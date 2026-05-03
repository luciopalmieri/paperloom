"""OCR backend registry.

Each backend implements `OCRBackend`. The factory `get_backend(name)` reads
`settings.ocr_provider` (env: `OCR_PROVIDER`) when no name is passed and
returns the configured backend. Local backends (Ollama, stub) are always
importable. Cloud backends (Mistral, OpenAI, Anthropic) are imported lazily
and require the matching extra (`paperloom[mistral]`, etc.).
"""

from __future__ import annotations

from paperloom.config import settings
from paperloom.ocr.backends.base import BackendError, BackendNotInstalled, OCRBackend
from paperloom.ocr.backends.ollama import OllamaBackend
from paperloom.ocr.backends.stub import StubBackend

_REGISTRY: dict[str, type[OCRBackend]] = {
    "ollama": OllamaBackend,
    "stub": StubBackend,
}


def _load_optional(name: str) -> type[OCRBackend] | None:
    """Lazy-import cloud backends. They use raw httpx (no SDK extras),
    so the only failure mode here is a missing module file.
    """
    if name == "mistral":
        try:
            from paperloom.ocr.backends.mistral import MistralBackend
        except ImportError as exc:
            raise BackendNotInstalled(f"mistral backend not importable: {exc}") from exc
        return MistralBackend
    return None


def available_providers() -> list[str]:
    """Names of backends paperloom knows about (registered or cloud-extra)."""
    return [*sorted(_REGISTRY.keys()), "mistral"]


def get_backend(name: str | None = None) -> OCRBackend:
    """Return an instance of the configured (or named) OCR backend."""
    chosen = (name or settings.ocr_provider or "ollama").strip().lower()
    cls = _REGISTRY.get(chosen)
    if cls is None:
        cls = _load_optional(chosen)
    if cls is None:
        raise BackendError(
            f"unknown OCR provider {chosen!r}; known: {available_providers()}",
        )
    return cls()


__all__ = [
    "BackendError",
    "BackendNotInstalled",
    "OCRBackend",
    "available_providers",
    "get_backend",
]
