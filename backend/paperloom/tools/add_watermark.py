from __future__ import annotations

from collections.abc import AsyncIterator
from pathlib import Path
from typing import Any

import pypdf

from paperloom.tools import register
from paperloom.tools._overlay import POSITIONS, make_text_overlay


@register("add-watermark")
async def run(
    job_id: str,
    job_root: Path,
    inputs: list[Path],
    params: dict[str, Any],
    step: int,
) -> AsyncIterator[tuple[str, dict[str, Any]]]:
    """Stamp a text watermark on every page.

    `text` (required), `position` (default center), `opacity` (0..1, default 0.25),
    `font_size` (default 64), `rotation` (deg, default 30 for diagonal look).
    """
    text = str(params.get("text") or "").strip()
    if not text:
        yield "error", {"job_id": job_id, "code": "missing_text", "message": "watermark text is required"}
        return

    position = str(params.get("position", "center"))
    if position not in POSITIONS:
        position = "center"
    opacity = max(0.0, min(1.0, float(params.get("opacity", 0.25))))
    font_size = float(params.get("font_size", 64))
    rotation = float(params.get("rotation", 30 if position == "center" else 0))

    out_dir = job_root / "work" / str(step)
    out_dir.mkdir(parents=True, exist_ok=True)
    outputs: list[str] = []

    for inp in inputs:
        reader = pypdf.PdfReader(str(inp))
        writer = pypdf.PdfWriter(clone_from=reader)
        for page in writer.pages:
            mb = page.mediabox
            w = float(mb.width)
            h = float(mb.height)
            overlay = make_text_overlay(
                w,
                h,
                text,
                position=position,
                font_size=font_size,
                rgba=(0, 0, 0, opacity),
                rotation=rotation,
            )
            page.merge_page(overlay)
        out = out_dir / f"{inp.stem}-watermarked.pdf"
        with out.open("wb") as f:
            writer.write(f)
        outputs.append(str(out))

    yield "node.end", {"step": step, "tool": "add-watermark", "outputs": outputs}
