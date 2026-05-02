from __future__ import annotations

import io
from pathlib import Path

from PIL import Image, ImageOps

IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".webp", ".tif", ".tiff", ".bmp", ".gif"}


def is_image(filename: str) -> bool:
    return Path(filename).suffix.lower() in IMAGE_EXTS


MAX_DIM = 2000


def load_as_png(path: Path) -> bytes:
    with Image.open(path) as im:
        im = ImageOps.exif_transpose(im)
        if im.mode not in ("RGB", "RGBA", "L"):
            im = im.convert("RGB")
        w, h = im.size
        longest = max(w, h)
        if longest > MAX_DIM:
            scale = MAX_DIM / longest
            im = im.resize((int(w * scale), int(h * scale)), Image.LANCZOS)
        buf = io.BytesIO()
        im.save(buf, format="PNG")
        return buf.getvalue()


def rotate_in_place(path: Path, degrees: int) -> None:
    if degrees % 360 == 0:
        return
    with Image.open(path) as im:
        im = ImageOps.exif_transpose(im)
        rotated = im.rotate(-degrees, expand=True)
        fmt = (im.format or "PNG").upper()
        save_kwargs: dict[str, object] = {}
        if fmt == "JPEG":
            if rotated.mode != "RGB":
                rotated = rotated.convert("RGB")
            save_kwargs["quality"] = 95
        rotated.save(path, format=fmt, **save_kwargs)
