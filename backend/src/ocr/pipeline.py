from __future__ import annotations

from collections.abc import AsyncIterator
from pathlib import Path
from typing import Any, Literal

from src.ocr import figures, images, ollama, render, stub
from src.ocr.prompts import OCR_PROMPT


async def run_real(
    job_id: str,
    pdf_path: Path,
    out_dir: Path,
    selected_pages: list[int] | None = None,
    include_images: bool = False,
    image_strategy: Literal["auto", "objects", "llm"] = "auto",
) -> AsyncIterator[tuple[str, dict[str, Any]]]:
    """OCR a PDF or image via Ollama into `out_dir/out.md` plus `out_dir/images/`.

    Yields per-page Markdown chunks via SSE-shaped events. Figure placeholders
    `[[FIGURE:fig-N|caption=...|bbox=...]]` are post-processed per page:
      - if `include_images` is True, figure crops are written under
        `out_dir/images/page-N-fig-M.png` (image-objects with LLM-bbox fallback,
        or pure LLM-bbox crop based on `image_strategy`);
      - placeholders are replaced with either an image link or a caption-only
        line in the final markdown.

    `selected_pages` (1-indexed) restricts processing to those pages;
    out-of-range entries are silently dropped. None means all pages.
    """
    out_dir.mkdir(parents=True, exist_ok=True)
    images_dir = out_dir / "images"
    if include_images:
        images_dir.mkdir(parents=True, exist_ok=True)

    is_img = images.is_image(pdf_path.name)
    total_pages = 1 if is_img else render.page_count(pdf_path)
    if selected_pages:
        page_iter = sorted({p for p in selected_pages if 1 <= p <= total_pages})
        if not page_iter:
            page_iter = list(range(1, total_pages + 1))
    else:
        page_iter = list(range(1, total_pages + 1))
    page_buffers: dict[int, str] = {}

    processed = 0
    total_to_process = len(page_iter)
    for page in page_iter:
        yield "progress", {
            "job_id": job_id,
            "tool": "ocr-to-markdown",
            "page": page,
            "percent": int((processed / total_to_process) * 100) if total_to_process else 0,
        }
        page_png = (
            images.load_as_png(pdf_path) if is_img else render.render_page_png(pdf_path, page - 1)
        )
        buf: list[str] = []
        try:
            async for chunk in ollama.stream_generate(page_png, OCR_PROMPT):
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

        page_md_raw = "".join(buf)
        page_md_final, figs_saved, figs_total = _finalize_page_markdown(
            page_md_raw=page_md_raw,
            pdf_path=pdf_path,
            page_index=0 if is_img else page - 1,
            page_png=page_png,
            page_number=page,
            images_dir=images_dir,
            include_images=include_images,
            image_strategy=image_strategy,
            is_img_input=is_img,
        )
        page_buffers[page] = page_md_final

        if page_md_final != page_md_raw or figs_total > 0:
            yield "ocr.page.replace", {
                "job_id": job_id,
                "page": page,
                "markdown_final": page_md_final,
                "figures_saved": figs_saved,
                "figures_total": figs_total,
            }

        processed += 1
        yield "ocr.page", {
            "job_id": job_id,
            "page": page,
            "markdown_chunk": "",
            "page_done": True,
        }

    md_text = "\n\n".join(page_buffers[p] for p in sorted(page_buffers))
    md_path = out_dir / "out.md"
    md_path.write_text(md_text, encoding="utf-8")


def _finalize_page_markdown(
    *,
    page_md_raw: str,
    pdf_path: Path,
    page_index: int,
    page_png: bytes,
    page_number: int,
    images_dir: Path,
    include_images: bool,
    image_strategy: Literal["auto", "objects", "llm"],
    is_img_input: bool,
) -> tuple[str, int, int]:
    """Returns (final_markdown, figures_saved, figures_total).

    figures_total counts placeholders detected (or 1 when an image input
    triggers the whole-image fallback without any placeholder).
    figures_saved counts figures actually written to disk.
    """
    placeholders = figures.parse_placeholders(page_md_raw)
    figures_total = len(placeholders)

    if not include_images:
        if not placeholders:
            return page_md_raw, 0, 0
        final = figures.replace_placeholders(
            page_md_raw, placeholders, [None] * len(placeholders)
        )
        return final, 0, figures_total

    image_rel_paths: list[str | None] = [None] * len(placeholders)

    if placeholders:
        # Image-only inputs cannot use PDF object extraction; force llm fallback.
        effective_strategy: Literal["auto", "objects", "llm"] = (
            "llm" if is_img_input and image_strategy != "llm" else image_strategy
        )
        crops = figures.build_figure_assets(
            pdf_path=pdf_path,
            page_index=page_index,
            page_png=page_png,
            placeholders=placeholders,
            strategy=effective_strategy,
        )
        for i, (ph, crop) in enumerate(zip(placeholders, crops, strict=True)):
            if crop is None:
                continue
            fname = f"page-{page_number}-fig-{ph.n}.png"
            (images_dir / fname).write_bytes(crop)
            image_rel_paths[i] = f"images/{fname}"

    figures_saved = sum(1 for r in image_rel_paths if r is not None)

    # Whole-image fallback for image uploads: if no per-figure crop succeeded,
    # save the full page once as `page-N.png` (no fig suffix) and DO NOT add
    # an md link — the page image is the source, captions already live in the
    # markdown. Placeholders fall through to caption-only rendering.
    if is_img_input and figures_saved == 0:
        (images_dir / f"page-{page_number}.png").write_bytes(page_png)
        figures_saved = 1
        figures_total = max(figures_total, 1)

    final_md = (
        figures.replace_placeholders(page_md_raw, placeholders, image_rel_paths)
        if placeholders
        else page_md_raw
    )
    return final_md, figures_saved, figures_total


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
