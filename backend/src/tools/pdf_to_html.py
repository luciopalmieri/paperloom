from __future__ import annotations

import html as _html
from collections.abc import AsyncIterator
from pathlib import Path
from typing import Any

import pypdf

from src.tools import register

_HTML_SHELL = """\
<!doctype html>
<html><head><meta charset="utf-8"><title>{title}</title>
<style>body{{font-family:system-ui,sans-serif;max-width:42rem;margin:2rem auto;padding:0 1rem;line-height:1.5}}section{{border-bottom:1px solid #e4e4e7;padding:1rem 0}}h2{{font-size:.9rem;text-transform:uppercase;color:#52525b;margin:0 0 .5rem 0}}pre{{white-space:pre-wrap;font-family:inherit;margin:0}}</style>
</head><body>
{body}
</body></html>
"""


@register("pdf-to-html")
async def run(
    job_id: str,
    job_root: Path,
    inputs: list[Path],
    params: dict[str, Any],
    step: int,
) -> AsyncIterator[tuple[str, dict[str, Any]]]:
    """Extract embedded text per page → wrap each page in a <section>.

    Layout-preserving HTML is out of scope for v1; this is the deterministic
    text-only counterpart. For visually faithful HTML use ocr-to-markdown
    or a layout-aware extractor.
    """
    out_dir = job_root / "work" / str(step)
    out_dir.mkdir(parents=True, exist_ok=True)
    outputs: list[str] = []

    for inp in inputs:
        if inp.suffix.lower() != ".pdf":
            continue
        reader = pypdf.PdfReader(str(inp))
        sections: list[str] = []
        for idx, page in enumerate(reader.pages, start=1):
            text = page.extract_text() or ""
            sections.append(
                f'<section><h2>Page {idx}</h2><pre>{_html.escape(text)}</pre></section>'
            )
        out = out_dir / f"{inp.stem}.html"
        out.write_text(_HTML_SHELL.format(title=inp.stem, body="\n".join(sections)), encoding="utf-8")
        outputs.append(str(out))

    if not outputs:
        yield "error", {
            "job_id": job_id,
            "code": "no_pdf_input",
            "message": "pdf-to-html needs PDF input",
        }
        return

    yield "node.end", {"step": step, "tool": "pdf-to-html", "outputs": outputs}
