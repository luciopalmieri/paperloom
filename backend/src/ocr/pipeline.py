from __future__ import annotations

from collections.abc import AsyncIterator
from pathlib import Path
from typing import Any

from src.ocr import render, stub


async def run_stub(
    job_id: str, pdf_path: Path
) -> AsyncIterator[tuple[str, dict[str, Any]]]:
    """Phase 2 stub OCR pipeline.

    Emits node lifecycle + per-page markdown chunks. Real Ollama wiring lands
    in Phase 3 and replaces stub.stream_page with an Ollama NDJSON consumer.
    """
    pages = render.page_count(pdf_path)
    yield "node.start", {"job_id": job_id, "tool": "ocr-to-markdown", "pages": pages}

    for page in range(1, pages + 1):
        yield "progress", {
            "job_id": job_id,
            "tool": "ocr-to-markdown",
            "page": page,
            "percent": int(((page - 1) / pages) * 100),
        }
        async for chunk in stub.stream_page(page):
            yield "ocr.page", {
                "job_id": job_id,
                "page": page,
                "markdown_chunk": chunk,
                "page_done": False,
            }
        yield "ocr.page", {
            "job_id": job_id,
            "page": page,
            "markdown_chunk": "",
            "page_done": True,
        }

    yield "done", {"job_id": job_id, "artifacts": []}
