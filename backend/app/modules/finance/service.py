from __future__ import annotations
from datetime import datetime, timezone
from decimal import Decimal
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.finance.idempotency import (
    OP_COMPANY_FINANCE_CREATE,
    OP_FINANCE_CREATE,
    OP_FINANCE_PAY,
    SCOPE_COMPANY,
    SCOPE_ORGANIZATION,
    FinancialOperationService,
    request_fingerprint,
)
from app.modules.finance.models import (
    Counterparty,
    FinanceHistory,
    FinanceTemplate,
    FinTransaction,
    FinancialOperation,
)
from app.modules.finance.ownership import (
    FinanceScope,
    validate_transaction_references,
)
from app.modules.finance.schemas import PayRequest, TransactionCreate, TransactionUpdate
from app.modules.organizations.models import Organization
from app.shared.admin_crud import CRUDService, OrgScope
from app.shared.exceptions import ConflictError, NotFoundError, ValidationError
from pydantic_core import to_jsonable_python


class TransactionService(CRUDService[FinTransaction]):
    """Финансовые транзакции: балансы меняются атомарно, суммы аудируются (ТЗ §6)."""

    def __init__(self, db: AsyncSession):
        super().__init__(FinTransaction, db)

    @staticmethod
    def _delta(direction: str, amount: Decimal) -> Decimal:
        return amount if direction == "income" else -amount

    @staticmethod
    def _authorize_organization(
        organization_id: UUID | None,
        org_scope: OrgScope,
    ) -> None:
        if org_scope is not None and organization_id not in org_scope:
            # Fail closed without disclosing whether an out-of-scope
            # organization exists.
            raise NotFoundError("FinTransaction organization not found")

    async def _operation_transactions(
        self,
        operation: FinancialOperation,
        *,
        organization_id: UUID | None = None,
        company_id: UUID | None = None,
    ) -> list[FinTransaction]:
        metadata = operation.result_metadata or {}
        try:
            transaction_ids = [
                UUID(value) for value in metadata["transaction_ids"]
            ]
        except (KeyError, TypeError, ValueError):
            raise ConflictError("Stored idempotency result is unavailable")
        if not transaction_ids:
            raise ConflictError("Stored idempotency result is unavailable")

        query = select(FinTransaction).where(
            FinTransaction.id.in_(transaction_ids),
            FinTransaction.deleted_at.is_(None),
        )
        if organization_id is not None:
            query = query.where(
                FinTransaction.organization_id == organization_id
            )
        if company_id is not None:
            query = query.where(FinTransaction.company_id == company_id)
        rows = (await self.db.execute(query)).scalars().all()
        by_id = {row.id: row for row in rows}
        try:
            return [by_id[transaction_id] for transaction_id in transaction_ids]
        except KeyError:
            raise ConflictError("Stored idempotency result is unavailable")

    async def _locked_counterparty(
        self, counterparty_id: UUID, scope: FinanceScope
    ) -> Counterparty:
        cp = (
            await self.db.execute(
                select(Counterparty)
                .where(
                    Counterparty.id == counterparty_id,
                    Counterparty.deleted_at.is_(None),
                    Counterparty.scope_kind == scope.kind,
                    getattr(Counterparty, scope.owner_field) == scope.tenant_id,
                )
                .with_for_update()
            )
        ).scalar_one_or_none()
        if cp is None:
            raise NotFoundError("Counterparty not found")
        return cp

    async def _locked_organization(self, organization_id: UUID) -> Organization:
        org = (
            await self.db.execute(
                select(Organization)
                .where(Organization.id == organization_id, Organization.deleted_at.is_(None))
                .with_for_update()
            )
        ).scalar_one_or_none()
        if org is None:
            raise NotFoundError("Organization not found")
        return org

    async def _apply_balance(
        self,
        counterparty_id: UUID | None,
        organization_id: UUID | None,
        delta: Decimal,
        scope: FinanceScope,
    ) -> None:
        if counterparty_id:
            cp = await self._locked_counterparty(counterparty_id, scope)
            cp.balance = (cp.balance or 0) + delta
        if organization_id:
            org = await self._locked_organization(organization_id)
            org.cash_balance = (org.cash_balance or 0) + delta

    async def create_transaction(
        self,
        data: TransactionCreate,
        user_id: UUID,
        idempotency_key: str | None = None,
        org_scope: OrgScope = None,
    ) -> FinTransaction:
        self._authorize_organization(data.organization_id, org_scope)
        if data.organization_id is None:
            raise ValidationError("organization_id is required")
        scope = FinanceScope("organization", data.organization_id)
        await validate_transaction_references(
            self.db,
            scope,
            payment_type_id=data.payment_type_id,
            category_id=data.category_id,
            counterparty_id=data.counterparty_id,
            finance_template_id=data.finance_template_id,
        )
        operation = None
        if idempotency_key is not None:
            if data.organization_id is None:
                raise ValidationError(
                    "organization_id is required when Idempotency-Key is used"
                )
            claim = await FinancialOperationService(self.db).claim(
                scope_kind=SCOPE_ORGANIZATION,
                scope_id=data.organization_id,
                operation_type=OP_FINANCE_CREATE,
                idempotency_key=idempotency_key,
                fingerprint=request_fingerprint(data),
            )
            operation = claim.operation
            if not claim.is_new:
                transactions = await self._operation_transactions(
                    operation, organization_id=data.organization_id
                )
                await self.db.commit()
                return transactions[0]

        tx = FinTransaction(
            **data.model_dump(exclude_unset=True),
            user_id=user_id,
            idempotency_key=idempotency_key,
        )
        if tx.date is None:
            tx.date = datetime.now(timezone.utc)
        self.db.add(tx)
        await self._apply_balance(
            tx.counterparty_id,
            tx.organization_id,
            self._delta(tx.direction, data.amount),
            scope,
        )
        await self.db.flush()
        if operation is not None:
            FinancialOperationService.complete(
                operation, {"transaction_ids": [str(tx.id)]}
            )
        await self.db.commit()
        await self.db.refresh(tx)
        return tx

    async def create_company_transaction(
        self,
        data: dict,
        user_id: UUID,
        company_id: UUID,
        idempotency_key: str | None = None,
    ) -> FinTransaction:
        """Preserve the kafe compatibility payload while adding safe replay."""

        normalized = {
            "amount": abs(float(data.get("amount") or 0)),
            "direction": data.get("direction") or "income",
            "comment": data.get("comment"),
            "category_id": data.get("category_id"),
            "payment_type_id": data.get("payment_type_id"),
            "counterparty_id": data.get("counterparty_id"),
            "finance_template_id": data.get("finance_template_id"),
        }
        scope = FinanceScope("company", company_id)
        await validate_transaction_references(
            self.db,
            scope,
            payment_type_id=normalized["payment_type_id"],
            category_id=normalized["category_id"],
            counterparty_id=normalized["counterparty_id"],
            finance_template_id=normalized["finance_template_id"],
        )
        operation = None
        if idempotency_key is not None:
            claim = await FinancialOperationService(self.db).claim(
                scope_kind=SCOPE_COMPANY,
                scope_id=company_id,
                operation_type=OP_COMPANY_FINANCE_CREATE,
                idempotency_key=idempotency_key,
                fingerprint=request_fingerprint(normalized),
            )
            operation = claim.operation
            if not claim.is_new:
                transactions = await self._operation_transactions(
                    operation, company_id=company_id
                )
                await self.db.commit()
                return transactions[0]

        transaction = FinTransaction(
            **normalized,
            user_id=user_id,
            company_id=company_id,
            idempotency_key=idempotency_key,
        )
        self.db.add(transaction)
        await self.db.flush()
        if operation is not None:
            FinancialOperationService.complete(
                operation, {"transaction_ids": [str(transaction.id)]}
            )
        await self.db.commit()
        await self.db.refresh(transaction)
        return transaction

    async def get_organization_transaction(
        self, tx_id: UUID, org_scope: OrgScope = None
    ) -> FinTransaction:
        query = select(FinTransaction).where(
            FinTransaction.id == tx_id,
            FinTransaction.deleted_at.is_(None),
            FinTransaction.company_id.is_(None),
            FinTransaction.organization_id.is_not(None),
        )
        if org_scope is not None:
            query = query.where(FinTransaction.organization_id.in_(org_scope))
        tx = (await self.db.execute(query)).scalar_one_or_none()
        if tx is None:
            raise NotFoundError("FinTransaction not found")
        return tx

    async def list_organization_transactions(
        self,
        params,
        *,
        org_scope: OrgScope,
        raw_filters: dict[str, str] | None = None,
        sort: str | None = None,
        date_from=None,
        date_to=None,
    ) -> tuple[list[FinTransaction], int]:
        query = select(FinTransaction).where(
            FinTransaction.deleted_at.is_(None),
            FinTransaction.company_id.is_(None),
            FinTransaction.organization_id.is_not(None),
        )
        if org_scope is not None:
            query = query.where(FinTransaction.organization_id.in_(org_scope))
        if raw_filters:
            query = self._apply_filters(query, raw_filters)
        if date_from:
            query = query.where(func.date(FinTransaction.date) >= date_from)
        if date_to:
            query = query.where(func.date(FinTransaction.date) <= date_to)
        total = (await self.db.execute(
            select(func.count()).select_from(query.subquery())
        )).scalar_one()
        query = self._apply_sort(query, sort, "-date")
        rows = (await self.db.execute(
            query.offset(params.offset).limit(params.size)
        )).scalars().all()
        return list(rows), total

    async def update_transaction(
        self,
        tx_id: UUID,
        data: TransactionUpdate,
        user_id: UUID,
        org_scope: OrgScope = None,
    ) -> FinTransaction:
        tx = await self.get_organization_transaction(tx_id, org_scope)
        payload = data.model_dump(exclude_unset=True)
        scope = FinanceScope("organization", tx.organization_id)
        await validate_transaction_references(
            self.db,
            scope,
            payment_type_id=payload.get("payment_type_id", tx.payment_type_id),
            category_id=payload.get("category_id", tx.category_id),
            counterparty_id=payload.get("counterparty_id", tx.counterparty_id),
            finance_template_id=payload.get(
                "finance_template_id", tx.finance_template_id
            ),
        )

        if "amount" in payload and Decimal(payload["amount"]) != Decimal(tx.amount):
            old_amount, new_amount = Decimal(tx.amount), Decimal(payload["amount"])
            # откат старой суммы и применение новой
            await self._apply_balance(
                tx.counterparty_id,
                tx.organization_id,
                -self._delta(tx.direction, old_amount),
                scope,
            )
            await self._apply_balance(
                payload.get("counterparty_id", tx.counterparty_id),
                tx.organization_id,
                self._delta(tx.direction, new_amount),
                scope,
            )
            self.db.add(FinanceHistory(
                status="updated",
                ref_id=tx.id,
                scope_kind="organization",
                company_id=None,
                organization_id=tx.organization_id,
                old_amount=old_amount,
                new_amount=new_amount,
                type=tx.direction,
                user_id=user_id,
                comment=payload.get("comment", tx.comment),
            ))

        for key, value in payload.items():
            setattr(tx, key, value)
        await self.db.commit()
        await self.db.refresh(tx)
        return tx

    async def delete_transaction(
        self, tx_id: UUID, user_id: UUID, org_scope: OrgScope = None
    ) -> None:
        tx = await self.get_organization_transaction(tx_id, org_scope)
        scope = FinanceScope("organization", tx.organization_id)
        await self._apply_balance(
            tx.counterparty_id, tx.organization_id,
            -self._delta(tx.direction, Decimal(tx.amount)),
            scope,
        )
        self.db.add(FinanceHistory(
            status="deleted",
            ref_id=tx.id,
            scope_kind="organization",
            company_id=None,
            organization_id=tx.organization_id,
            old_amount=Decimal(tx.amount),
            new_amount=None,
            type=tx.direction,
            user_id=user_id,
        ))
        tx.deleted_at = datetime.now(timezone.utc)
        await self.db.commit()

    async def pay(
        self,
        data: PayRequest,
        user_id: UUID,
        idempotency_key: str | None = None,
        org_scope: OrgScope = None,
    ) -> list[FinTransaction]:
        """Разбивка оплаты: несколько транзакций одной операцией (ТЗ §6)."""
        self._authorize_organization(data.organization_id, org_scope)
        if data.organization_id is None:
            raise ValidationError("organization_id is required")
        scope = FinanceScope("organization", data.organization_id)
        for item in data.items:
            await validate_transaction_references(
                self.db,
                scope,
                payment_type_id=item.payment_type_id,
                category_id=item.category_id,
                counterparty_id=item.counterparty_id,
                finance_template_id=item.finance_template_id,
            )
        operation = None
        if idempotency_key is not None:
            if data.organization_id is None:
                raise ValidationError(
                    "organization_id is required when Idempotency-Key is used"
                )
            claim = await FinancialOperationService(self.db).claim(
                scope_kind=SCOPE_ORGANIZATION,
                scope_id=data.organization_id,
                operation_type=OP_FINANCE_PAY,
                idempotency_key=idempotency_key,
                fingerprint=request_fingerprint(data),
            )
            operation = claim.operation
            if not claim.is_new:
                transactions = await self._operation_transactions(
                    operation, organization_id=data.organization_id
                )
                await self.db.commit()
                return transactions

        if data.save_as_template:
            self.db.add(FinanceTemplate(
                name=data.save_as_template,
                payload=to_jsonable_python(data.model_dump(exclude={"save_as_template"})),
                scope_kind="organization",
                company_id=None,
                organization_id=data.organization_id,
            ))

        now = datetime.now(timezone.utc)
        transactions = []
        for item in data.items:
            tx = FinTransaction(
                date=now,
                amount=item.amount,
                direction=data.direction,
                payment_type_id=item.payment_type_id,
                counterparty_id=item.counterparty_id,
                category_id=item.category_id,
                finance_template_id=item.finance_template_id,
                organization_id=data.organization_id,
                comment=item.comment,
                user_id=user_id,
                idempotency_key=idempotency_key,
            )
            self.db.add(tx)
            await self._apply_balance(
                item.counterparty_id, data.organization_id,
                self._delta(data.direction, item.amount),
                scope,
            )
            transactions.append(tx)
        await self.db.flush()
        if operation is not None:
            FinancialOperationService.complete(
                operation,
                {"transaction_ids": [str(tx.id) for tx in transactions]},
            )
        await self.db.commit()
        for tx in transactions:
            await self.db.refresh(tx)
        return transactions
