import io
import zipfile

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


def _upload(client: TestClient, name: str, content: bytes) -> str:
    r = client.post("/api/files", files={"file": (name, content, "application/pdf")})
    assert r.status_code == 200
    return r.json()["file_id"]


def _run(client: TestClient, tools, inputs):
    job = client.post("/api/jobs", json={"tools": tools, "inputs": inputs}).json()
    job_id = job["job_id"]
    with client.stream("GET", f"/api/jobs/{job_id}/events") as r:
        assert r.status_code == 200
        body = b"".join(r.iter_bytes()).decode()
    return job_id, body


def test_pdf_to_text_chain(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "job_storage_root", str(tmp_path))
    client = TestClient(app)
    file_id = _upload(client, "doc.pdf", _make_pdf(2))

    job_id, body = _run(client, ["pdf-to-text"], [file_id])
    assert "event: node.start" in body
    assert "event: node.end" in body
    assert "event: done" in body

    zip_path = tmp_path / job_id / "out.zip"
    assert zip_path.is_file()
    with zipfile.ZipFile(zip_path) as zf:
        assert any(n.endswith(".md") for n in zf.namelist())


def test_pdf_to_images_chain(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "job_storage_root", str(tmp_path))
    client = TestClient(app)
    file_id = _upload(client, "doc.pdf", _make_pdf(3))

    job_id, body = _run(
        client,
        [{"slug": "pdf-to-images", "params": {"dpi": 96}}],
        [file_id],
    )
    assert "event: done" in body

    zip_path = tmp_path / job_id / "out.zip"
    with zipfile.ZipFile(zip_path) as zf:
        names = zf.namelist()
    pngs = [n for n in names if n.endswith(".png")]
    assert len(pngs) == 3


def test_merge_pdfs_chain(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "job_storage_root", str(tmp_path))
    client = TestClient(app)
    a = _upload(client, "a.pdf", _make_pdf(1))
    b = _upload(client, "b.pdf", _make_pdf(2))

    job_id, body = _run(client, ["merge-pdfs"], [a, b])
    assert "event: done" in body

    zip_path = tmp_path / job_id / "out.zip"
    with zipfile.ZipFile(zip_path) as zf:
        names = zf.namelist()
    assert "merged.pdf" in names


def test_unknown_tool_emits_error(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "job_storage_root", str(tmp_path))
    client = TestClient(app)
    file_id = _upload(client, "doc.pdf", _make_pdf(1))

    _, body = _run(client, ["does-not-exist"], [file_id])
    assert "unknown_tool" in body
