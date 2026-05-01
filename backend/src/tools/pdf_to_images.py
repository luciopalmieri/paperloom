from __future__ import annotations

from collections.abc import AsyncIterator
from pathlib import Path
from typing import Any

from src.ocr import render
from src.tools import register


@register("pdf-to-images")
async def run(
    job_id: str,
    job_root: Path,
    inputs: list[Path],
    params: dict[str, Any],
    step: int,
) -> AsyncIterator[tuple[str, dict[str, Any]]]:
    """Render every page of every input PDF to PNG."""
    dpi = int(params.get("dpi", 150))
    scale = dpi / 72.0
    out_dir = job_root / "work" / str(step)
    out_dir.mkdir(parents=True, exist_ok=True)
    outputs: list[str] = []

    for inp in inputs:
        pages = render.page_count(inp)
        for i in range(pages):
            yield "progress", {
                "job_id": job_id,
                "tool": "pdf-to-images",
                "page": i + 1,
                "percent": int(i / max(pages, 1) * 100),
            }
            png = render.render_page_png(inp, i, scale=scale)
            out = out_dir / f"{inp.stem}-p{i + 1:04d}.png"
            out.write_bytes(png)
            outputs.append(str(out))

    yield "node.end", {"step": step, "tool": "pdf-to-images", "outputs": outputs}
