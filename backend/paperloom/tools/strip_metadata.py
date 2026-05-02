from __future__ import annotations

from collections.abc import AsyncIterator
from pathlib import Path
from typing import Any

import pypdf

from paperloom.tools import register


@register("strip-metadata")
async def run(
    job_id: str,
    job_root: Path,
    inputs: list[Path],
    params: dict[str, Any],
    step: int,
) -> AsyncIterator[tuple[str, dict[str, Any]]]:
    out_dir = job_root / "work" / str(step)
    out_dir.mkdir(parents=True, exist_ok=True)
    outputs: list[str] = []

    for inp in inputs:
        reader = pypdf.PdfReader(str(inp))
        # Re-build a writer from scratch so the source /Info dict is left
        # behind. cloning would carry it over.
        writer = pypdf.PdfWriter()
        for page in reader.pages:
            writer.add_page(page)
        out = out_dir / f"{inp.stem}-clean.pdf"
        with out.open("wb") as f:
            writer.write(f)
        outputs.append(str(out))

    yield "node.end", {"step": step, "tool": "strip-metadata", "outputs": outputs}
