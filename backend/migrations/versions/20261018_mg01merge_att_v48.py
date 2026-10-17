"""merge att01status + v48pwd01

Joins the desktop/staff line (att01status, on br01login — attendance_logs
status/approved_by/approved_at) with the backend line (v48pwd01, on v47avg01 —
users.auth_version for password-change token invalidation). Both branches are
additive column migrations; the merge itself changes nothing.

Revision ID: mg01merge
Revises: att01status, v48pwd01
Create Date: 2026-10-18
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "mg01merge"
down_revision: Union[str, Sequence[str], None] = ("att01status", "v48pwd01")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
