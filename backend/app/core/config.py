"""Application configuration via pydantic-settings."""
from functools import lru_cache
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    openai_api_key: str = ""
    mysql_host: str = ""
    mysql_port: int = 3306
    mysql_user: str = ""
    mysql_password: str = ""
    mysql_db: str = "stocksense_inventory"
    allowed_origins: str = "http://localhost:3000,http://127.0.0.1:3000"

    # Email / SMTP — used for delivery delay notifications
    smtp_host: str = "smtp.gmail.com"
    smtp_port: int = 587
    smtp_user: str = ""          # Gmail address used to send alerts
    smtp_password: str = ""      # Gmail App Password (not your regular password)
    notification_email: str = ""                      # recipient: owner / ops manager (set in .env)

    class Config:
        env_file = ".env"
        case_sensitive = False

    def get_allowed_origins(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
