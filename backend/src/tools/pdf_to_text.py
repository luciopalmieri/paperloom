from __future__ import annotations

from collections.abc import AsyncIterator
from pathlib import Path
from typing import Any

import pypdf

from src.tools import register


@register("pdf-to-text")
async def run(
    job_id: str,
    job_root: Path,
    inputs: list[Path],
    params: dict[str, Any],
    step: int,
) -> AsyncIterator[tuple[str, dict[str, Any]]]:
    """Extract embedded text layer (no OCR). Each input PDF → one .md."""
    out_dir = job_root / "work" / str(step)
    out_dir.mkdir(parents=True, exist_ok=True)
    outputs: list[str] = []

    for idx, inp in enumerate(inputs):
        yield "progress", {
            "job_id": job_id,
            "tool": "pdf-to-text",
            "percent": int(idx / max(len(inputs), 1) * 100),
        }
        reader = pypdf.PdfReader(str(inp))
        chunks: list[str] = []
        for page in reader.pages:
            chunks.append(page.extract_text() or "")
        out = out_dir / f"{inp.stem}.md"
        out.write_text("\n\n".join(chunks), encoding="utf-8")
        outputs.append(str(out))

    yield "node.end", {"step": step, "tool": "pdf-to-text", "outputs": outputs}
