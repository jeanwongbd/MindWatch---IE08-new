"""daily check-ins

Revision ID: 0004
Revises: 0003
"""
from alembic import op
import sqlalchemy as sa

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "checkins",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("date", sa.Date, nullable=False),
        sa.Column("stress", sa.SmallInteger, nullable=False),
        sa.Column("word", sa.String(20), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("user_id", "date", name="uq_checkins_user_date"),
        sa.CheckConstraint("stress >= 0 AND stress <= 10", name="ck_checkins_stress_range"),
    )
    op.create_index("ix_checkins_user_id", "checkins", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_checkins_user_id", table_name="checkins")
    op.drop_table("checkins")
