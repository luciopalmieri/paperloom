from __future__ import annotations

from collections.abc import AsyncIterator
from pathlib import Path
from typing import Any

import pypdf

from paperloom.tools import register


@register("reorder-pages")
async def run(
    job_id: str,
    job_root: Path,
    inputs: list[Path],
    params: dict[str, Any],
    step: int,
) -> AsyncIterator[tuple[str, dict[str, Any]]]:
    """Reorder pages per `order` (1-indexed list, e.g. [3,1,2,4])."""
    out_dir = job_root / "work" / str(step)
    out_dir.mkdir(parents=True, exist_ok=True)
    order = params.get("order")
    if not isinstance(order, list) or not all(isinstance(x, int) for x in order):
        yield "error", {
            "job_id": job_id,
            "code": "bad_order",
            "message": "order must be a list of 1-indexed page numbers",
        }
        return
    outputs: list[str] = []

    for inp in inputs:
        reader = pypdf.PdfReader(str(inp))
        total = len(reader.pages)
        writer = pypdf.PdfWriter()
        for p in order:
            if 1 <= p <= total:
                writer.add_page(reader.pages[p - 1])
        out = out_dir / f"{inp.stem}-reordered.pdf"
        with out.open("wb") as f:
            writer.write(f)
        outputs.append(str(out))

    yield "node.end", {"step": step, "tool": "reorder-pages", "outputs": outputs}
