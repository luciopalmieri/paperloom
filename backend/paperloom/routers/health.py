import importlib.util
from typing import Any

import httpx
from fastapi import APIRouter

from paperloom._api import __version__
from paperloom.anonymizer import _lazy_install
from paperloom.config import settings
from paperloom.privacy import current_state

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
        "opf_auto_install": _lazy_install.auto_install_enabled(),
    }


@router.get("/status")
async def status() -> dict[str, Any]:
    """Runtime status: version, privacy mode, components, caveats.

    The web UI badge polls this. Cheap — never touches the network.
    """
    return {
        "version": __version__,
        "privacy": current_state(),
    }
