from __future__ import annotations

from collections.abc import AsyncIterator
from pathlib import Path
from typing import Any

from PIL import Image

from paperloom.tools import register

_EXT = {".png", ".jpg", ".jpeg", ".bmp", ".tif", ".tiff", ".webp"}


@register("images-to-pdf")
async def run(
    job_id: str,
    job_root: Path,
    inputs: list[Path],
    params: dict[str, Any],
    step: int,
) -> AsyncIterator[tuple[str, dict[str, Any]]]:
    out_dir = job_root / "work" / str(step)
    out_dir.mkdir(parents=True, exist_ok=True)
    out = out_dir / "combined.pdf"

    images: list[Image.Image] = []
    for inp in inputs:
        if inp.suffix.lower() not in _EXT:
            continue
        img = Image.open(inp).convert("RGB")
        images.append(img)

    if not images:
        yield "error", {"job_id": job_id, "code": "no_images", "message": "no input images"}
        return

    yield "progress", {"job_id": job_id, "tool": "images-to-pdf", "percent": 50}
    images[0].save(out, save_all=True, append_images=images[1:])
    yield "node.end", {"step": step, "tool": "images-to-pdf", "outputs": [str(out)]}
