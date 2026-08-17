"""Add branch login credentials (6.2 / 6.3)

6.2 — вход на кассе одним шагом по логину/паролю филиала. Логин глобально
уникален → определяет и организацию, и филиал. Пароль хранится хешированным
(bcrypt) в password_hash. Выбор филиала на кассе больше не нужен; личный логин
владельца сотрудникам не показывается (6.3) — токен выпускается на служебного
терминального пользователя филиала.

Revision ID: v9w0brnlog03
Revises: u8v9attapp02
Create Date: 2026-08-14
"""
from typing import Sequence, Union
import sqlalchemy as sa
from alembic import op

revision: str = "v9w0brnlog03"
down_revision: Union[str, None] = "u8v9attapp02"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("branches", sa.Column("login", sa.String(100), nullable=True))
    op.add_column("branches", sa.Column("password_hash", sa.String(255), nullable=True))
    # Логин филиала глобально уникален — по нему касса определяет организацию
    op.create_index("ix_branches_login", "branches", ["login"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_branches_login", table_name="branches")
    op.drop_column("branches", "password_hash")
    op.drop_column("branches", "login")
