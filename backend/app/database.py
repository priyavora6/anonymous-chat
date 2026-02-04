from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker, declarative_base
import os
import time
import importlib

# Allow overriding via environment variable. If not set, prefer Postgres
# when asyncpg is available, otherwise fall back to a local SQLite DB
# Use DATABASE_URL when explicitly provided. Do NOT auto-select Postgres
# based on installed drivers because that can cause connection attempts
# to a non-running local Postgres and crash request handlers.
env_url = os.getenv("DATABASE_URL")
if env_url:
    DATABASE_URL = env_url
else:
    # Default to a local SQLite file for development/demo.
    db_path = os.path.abspath(os.path.join(os.getcwd(), "anonchat.db"))
    # If the file exists but is not a valid SQLite DB, rename it to avoid crashes.
    if os.path.exists(db_path):
        try:
            with open(db_path, "rb") as f:
                header = f.read(16)
            if header != b"SQLite format 3\x00":
                backup_path = f"{db_path}.bak-{int(time.time())}"
                os.replace(db_path, backup_path)
                print(f"[DB] ⚠️ Renamed invalid DB file to: {backup_path}")
        except Exception as e:
            print(f"[DB] ⚠️ Could not validate DB file: {e}")
    DATABASE_URL = "sqlite+aiosqlite:///./anonchat.db"

engine = create_async_engine(DATABASE_URL, future=True)
AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
Base = declarative_base()

async def get_db():
    async with AsyncSessionLocal() as session:
        yield session
