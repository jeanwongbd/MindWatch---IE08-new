"""Database tables. Keep migrations in step: every change here needs a new revision."""
import datetime as dt
from datetime import datetime
from typing import Optional

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy import false as sa_false
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    email: Mapped[str] = mapped_column(String(320), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    # The read-only sample account. It has no usable password and can only be read.
    is_sample: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=sa_false())
    # Set only on a private copy of the sample made for one visitor. The copy is removed after this time.
    sample_expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)


class UserSession(Base):
    __tablename__ = "sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # Only a SHA-256 hash of the token is kept, never the token itself.
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class LoginFailure(Base):
    __tablename__ = "login_failures"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(String(320), nullable=False, index=True)
    failed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class Consent(Base):
    __tablename__ = "consents"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True
    )
    # Which wording the person agreed to, and when. Set by the server, not the phone.
    version: Mapped[str] = mapped_column(String(32), nullable=False)
    adult_confirmed: Mapped[bool] = mapped_column(Boolean, nullable=False)
    agreed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class CalibrationAnswers(Base):
    __tablename__ = "calibration_answers"

    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    questions_version: Mapped[str] = mapped_column(String(16), nullable=False)
    answers: Mapped[dict] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class Checkin(Base):
    """One check-in per person per day. The day is the phone's local date."""

    __tablename__ = "checkins"
    __table_args__ = (
        UniqueConstraint("user_id", "date", name="uq_checkins_user_date"),
        CheckConstraint("stress >= 0 AND stress <= 10", name="ck_checkins_stress_range"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    date: Mapped[dt.date] = mapped_column(Date, nullable=False)
    stress: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    # One of the fixed words in checkin_words.json, or nothing. Never free text.
    word: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    # Asked only of people who said they have no smart watch. Each is one of the fixed options in
    # calibration_questions.json, or nothing.
    sleep_hours: Mapped[Optional[str]] = mapped_column(String(16), nullable=True)
    sleep_quality: Mapped[Optional[str]] = mapped_column(String(16), nullable=True)
    activity: Mapped[Optional[str]] = mapped_column(String(24), nullable=True)
    # Zero or more tags from "energy" in checkin_words.json, in that list's order. Never free text.
    energy: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class DailyMeasurement(Base):
    """One day of watch data per person, read from Health Connect on the phone.

    The day is the phone's local date. Any value can be empty: empty means "not available" (the
    watch recorded nothing), which is not the same as zero.
    """

    __tablename__ = "daily_measurements"
    __table_args__ = (
        UniqueConstraint("user_id", "date", name="uq_daily_measurements_user_date"),
        CheckConstraint("steps IS NULL OR (steps >= 0 AND steps <= 200000)", name="ck_measurements_steps"),
        CheckConstraint(
            "sleep_minutes IS NULL OR (sleep_minutes >= 0 AND sleep_minutes <= 1440)", name="ck_measurements_sleep"
        ),
        CheckConstraint(
            "heart_rate_avg IS NULL OR (heart_rate_avg >= 20 AND heart_rate_avg <= 250)", name="ck_measurements_hr"
        ),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    date: Mapped[dt.date] = mapped_column(Date, nullable=False)
    steps: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    sleep_minutes: Mapped[Optional[int]] = mapped_column(SmallInteger, nullable=True)
    heart_rate_avg: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class UserModel(Base):
    """One person's trained stress model, as plain numbers. Never shared between people.

    `params` is empty unless the model is ready. `reason` says in a word why it is not.
    """

    __tablename__ = "user_models"
    __table_args__ = (CheckConstraint("status IN ('ready', 'not_ready')", name="ck_user_models_status"),)

    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    status: Mapped[str] = mapped_column(String(16), nullable=False)
    reason: Mapped[str] = mapped_column(String(40), nullable=False)
    trained_on: Mapped[int] = mapped_column(Integer, nullable=False)
    holdout_days: Mapped[Optional[int]] = mapped_column(SmallInteger, nullable=True)
    model_error: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    average_error: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    params: Mapped[Optional[dict]] = mapped_column(JSON(none_as_null=True), nullable=True)
    trained_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class JournalEntry(Base):
    """A private free-text note. Only its owner reads it; nothing else in the app uses it."""

    __tablename__ = "journal_entries"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # The phone-local date the entry was first written. Editing never changes it.
    date: Mapped[dt.date] = mapped_column(Date, nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
