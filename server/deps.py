import os
from dataclasses import dataclass
from typing import AsyncGenerator
from pathlib import Path
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

# Try to load .env file using python-dotenv if available
try:
    from dotenv import load_dotenv
    env_path = Path(__file__).parent.parent / ".env"
    if env_path.exists():
        load_dotenv(env_path)
    else:
        # Try server/.env as fallback
        env_path = Path(__file__).parent / ".env"
        if env_path.exists():
            load_dotenv(env_path)
except ImportError:
    pass  # python-dotenv not installed, use system env only

@dataclass
class Settings:
    secret_key: str
    backend_url: str
    frontend_url: str
    admin_email: str

def get_settings() -> Settings:
    backend_url = os.getenv("BACKEND_URL", "http://localhost:8000")
    # Ensure no double slashes before port
    backend_url = backend_url.replace("://:","://")  # Fix ://: to ://
    
    return Settings(
        secret_key=os.getenv("SECRET_KEY", "change-this"),
        backend_url=backend_url,
        frontend_url=os.getenv("FRONTEND_URL", "http://localhost:5173"),
        admin_email=os.getenv("ADMIN_EMAIL", "longtqse172269@fpt.edu.vn"),
    )

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./app.db")
engine = create_async_engine(DATABASE_URL, echo=False)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)

async def get_session() -> AsyncGenerator[AsyncSession, None]:
    async with SessionLocal() as session:
        yield session
