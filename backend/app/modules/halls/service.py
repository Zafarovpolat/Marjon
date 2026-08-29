from __future__ import annotations
from uuid import UUID
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession
from app.modules.companies.models import Branch
from app.modules.finance.models import PaymentType
from app.modules.finance.ownership import FinanceScope, require_finance_reference
from app.modules.halls.models import Hall, Table
from app.modules.halls.schemas import HallCreate, HallUpdate, TableCreate, TableUpdate
from app.shared.exceptions import ConflictError, NotFoundError
from app.shared.tenant_scope import require_company_resource


class HallService:
    def __init__(self, db: AsyncSession):
        self.db = db

    @staticmethod
    def _tables_loader(include_inactive_tables: bool):
        """Eager-load nested tables in one extra query for the whole result set
        (selectinload, so no N+1). The flag controls VISIBILITY only — never
        uniqueness (Phase 5C-3) and never lifecycle rules."""
        if include_inactive_tables:
            return selectinload(Hall.tables)
        return selectinload(Hall.tables.and_(Table.is_active.is_(True)))

    async def list(
        self,
        company_id: UUID,
        branch_id: UUID | None = None,
        *,
        include_inactive: bool = False,
    ) -> list[Hall]:
        # Default stays ACTIVE-ONLY for backward compatibility: soft-deleted
        # halls drop out of the places directory and their tables are likewise
        # loaded active-only. Phase 5C-4: `include_inactive=True` exposes the
        # archive (halls AND their nested tables) for the Settings management
        # view. Tenant/branch scoping is untouched — the flag never widens
        # ownership. Historical orders keep their table_id regardless.
        q = (
            select(Hall)
            .options(self._tables_loader(include_inactive))
            .where(Hall.company_id == company_id)
        )
        if not include_inactive:
            q = q.where(Hall.is_active.is_(True))
        if branch_id:
            q = q.where(Hall.branch_id == branch_id)
        result = await self.db.execute(q)
        return list(result.scalars().all())

    async def get(
        self,
        company_id: UUID,
        hall_id: UUID,
        *,
        include_inactive_tables: bool = False,
        refresh_tables: bool = False,
    ) -> Hall:
        # An archived hall is still addressable by id (unchanged pre-5C-4
        # behaviour) — `include_inactive_tables` only widens the NESTED tables
        # collection.
        query = (
            select(Hall).options(self._tables_loader(include_inactive_tables))
            .where(Hall.id == hall_id, Hall.company_id == company_id)
        )
        if refresh_tables:
            # SQLAlchemy leaves an already-loaded relationship untouched on a
            # plain re-select, so a hall whose tables were just mutated would
            # serialize the stale collection. Post-write reads must re-populate
            # it or the response could contradict the active-only contract.
            query = query.execution_options(populate_existing=True)
        hall = (await self.db.execute(query)).scalar_one_or_none()
        if not hall:
            raise NotFoundError("Hall not found")
        return hall

    async def _resolve_branch(self, company_id: UUID, branch_id: UUID | None) -> UUID:
        """BE-14 / Phase 5C-1: resolve the branch a place attaches to.

        Explicit branch_id is validated for tenant ownership (+ active). When
        omitted the sole active branch is used; zero or many active branches are
        a deliberate configuration conflict rather than a silent first-branch
        pick, so the caller must onboard/choose."""
        if branch_id is not None:
            branch = await require_company_resource(
                self.db, Branch, branch_id, company_id, detail="Branch not found"
            )
            if branch.is_active is False:
                raise ConflictError("Филиал неактивен")
            return branch.id
        result = await self.db.execute(
            select(Branch).where(Branch.company_id == company_id, Branch.is_active.is_(True))
        )
        branches = list(result.scalars().all())
        if not branches:
            raise ConflictError("Не настроен филиал. Создайте филиал, чтобы добавить место.")
        if len(branches) > 1:
            raise ConflictError("Укажите филиал")
        return branches[0].id

    async def create(self, company_id: UUID, data: HallCreate) -> Hall:
        branch_id = await self._resolve_branch(company_id, data.branch_id)
        await require_finance_reference(
            self.db,
            PaymentType,
            data.payment_type_id,
            FinanceScope("company", company_id),
            allow_system=True,
            detail="PaymentType not found",
        )
        hall = Hall(
            company_id=company_id, branch_id=branch_id,
            name=data.name, description=data.description,
            condition=data.condition, percent=data.percent,
            price_amount=data.price_amount,
            pricing_type=data.pricing_type, payment_type_id=data.payment_type_id,
        )
        self.db.add(hall)
        await self.db.commit()
        await self.db.refresh(hall)
        result = await self.db.execute(
            select(Hall).options(selectinload(Hall.tables)).where(
                Hall.id == hall.id, Hall.company_id == company_id
            )
        )
        return result.scalar_one()

    # Phase 5C-2: only the structured pricing fields honour an EXPLICIT null so
    # the settings UI can clear "Доп. цена". Every other field keeps the
    # historical behaviour (explicit null ignored) to avoid a broad regression.
    _PRICING_CLEARABLE = ("price_amount", "pricing_type")

    async def update(self, company_id: UUID, hall_id: UUID, data: HallUpdate) -> Hall:
        # Active-only nested tables: that is both the response shape callers
        # already receive and exactly the set a deactivation cascade must flip.
        hall = await self.get(company_id, hall_id)
        if "payment_type_id" in data.model_fields_set:
            await require_finance_reference(
                self.db,
                PaymentType,
                data.payment_type_id,
                FinanceScope("company", company_id),
                allow_system=True,
                detail="PaymentType not found",
            )
        payload = data.model_dump(exclude_unset=True)
        # Phase 5C-4 lifecycle transitions. An archived hall stays freely
        # editable (name/pricing/...); only the is_active edges are gated.
        reactivating = payload.get("is_active") is True and not hall.is_active
        deactivating = payload.get("is_active") is False and hall.is_active
        if reactivating:
            # Phase 5C-1 invariant: a hall may only become operational under an
            # ACTIVE branch of its own company. Child tables are deliberately
            # NOT resurrected — see _deactivate_child_tables.
            await self._assert_branch_active(company_id, hall.branch_id)
        for field, value in payload.items():
            if value is None and field not in self._PRICING_CLEARABLE:
                continue
            setattr(hall, field, value)
        if deactivating:
            # Same cascade as DELETE, so "hall inactive + table active" is
            # unreachable through either deactivation route.
            self._deactivate_child_tables(hall)
        await self.db.commit()
        await self.db.refresh(hall)
        return await self.get(company_id, hall_id, refresh_tables=True)

    async def _assert_branch_active(self, company_id: UUID, branch_id: UUID) -> None:
        """A hall may only become operational under an active branch of its own
        company. Never creates or reactivates a branch as a side effect."""
        branch = await require_company_resource(
            self.db, Branch, branch_id, company_id, detail="Branch not found"
        )
        if branch.is_active is False:
            raise ConflictError("Филиал неактивен")

    @staticmethod
    def _deactivate_child_tables(hall: Hall) -> None:
        """Archive the hall's still-active tables (soft only).

        Reactivating the hall later does NOT resurrect them: some tables may
        have been deliberately inactive beforehand, no prior-state record
        exists, and guessing would destroy that distinction. Each table is
        re-enabled by hand instead. Numbers and Order.table_id are untouched.
        """
        for table in hall.tables:
            table.is_active = False

    async def delete(self, company_id: UUID, hall_id: UUID) -> None:
        # Soft-delete: historical Orders may reference tables in this hall via
        # Order.table_id, so we never physically drop the hall (which would
        # CASCADE-delete its tables and strand that history). Deactivate the hall
        # and its still-active tables instead; the DB FK ON DELETE SET NULL remains
        # only as a safety net for exceptional physical deletion.
        hall = await self.get(company_id, hall_id)
        hall.is_active = False
        self._deactivate_child_tables(hall)
        await self.db.commit()

    async def list_tables(
        self, company_id: UUID, hall_id: UUID, *, include_inactive: bool = False
    ) -> list[Table]:
        # Default ACTIVE-ONLY (unchanged); include_inactive exposes the archive
        # for the Settings management view. Ownership is still proven by
        # resolving the hall inside the tenant first.
        hall = await self.get(company_id, hall_id)
        query = select(Table).where(Table.hall_id == hall.id)
        if not include_inactive:
            query = query.where(Table.is_active.is_(True))
        result = await self.db.execute(query.order_by(Table.number))
        return list(result.scalars().all())

    # Phase 5C-3: (hall_id, number) is unique among ACTIVE tables. The partial
    # unique index `uq_tables_hall_number_active` is the concurrency-safe final
    # authority; these helpers only turn it into a friendly domain 409.
    _TABLE_NUMBER_INDEX = "uq_tables_hall_number_active"
    _DUPLICATE_TABLE_DETAIL = "Стол с таким номером уже существует в этом месте"

    def _is_table_number_violation(self, exc: IntegrityError) -> bool:
        """True only for our named partial unique index — never swallow other
        integrity errors under the duplicate-table message."""
        original = getattr(exc, "orig", None)
        for candidate in (
            getattr(original, "constraint_name", None),
            getattr(getattr(original, "diag", None), "constraint_name", None),
        ):
            if candidate:
                return candidate == self._TABLE_NUMBER_INDEX
        return self._TABLE_NUMBER_INDEX in str(original or exc)

    async def _assert_table_number_free(
        self, hall_id: UUID, number: int | None, *, exclude_table_id: UUID | None = None
    ) -> None:
        if number is None:
            return
        query = select(Table.id).where(
            Table.hall_id == hall_id,
            Table.number == number,
            Table.is_active.is_(True),
        )
        if exclude_table_id is not None:
            query = query.where(Table.id != exclude_table_id)
        if (await self.db.execute(query.limit(1))).scalar_one_or_none() is not None:
            raise ConflictError(self._DUPLICATE_TABLE_DETAIL)

    async def _commit_table(self, table: Table) -> Table:
        try:
            await self.db.commit()
        except IntegrityError as exc:
            await self.db.rollback()
            if self._is_table_number_violation(exc):
                raise ConflictError(self._DUPLICATE_TABLE_DETAIL) from exc
            raise
        await self.db.refresh(table)
        return table

    _INACTIVE_HALL_DETAIL = "Место неактивно — сначала активируйте место"

    async def create_table(self, company_id: UUID, hall_id: UUID, data: TableCreate) -> Table:
        # Phase 5C-4: a new table is an operational row, so the parent hall must
        # be active. Never silently activates the hall.
        hall = await self.get(company_id, hall_id)
        if not hall.is_active:
            raise ConflictError(self._INACTIVE_HALL_DETAIL)
        await self._assert_table_number_free(hall_id, data.number)
        table = Table(hall_id=hall_id, number=data.number, capacity=data.capacity)
        self.db.add(table)
        return await self._commit_table(table)

    async def update_table(self, company_id: UUID, hall_id: UUID, table_id: UUID, data: TableUpdate) -> Table:
        hall = await self.get(company_id, hall_id)
        result = await self.db.execute(
            select(Table).where(Table.id == table_id, Table.hall_id == hall_id)
        )
        table = result.scalar_one_or_none()
        if not table:
            raise NotFoundError("Table not found")
        payload = data.model_dump(exclude_none=True)
        # A row moving to a new number, or being re-activated, must not collide
        # with another ACTIVE table holding that number in the same hall.
        target_number = payload.get("number", table.number)
        will_be_active = payload.get("is_active", table.is_active)
        # Phase 5C-4: activation is the only transition gated on the hall, and
        # it is what keeps "hall inactive + table active" unreachable. Ordinary
        # metadata edits of an archived table stay allowed, so an archived hall
        # never becomes an administrative dead end.
        if will_be_active and not hall.is_active:
            raise ConflictError(self._INACTIVE_HALL_DETAIL)
        if will_be_active:
            await self._assert_table_number_free(
                hall_id, target_number, exclude_table_id=table.id
            )
        for field, value in payload.items():
            setattr(table, field, value)
        return await self._commit_table(table)

    async def delete_table(self, company_id: UUID, hall_id: UUID, table_id: UUID) -> None:
        await self.get(company_id, hall_id)
        result = await self.db.execute(
            select(Table).where(Table.id == table_id, Table.hall_id == hall_id)
        )
        table = result.scalar_one_or_none()
        if not table:
            raise NotFoundError("Table not found")
        # Soft-delete: a historical Order.table_id may point here. Deactivate rather
        # than physically remove so order history keeps its canonical seating link.
        table.is_active = False
        await self.db.commit()

    async def branch_tables(self, company_id: UUID, branch_id: UUID) -> list[Table]:
        """Get all active tables across all halls in a branch."""
        result = await self.db.execute(
            select(Table)
            .join(Hall, Hall.id == Table.hall_id)
            .where(Hall.company_id == company_id, Hall.branch_id == branch_id,
                   Hall.is_active == True, Table.is_active == True)
            .order_by(Table.number)
        )
        return list(result.scalars().all())
