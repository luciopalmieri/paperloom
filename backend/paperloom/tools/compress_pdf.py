from __future__ import annotations

from collections.abc import AsyncIterator
from pathlib import Path
from typing import Any

import pypdf

from paperloom.tools import register


@register("compress-pdf")
async def run(
    job_id: str,
    job_root: Path,
    inputs: list[Path],
    params: dict[str, Any],
    step: int,
) -> AsyncIterator[tuple[str, dict[str, Any]]]:
    """Re-encode content streams and downscale embedded images.

    `quality` (1-95, default 75) controls JPEG quality on raster images.
    """
    out_dir = job_root / "work" / str(step)
    out_dir.mkdir(parents=True, exist_ok=True)
    quality = max(1, min(95, int(params.get("quality", 75))))
    outputs: list[str] = []

    for inp in inputs:
        reader = pypdf.PdfReader(str(inp))
        writer = pypdf.PdfWriter(clone_from=reader)
        for page in writer.pages:
            page.compress_content_streams()
            for img in page.images:
                try:
                    img.replace(img.image, quality=quality)
                except Exception:
                    # Some image streams (CMYK, masks, monochrome) are not
                    # re-encodable via Pillow; leave them untouched.
                    continue
        out = out_dir / f"{inp.stem}-compressed.pdf"
        with out.open("wb") as f:
            writer.write(f)
        outputs.append(str(out))

    yield "node.end", {"step": step, "tool": "compress-pdf", "outputs": outputs}
