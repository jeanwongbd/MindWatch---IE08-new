"""per-user trained models

Revision ID: 0007
Revises: 0006
"""
from alembic import op
import sqlalchemy as sa

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "user_models",
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("reason", sa.String(40), nullable=False),
        sa.Column("trained_on", sa.Integer, nullable=False),
        sa.Column("holdout_days", sa.SmallInteger, nullable=True),
        sa.Column("model_error", sa.Float, nullable=True),
        sa.Column("average_error", sa.Float, nullable=True),
        sa.Column("params", sa.JSON, nullable=True),
        sa.Column("trained_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("status IN ('ready', 'not_ready')", name="ck_user_models_status"),
    )


def downgrade() -> None:
    op.drop_table("user_models")
