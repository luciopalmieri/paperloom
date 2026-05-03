"""Mistral OCR backend (cloud, opt-in).

Cloud backend — bytes leave the user's machine. Selected when
`OCR_PROVIDER=mistral`. Requires `MISTRAL_API_KEY` and the optional
extra: `pip install paperloom[mistral]`.

Two operating modes (`MISTRAL_OCR_MODE`):

- `batch` (default, cheaper) — single API call per PDF, whole-document.
  Mistral processes all pages in one round trip and returns the full
  markdown back. **No streaming UX**: the chain renders all pages at
  once when the response arrives.
- `per_page` — one API call per rendered page image. Slower, costs more
  (one billable doc per page), but preserves paperloom's page-by-page
  streaming.

Both modes return identical markdown to the caller; the trade-off is
purely cost vs. UX latency feedback.
"""

from __future__ import annotations

import base64
import json
import os
from collections.abc import AsyncIterator
from pathlib import Path

import httpx

from paperloom.config import settings
from paperloom.ocr.backends.base import BackendError, BackendNotInstalled, OCRBackend


def _api_key() -> str:
    key = settings.mistral_api_key or os.environ.get("MISTRAL_API_KEY") or ""
    if not key:
        raise BackendNotInstalled(
            "MISTRAL_API_KEY is not set; export it or set in .env "
            "before selecting the mistral OCR backend.",
        )
    return key


def _model() -> str:
    return settings.mistral_ocr_model or "mistral-ocr-latest"


def _api_base() -> str:
    return (settings.mistral_api_base or "https://api.mistral.ai").rstrip("/")


class MistralBackend(OCRBackend):
    provider_name = "mistral"
    is_local = False

    @property
    def batch_supported(self) -> bool:  # type: ignore[override]
        # batch is preferred when env says so. per_page mode disables batch
        # so the pipeline keeps streaming page-by-page.
        return (settings.mistral_ocr_mode or "batch").lower() == "batch"

    async def stream_page(
        self,
        image_png: bytes,
        prompt: str,
    ) -> AsyncIterator[str]:
        """Per-page mode: send one PNG, return its markdown as a single chunk.

        Mistral OCR is non-streaming at the API level — the markdown for
        the page arrives in one piece. We yield it as a single chunk so
        the rest of the pipeline (figure extraction, SSE buffering) is
        unaware of the difference.
        """
        b64 = base64.b64encode(image_png).decode("ascii")
        body = {
            "model": _model(),
            "document": {
                "type": "image_url",
                "image_url": f"data:image/png;base64,{b64}",
            },
        }
        markdown = await _call_ocr(body)
        if markdown:
            yield markdown

    async def process_pdf_batch(
        self,
        pdf_path: Path,
        pages: list[int],
    ) -> dict[int, str] | None:
        """Batch mode: send the whole PDF once, slice the response by page.

        Returns None when batch mode is disabled — the pipeline then falls
        back to `stream_page` for per-page streaming.
        """
        if not self.batch_supported:
            return None
        content = pdf_path.read_bytes()
        b64 = base64.b64encode(content).decode("ascii")
        body = {
            "model": _model(),
            "document": {
                "type": "document_url",
                # Use data URL so Mistral does not have to fetch from us.
                "document_url": f"data:application/pdf;base64,{b64}",
                "document_name": pdf_path.name,
            },
        }
        result = await _call_ocr_full(body)
        # Result.pages: list of {page_number (1-based), markdown, ...}
        # Filter to requested pages to honour `selected_pages`.
        wanted = set(pages)
        out: dict[int, str] = {}
        for entry in result.get("pages") or []:
            n = int(entry.get("index", entry.get("page_number", 0)) or 0)
            if n <= 0:
                continue
            # Mistral OCR uses 0-based "index" in some response shapes;
            # normalize to 1-based to match paperloom's page numbering.
            page_no = n + 1 if entry.get("index") is not None else n
            if page_no not in wanted:
                continue
            md = entry.get("markdown") or entry.get("text") or ""
            out[page_no] = md
        return out


async def _call_ocr(body: dict[str, object]) -> str:
    """POST /v1/ocr — return concatenated markdown across all returned pages."""
    result = await _call_ocr_full(body)
    pages = result.get("pages") or []
    return "\n\n".join((p.get("markdown") or p.get("text") or "") for p in pages)


async def _call_ocr_full(body: dict[str, object]) -> dict[str, object]:
    url = f"{_api_base()}/v1/ocr"
    headers = {
        "Authorization": f"Bearer {_api_key()}",
        "Content-Type": "application/json",
    }
    timeout = httpx.Timeout(connect=10.0, read=300.0, write=60.0, pool=10.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        resp = await client.post(url, headers=headers, content=json.dumps(body))
    if resp.status_code != 200:
        snippet = resp.text[:300]
        raise BackendError(f"mistral ocr {resp.status_code}: {snippet}")
    try:
        return resp.json()
    except json.JSONDecodeError as exc:
        raise BackendError(f"mistral ocr returned non-JSON: {exc}") from exc
