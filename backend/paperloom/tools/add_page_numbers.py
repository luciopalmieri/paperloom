from __future__ import annotations

from collections.abc import AsyncIterator
from pathlib import Path
from typing import Any

import pypdf

from paperloom.tools import register
from paperloom.tools._overlay import POSITIONS, make_text_overlay


@register("add-page-numbers")
async def run(
    job_id: str,
    job_root: Path,
    inputs: list[Path],
    params: dict[str, Any],
    step: int,
) -> AsyncIterator[tuple[str, dict[str, Any]]]:
    """Stamp 1-indexed page numbers onto every page.

    `position` (default bottom-center), `format` (`"{page} / {total}"` style
    Python format with {page} and {total}), `font_size` (default 10).
    """
    out_dir = job_root / "work" / str(step)
    out_dir.mkdir(parents=True, exist_ok=True)
    position = str(params.get("position", "bottom-center"))
    if position not in POSITIONS:
        position = "bottom-center"
    fmt = str(params.get("format", "{page} / {total}"))
    font_size = float(params.get("font_size", 10))
    outputs: list[str] = []

    for inp in inputs:
        reader = pypdf.PdfReader(str(inp))
        writer = pypdf.PdfWriter(clone_from=reader)
        total = len(writer.pages)
        for idx, page in enumerate(writer.pages):
            mb = page.mediabox
            w = float(mb.width)
            h = float(mb.height)
            text = fmt.format(page=idx + 1, total=total)
            overlay = make_text_overlay(w, h, text, position=position, font_size=font_size)
            page.merge_page(overlay)
        out = out_dir / f"{inp.stem}-numbered.pdf"
        with out.open("wb") as f:
            writer.write(f)
        outputs.append(str(out))

    yield "node.end", {"step": step, "tool": "add-page-numbers", "outputs": outputs}
