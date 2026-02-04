from sqlalchemy import Column, Integer, String, DateTime, JSON, Float
from .database import Base
import datetime


class Device(Base):
    __tablename__ = "devices"
    id = Column(Integer, primary_key=True, index=True)
    device_id = Column(String, unique=True, index=True, nullable=False)
    gender = Column(String, nullable=True)
    nickname = Column(String, nullable=True)
    bio = Column(String, nullable=True)
    # `metadata` is a reserved name on the declarative base; use
    # attribute `meta` while keeping the DB column name `metadata`.
    meta = Column("metadata", JSON, default={})
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


class Report(Base):
    __tablename__ = "reports"
    id = Column(Integer, primary_key=True, index=True)
    reporter_device_id = Column(String, nullable=False, index=True)
    reported_device_id = Column(String, nullable=False, index=True)
    reason = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


class DailyLimit(Base):
    """Track daily match limits per device and gender"""
    __tablename__ = "daily_limits"
    id = Column(Integer, primary_key=True, index=True)
    device_id = Column(String, index=True, nullable=False)
    date = Column(String, nullable=False)  # YYYY-MM-DD format
    male_count = Column(Integer, default=0)
    female_count = Column(Integer, default=0)
    non_binary_count = Column(Integer, default=0)
    prefer_not_to_say_count = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

