"""Backend models wrapper to match requested layout.
Re-exports models defined under `app.models` if present.
"""
try:
    from app.models import Device, Report
except Exception:
    # Lightweight fallback definitions for users who run this file directly.
    from dataclasses import dataclass
    from datetime import datetime

    @dataclass
    class Device:
        device_id: str
        gender: str = None
        nickname: str = None
        bio: str = None
        meta: dict = None
        created_at: datetime = datetime.utcnow()

    @dataclass
    class Report:
        reporter_device_id: str
        reported_device_id: str
        reason: str = None
        created_at: datetime = datetime.utcnow()
