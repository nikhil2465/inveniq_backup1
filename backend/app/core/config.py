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
    smtp_user: str = ""
    smtp_password: str = ""
    notification_email: str = ""

    # ── Authentication ─────────────────────────────────────────────────────────
    # Set JWT_SECRET_KEY to a strong random string (32+ chars) in production.
    jwt_secret_key: str = "inveniq-dev-change-this-in-production-2026"
    access_token_expire_hours: int = 8

    # ── Client / default user credentials ────────────────────────────────────
    auth_username:        str = "admin"
    auth_password:        str = "inveniq@2024"
    auth_display_name:    str = "Admin"
    auth_email:           str = "admin@inveniq.app"
    auth_role:            str = "admin"
    # Comma-separated module IDs this user can access.
    # "all" = unrestricted (admin role always gets all modules regardless of this setting).
    # Example for client: "quotes,customers,catalog,chatbot,settings,about"
    auth_allowed_modules: str = "all"

    # ── Owner / developer backdoor (optional) ─────────────────────────────────
    # Set OWNER_USERNAME + OWNER_PASSWORD to retain full admin access on a
    # client deployment where AUTH_ROLE=client restricts the main account.
    # Leave blank to disable (no backdoor account).
    owner_username:     str = ""
    owner_password:     str = ""
    owner_display_name: str = "Owner"
    owner_email:        str = ""

    class Config:
        env_file = ".env"
        case_sensitive = False

    def get_allowed_origins(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
