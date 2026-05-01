from __future__ import annotations

from collections.abc import AsyncIterator
from pathlib import Path
from typing import Any

import pypdf

from src.tools import register
from src.tools._pageutils import parse_page_spec


@register("extract-pages")
async def run(
    job_id: str,
    job_root: Path,
    inputs: list[Path],
    params: dict[str, Any],
    step: int,
) -> AsyncIterator[tuple[str, dict[str, Any]]]:
    """Keep only `pages` ("1,3-5") from each input PDF."""
    out_dir = job_root / "work" / str(step)
    out_dir.mkdir(parents=True, exist_ok=True)
    spec = str(params.get("pages") or "")
    outputs: list[str] = []

    for inp in inputs:
        reader = pypdf.PdfReader(str(inp))
        keep = parse_page_spec(spec, len(reader.pages))
        if not keep:
            yield "error", {
                "job_id": job_id,
                "code": "no_pages_selected",
                "message": "extract-pages produced no pages — check `pages` param",
            }
            return
        writer = pypdf.PdfWriter()
        for idx in keep:
            writer.add_page(reader.pages[idx])
        out = out_dir / f"{inp.stem}-extracted.pdf"
        with out.open("wb") as f:
            writer.write(f)
        outputs.append(str(out))

    yield "node.end", {"step": step, "tool": "extract-pages", "outputs": outputs}
