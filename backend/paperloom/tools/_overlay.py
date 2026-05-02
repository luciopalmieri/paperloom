from __future__ import annotations

import io

import pypdf
from reportlab.lib.colors import Color
from reportlab.pdfgen import canvas

POSITIONS = {
    "bottom-center",
    "bottom-left",
    "bottom-right",
    "top-center",
    "top-left",
    "top-right",
    "center",
}


def _xy(position: str, w: float, h: float, margin: float = 36.0) -> tuple[float, float, str]:
    """Return (x, y, anchor) for a given position keyword. Anchor controls
    reportlab's text alignment.
    """
    cx = w / 2
    cy = h / 2
    if position == "top-left":
        return margin, h - margin, "left"
    if position == "top-center":
        return cx, h - margin, "center"
    if position == "top-right":
        return w - margin, h - margin, "right"
    if position == "center":
        return cx, cy, "center"
    if position == "bottom-left":
        return margin, margin, "left"
    if position == "bottom-right":
        return w - margin, margin, "right"
    return cx, margin, "center"  # bottom-center default


def _draw_text(
    c: canvas.Canvas,
    text: str,
    x: float,
    y: float,
    anchor: str,
    font_size: float,
    rgba: tuple[float, float, float, float],
) -> None:
    c.setFont("Helvetica", font_size)
    c.setFillColor(Color(*rgba))
    if anchor == "left":
        c.drawString(x, y, text)
    elif anchor == "right":
        c.drawRightString(x, y, text)
    else:
        c.drawCentredString(x, y, text)


def make_text_overlay(
    width: float,
    height: float,
    text: str,
    *,
    position: str,
    font_size: float = 12.0,
    rgba: tuple[float, float, float, float] = (0, 0, 0, 1),
    rotation: float = 0.0,
) -> pypdf.PageObject:
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=(width, height))
    x, y, anchor = _xy(position, width, height)
    if rotation:
        c.saveState()
        c.translate(x, y)
        c.rotate(rotation)
        _draw_text(c, text, 0, 0, anchor, font_size, rgba)
        c.restoreState()
    else:
        _draw_text(c, text, x, y, anchor, font_size, rgba)
    c.showPage()
    c.save()
    buf.seek(0)
    return pypdf.PdfReader(buf).pages[0]
