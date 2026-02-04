"""Database connectors for PostgreSQL and Redis (scaffold).
This file re-uses app.database if present; otherwise creates lightweight defaults.
"""
import os
try:
    # prefer existing app.database when running within repo
    from app.database import engine, AsyncSessionLocal, Base
except Exception:
    # fallback simple placeholders (do not use in production)
    engine = None
    AsyncSessionLocal = None
    Base = None

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

def redis_url():
    return REDIS_URL
