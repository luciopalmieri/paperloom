from __future__ import annotations

from collections.abc import AsyncIterator
from pathlib import Path
from typing import Any

from markdown_it import MarkdownIt

from paperloom.tools import register
from paperloom.tools._weasyprint import WeasyPrintUnavailable, html_to_pdf_bytes

_HTML_SHELL = """\
<!doctype html>
<html><head><meta charset="utf-8"><title>{title}</title>
<style>@page{{margin:2cm}}body{{font-family:serif;line-height:1.45}}pre,code{{font-family:ui-monospace,monospace}}pre{{background:#f4f4f5;padding:.5rem}}table{{border-collapse:collapse}}td,th{{border:1px solid #999;padding:.25rem .5rem}}</style>
</head><body>{body}</body></html>
"""


@register("markdown-to-pdf")
async def run(
    job_id: str,
    job_root: Path,
    inputs: list[Path],
    params: dict[str, Any],
    step: int,
) -> AsyncIterator[tuple[str, dict[str, Any]]]:
    out_dir = job_root / "work" / str(step)
    out_dir.mkdir(parents=True, exist_ok=True)
    md = MarkdownIt("commonmark", {"html": False, "linkify": True}).enable("table")
    outputs: list[str] = []

    for inp in inputs:
        if inp.suffix.lower() not in {".md", ".markdown", ".txt"}:
            continue
        body = md.render(inp.read_text(encoding="utf-8"))
        html = _HTML_SHELL.format(title=inp.stem, body=body)
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
            "code": "no_markdown_input",
            "message": "markdown-to-pdf needs .md / .markdown / .txt inputs",
        }
        return

    yield "node.end", {"step": step, "tool": "markdown-to-pdf", "outputs": outputs}
