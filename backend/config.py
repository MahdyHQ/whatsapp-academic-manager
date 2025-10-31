"""
Configuration management for WhatsApp Academic Manager
Loads environment variables and provides application settings
"""

import os
from typing import Optional
from pydantic_settings import BaseSettings
from pydantic import Field


class Settings(BaseSettings):
    """Application settings loaded from environment variables"""
    
    # ===== AI PROVIDERS =====
    gemini_api_key: Optional[str] = Field(None, alias="GEMINI_API_KEY")
    openai_api_key: Optional[str] = Field(None, alias="OPENAI_API_KEY")
    anthropic_api_key: Optional[str] = Field(None, alias="ANTHROPIC_API_KEY")
    mistral_api_key: Optional[str] = Field(None, alias="MISTRAL_API_KEY")
    
    # ===== DATABASE =====
    database_url: str = Field(..., alias="DATABASE_URL")
    
    # ===== SECURITY =====
    secret_key: str = Field(..., alias="SECRET_KEY")
    jwt_secret_key: str = Field(..., alias="JWT_SECRET_KEY")
    jwt_algorithm: str = Field("HS256", alias="JWT_ALGORITHM")
    jwt_expiration_hours: int = Field(24, alias="JWT_EXPIRATION_HOURS")
    
    # ===== API CONFIGURATION =====
    api_v2_prefix: str = Field("/api/v2", alias="API_V2_PREFIX")
    backend_port: int = Field(8000, alias="BACKEND_PORT")
    backend_host: str = Field("0.0.0.0", alias="BACKEND_HOST")
    
    # ===== FRONTEND =====
    frontend_url: str = Field("http://localhost:3000", alias="FRONTEND_URL")
    
    # ===== NOTIFICATIONS =====
    smtp_host: Optional[str] = Field(None, alias="SMTP_HOST")
    smtp_port: Optional[int] = Field(587, alias="SMTP_PORT")
    smtp_user: Optional[str] = Field(None, alias="SMTP_USER")
    smtp_password: Optional[str] = Field(None, alias="SMTP_PASSWORD")
    smtp_from_email: Optional[str] = Field(None, alias="SMTP_FROM_EMAIL")
    smtp_from_name: str = Field("WhatsApp Academic Manager", alias="SMTP_FROM_NAME")
    
    # ===== WHATSAPP CONFIGURATION =====
    whatsapp_session_path: str = Field("./sessions", alias="WHATSAPP_SESSION_PATH")
    whatsapp_max_retries: int = Field(3, alias="WHATSAPP_MAX_RETRIES")
    whatsapp_retry_delay: int = Field(5, alias="WHATSAPP_RETRY_DELAY")
    
    # ===== AI CONFIGURATION =====
    ai_default_provider: str = Field("gemini", alias="AI_DEFAULT_PROVIDER")
    ai_confidence_threshold: float = Field(0.7, alias="AI_CONFIDENCE_THRESHOLD")
    ai_max_tokens: int = Field(1000, alias="AI_MAX_TOKENS")
    ai_temperature: float = Field(0.3, alias="AI_TEMPERATURE")
    
    # ===== LOGGING =====
    log_level: str = Field("INFO", alias="LOG_LEVEL")
    log_file: str = Field("./logs/app.log", alias="LOG_FILE")
    
    # ===== DEVELOPMENT =====
    debug: bool = Field(False, alias="DEBUG")
    environment: str = Field("production", alias="ENVIRONMENT")
    
    class Config:
        env_file = ".env"
        case_sensitive = False


# Create global settings instance
settings = Settings()


def get_settings() -> Settings:
    """Get application settings instance"""
    return settings
