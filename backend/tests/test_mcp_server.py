from __future__ import annotations

from pathlib import Path

import pytest

from src import jobs as jobs_mod
from src import mcp_server
from src.config import settings


@pytest.fixture
def storage(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "job_storage_root", str(tmp_path / "storage"))
    return tmp_path


async def test_register_file_rejects_outside_allowlist(storage, monkeypatch):
    monkeypatch.setattr(settings, "mcp_allowed_dirs", str(storage / "allowed"))
    (storage / "allowed").mkdir()
    outside = storage / "outside.txt"
    outside.write_text("nope")
    res = await mcp_server.register_file(str(outside))
    assert res["error"]["code"] == "path_not_allowed"


async def test_register_file_accepts_inside_allowlist(storage, monkeypatch):
    allowed = storage / "allowed"
    allowed.mkdir()
    monkeypatch.setattr(settings, "mcp_allowed_dirs", str(allowed))
    f = allowed / "doc.md"
    f.write_text("# hello")
    res = await mcp_server.register_file(str(f))
    assert "file_id" in res
    assert res["filename"] == "doc.md"
    # File materialised into storage so subsequent ops cannot escape.
    entry = jobs_mod.find_file(res["file_id"])
    assert entry is not None
    assert entry.path.read_text() == "# hello"


async def test_register_file_rejects_symlink_escape(storage, monkeypatch):
    allowed = storage / "allowed"
    allowed.mkdir()
    monkeypatch.setattr(settings, "mcp_allowed_dirs", str(allowed))
    secret = storage / "secret.txt"
    secret.write_text("PII")
    link = allowed / "link.txt"
    link.symlink_to(secret)
    res = await mcp_server.register_file(str(link))
    # Symlink resolves to outside-allowed → reject.
    assert res["error"]["code"] == "path_not_allowed"


async def test_register_inline_creates_file(storage):
    import base64

    payload = base64.b64encode(b"# hi from inline").decode()
    res = await mcp_server.register_inline("note.md", payload)
    assert "file_id" in res
    assert res["size"] == len(b"# hi from inline")
    entry = jobs_mod.find_file(res["file_id"])
    assert entry is not None
    assert entry.path.read_text() == "# hi from inline"


async def test_register_inline_rejects_bad_base64(storage):
    res = await mcp_server.register_inline("x.md", "@@@not-base64@@@")
    assert res["error"]["code"] == "bad_base64"


async def test_run_tool_rejects_unknown_slug(storage):
    res = await mcp_server.run_tool("does-not-exist", ["a" * 32], {})
    assert res["error"]["code"] == "unknown_tool"


async def test_run_tool_rejects_unknown_file_id(storage):
    res = await mcp_server.run_tool("pdf-to-text", ["a" * 32], {})
    assert res["error"]["code"] == "unknown_file_id"


async def test_run_tool_rejects_invalid_file_id_format(storage):
    res = await mcp_server.run_tool("pdf-to-text", ["../etc/passwd"], {})
    assert res["error"]["code"] == "unknown_file_id"


async def test_markdown_to_html_end_to_end(storage):
    entry = jobs_mod.store_file("note.md", b"# Hello\n\nWorld.", pages=None)
    res = await mcp_server.markdown_to_html(entry.file_id)
    assert res.get("error") is None, res
    assert res["outputs"]
    out = Path(res["outputs"][0])
    assert out.exists()
    html = out.read_text()
    assert "<h1>Hello</h1>" in html


async def test_pdf_to_text_end_to_end(storage):
    import io

    import pypdfium2 as pdfium

    pdf = pdfium.PdfDocument.new()
    try:
        pdf.new_page(width=612, height=792)
        buf = io.BytesIO()
        pdf.save(buf)
        pdf_bytes = buf.getvalue()
    finally:
        pdf.close()

    entry = jobs_mod.store_file("doc.pdf", pdf_bytes, pages=1)
    res = await mcp_server.pdf_to_text(entry.file_id)
    assert res.get("error") is None, res
    assert res["outputs"]
    # Empty page → empty .md, but inline_text should still surface.
    assert "inline_text" in res


async def test_list_paperloom_tools_returns_registry():
    res = await mcp_server.list_paperloom_tools()
    assert "ocr-to-markdown" in res["tools"]
    assert "anonymize" in res["tools"]
    assert "pdf-to-text" in res["params_hints"]


async def test_run_tool_requires_at_least_one_input(storage):
    res = await mcp_server.run_tool("merge-pdfs", [], {})
    assert res["error"]["code"] == "no_inputs"
