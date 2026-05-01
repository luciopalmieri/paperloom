"""Tests for the weasyprint-dependent + pdf-to-html converters.

WeasyPrint needs native libs (cairo, pango, glib) at runtime. On hosts
where those aren't present the smoke render fails and the tools must
emit a clear error event. The runtime probe at the top decides which
path to assert.
"""

from __future__ import annotations

import io
import zipfile

import pypdf
import pypdfium2 as pdfium
import pytest
from fastapi.testclient import TestClient

from src.config import settings
from src.main import app


def _weasy_works() -> bool:
    try:
        from weasyprint import HTML  # noqa: PLC0415

        HTML(string="<p>x</p>").write_pdf()
        return True
    except Exception:
        return False


WEASY_OK = _weasy_works()


def _make_pdf(num_pages: int = 2) -> bytes:
    pdf = pdfium.PdfDocument.new()
    try:
        for _ in range(num_pages):
            pdf.new_page(width=612, height=792)
        buf = io.BytesIO()
        pdf.save(buf)
        return buf.getvalue()
    finally:
        pdf.close()


def _upload(client: TestClient, name: str, content: bytes, ctype: str) -> str:
    r = client.post("/api/files", files={"file": (name, content, ctype)})
    assert r.status_code == 200, r.text
    return r.json()["file_id"]


def _run(client: TestClient, tools, inputs):
    job = client.post("/api/jobs", json={"tools": tools, "inputs": inputs}).json()
    job_id = job["job_id"]
    with client.stream("GET", f"/api/jobs/{job_id}/events") as r:
        body = b"".join(r.iter_bytes()).decode()
    return job_id, body


def test_pdf_to_html_extracts_pages(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "job_storage_root", str(tmp_path))
    client = TestClient(app)
    fid = _upload(client, "doc.pdf", _make_pdf(2), "application/pdf")
    job_id, body = _run(client, ["pdf-to-html"], [fid])
    assert "event: done" in body
    out_html = next((tmp_path / job_id / "out").glob("*.html"))
    text = out_html.read_text()
    assert "<section>" in text
    assert text.count("<h2>") == 2


@pytest.mark.skipif(not WEASY_OK, reason="weasyprint native libs not installed")
def test_markdown_to_pdf(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "job_storage_root", str(tmp_path))
    client = TestClient(app)
    fid = _upload(client, "doc.md", b"# Hi\n\nLorem ipsum.", "text/markdown")
    job_id, body = _run(client, ["markdown-to-pdf"], [fid])
    assert "event: done" in body
    out_pdf = next((tmp_path / job_id / "out").glob("*.pdf"))
    assert pypdf.PdfReader(str(out_pdf)).pages


@pytest.mark.skipif(not WEASY_OK, reason="weasyprint native libs not installed")
def test_html_to_pdf(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "job_storage_root", str(tmp_path))
    client = TestClient(app)
    fid = _upload(
        client,
        "doc.html",
        b"<!doctype html><html><body><h1>Hi</h1><p>x</p></body></html>",
        "text/html",
    )
    job_id, body = _run(client, ["html-to-pdf"], [fid])
    assert "event: done" in body
    out_pdf = next((tmp_path / job_id / "out").glob("*.pdf"))
    assert pypdf.PdfReader(str(out_pdf)).pages


@pytest.mark.skipif(WEASY_OK, reason="this branch checks the no-native-libs error path")
def test_markdown_to_pdf_emits_unavailable_error(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "job_storage_root", str(tmp_path))
    client = TestClient(app)
    fid = _upload(client, "doc.md", b"# Hi", "text/markdown")
    _, body = _run(client, ["markdown-to-pdf"], [fid])
    assert "weasyprint_unavailable" in body
