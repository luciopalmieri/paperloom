from __future__ import annotations

import io
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

import pypdfium2 as pdfium
import pypdfium2.raw as pdfium_c
from PIL import Image

Bbox = tuple[float, float, float, float]
Strategy = Literal["auto", "objects", "llm"]


@dataclass(frozen=True)
class FigurePlaceholder:
    n: int
    caption: str
    bbox_norm: Bbox | None
    raw: str  # exact match string for replace


@dataclass(frozen=True)
class FigureObject:
    bbox_norm: Bbox
    image_bytes: bytes


_PLACEHOLDER_RE = re.compile(
    r"\[\[FIGURE:fig-(?P<n>\d+)"
    r"(?:\|caption=(?P<caption>[^|\]]*))?"
    r"(?:\|bbox=(?P<bbox>[0-9.,\s]+))?"
    r"\]\]"
)


def parse_placeholders(page_md: str) -> list[FigurePlaceholder]:
    out: list[FigurePlaceholder] = []
    for m in _PLACEHOLDER_RE.finditer(page_md):
        n = int(m.group("n"))
        caption = (m.group("caption") or "").strip()
        bbox = _parse_bbox(m.group("bbox"))
        out.append(FigurePlaceholder(n=n, caption=caption, bbox_norm=bbox, raw=m.group(0)))
    return out


def _parse_bbox(s: str | None) -> Bbox | None:
    if not s:
        return None
    parts = [p.strip() for p in s.split(",") if p.strip()]
    if len(parts) != 4:
        return None
    try:
        x0, y0, x1, y1 = (float(p) for p in parts)
    except ValueError:
        return None
    x0, x1 = sorted((max(0.0, min(1.0, x0)), max(0.0, min(1.0, x1))))
    y0, y1 = sorted((max(0.0, min(1.0, y0)), max(0.0, min(1.0, y1))))
    if x1 - x0 < 1e-3 or y1 - y0 < 1e-3:
        return None
    return (x0, y0, x1, y1)


def iou(a: Bbox, b: Bbox) -> float:
    ax0, ay0, ax1, ay1 = a
    bx0, by0, bx1, by1 = b
    ix0 = max(ax0, bx0)
    iy0 = max(ay0, by0)
    ix1 = min(ax1, bx1)
    iy1 = min(ay1, by1)
    iw = max(0.0, ix1 - ix0)
    ih = max(0.0, iy1 - iy0)
    inter = iw * ih
    if inter <= 0.0:
        return 0.0
    area_a = max(0.0, (ax1 - ax0) * (ay1 - ay0))
    area_b = max(0.0, (bx1 - bx0) * (by1 - by0))
    union = area_a + area_b - inter
    return inter / union if union > 0.0 else 0.0


def extract_image_objects(pdf_path: Path, page_index: int) -> list[FigureObject]:
    """Extract raster image objects from a PDF page.

    Bounds returned by pdfium are in PDF user-space (origin bottom-left).
    Normalizes to [0..1] with top-left origin to match the LLM bbox convention.
    Returns [] if the file is not a valid PDF or the page index is out of range.
    """
    out: list[FigureObject] = []
    try:
        pdf = pdfium.PdfDocument(str(pdf_path))
    except Exception:
        return out
    try:
        if page_index < 0 or page_index >= len(pdf):
            return out
        page = pdf[page_index]
        page_w, page_h = page.get_size()
        if page_w <= 0 or page_h <= 0:
            return out
        for obj in page.get_objects(filter=[pdfium_c.FPDF_PAGEOBJ_IMAGE]):
            try:
                left, bottom, right, top = obj.get_bounds()
            except Exception:
                continue
            x0 = max(0.0, min(1.0, left / page_w))
            x1 = max(0.0, min(1.0, right / page_w))
            y0 = max(0.0, min(1.0, (page_h - top) / page_h))
            y1 = max(0.0, min(1.0, (page_h - bottom) / page_h))
            if x1 - x0 < 1e-3 or y1 - y0 < 1e-3:
                continue
            png = _bitmap_to_png(obj)
            if png is None:
                continue
            out.append(FigureObject(bbox_norm=(x0, y0, x1, y1), image_bytes=png))
    finally:
        pdf.close()
    return out


def _bitmap_to_png(image_obj) -> bytes | None:  # type: ignore[no-untyped-def]
    try:
        bitmap = image_obj.get_bitmap(render=True)
        pil = bitmap.to_pil()
        if pil.mode not in ("RGB", "RGBA", "L"):
            pil = pil.convert("RGB")
        buf = io.BytesIO()
        pil.save(buf, format="PNG")
        return buf.getvalue()
    except Exception:
        return None


def crop_from_bbox(page_png: bytes, bbox_norm: Bbox) -> bytes | None:
    try:
        with Image.open(io.BytesIO(page_png)) as im:
            im.load()
            W, H = im.size
            x0, y0, x1, y1 = bbox_norm
            left = max(0, int(round(x0 * W)))
            top = max(0, int(round(y0 * H)))
            right = min(W, int(round(x1 * W)))
            bottom = min(H, int(round(y1 * H)))
            if right - left < 2 or bottom - top < 2:
                return None
            crop = im.crop((left, top, right, bottom))
            if crop.mode not in ("RGB", "RGBA", "L"):
                crop = crop.convert("RGB")
            buf = io.BytesIO()
            crop.save(buf, format="PNG")
            return buf.getvalue()
    except Exception:
        return None


def build_figure_assets(
    pdf_path: Path,
    page_index: int,
    page_png: bytes,
    placeholders: list[FigurePlaceholder],
    strategy: Strategy = "auto",
    iou_threshold: float = 0.3,
) -> list[bytes | None]:
    """Return one PNG (or None) per placeholder, in placeholder order.

    - 'objects': match each placeholder bbox against PDF image objects via IoU.
      No bbox or no match → None.
    - 'llm': crop page_png at the placeholder bbox. No bbox → None.
    - 'auto': try objects first; for non-matched placeholders, fall back to llm.
    """
    if not placeholders:
        return []

    crops: list[bytes | None] = [None] * len(placeholders)
    objects: list[FigureObject] = []
    if strategy in ("objects", "auto"):
        try:
            objects = extract_image_objects(pdf_path, page_index)
        except Exception:
            objects = []

    used_obj: set[int] = set()
    if strategy in ("objects", "auto"):
        for i, ph in enumerate(placeholders):
            if ph.bbox_norm is None:
                continue
            best_idx = -1
            best_iou = iou_threshold
            for j, obj in enumerate(objects):
                if j in used_obj:
                    continue
                score = iou(ph.bbox_norm, obj.bbox_norm)
                if score > best_iou:
                    best_iou = score
                    best_idx = j
            if best_idx >= 0:
                crops[i] = objects[best_idx].image_bytes
                used_obj.add(best_idx)

    if strategy in ("llm", "auto"):
        for i, ph in enumerate(placeholders):
            if crops[i] is not None:
                continue
            if ph.bbox_norm is None:
                continue
            crops[i] = crop_from_bbox(page_png, ph.bbox_norm)

    return crops


def render_caption_line(ph: FigurePlaceholder, image_rel_path: str | None) -> str:
    """Markdown replacement for a placeholder.

    - image link if `image_rel_path` provided (alt = caption, may be empty);
    - bold-prefixed caption line if no image but caption is present;
    - empty string when neither image nor caption exists.
    """
    alt = ph.caption.replace("[", "").replace("]", "").strip()
    if image_rel_path:
        return f"![{alt}]({image_rel_path})"
    if ph.caption:
        return f"**Figure {ph.n}.** {ph.caption}"
    return ""


def replace_placeholders(
    page_md: str,
    placeholders: list[FigurePlaceholder],
    image_rel_paths: list[str | None],
) -> str:
    """Replace each placeholder's raw token in page_md with its caption/image line.

    Empty replacements collapse the placeholder line entirely (drop trailing
    blank line) so the markdown stays clean.
    """
    out = page_md
    for ph, rel in zip(placeholders, image_rel_paths, strict=True):
        replacement = render_caption_line(ph, rel)
        if replacement:
            out = out.replace(ph.raw, replacement, 1)
        else:
            # drop the placeholder and its line break to avoid empty lines
            patterns = [f"{ph.raw}\n", f"\n{ph.raw}", ph.raw]
            for p in patterns:
                if p in out:
                    out = out.replace(p, "", 1)
                    break
    return out
