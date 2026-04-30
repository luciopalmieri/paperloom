import io
import zipfile
from collections.abc import AsyncIterator

import pypdfium2 as pdfium
from fastapi.testclient import TestClient

from src.config import settings
from src.main import app
from src.ocr import ollama


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


async def _fake_ollama(_image_png: bytes, _prompt: str) -> AsyncIterator[str]:
    yield "# Stub Heading\n\n"
    yield "Lorem ipsum.\n"


def test_ocr_streams_chunks_and_emits_zip(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "job_storage_root", str(tmp_path))
    monkeypatch.setattr(ollama, "stream_generate", _fake_ollama)

    client = TestClient(app)

    up = client.post(
        "/api/files",
        files={"file": ("doc.pdf", _make_pdf(2), "application/pdf")},
    ).json()

    job = client.post(
        "/api/jobs",
        json={"tools": ["ocr-to-markdown"], "inputs": [up["file_id"]]},
    ).json()
    job_id = job["job_id"]

    with client.stream("GET", f"/api/jobs/{job_id}/events") as r:
        assert r.status_code == 200
        body = b"".join(r.iter_bytes()).decode()

    assert "event: node.start" in body
    assert "event: ocr.page" in body
    assert "page_done" in body
    assert "event: done" in body
    assert "out.zip" in body

    out_md = tmp_path / job_id / "out" / "out.md"
    assert out_md.is_file()
    text = out_md.read_text()
    assert "Stub Heading" in text

    zip_path = tmp_path / job_id / "out.zip"
    assert zip_path.is_file()
    with zipfile.ZipFile(zip_path) as zf:
        names = zf.namelist()
    assert "out.md" in names

    art = client.get(f"/api/jobs/{job_id}/artifacts/out.zip")
    assert art.status_code == 200
    assert art.headers["content-type"] == "application/zip"


def test_artifact_traversal_in_name_blocked(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "job_storage_root", str(tmp_path))
    client = TestClient(app)
    r = client.get("/api/jobs/whatever/artifacts/..secret")
    assert r.status_code == 400
