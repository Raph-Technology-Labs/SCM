"""
Database layer: engine, session, Base, get_db dependency, and ORM models.

Consolidated PostgreSQL schema equivalent to the full SQLite migration chain
(v001..v007) plus the AI-model registry. SQLAlchemy 2.0 declarative style.
"""

from __future__ import annotations

import datetime
import hashlib
from typing import Any, Generator, Optional

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    create_engine,
    func,
)
from sqlalchemy.dialects.postgresql import BYTEA, JSONB
from sqlalchemy.orm import (
    DeclarativeBase,
    Mapped,
    mapped_column,
    relationship,
    sessionmaker,
)

from app.config import settings

# ---------------------------------------------------------------------------
# Engine & Session
# ---------------------------------------------------------------------------
engine = create_engine(
    settings.DATABASE_URL,
    echo=settings.SQL_ECHO,
    pool_pre_ping=True,
    future=True,
)

SessionLocal = sessionmaker(
    bind=engine,
    autoflush=False,
    autocommit=False,
    expire_on_commit=False,
    future=True,
)


class Base(DeclarativeBase):
    pass


def get_db() -> Generator:
    """FastAPI dependency that yields a session and always closes it."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    """Create all tables from ORM metadata (dev convenience; schema.sql is canonical)."""
    Base.metadata.create_all(bind=engine)


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------
class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint(
            "role IN ('operator', 'administrator', 'superadministrator')",
            name="ck_users_role",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    username: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    password_hash: Mapped[str] = mapped_column(Text, nullable=False)
    role: Mapped[str] = mapped_column(Text, nullable=False)

    parts: Mapped[list["Part"]] = relationship(back_populates="creator")

    # Kept from the desktop app for login compatibility with existing hashes.
    # NOTE: sha256 is unsalted; prefer bcrypt/argon2 for any new credentials.
    @staticmethod
    def calc_password_hash(password: str) -> str:
        h = hashlib.new("sha256")
        h.update(password.encode())
        return h.hexdigest()

    @staticmethod
    def can_login(username: str, password: str) -> Optional[dict]:
        db = SessionLocal()
        try:
            existing = db.query(User).filter(User.username == username).first()
            if existing and User.calc_password_hash(password) == existing.password_hash:
                return {
                    "message": "Login successful",
                    "role": existing.role,
                    "user_id": existing.id,
                    "user_name": existing.name,
                }
            return None
        finally:
            db.close()


class Category(Base):
    __tablename__ = "categories"

    category_id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    category_name: Mapped[str] = mapped_column(Text, nullable=False, unique=True)

    parts: Mapped[list["Part"]] = relationship(back_populates="category")



class Part(Base):
    __tablename__ = "parts"
    __table_args__ = (
        CheckConstraint(
            "mode_of_operation IN ('Counting', 'Defect Detection', 'Measurement')",
            name="ck_parts_mode_of_operation",
        ),
    )

    part_id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    part_code: Mapped[str] = mapped_column(Text, nullable=False, unique=True, index=True)
    part_name: Mapped[str] = mapped_column(Text, nullable=False)

    category_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("categories.category_id", ondelete="SET NULL")
    )

    parts_metadata: Mapped[Optional[str]] = mapped_column(Text)
    created_by: Mapped[Optional[int]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    created_at: Mapped[Optional[datetime.datetime]] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    image: Mapped[Optional[bytes]] = mapped_column(BYTEA)

    # weight is the ONE dimension that stays a plain fixed field — single
    # value, no instances, no min/max, no calibration factor.

    # basic dimensions
    part_weight: Mapped[Optional[float]] = mapped_column(Float)

    # part_height: Mapped[Optional[float]] = mapped_column(Float)
    # part_width: Mapped[Optional[float]] = mapped_column(Float)

    # diameter structure
    # part_inner_diameter: Mapped[Optional[float]] = mapped_column(Float)
    # part_outer_diameter: Mapped[Optional[float]] = mapped_column(Float)

    # master measurement config (JSON)
    # actual_measurement_data: Mapped[Optional[dict[str, Any]]] = mapped_column(JSONB)

    # additional measurements
    # part_length: Mapped[Optional[float]] = mapped_column(Float)
    # part_angle: Mapped[Optional[float]] = mapped_column(Float)
    # part_arch_length: Mapped[Optional[float]] = mapped_column(Float)
    # part_sector:  Mapped[Optional[float]] = mapped_column(Float)  

    # ---------------------------------------------------------------------
    # SINGLE SOURCE OF TRUTH for every other dimensional parameter.
    # No more fixed part_length / part_width / part_height / part_inner_
    # diameter / part_outer_diameter / part_angle / part_arch_length /
    # part_sector columns — all of that now lives here, as unlimited
    # numbered instances per family:
    #
    #   {
    #     "length1": {"value": 40.0, "min_value": 39.5, "max_value": 40.5,
    #                 "calibration_factor": 1.002},
    #     "length2": {"value": 12.0, "min_value": 11.5, "max_value": 12.5},
    #     "width1":  {"value": 8.0},
    #     "od1":     {"value": 6.2, "min_value": 6.0, "max_value": 6.4}
    #   }
    #
    # Recognized family prefixes: length, width, height, id (inner diameter),
    # od (outer diameter), angle, arch, sector. Instance numbers (1, 2, 3, ...)
    # are unbounded. Every field inside an instance (value / min_value /
    # max_value / calibration_factor) is optional and independent.
    # ---------------------------------------------------------------------

    # dynamic measurement template (min/max/camera per parameter)
    measurement_parameters: Mapped[Optional[dict]] = mapped_column(JSONB)

    # ---------------------------------------------------------------------
    # Defect CONFIG for this part — same generalized/numbered-instance
    # pattern as measurement_parameters:
    #   { "d1": {"defect_name": "dent",    "confidence_threshold": 0.6},
    #     "d2": {"defect_name": "scratch", "confidence_threshold": 0.75} }
    # Instance numbers (1, 2, 3, ...) are unbounded. Only meaningful when
    # mode_of_operation == "Defect Detection", but not enforced at the DB
    # level. Actual pass/fail RESULTS per inspected unit live in
    # PartDefect.defects, keyed the same way (e.g. {"d1": "NOK", "d2": "OK"}).
    # ---------------------------------------------------------------------
    defect_parameters: Mapped[Optional[dict]] = mapped_column(JSONB)

    # boolean flags
    part_co_planarity: Mapped[bool] = mapped_column(nullable=False, server_default="false")
    part_parallelity: Mapped[bool] = mapped_column(nullable=False, server_default="false")
    part_concentricity: Mapped[bool] = mapped_column(nullable=False, server_default="false")

    # mode of operation (enum)
    mode_of_operation: Mapped[str] = mapped_column(
        Text, nullable=False, server_default="Counting"
    )

    category: Mapped[Optional["Category"]] = relationship(back_populates="parts")
    creator: Mapped[Optional["User"]] = relationship(back_populates="parts")
    sessions: Mapped[list["CompanySession"]] = relationship(back_populates="part")
    defects: Mapped[list["PartDefect"]] = relationship(
        back_populates="part", passive_deletes=True
    )


class CompanySession(Base):
    __tablename__ = "company_sessions"
    __table_args__ = (
        CheckConstraint(
            "overall_status IN ('OK', 'NOK')",
            name="ck_company_sessions_overall_status",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    part_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("parts.part_id", ondelete="SET NULL"), index=True
    )
    part_code: Mapped[str] = mapped_column(Text, nullable=False)
    part_name: Mapped[str] = mapped_column(Text, nullable=False)

    part_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    parts_per_minute: Mapped[Optional[int]] = mapped_column(Integer)

    session_start: Mapped[Optional[datetime.datetime]] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )
    session_end: Mapped[Optional[datetime.datetime]] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[Optional[datetime.datetime]] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    notes: Mapped[Optional[str]] = mapped_column(Text)
    session_weight: Mapped[Optional[float]] = mapped_column(Float)
    order_no: Mapped[Optional[str]] = mapped_column(Text)

    measured_realtime_data: Mapped[Optional[dict[str, Any]]] = mapped_column(JSONB)
    overall_status: Mapped[Optional[str]] = mapped_column(Text)

    # calibration
    is_calibration: Mapped[bool] = mapped_column(nullable=False, server_default="false")
    calibration_expected_per_run: Mapped[Optional[int]] = mapped_column(Integer)
    calibration_total_runs: Mapped[Optional[int]] = mapped_column(Integer)
    calibration_runs: Mapped[Optional[dict[str, Any]]] = mapped_column(JSONB)
    calibration_avg_count: Mapped[Optional[float]] = mapped_column(Float)
    calibration_avg_accuracy: Mapped[Optional[float]] = mapped_column(Float)
    calibration_passed: Mapped[Optional[bool]] = mapped_column()
    calibration_completed_at: Mapped[Optional[datetime.datetime]] = mapped_column(
        DateTime(timezone=True)
    )

    part: Mapped[Optional["Part"]] = relationship(back_populates="sessions")
    defects: Mapped[list["PartDefect"]] = relationship(
        back_populates="session", passive_deletes=True
    )


class PartDefect(Base):
    __tablename__ = "part_defects"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    session_id: Mapped[int] = mapped_column(
        ForeignKey("company_sessions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    part_id: Mapped[int] = mapped_column(
        ForeignKey("parts.part_id", ondelete="CASCADE"), nullable=False, index=True
    )
    defects: Mapped[Optional[dict]] = mapped_column(JSONB)   # {"dent": true, "scratch": false}
    created_at: Mapped[Optional[datetime.datetime]] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    session: Mapped["CompanySession"] = relationship(back_populates="defects")
    part: Mapped["Part"] = relationship(back_populates="defects")
