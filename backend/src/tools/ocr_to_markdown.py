from __future__ import annotations

from collections.abc import AsyncIterator
from pathlib import Path
from typing import Any

from src.ocr import pipeline
from src.tools import register


@register("ocr-to-markdown")
async def run(
    job_id: str,
    job_root: Path,
    inputs: list[Path],
    params: dict[str, Any],
    step: int,
) -> AsyncIterator[tuple[str, dict[str, Any]]]:
    if not inputs:
        yield "error", {"code": "no_input", "message": "ocr-to-markdown needs a PDF input"}
        return

    out_dir = job_root / "work" / str(step)
    pdf = inputs[0]

    selected_pages = _coerce_pages(params.get("pages"))

    async for ev_type, ev_data in pipeline.run_real(
        job_id, pdf, out_dir, selected_pages=selected_pages
    ):
        yield ev_type, ev_data

    md = out_dir / "out.md"
    images = out_dir / "images"
    outputs: list[str] = []
    if md.is_file():
        outputs.append(str(md))
    if images.is_dir():
        for f in sorted(images.iterdir()):
            if f.is_file():
                outputs.append(str(f))

    yield "node.end", {"step": step, "tool": "ocr-to-markdown", "outputs": outputs}


def _coerce_pages(raw: Any) -> list[int] | None:
    if raw is None:
        return None
    if isinstance(raw, str):
        items = [s.strip() for s in raw.split(",") if s.strip()]
    elif isinstance(raw, list):
        items = raw
    else:
        return None
    out: list[int] = []
    for item in items:
        try:
            n = int(item)
        except (TypeError, ValueError):
            continue
        if n >= 1:
            out.append(n)
    return out or None
