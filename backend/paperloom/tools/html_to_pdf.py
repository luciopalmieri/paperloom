from __future__ import annotations

from collections.abc import AsyncIterator
from pathlib import Path
from typing import Any

from paperloom.tools import register
from paperloom.tools._weasyprint import WeasyPrintUnavailable, html_to_pdf_bytes


@register("html-to-pdf")
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
        if inp.suffix.lower() not in {".html", ".htm"}:
            continue
        html = inp.read_text(encoding="utf-8")
        try:
            pdf = html_to_pdf_bytes(html, base_url=str(inp.parent))
        except WeasyPrintUnavailable as exc:
            yield "error", {
                "job_id": job_id,
                "code": "weasyprint_unavailable",
                "message": str(exc),
                "recoverable": False,
            }
            return
        out = out_dir / f"{inp.stem}.pdf"
        out.write_bytes(pdf)
        outputs.append(str(out))

    if not outputs:
        yield "error", {
            "job_id": job_id,
            "code": "no_html_input",
            "message": "html-to-pdf needs .html / .htm inputs",
        }
        return

    yield "node.end", {"step": step, "tool": "html-to-pdf", "outputs": outputs}
