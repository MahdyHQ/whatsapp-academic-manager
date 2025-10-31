"""
Database configuration and session management
Provides secure database connection with error handling
"""

from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session
from typing import Generator
import time

from backend.config import get_settings
from backend.utils.logger import ErrorTracker

settings = get_settings()
tracker = ErrorTracker()

# Create database engine with connection pooling
try:
    engine = create_engine(
        settings.database_url,
        pool_pre_ping=True,  # Verify connections before using
        pool_size=10,  # Maximum number of connections
        max_overflow=20,  # Extra connections if pool is full
        echo=settings.debug,  # Log SQL queries in debug mode
    )
    tracker.log_info("✅ Database engine created successfully")
except Exception as e:
    tracker.log_critical("Failed to create database engine", exception=e)
    raise

# Create SessionLocal class for database sessions
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base class for all models
Base = declarative_base()


def get_db() -> Generator[Session, None, None]:
    """
    Dependency function to get database session
    Automatically handles session lifecycle and errors
    
    Usage in FastAPI:
        @app.get("/users")
        def get_users(db: Session = Depends(get_db)):
            return db.query(User).all()
    """
    db = SessionLocal()
    start_time = time.time()
    
    try:
        yield db
        duration_ms = (time.time() - start_time) * 1000
        tracker.log_database_operation(
            operation="session",
            table="all",
            duration_ms=duration_ms,
            rows_affected=0
        )
    except Exception as e:
        tracker.log_error(
            "Database session error",
            exception=e,
            context={"operation": "get_db"}
        )
        db.rollback()
        raise
    finally:
        db.close()


def init_db():
    """
    Initialize database - create all tables
    Call this when starting the application
    """
    try:
        Base.metadata.create_all(bind=engine)
        tracker.log_info("✅ Database tables created successfully")
    except Exception as e:
        tracker.log_critical("Failed to create database tables", exception=e)
        raise
