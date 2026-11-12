from functools import cached_property

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "FridgeLedger API"
    app_env: str = "development"
    api_cors_origins: str = "http://localhost:3000"

    supabase_url: str | None = None
    supabase_service_role_key: str | None = None
    supabase_storage_bucket: str = "receipts"

    gemini_api_key: str | None = None
    gemini_model_id: str = "gemini-3.5-flash-lite"

    telegram_bot_token: str | None = None

    gmail_smtp_host: str = "smtp.gmail.com"
    gmail_smtp_port: int = 587
    gmail_smtp_user: str | None = None
    gmail_smtp_app_password: str | None = None
    gmail_from_email: str | None = None

    model_base_url: str = "http://[IP_ADDRESS]"
    model_name: str = "your_model_name_here"

    model_config = SettingsConfigDict(env_file="../.env", env_file_encoding="utf-8")

    @cached_property
    def cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.api_cors_origins.split(",") if origin.strip()]


settings = Settings()
