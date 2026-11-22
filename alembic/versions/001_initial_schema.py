"""001_initial_schema

Revision ID: 001_initial_schema
Revises: 
Create Date: 2026-11-22 21:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from database import Base

# revision identifiers, used by Alembic.
revision: str = '001_initial_schema'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Use bind engine to create all tables safely if they do not yet exist
    bind = op.get_bind()
    Base.metadata.create_all(bind=bind)


def downgrade() -> None:
    bind = op.get_bind()
    # Tables are preserved in downgrade to prevent catastrophic data loss during rollbacks
    pass
