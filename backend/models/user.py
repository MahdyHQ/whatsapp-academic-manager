from datetime import datetime
from sqlalchemy import Column, Integer, String, Boolean, DateTime
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship
from backend.utils.database import Base
from backend.utils.logger import logger
import bcrypt

Base = declarative_base()

class User(Base):
    __tablename__ = 'users'

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    full_name = Column(String)
    phone_number = Column(String)
    is_active = Column(Boolean, default=True)
    is_verified = Column(Boolean, default=False)
    is_admin = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    last_login = Column(DateTime, nullable=True)
    whatsapp_phone = Column(String)
    whatsapp_account_id = Column(String)

    def hash_password(self, password: str) -> str:
        try:
            return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
        except Exception as e:
            logger.error(f"Error hashing password: {e}")
            raise

    def verify_password(self, password: str) -> bool:
        try:
            return bcrypt.checkpw(password.encode('utf-8'), self.hashed_password.encode('utf-8'))
        except Exception as e:
            logger.error(f"Error verifying password: {e}")
            return False

    def update_last_login(self) -> None:
        self.last_login = datetime.utcnow()
        try:
            # Code to commit the update to the database should be added here
            pass
        except Exception as e:
            logger.error(f"Error updating last login: {e}")

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "email": self.email,
            "full_name": self.full_name,
            "phone_number": self.phone_number,
            "is_active": self.is_active,
            "is_verified": self.is_verified,
            "is_admin": self.is_admin,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
            "last_login": self.last_login,
            "whatsapp_phone": self.whatsapp_phone,
            "whatsapp_account_id": self.whatsapp_account_id,
        }

class SystemSettings(Base):
    __tablename__ = 'system_settings'

    id = Column(Integer, primary_key=True, index=True)
    signup_enabled = Column(Boolean, default=True)
    signup_requires_approval = Column(Boolean, default=False)
    require_email_verification = Column(Boolean, default=True)
    max_whatsapp_accounts_per_user = Column(Integer, default=1)
    default_ai_provider = Column(String, default='OpenAI')
    ai_enabled = Column(Boolean, default=True)
    email_notifications_enabled = Column(Boolean, default=True)

    def __init__(self):
        # Initialize with default settings if needed
        pass
