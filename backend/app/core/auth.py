from __future__ import annotations

from dataclasses import dataclass

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from supabase import create_client

from app.core.config import settings


bearer_scheme = HTTPBearer(auto_error=False)


@dataclass(frozen=True)
class CurrentUser:
    id: str
    email: str | None = None


def get_supabase_client():
    if not settings.supabase_url or not settings.supabase_service_role_key:
        raise HTTPException(status_code=500, detail="Supabase configuration is missing")
    return create_client(settings.supabase_url, settings.supabase_service_role_key)


async def require_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> CurrentUser:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(status_code=401, detail="Authentication required")

    try:
        response = get_supabase_client().auth.get_user(credentials.credentials)
    except Exception as exc:
        raise HTTPException(status_code=401, detail="Invalid authentication token") from exc

    user = getattr(response, "user", None)
    user_id = getattr(user, "id", None)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid authentication token")

    return CurrentUser(id=str(user_id), email=getattr(user, "email", None))


async def require_user_id(
    current_user: CurrentUser = Depends(require_current_user),
) -> str:
    return current_user.id
