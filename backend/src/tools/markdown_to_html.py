from __future__ import annotations

from collections.abc import AsyncIterator
from pathlib import Path
from typing import Any

from markdown_it import MarkdownIt

from src.tools import register

_HTML_SHELL = """\
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{title}</title>
<style>body{{font-family:system-ui,sans-serif;max-width:42rem;margin:2rem auto;padding:0 1rem;line-height:1.5}}pre,code{{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}}pre{{background:#f4f4f5;padding:1rem;overflow-x:auto;border-radius:.5rem}}</style>
</head>
<body>
{body}
</body>
</html>
"""


@register("markdown-to-html")
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
        text = inp.read_text(encoding="utf-8")
        body = md.render(text)
        html = _HTML_SHELL.format(title=inp.stem, body=body)
        out = out_dir / f"{inp.stem}.html"
        out.write_text(html, encoding="utf-8")
        outputs.append(str(out))

    if not outputs:
        yield "error", {
            "job_id": job_id,
            "code": "no_markdown",
            "message": "no .md/.markdown/.txt input found",
        }
        return

    yield "node.end", {"step": step, "tool": "markdown-to-html", "outputs": outputs}
