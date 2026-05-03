"""OCRBackend protocol.

Two surfaces:

- `stream_page(image_png, prompt)` — REQUIRED. Yields markdown chunks for a
  single rendered page image. Used for streaming UX (SSE page-by-page).
- `process_pdf_batch(pdf_path, pages)` — OPTIONAL. Returns the entire
  markdown output for the requested pages in one call. Backends that
  natively process whole PDFs (Mistral OCR `document_url` / `file`) override
  this for cheaper, single-call execution. Pipeline checks `batch_supported`
  and prefers batch when configured.

Backends declare:
  `provider_name`  — short slug (`ollama`, `mistral`, ...)
  `is_local`       — True if all computation is on the user's machine.
  `batch_supported`— True if `process_pdf_batch` is meaningful.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import AsyncIterator
from pathlib import Path


class BackendError(RuntimeError):
    """Backend invocation failed (network, auth, model error)."""


class BackendNotInstalled(BackendError):
    """Optional dep for this backend is not installed in the active env."""


class OCRBackend(ABC):
    provider_name: str = "abstract"
    is_local: bool = True
    batch_supported: bool = False

    @abstractmethod
    async def stream_page(
        self,
        image_png: bytes,
        prompt: str,
    ) -> AsyncIterator[str]:
        """Yield markdown chunks for ONE page image. Required."""

    async def process_pdf_batch(
        self,
        pdf_path: Path,
        pages: list[int],
    ) -> dict[int, str] | None:
        """Optional batch path. Return {page_number: markdown} or None.

        Default implementation returns None — pipeline falls back to
        per-page streaming via `stream_page`. Backends that benefit from
        a single round trip (Mistral document_url, OpenAI file API) override.
        """
        return None
