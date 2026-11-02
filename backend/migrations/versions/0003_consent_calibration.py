"""consent and starting-point answers

Revision ID: 0003
Revises: 0002
"""
from alembic import op
import sqlalchemy as sa

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "consents",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("version", sa.String(32), nullable=False),
        sa.Column("adult_confirmed", sa.Boolean, nullable=False),
        sa.Column("agreed_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "calibration_answers",
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("questions_version", sa.String(16), nullable=False),
        sa.Column("answers", sa.JSON, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("calibration_answers")
    op.drop_table("consents")
