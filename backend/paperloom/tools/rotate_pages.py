from __future__ import annotations

from collections.abc import AsyncIterator
from pathlib import Path
from typing import Any

import pypdf

from paperloom.tools import register
from paperloom.tools._pageutils import parse_page_spec


@register("rotate-pages")
async def run(
    job_id: str,
    job_root: Path,
    inputs: list[Path],
    params: dict[str, Any],
    step: int,
) -> AsyncIterator[tuple[str, dict[str, Any]]]:
    """Rotate `pages` (default: all) by `degrees` (90/180/270)."""
    out_dir = job_root / "work" / str(step)
    out_dir.mkdir(parents=True, exist_ok=True)
    degrees = int(params.get("degrees", 90))
    if degrees not in (90, 180, 270):
        yield "error", {
            "job_id": job_id,
            "code": "bad_degrees",
            "message": "degrees must be 90, 180, or 270",
        }
        return
    spec = str(params.get("pages") or "")
    outputs: list[str] = []

    for inp in inputs:
        reader = pypdf.PdfReader(str(inp))
        total = len(reader.pages)
        targets = set(parse_page_spec(spec, total))
        writer = pypdf.PdfWriter()
        for idx, page in enumerate(reader.pages):
            if idx in targets:
                page.rotate(degrees)
            writer.add_page(page)
        out = out_dir / f"{inp.stem}-rotated.pdf"
        with out.open("wb") as f:
            writer.write(f)
        outputs.append(str(out))

    yield "node.end", {"step": step, "tool": "rotate-pages", "outputs": outputs}
