from __future__ import annotations

from collections.abc import AsyncIterator
from pathlib import Path
from typing import Any

from src.ocr import images, ollama, render, stub
from src.ocr.prompts import OCR_PROMPT


async def run_real(
    job_id: str, pdf_path: Path, out_dir: Path
) -> AsyncIterator[tuple[str, dict[str, Any]]]:
    """OCR a PDF or image via Ollama into `out_dir/out.md` plus `out_dir/images/`.

    Yields per-page Markdown chunks via SSE-shaped events. Figure
    placeholders [[FIGURE:fig-N]] pass through verbatim — cropping is
    deferred per phase-0 §8.2. Final `node.end` event lists the
    written output files (consumed by the chain executor).
    """
    out_dir.mkdir(parents=True, exist_ok=True)
    images_dir = out_dir / "images"
    images_dir.mkdir(parents=True, exist_ok=True)

    is_img = images.is_image(pdf_path.name)
    pages = 1 if is_img else render.page_count(pdf_path)
    page_buffers: dict[int, str] = {}

    for page in range(1, pages + 1):
        yield "progress", {
            "job_id": job_id,
            "tool": "ocr-to-markdown",
            "page": page,
            "percent": int(((page - 1) / pages) * 100),
        }
        png = images.load_as_png(pdf_path) if is_img else render.render_page_png(pdf_path, page - 1)
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
    md_path = out_dir / "out.md"
    md_path.write_text(md_text, encoding="utf-8")


async def run_stub(
    job_id: str, pdf_path: Path
) -> AsyncIterator[tuple[str, dict[str, Any]]]:
    """Phase 2 stub kept for offline development."""
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
