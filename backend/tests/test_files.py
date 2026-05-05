import io

import pypdfium2 as pdfium
from fastapi.testclient import TestClient

from paperloom.config import settings
from paperloom.main import app


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


def test_upload_pdf_returns_metadata(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "job_storage_root", str(tmp_path))
    client = TestClient(app)

    pdf_bytes = _make_pdf(2)
    r = client.post(
        "/api/files",
        files={"file": ("doc.pdf", pdf_bytes, "application/pdf")},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["filename"] == "doc.pdf"
    assert data["pages"] == 2
    assert "file_id" in data


def test_upload_oversize_rejected(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "job_storage_root", str(tmp_path))
    monkeypatch.setattr(settings, "max_file_size_mb", 1)
    client = TestClient(app)

    too_big = b"x" * (2 * 1024 * 1024)
    r = client.post(
        "/api/files",
        files={"file": ("big.bin", too_big, "application/octet-stream")},
    )
    assert r.status_code == 413


def test_preview_returns_png(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "job_storage_root", str(tmp_path))
    client = TestClient(app)

    pdf_bytes = _make_pdf(1)
    up = client.post(
        "/api/files",
        files={"file": ("doc.pdf", pdf_bytes, "application/pdf")},
    ).json()

    r = client.get(f"/api/files/{up['file_id']}/preview", params={"page": 1})
    assert r.status_code == 200
    assert r.headers["content-type"] == "image/png"
    assert r.content.startswith(b"\x89PNG\r\n\x1a\n")
