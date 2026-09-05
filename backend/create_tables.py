"""Create all tables in the database."""
import asyncio
from app.shared.base_model import Base
from app.infrastructure.database.session import engine

# Import all models so Base.metadata knows about them
import app.modules.companies.models
import app.modules.auth.models
import app.modules.rbac.models
import app.modules.inventory.models
import app.modules.crm.models
import app.modules.pos.models
import app.modules.payments.models
import app.modules.kitchen.models
import app.modules.loyalty.models
import app.modules.delivery.models
import app.modules.hr.models
import app.modules.notifications.models
import app.modules.audit.models
import app.modules.fiscal.models
import app.modules.subscriptions.models
import app.modules.printers.models
import app.modules.halls.models
import app.modules.inventory.warehouse_models
import app.modules.inventory.semi_product_models
import app.modules.kafe_compat.models
import app.modules.handbook.models
import app.modules.organizations.models
import app.modules.departments.models
import app.modules.marketing.models
import app.modules.nomenclature.models
import app.modules.storage.models
import app.modules.finance.models
import app.modules.field_service.models
import app.modules.tasks.models
import app.modules.admin_settings.models


async def main():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print("ALL TABLES CREATED OK")


if __name__ == "__main__":
    asyncio.run(main())
