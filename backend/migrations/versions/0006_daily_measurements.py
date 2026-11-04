"""daily watch measurements

Revision ID: 0006
Revises: 0005
"""
from alembic import op
import sqlalchemy as sa

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "daily_measurements",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("date", sa.Date, nullable=False),
        sa.Column("steps", sa.Integer, nullable=True),
        sa.Column("sleep_minutes", sa.SmallInteger, nullable=True),
        sa.Column("heart_rate_avg", sa.Float, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("user_id", "date", name="uq_daily_measurements_user_date"),
        sa.CheckConstraint("steps IS NULL OR (steps >= 0 AND steps <= 200000)", name="ck_measurements_steps"),
        sa.CheckConstraint(
            "sleep_minutes IS NULL OR (sleep_minutes >= 0 AND sleep_minutes <= 1440)", name="ck_measurements_sleep"
        ),
        sa.CheckConstraint(
            "heart_rate_avg IS NULL OR (heart_rate_avg >= 20 AND heart_rate_avg <= 250)", name="ck_measurements_hr"
        ),
    )
    op.create_index("ix_daily_measurements_user_id", "daily_measurements", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_daily_measurements_user_id", table_name="daily_measurements")
    op.drop_table("daily_measurements")
