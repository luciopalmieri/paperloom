from __future__ import annotations

import json
import re
import shutil
import time
import uuid
from dataclasses import dataclass
from pathlib import Path

from src.config import settings

_HEX32 = re.compile(r"^[0-9a-f]{32}$")


def _is_safe_id(value: str) -> bool:
    return bool(_HEX32.fullmatch(value))


def safe_under(candidate: Path, root: Path) -> Path:
    """Resolve `candidate` and assert it lives under `root`.

    Raises ValueError on traversal. Used by every code path that turns
    user-supplied identifiers into filesystem paths (HTTP routers, MCP
    wrapper). Symlinks are resolved so a symlink under `root` cannot
    point outside.
    """
    root_real = root.resolve()
    real = candidate.resolve()
    if root_real != real and root_real not in real.parents:
        raise ValueError(f"path escapes root: {candidate}")
    return real


@dataclass(slots=True)
class FileEntry:
    file_id: str
    filename: str
    size: int
    pages: int | None
    path: Path


@dataclass(slots=True)
class Job:
    job_id: str
    tools: list[str]
    inputs: list[str]
    root: Path
    created_at: float


def _root() -> Path:
    root = Path(settings.job_storage_root)
    if not root.exists():
        # 0700: storage holds user-uploaded PDFs and (optionally) anonymizer
        # reports. On a multi-user machine the previous /tmp default exposed
        # them to anyone with read access — keep them owner-only.
        root.mkdir(parents=True, mode=0o700, exist_ok=True)
    return root


def _files_root() -> Path:
    return _root() / "_files"


def store_file(filename: str, content: bytes, pages: int | None) -> FileEntry:
    file_id = uuid.uuid4().hex
    dest_dir = _files_root() / file_id
    dest_dir.mkdir(parents=True, exist_ok=True)
    safe = Path(filename).name or "upload"
    dest = dest_dir / safe
    dest.write_bytes(content)
    return FileEntry(file_id=file_id, filename=safe, size=len(content), pages=pages, path=dest)


def find_file(file_id: str) -> FileEntry | None:
    if not _is_safe_id(file_id):
        return None
    dir_ = _files_root() / file_id
    if not dir_.is_dir():
        return None
    candidates = [p for p in dir_.iterdir() if p.is_file()]
    if not candidates:
        return None
    p = candidates[0]
    return FileEntry(file_id=file_id, filename=p.name, size=p.stat().st_size, pages=None, path=p)


def find_job_root(job_id: str) -> Path | None:
    if not _is_safe_id(job_id):
        return None
    root = _root() / job_id
    return root if root.is_dir() else None


def create_job(chain: list[dict[str, object]], inputs: list[str]) -> Job:
    job_id = uuid.uuid4().hex
    root = _root() / job_id
    (root / "inputs").mkdir(parents=True, exist_ok=True)
    (root / "work").mkdir(parents=True, exist_ok=True)
    (root / "out").mkdir(parents=True, exist_ok=True)
    tool_slugs = [str(node.get("slug", "")) for node in chain]
    job = Job(job_id=job_id, tools=tool_slugs, inputs=inputs, root=root, created_at=time.time())
    (root / "job.json").write_text(
        json.dumps(
            {
                "job_id": job_id,
                "chain": chain,
                "inputs": inputs,
                "created_at": job.created_at,
            }
        )
    )
    return job


def cleanup_old_jobs() -> int:
    cutoff = time.time() - settings.job_ttl_hours * 3600
    removed = 0
    base = _root()
    if not base.exists():
        return 0
    for entry in base.iterdir():
        if not entry.is_dir():
            continue
        if entry.name == "_files":
            continue
        try:
            mtime = entry.stat().st_mtime
        except FileNotFoundError:
            continue
        if mtime < cutoff:
            shutil.rmtree(entry, ignore_errors=True)
            removed += 1
    return removed
