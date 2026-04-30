from __future__ import annotations

import zipfile
from pathlib import Path


def build_zip(source_dir: Path, dest: Path) -> Path:
    """Zip every file under `source_dir` (paths relative to source_dir)."""
    with zipfile.ZipFile(dest, "w", zipfile.ZIP_DEFLATED) as zf:
        for p in source_dir.rglob("*"):
            if p.is_file():
                zf.write(p, p.relative_to(source_dir))
    return dest
