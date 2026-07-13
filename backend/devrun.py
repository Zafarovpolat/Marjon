"""Dev bootstrap: create tables on SQLite, then run uvicorn. For local verification only."""
import os
os.environ["DEBUG"] = "false"          # quiet SQLAlchemy echo
os.environ["SECRET_KEY"] = "dev-only-insecure-secret-key"
os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:////agent/workspace/Marjon/backend/dev.db")

import asyncio
import uvicorn
from app.main import app                # registers all models on Base.metadata
from app.infrastructure.database.session import create_tables

if __name__ == "__main__":
    asyncio.run(create_tables())
    uvicorn.run(app, host="127.0.0.1", port=8000, log_level="warning")
