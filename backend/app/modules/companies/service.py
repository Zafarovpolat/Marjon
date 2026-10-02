from __future__ import annotations
from uuid import UUID
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from app.modules.auth.security import hash_password
from app.modules.companies.models import Company, Branch
from app.modules.companies.repository import CompanyRepository, BranchRepository
from app.modules.companies.schemas import CompanyCreate, CompanyUpdate, BranchCreate, BranchUpdate
from app.shared.exceptions import NotFoundError, ConflictError, ValidationError


class CompanyService:
    def __init__(self, db: AsyncSession):
        self.repo = CompanyRepository(db)

    async def create(self, data: CompanyCreate) -> Company:
        if await self.repo.get_by_slug(data.slug):
            raise ConflictError(f"Slug '{data.slug}' is already taken")
        return await self.repo.save(Company(**data.model_dump()))

    async def get(self, company_id: UUID) -> Company:
        company = await self.repo.get_by_id(company_id)
        if not company:
            raise NotFoundError("Company not found")
        return company

    async def update(self, company_id: UUID, data: CompanyUpdate) -> Company:
        company = await self.get(company_id)
        for field, value in data.model_dump(exclude_none=True).items():
            setattr(company, field, value)
        return await self.repo.save(company)


class BranchService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.repo = BranchRepository(db)

    async def _normalize_unique_login(self, login: str, *, exclude_id: UUID | None = None) -> str:
        """Логин филиала — произвольная строка, глобально уникальная (десктоп
        логинится ТОЛЬКО по логину, без выбора компании). Приводим к нижнему
        регистру и проверяем уникальность по всей таблице."""
        norm = login.strip().lower()
        if not norm:
            raise ValidationError("Логин филиала не может быть пустым")
        q = select(Branch.id).where(func.lower(Branch.login) == norm)
        if exclude_id is not None:
            q = q.where(Branch.id != exclude_id)
        if (await self.db.execute(q)).first():
            raise ConflictError("Такой логин филиала уже используется")
        return norm

    async def create(self, company_id: UUID, data: BranchCreate) -> Branch:
        payload = data.model_dump(exclude_none=True)
        login = payload.pop("login", None)
        password = payload.pop("password", None)
        branch = Branch(company_id=company_id, **payload)
        if login is not None:
            branch.login = await self._normalize_unique_login(login)
        if password is not None:
            branch.password_hash = hash_password(password)
        return await self.repo.save(branch)

    async def list(self, company_id: UUID) -> list[Branch]:
        return await self.repo.get_active(company_id)

    async def get(self, branch_id: UUID, company_id: UUID) -> Branch:
        branch = await self.repo.get_by_id(branch_id, company_id)
        if not branch:
            raise NotFoundError("Branch not found")
        return branch

    async def update(self, branch_id: UUID, company_id: UUID, data: BranchUpdate) -> Branch:
        branch = await self.get(branch_id, company_id)
        payload = data.model_dump(exclude_none=True)
        login = payload.pop("login", None)
        password = payload.pop("password", None)
        for field, value in payload.items():
            setattr(branch, field, value)
        if login is not None:
            branch.login = await self._normalize_unique_login(login, exclude_id=branch_id)
        if password is not None:
            branch.password_hash = hash_password(password)
        return await self.repo.save(branch)
