from __future__ import annotations

from collections.abc import AsyncIterator
from pathlib import Path
from typing import Any

from src import jobs as jobs_mod
from src.ocr import ollama, render, stub
from src.ocr.prompts import OCR_PROMPT
from src.zip import build_zip


async def run_real(
    job_id: str, pdf_path: Path
) -> AsyncIterator[tuple[str, dict[str, Any]]]:
    """Real Ollama OCR pipeline.

    Renders each page → PNG via pypdfium2, streams Markdown chunks from
    GLM-OCR via Ollama /api/generate, writes out.md + (empty for now)
    images/ under <jobId>/out/, bundles a zip artifact, and emits SSE
    events. Figure cropping is a deferred concern (phase-0 §8.2): the
    OCR prompt's [[FIGURE:fig-N]] placeholders pass through verbatim.
    """
    pages = render.page_count(pdf_path)
    out_root = jobs_mod._root() / job_id / "out"
    images_dir = out_root / "images"
    images_dir.mkdir(parents=True, exist_ok=True)

    yield "node.start", {"job_id": job_id, "tool": "ocr-to-markdown", "pages": pages}

    page_buffers: dict[int, str] = {}
    for page in range(1, pages + 1):
        yield "progress", {
            "job_id": job_id,
            "tool": "ocr-to-markdown",
            "page": page,
            "percent": int(((page - 1) / pages) * 100),
        }
        png = render.render_page_png(pdf_path, page - 1)
        buf: list[str] = []
        try:
            async for chunk in ollama.stream_generate(png, OCR_PROMPT):
                buf.append(chunk)
                yield "ocr.page", {
                    "job_id": job_id,
                    "page": page,
                    "markdown_chunk": chunk,
                    "page_done": False,
                }
        except ollama.OllamaError as exc:
            yield "error", {
                "job_id": job_id,
                "code": "ollama_failed",
                "message": str(exc),
                "recoverable": False,
            }
            return
        page_buffers[page] = "".join(buf)
        yield "ocr.page", {
            "job_id": job_id,
            "page": page,
            "markdown_chunk": "",
            "page_done": True,
        }

    md_text = "\n\n".join(page_buffers[p] for p in sorted(page_buffers))
    (out_root / "out.md").write_text(md_text, encoding="utf-8")

    zip_path = out_root.parent / "out.zip"
    build_zip(out_root, zip_path)

    yield "done", {
        "job_id": job_id,
        "artifacts": [
            {
                "name": "out.zip",
                "size": zip_path.stat().st_size,
                "url": f"/api/jobs/{job_id}/artifacts/out.zip",
            }
        ],
    }


async def run_stub(
    job_id: str, pdf_path: Path
) -> AsyncIterator[tuple[str, dict[str, Any]]]:
    """Phase 2 stub kept for tests / offline development."""
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
