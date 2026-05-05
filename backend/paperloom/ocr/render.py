from __future__ import annotations

import io
from pathlib import Path

import pypdfium2 as pdfium
from PIL import Image

DPI = 150
SCALE = DPI / 72


def page_count(pdf_path: Path) -> int:
    pdf = pdfium.PdfDocument(str(pdf_path))
    try:
        return len(pdf)
    finally:
        pdf.close()


def render_page_png(pdf_path: Path, page_index: int, scale: float = SCALE) -> bytes:
    pdf = pdfium.PdfDocument(str(pdf_path))
    try:
        page = pdf[page_index]
        bitmap = page.render(scale=scale)
        pil_img: Image.Image = bitmap.to_pil()
        buf = io.BytesIO()
        pil_img.save(buf, format="PNG")
        return buf.getvalue()
    finally:
        pdf.close()
