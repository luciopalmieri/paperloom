from __future__ import annotations

from collections.abc import AsyncIterator
from pathlib import Path
from typing import Any

import pypdf

from paperloom.tools import register
from paperloom.tools._pageutils import parse_page_spec


@register("delete-pages")
async def run(
    job_id: str,
    job_root: Path,
    inputs: list[Path],
    params: dict[str, Any],
    step: int,
) -> AsyncIterator[tuple[str, dict[str, Any]]]:
    out_dir = job_root / "work" / str(step)
    out_dir.mkdir(parents=True, exist_ok=True)
    spec = str(params.get("pages") or "")
    outputs: list[str] = []

    for inp in inputs:
        reader = pypdf.PdfReader(str(inp))
        total = len(reader.pages)
        drop = set(parse_page_spec(spec, total))
        keep = [i for i in range(total) if i not in drop]
        writer = pypdf.PdfWriter()
        for idx in keep:
            writer.add_page(reader.pages[idx])
        out = out_dir / f"{inp.stem}-trimmed.pdf"
        with out.open("wb") as f:
            writer.write(f)
        outputs.append(str(out))

    yield "node.end", {"step": step, "tool": "delete-pages", "outputs": outputs}
