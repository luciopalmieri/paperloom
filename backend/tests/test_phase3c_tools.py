import io
import zipfile

import pypdf
import pypdfium2 as pdfium
from fastapi.testclient import TestClient
from PIL import Image

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


def _png(color: tuple[int, int, int] = (200, 100, 50)) -> bytes:
    img = Image.new("RGB", (200, 200), color)
    buf = io.BytesIO()
    img.save(buf, "PNG")
    return buf.getvalue()


def _md(text: str = "# Hello\n\nWorld") -> bytes:
    return text.encode("utf-8")


def _upload(client: TestClient, name: str, content: bytes, ctype: str) -> str:
    r = client.post("/api/files", files={"file": (name, content, ctype)})
    assert r.status_code == 200, r.text
    return r.json()["file_id"]


def _run(client: TestClient, tools, inputs):
    job = client.post("/api/jobs", json={"tools": tools, "inputs": inputs}).json()
    job_id = job["job_id"]
    with client.stream("GET", f"/api/jobs/{job_id}/events") as r:
        assert r.status_code == 200
        body = b"".join(r.iter_bytes()).decode()
    return job_id, body


def _zip_names(zip_path) -> list[str]:
    with zipfile.ZipFile(zip_path) as zf:
        return zf.namelist()


def test_split_pdf_every_n(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "job_storage_root", str(tmp_path))
    client = TestClient(app)
    fid = _upload(client, "doc.pdf", _make_pdf(4), "application/pdf")
    job_id, body = _run(
        client, [{"slug": "split-pdf", "params": {"every_n": 2}}], [fid]
    )
    assert "event: done" in body
    names = _zip_names(tmp_path / job_id / "out.zip")
    parts = [n for n in names if n.endswith(".pdf")]
    assert len(parts) == 2


def test_extract_and_delete_pages(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "job_storage_root", str(tmp_path))
    client = TestClient(app)
    fid = _upload(client, "doc.pdf", _make_pdf(5), "application/pdf")

    job_id, _ = _run(
        client, [{"slug": "extract-pages", "params": {"pages": "1,3"}}], [fid]
    )
    out_pdf = next((tmp_path / job_id / "out").glob("*.pdf"))
    assert len(pypdf.PdfReader(str(out_pdf)).pages) == 2

    job_id2, _ = _run(
        client, [{"slug": "delete-pages", "params": {"pages": "2-4"}}], [fid]
    )
    out_pdf2 = next((tmp_path / job_id2 / "out").glob("*.pdf"))
    assert len(pypdf.PdfReader(str(out_pdf2)).pages) == 2


def test_rotate_pages(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "job_storage_root", str(tmp_path))
    client = TestClient(app)
    fid = _upload(client, "doc.pdf", _make_pdf(2), "application/pdf")
    job_id, body = _run(
        client, [{"slug": "rotate-pages", "params": {"degrees": 90}}], [fid]
    )
    assert "event: done" in body
    out_pdf = next((tmp_path / job_id / "out").glob("*.pdf"))
    pages = pypdf.PdfReader(str(out_pdf)).pages
    assert pages[0].get("/Rotate") == 90


def test_reorder_pages(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "job_storage_root", str(tmp_path))
    client = TestClient(app)
    fid = _upload(client, "doc.pdf", _make_pdf(3), "application/pdf")
    job_id, body = _run(
        client, [{"slug": "reorder-pages", "params": {"order": [3, 1, 2]}}], [fid]
    )
    assert "event: done" in body
    out_pdf = next((tmp_path / job_id / "out").glob("*.pdf"))
    assert len(pypdf.PdfReader(str(out_pdf)).pages) == 3


def test_strip_metadata(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "job_storage_root", str(tmp_path))
    client = TestClient(app)
    fid = _upload(client, "doc.pdf", _make_pdf(1), "application/pdf")
    job_id, body = _run(client, ["strip-metadata"], [fid])
    assert "event: done" in body
    out_pdf = next((tmp_path / job_id / "out").glob("*.pdf"))
    md = pypdf.PdfReader(str(out_pdf)).metadata or {}
    # Whatever pypdf re-stamps (Producer is unavoidable) is fine, but the
    # source's /Creator and /CreationDate must be gone.
    assert "/Creator" not in md
    assert "/CreationDate" not in md


def test_compress_pdf_runs(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "job_storage_root", str(tmp_path))
    client = TestClient(app)
    fid = _upload(client, "doc.pdf", _make_pdf(2), "application/pdf")
    job_id, body = _run(
        client, [{"slug": "compress-pdf", "params": {"quality": 60}}], [fid]
    )
    assert "event: done" in body
    out_pdf = next((tmp_path / job_id / "out").glob("*.pdf"))
    assert out_pdf.stat().st_size > 0


def test_add_page_numbers_and_watermark(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "job_storage_root", str(tmp_path))
    client = TestClient(app)
    fid = _upload(client, "doc.pdf", _make_pdf(2), "application/pdf")

    job_id, body = _run(
        client,
        [
            {"slug": "add-page-numbers", "params": {"position": "bottom-right"}},
            {"slug": "add-watermark", "params": {"text": "DRAFT", "opacity": 0.2}},
        ],
        [fid],
    )
    assert "event: done" in body
    assert "event: node.end" in body
    out_pdf = next((tmp_path / job_id / "out").glob("*.pdf"))
    assert len(pypdf.PdfReader(str(out_pdf)).pages) == 2


def test_images_to_pdf(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "job_storage_root", str(tmp_path))
    client = TestClient(app)
    a = _upload(client, "a.png", _png((255, 0, 0)), "image/png")
    b = _upload(client, "b.png", _png((0, 255, 0)), "image/png")
    job_id, body = _run(client, ["images-to-pdf"], [a, b])
    assert "event: done" in body
    out_pdf = next((tmp_path / job_id / "out").glob("*.pdf"))
    assert len(pypdf.PdfReader(str(out_pdf)).pages) == 2


def test_markdown_to_html(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "job_storage_root", str(tmp_path))
    client = TestClient(app)
    fid = _upload(client, "doc.md", _md("# Hi\n\n- a\n- b"), "text/markdown")
    job_id, body = _run(client, ["markdown-to-html"], [fid])
    assert "event: done" in body
    out_html = next((tmp_path / job_id / "out").glob("*.html"))
    text = out_html.read_text()
    assert "<h1>" in text
    assert "<li>a</li>" in text


def test_watermark_missing_text_emits_error(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "job_storage_root", str(tmp_path))
    client = TestClient(app)
    fid = _upload(client, "doc.pdf", _make_pdf(1), "application/pdf")
    _, body = _run(client, [{"slug": "add-watermark", "params": {}}], [fid])
    assert "missing_text" in body
