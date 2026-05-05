from __future__ import annotations

from collections.abc import AsyncIterator
from pathlib import Path
from typing import Any

import pypdf

from paperloom.tools import register


@register("merge-pdfs")
async def run(
    job_id: str,
    job_root: Path,
    inputs: list[Path],
    params: dict[str, Any],
    step: int,
) -> AsyncIterator[tuple[str, dict[str, Any]]]:
    """Concatenate every input PDF in given order into a single PDF."""
    out_dir = job_root / "work" / str(step)
    out_dir.mkdir(parents=True, exist_ok=True)
    out = out_dir / "merged.pdf"

    writer = pypdf.PdfWriter()
    total = max(len(inputs), 1)
    for idx, inp in enumerate(inputs):
        yield "progress", {
            "job_id": job_id,
            "tool": "merge-pdfs",
            "percent": int(idx / total * 100),
        }
        reader = pypdf.PdfReader(str(inp))
        for page in reader.pages:
            writer.add_page(page)

    with out.open("wb") as f:
        writer.write(f)

    yield "node.end", {"step": step, "tool": "merge-pdfs", "outputs": [str(out)]}
