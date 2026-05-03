"""Runtime privacy-mode introspection.

paperloom advertises itself as local-first. That is true for **paperloom's
own components** (computation, PII detection, transport). It is **not**
guaranteed end-to-end when an MCP client routes tool I/O through a cloud
LLM provider — in that case bytes leave the machine through the *client*,
not paperloom.

This module computes a `PrivacyState` reflecting only what paperloom can
see and control. The cloud-LLM-via-MCP-client caveat is always included
in `caveats` so consumers (UI badge, doctor command, MCP banner) display
it prominently.

Mode definitions:
- `local`  : every paperloom component runs on the user's machine.
- `hybrid` : at least one component (typically OCR) is cloud-based.
- `cloud`  : every paperloom component is cloud-based (rare; mostly a
             theoretical category — paperloom's anonymizer is local-only).
"""

from __future__ import annotations

from typing import Literal, TypedDict

from paperloom.config import settings
from paperloom.ocr.backends import get_backend


class ComponentStatus(TypedDict):
    name: str
    provider: str
    is_local: bool
    detail: str


class PrivacyState(TypedDict):
    mode: Literal["local", "hybrid", "cloud"]
    components: list[ComponentStatus]
    caveats: list[str]


_MCP_CLIENT_CAVEAT = (
    "MCP transport: when the calling client runs on a cloud LLM provider "
    "(Claude Desktop, Cursor, ChatGPT desktop, etc.), tool inputs and "
    "outputs traverse that provider's API. paperloom processes data "
    "locally, but the agent reading/writing the tool calls is outside "
    "paperloom's privacy boundary. See doc/privacy.md."
)


def _ocr_status() -> ComponentStatus:
    try:
        backend = get_backend()
    except Exception as exc:  # noqa: BLE001 — surface init failure as status
        return {
            "name": "ocr",
            "provider": settings.ocr_provider or "ollama",
            "is_local": False,
            "detail": f"backend init failed: {exc}",
        }
    detail = f"{backend.provider_name}"
    if backend.provider_name == "ollama":
        detail = f"ollama @ {settings.ollama_url} ({settings.ollama_model})"
    elif backend.provider_name == "mistral":
        detail = (
            f"mistral {settings.mistral_ocr_model} ({settings.mistral_ocr_mode} mode) "
            f"— cloud round-trip"
        )
    return {
        "name": "ocr",
        "provider": backend.provider_name,
        "is_local": backend.is_local,
        "detail": detail,
    }


def _anonymizer_status() -> ComponentStatus:
    # OPF is the only anonymizer; auto-installs on first use. Always local.
    return {
        "name": "anonymizer",
        "provider": "opf",
        "is_local": True,
        "detail": "OpenAI Privacy Filter, runs on CPU/GPU locally",
    }


def current_state() -> PrivacyState:
    components: list[ComponentStatus] = [
        _ocr_status(),
        _anonymizer_status(),
    ]
    locals_ok = [c["is_local"] for c in components]
    if all(locals_ok):
        mode: Literal["local", "hybrid", "cloud"] = "local"
    elif any(locals_ok):
        mode = "hybrid"
    else:
        mode = "cloud"

    caveats: list[str] = [_MCP_CLIENT_CAVEAT]
    if mode != "local":
        cloud_components = [c["name"] for c in components if not c["is_local"]]
        caveats.insert(
            0,
            f"Cloud components active: {', '.join(cloud_components)}. "
            f"Inputs to these components leave the machine.",
        )

    return {"mode": mode, "components": components, "caveats": caveats}


def short_summary() -> str:
    """One-line summary for banners and CLI doctor output."""
    state = current_state()
    parts = [f"privacy mode: {state['mode'].upper()}"]
    for c in state["components"]:
        flag = "local" if c["is_local"] else "CLOUD"
        parts.append(f"{c['name']}={c['provider']}({flag})")
    return " | ".join(parts)
