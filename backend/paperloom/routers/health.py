import importlib.util

import httpx
from fastapi import APIRouter

from paperloom.config import settings

router = APIRouter(prefix="/api", tags=["health"])


async def _ollama_up() -> bool:
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            r = await client.get(f"{settings.ollama_url}/api/tags")
            return r.status_code == 200
    except Exception:
        return False


def _opf_installed() -> bool:
    return importlib.util.find_spec("opf") is not None


@router.get("/health")
async def health() -> dict[str, bool]:
    return {
        "ollama": await _ollama_up(),
        "opf": _opf_installed(),
    }
