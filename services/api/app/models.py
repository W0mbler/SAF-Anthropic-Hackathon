"""Relational ownership, reference data, and immutable optimisation records."""

import uuid
from datetime import datetime, timezone

from sqlalchemy import JSON, Boolean, CheckConstraint, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base


def now():
    return datetime.now(timezone.utc)


def new_id():
    return str(uuid.uuid4())


class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    email: Mapped[str] = mapped_column(String(254), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(Text)
    display_name: Mapped[str] = mapped_column(String(100), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class BrowserSession(Base):
    __tablename__ = "browser_sessions"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    csrf_token: Mapped[str] = mapped_column(String(64))
    user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Location(Base):
    __tablename__ = "locations"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    kind: Mapped[str] = mapped_column(String(16))
    display_name: Mapped[str] = mapped_column(String(255))
    latitude: Mapped[float] = mapped_column(Float)
    longitude: Mapped[float] = mapped_column(Float)
    attributes: Mapped[dict] = mapped_column(JSON)


class CandidateSite(Base):
    __tablename__ = "candidate_sites"
    id: Mapped[str] = mapped_column(ForeignKey("locations.id"), primary_key=True)
    allows_depot: Mapped[bool] = mapped_column(Boolean)
    allows_refinery: Mapped[bool] = mapped_column(Boolean)
    screening_method_version: Mapped[str] = mapped_column(String(255))


class Scenario(Base):
    __tablename__ = "scenarios"
    __table_args__ = (
        CheckConstraint(
            "(user_id IS NOT NULL AND guest_session_id IS NULL) OR (user_id IS NULL AND guest_session_id IS NOT NULL)",
            name="one_owner",
        ),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    guest_session_id: Mapped[str | None] = mapped_column(
        ForeignKey("browser_sessions.id"), nullable=True, index=True
    )
    name: Mapped[str] = mapped_column(String(100))
    assumptions: Mapped[dict] = mapped_column(JSON)
    version: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, onupdate=now)


class OptimizationRun(Base):
    __tablename__ = "optimization_runs"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    scenario_id: Mapped[str] = mapped_column(ForeignKey("scenarios.id", ondelete="CASCADE"), index=True)
    input_snapshot: Mapped[dict] = mapped_column(JSON)
    input_hash: Mapped[str] = mapped_column(String(64), index=True)
    result: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class RunFacility(Base):
    __tablename__ = "run_facilities"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    optimization_run_id: Mapped[str] = mapped_column(
        ForeignKey("optimization_runs.id", ondelete="CASCADE"), index=True
    )
    candidate_site_id: Mapped[str] = mapped_column(ForeignKey("candidate_sites.id"))
    facility_type: Mapped[str] = mapped_column(String(16))
    size: Mapped[str] = mapped_column(String(16))
    latitude: Mapped[float] = mapped_column(Float)
    longitude: Mapped[float] = mapped_column(Float)
    capacity_input_kt: Mapped[float] = mapped_column(Float)
    throughput_input_kt: Mapped[float] = mapped_column(Float)
    capex_usd: Mapped[float] = mapped_column(Float)


class RunFlow(Base):
    __tablename__ = "run_flows"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    optimization_run_id: Mapped[str] = mapped_column(
        ForeignKey("optimization_runs.id", ondelete="CASCADE"), index=True
    )
    stage: Mapped[str] = mapped_column(String(32))
    from_node_id: Mapped[str] = mapped_column(String(64))
    to_node_id: Mapped[str] = mapped_column(String(64))
    quantity_kt: Mapped[float] = mapped_column(Float)
    material: Mapped[str] = mapped_column(String(16))
    distance_km: Mapped[float] = mapped_column(Float)
    tariff_usd_per_tonne_km: Mapped[float] = mapped_column(Float)
    transport_usd: Mapped[float] = mapped_column(Float)
