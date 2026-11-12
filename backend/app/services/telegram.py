import httpx

from app.core.config import settings


def _api(path: str) -> str:
    return f"https://api.telegram.org/bot{settings.telegram_bot_token}/{path}"


async def get_file_bytes(file_id: str) -> bytes:
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.get(_api("getFile"), params={"file_id": file_id})
        r.raise_for_status()
        file_path = r.json()["result"]["file_path"]

        r = await client.get(
            f"https://api.telegram.org/file/bot{settings.telegram_bot_token}/{file_path}"
        )
        r.raise_for_status()
        return r.content


async def send_message(chat_id: int, text: str) -> None:
    async with httpx.AsyncClient(timeout=10) as client:
        await client.post(_api("sendMessage"), json={"chat_id": chat_id, "text": text})
