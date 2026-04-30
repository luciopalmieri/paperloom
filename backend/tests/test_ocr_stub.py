import io

import pypdfium2 as pdfium
from fastapi.testclient import TestClient

from src.config import settings
from src.main import app


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


def test_ocr_stub_streams_chunks(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "job_storage_root", str(tmp_path))
    client = TestClient(app)

    up = client.post(
        "/api/files",
        files={"file": ("doc.pdf", _make_pdf(1), "application/pdf")},
    ).json()

    job = client.post(
        "/api/jobs",
        json={"tools": ["ocr-to-markdown"], "inputs": [up["file_id"]]},
    ).json()
    assert "job_id" in job

    with client.stream("GET", f"/api/jobs/{job['job_id']}/events") as r:
        assert r.status_code == 200
        body = b"".join(r.iter_bytes())

    text = body.decode()
    assert "event: node.start" in text
    assert "event: ocr.page" in text
    assert "page_done" in text
    assert "event: done" in text
