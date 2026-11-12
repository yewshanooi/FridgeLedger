from app.core.config import settings


def get_supabase_settings() -> dict[str, str | None]:
    return {
        "url": settings.supabase_url,
        "service_role_key": settings.supabase_service_role_key,
        "storage_bucket": settings.supabase_storage_bucket,
    }
