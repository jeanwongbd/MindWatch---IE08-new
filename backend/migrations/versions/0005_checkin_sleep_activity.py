"""optional sleep and activity answers on a check-in

Revision ID: 0005
Revises: 0004
"""
from alembic import op
import sqlalchemy as sa

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Empty unless the person has no smart watch and chose to answer, so existing rows stay valid.
    op.add_column("checkins", sa.Column("sleep_hours", sa.String(16), nullable=True))
    op.add_column("checkins", sa.Column("sleep_quality", sa.String(16), nullable=True))
    op.add_column("checkins", sa.Column("activity", sa.String(24), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("checkins") as batch:
        batch.drop_column("activity")
        batch.drop_column("sleep_quality")
        batch.drop_column("sleep_hours")
