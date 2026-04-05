from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import settings


class Base(DeclarativeBase):
    pass


# Ensure we use an async driver in the URL
async_db_url = settings.database_url
if async_db_url.startswith("postgresql://"):
    async_db_url = async_db_url.replace("postgresql://", "postgresql+psycopg://", 1)
# For sqlite (if used locally) this would require aiosqlite, keeping string replacement as a fallback
elif async_db_url.startswith("sqlite:///"):
    async_db_url = async_db_url.replace("sqlite:///", "sqlite+aiosqlite:///", 1)

engine = create_async_engine(
    async_db_url,
    connect_args={"check_same_thread": False}
    if async_db_url.startswith("sqlite")
    else {},
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    autoflush=False,
    expire_on_commit=False,
    class_=AsyncSession,
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as db:
        yield db
