from __future__ import annotations

from collections.abc import AsyncIterator
from pathlib import Path
from typing import Any

import pypdf

from paperloom.tools import register
from paperloom.tools._pageutils import parse_page_spec


@register("split-pdf")
async def run(
    job_id: str,
    job_root: Path,
    inputs: list[Path],
    params: dict[str, Any],
    step: int,
) -> AsyncIterator[tuple[str, dict[str, Any]]]:
    """Split each PDF either by `every_n` (group every N pages) or `ranges`
    ("1-3,4-6"). Default: every page becomes its own PDF.
    """
    out_dir = job_root / "work" / str(step)
    out_dir.mkdir(parents=True, exist_ok=True)
    every_n = int(params.get("every_n") or 1)
    ranges_spec = str(params.get("ranges") or "").strip()
    outputs: list[str] = []

    for inp in inputs:
        reader = pypdf.PdfReader(str(inp))
        total = len(reader.pages)

        groups: list[list[int]]
        if ranges_spec:
            spec_pages = parse_page_spec(ranges_spec, total)
            groups = [spec_pages] if spec_pages else []
        else:
            groups = [list(range(i, min(i + every_n, total))) for i in range(0, total, every_n)]

        for gi, indices in enumerate(groups):
            if not indices:
                continue
            writer = pypdf.PdfWriter()
            for idx in indices:
                writer.add_page(reader.pages[idx])
            out = out_dir / f"{inp.stem}-part{gi + 1:03d}.pdf"
            with out.open("wb") as f:
                writer.write(f)
            outputs.append(str(out))

    yield "node.end", {"step": step, "tool": "split-pdf", "outputs": outputs}
