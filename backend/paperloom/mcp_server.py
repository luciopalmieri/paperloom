"""Paperloom MCP server.

Exposes the same 19 document tools as the FastAPI backend, but over the
Model Context Protocol so local LLM clients (Claude Desktop, Claude Code,
Cursor, Cline) can drive them as native tool calls.

Security posture:
- `register_file` requires the source path to live under one of the
  configured `mcp_allowed_dirs`. Files are copied into paperloom's storage
  so subsequent operations can never escape via symlinks.
- All tool inputs are referenced by `file_id` (hex32 token returned by
  `register_file` or `register_inline`). Raw filesystem paths from the
  LLM are never accepted as tool arguments.
- Outputs land under the user's storage root and are returned as absolute
  paths. The client is expected to read them with its filesystem tooling.
"""

from __future__ import annotations

import base64
from pathlib import Path
from typing import Any

from mcp.server.fastmcp import FastMCP

from paperloom import chain as chain_mod
from paperloom import jobs as jobs_mod
from paperloom import tools as tool_registry  # importing populates REGISTRY
from paperloom.config import settings

mcp = FastMCP("paperloom")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _allowed_dirs() -> list[Path]:
    raw = settings.mcp_allowed_dirs or ""
    out: list[Path] = []
    for chunk in raw.split(","):
        s = chunk.strip()
        if not s:
            continue
        try:
            out.append(Path(s).expanduser().resolve())
        except OSError:
            continue
    return out


def _is_under_allowed(path: Path) -> bool:
    try:
        real = path.resolve(strict=True)
    except (OSError, RuntimeError):
        return False
    for root in _allowed_dirs():
        if real == root or root in real.parents:
            return True
    return False


async def _run_single(slug: str, file_ids: list[str], params: dict[str, Any]) -> dict[str, Any]:
    """Run a single registered tool over `file_ids` with `params`.

    Returns a JSON-serialisable dict the MCP client can consume directly.
    Errors are returned in-band (`{"error": ...}`) rather than raised so
    the LLM can react without seeing a Python traceback.
    """
    if tool_registry.get(slug) is None:
        return {"error": {"code": "unknown_tool", "slug": slug}}

    input_paths: list[Path] = []
    for fid in file_ids:
        entry = jobs_mod.find_file(fid)
        if entry is None:
            return {"error": {"code": "unknown_file_id", "file_id": fid}}
        input_paths.append(entry.path)

    if not input_paths:
        return {"error": {"code": "no_inputs", "message": "at least one file_id required"}}

    chain = [{"slug": slug, "params": params}]
    job = jobs_mod.create_job(chain, file_ids)

    events: list[dict[str, Any]] = []
    error: dict[str, Any] | None = None
    artifacts: list[dict[str, Any]] = []

    async for ev_type, ev_data in chain_mod.run(job.job_id, chain, input_paths):
        # Strip the noisy job_id from every event; caller has it once at top level.
        clean = {k: v for k, v in ev_data.items() if k != "job_id"}
        events.append({"type": ev_type, **clean})
        if ev_type == "error":
            error = clean
        elif ev_type == "done":
            artifacts = ev_data.get("artifacts", [])

    out_dir = job.root / "out"
    outputs: list[str] = []
    if out_dir.is_dir():
        outputs = [str(p) for p in sorted(out_dir.iterdir()) if p.is_file()]

    inline_text: str | None = None
    for p in outputs:
        path = Path(p)
        if path.suffix.lower() in {".md", ".txt"} and path.stat().st_size <= 200_000:
            inline_text = path.read_text(encoding="utf-8", errors="replace")
            break

    result: dict[str, Any] = {
        "job_id": job.job_id,
        "outputs": outputs,
        "events": events,
        "artifacts": artifacts,
    }
    if inline_text is not None:
        result["inline_text"] = inline_text
    if error is not None:
        result["error"] = error
    return result


# ---------------------------------------------------------------------------
# File registration
# ---------------------------------------------------------------------------


@mcp.tool()
async def register_file(path: str) -> dict[str, Any]:
    """Copy a local file into paperloom storage and return a file_id.

    The source `path` must be inside one of the configured allowlisted
    directories (default: ~/Documents, ~/Downloads, ~/Desktop). Symlinks
    are resolved before the check, so a symlink under an allowed dir
    pointing outside is rejected.

    Returns: {file_id, filename, size, pages?}
    """
    src = Path(path).expanduser()
    if not src.is_file():
        return {"error": {"code": "not_a_file", "path": str(src)}}
    if not _is_under_allowed(src):
        return {
            "error": {
                "code": "path_not_allowed",
                "message": (
                    "source path is outside the MCP allowlist; configure "
                    "PAPERLOOM_MCP_ALLOWED_DIRS to permit additional roots"
                ),
                "allowed": [str(d) for d in _allowed_dirs()],
            }
        }
    content = src.read_bytes()
    max_bytes = settings.max_file_size_mb * 1024 * 1024
    if len(content) > max_bytes:
        return {"error": {"code": "file_too_large", "max_mb": settings.max_file_size_mb}}

    pages: int | None = None
    if src.suffix.lower() == ".pdf":
        from paperloom.ocr import render

        try:
            entry = jobs_mod.store_file(src.name, content, pages=None)
            pages = render.page_count(entry.path)
        except Exception:
            return {"error": {"code": "invalid_pdf"}}
        if pages > settings.max_pdf_pages:
            return {"error": {"code": "too_many_pages", "max": settings.max_pdf_pages}}
        return {
            "file_id": entry.file_id,
            "filename": entry.filename,
            "size": entry.size,
            "pages": pages,
        }

    entry = jobs_mod.store_file(src.name, content, pages=None)
    return {
        "file_id": entry.file_id,
        "filename": entry.filename,
        "size": entry.size,
    }


@mcp.tool()
async def register_inline(filename: str, base64_content: str) -> dict[str, Any]:
    """Register a file from inline base64 bytes. Returns a file_id.

    Useful when the LLM constructs content (e.g. markdown to convert to
    PDF) instead of pointing at an existing file. Same size limit as
    `register_file`.
    """
    safe_name = Path(filename).name or "upload"
    try:
        content = base64.b64decode(base64_content, validate=True)
    except (ValueError, TypeError):
        return {"error": {"code": "bad_base64"}}
    max_bytes = settings.max_file_size_mb * 1024 * 1024
    if len(content) > max_bytes:
        return {"error": {"code": "file_too_large", "max_mb": settings.max_file_size_mb}}
    entry = jobs_mod.store_file(safe_name, content, pages=None)
    return {"file_id": entry.file_id, "filename": entry.filename, "size": entry.size}


@mcp.tool()
async def list_paperloom_tools() -> dict[str, Any]:
    """List every paperloom tool slug currently registered, plus a hint
    map of which params each one accepts. Use this to discover tools
    before calling them via `run_tool` (or the per-slug wrappers below).
    """
    return {"tools": tool_registry.list_tools(), "params_hints": _PARAM_HINTS}


@mcp.tool()
async def paperloom_status() -> dict[str, Any]:
    """Runtime privacy / component status of this paperloom instance.

    Returns mode (`local`/`hybrid`/`cloud`) computed across paperloom's own
    components (OCR backend, anonymizer). Always includes a caveat
    reminding that tool I/O traverses the calling MCP client's LLM
    provider — paperloom cannot see what happens upstream of itself.

    Surface this to the user when:
      - they ask "are we local?" / "is this private?";
      - the user is about to ingest sensitive material;
      - any cloud component is active (caveats list will say so).
    """
    from paperloom._api import __version__
    from paperloom.privacy import current_state

    return {"version": __version__, "privacy": current_state()}


_PARAM_HINTS: dict[str, dict[str, str]] = {
    "ocr-to-markdown": {
        "pages": "comma list e.g. '1,3-5' (optional, default all)",
        "include_images": "bool — also crop figures",
        "image_strategy": "auto|objects|llm",
    },
    "anonymize": {"preset": "balanced|recall|precision (text inputs only)"},
    "pdf-to-text": {},
    "pdf-to-images": {"dpi": "int 72-600, default 150"},
    "extract-pages": {"pages": "page spec, e.g. '1,3-5'"},
    "delete-pages": {"pages": "page spec to delete"},
    "rotate-pages": {"pages": "page spec", "degrees": "90|180|270"},
    "reorder-pages": {"order": "list[int] new order, 1-based"},
    "split-pdf": {"every_n": "int", "ranges": "comma-separated specs"},
    "merge-pdfs": {},
    "compress-pdf": {"quality": "int 1-95, default 75"},
    "strip-metadata": {},
    "add-page-numbers": {
        "position": "top-left|top-center|top-right|bottom-left|bottom-center|bottom-right",
        "format": "f-string with {page} {total}",
        "font_size": "float, default 10",
    },
    "add-watermark": {
        "text": "str (required)",
        "position": "center|top-left|...",
        "opacity": "0..1",
        "font_size": "float",
        "rotation": "degrees",
    },
    "images-to-pdf": {},
    "markdown-to-html": {},
    "markdown-to-pdf": {},
    "html-to-pdf": {},
    "pdf-to-html": {},
}


# ---------------------------------------------------------------------------
# Generic dispatcher (escape hatch covering every registered slug)
# ---------------------------------------------------------------------------


@mcp.tool()
async def run_tool(
    slug: str,
    file_ids: list[str],
    params: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Run any registered paperloom tool by slug.

    Use the typed wrappers below (ocr_to_markdown, anonymize, ...) when
    the slug is known — they document params in their signatures. This
    generic form is the fallback for tools without a dedicated wrapper.
    """
    return await _run_single(slug, file_ids, params or {})


# ---------------------------------------------------------------------------
# Typed wrappers for the most useful tools
# ---------------------------------------------------------------------------


@mcp.tool()
async def ocr_to_markdown(
    file_id: str,
    pages: str | None = None,
    include_images: bool = False,
    image_strategy: str = "auto",
) -> dict[str, Any]:
    """Stream-OCR a PDF/image to Markdown via local Ollama (glm-ocr).

    `pages`: optional page spec like "1,3-5". `image_strategy` is one of
    auto|objects|llm. Output Markdown is inlined in `inline_text` when
    small enough; the full path is in `outputs`.
    """
    params = {
        "pages": pages,
        "include_images": include_images,
        "image_strategy": image_strategy,
    }
    return await _run_single("ocr-to-markdown", [file_id], params)


@mcp.tool()
async def anonymize(file_id: str, preset: str = "balanced") -> dict[str, Any]:
    """Redact PII from a Markdown/text file via the OPF model.

    Preset: balanced (default), recall, precision. Errors with
    `opf_not_installed` if the optional dependency is missing — the user
    must run `uv sync --extra anonymizer` once.
    """
    return await _run_single("anonymize", [file_id], {"preset": preset})


@mcp.tool()
async def pdf_to_text(file_id: str) -> dict[str, Any]:
    """Extract the embedded text layer of a PDF (no OCR). Fast but fails
    silently on scanned pages — chain `ocr-to-markdown` for those.
    """
    return await _run_single("pdf-to-text", [file_id], {})


@mcp.tool()
async def pdf_to_images(file_id: str, dpi: int = 150) -> dict[str, Any]:
    """Render every PDF page as PNG at the requested DPI."""
    return await _run_single("pdf-to-images", [file_id], {"dpi": dpi})


@mcp.tool()
async def extract_pages(file_id: str, pages: str) -> dict[str, Any]:
    """Keep only `pages` (e.g. '1,3-5') from the input PDF."""
    return await _run_single("extract-pages", [file_id], {"pages": pages})


@mcp.tool()
async def delete_pages(file_id: str, pages: str) -> dict[str, Any]:
    """Drop `pages` (page spec) from the input PDF."""
    return await _run_single("delete-pages", [file_id], {"pages": pages})


@mcp.tool()
async def rotate_pages(file_id: str, pages: str, degrees: int = 90) -> dict[str, Any]:
    """Rotate selected pages by 90/180/270 degrees."""
    return await _run_single("rotate-pages", [file_id], {"pages": pages, "degrees": degrees})


@mcp.tool()
async def merge_pdfs(file_ids: list[str]) -> dict[str, Any]:
    """Concatenate every input PDF in the given order."""
    return await _run_single("merge-pdfs", file_ids, {})


@mcp.tool()
async def split_pdf(
    file_id: str, every_n: int = 1, ranges: str = ""
) -> dict[str, Any]:
    """Split a PDF either every N pages or by an explicit range spec."""
    return await _run_single("split-pdf", [file_id], {"every_n": every_n, "ranges": ranges})


@mcp.tool()
async def compress_pdf(file_id: str, quality: int = 75) -> dict[str, Any]:
    """Recompress raster images inside the PDF to reduce file size."""
    return await _run_single("compress-pdf", [file_id], {"quality": quality})


@mcp.tool()
async def strip_metadata(file_id: str) -> dict[str, Any]:
    """Strip /Info dict and XMP metadata from the PDF."""
    return await _run_single("strip-metadata", [file_id], {})


@mcp.tool()
async def add_watermark(
    file_id: str,
    text: str,
    position: str = "center",
    opacity: float = 0.25,
    font_size: float = 64,
    rotation: float | None = None,
) -> dict[str, Any]:
    """Stamp `text` on every page of the PDF."""
    params: dict[str, Any] = {
        "text": text,
        "position": position,
        "opacity": opacity,
        "font_size": font_size,
    }
    if rotation is not None:
        params["rotation"] = rotation
    return await _run_single("add-watermark", [file_id], params)


@mcp.tool()
async def add_page_numbers(
    file_id: str,
    position: str = "bottom-center",
    format: str = "{page} / {total}",
    font_size: float = 10,
) -> dict[str, Any]:
    """Render '{page} / {total}' on every page of the PDF."""
    return await _run_single(
        "add-page-numbers",
        [file_id],
        {"position": position, "format": format, "font_size": font_size},
    )


@mcp.tool()
async def images_to_pdf(file_ids: list[str]) -> dict[str, Any]:
    """Combine raster images (one per file_id) into a single PDF."""
    return await _run_single("images-to-pdf", file_ids, {})


@mcp.tool()
async def markdown_to_html(file_id: str) -> dict[str, Any]:
    """Render a Markdown file to a standalone HTML document."""
    return await _run_single("markdown-to-html", [file_id], {})


@mcp.tool()
async def markdown_to_pdf(file_id: str) -> dict[str, Any]:
    """Render a Markdown file to PDF via WeasyPrint."""
    return await _run_single("markdown-to-pdf", [file_id], {})


@mcp.tool()
async def html_to_pdf(file_id: str) -> dict[str, Any]:
    """Render an HTML document to PDF via WeasyPrint."""
    return await _run_single("html-to-pdf", [file_id], {})


@mcp.tool()
async def pdf_to_html(file_id: str) -> dict[str, Any]:
    """Wrap each page's text layer in a <section> for browser viewing."""
    return await _run_single("pdf-to-html", [file_id], {})


@mcp.tool()
async def reorder_pages(file_id: str, order: list[int]) -> dict[str, Any]:
    """Reorder pages of the PDF by 1-based indices."""
    return await _run_single("reorder-pages", [file_id], {"order": order})


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------


def main() -> None:
    """Run the MCP server over stdio (default for Claude Desktop, etc.)."""
    import sys

    from paperloom._api import __version__
    from paperloom.privacy import current_state, short_summary

    state = current_state()
    print(f"paperloom-mcp {__version__} — {short_summary()}", file=sys.stderr, flush=True)
    for caveat in state["caveats"]:
        print(f"  caveat: {caveat}", file=sys.stderr, flush=True)
    mcp.run(transport="stdio")


if __name__ == "__main__":
    main()
