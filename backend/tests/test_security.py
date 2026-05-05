from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from paperloom import jobs as jobs_mod
from paperloom.config import settings
from paperloom.main import app


@pytest.mark.parametrize(
    "bad_id",
    [
        "../etc/passwd",
        "..%2F..%2Fetc%2Fpasswd",
        "/absolute/path",
        "g" * 32,  # not hex
        "abc",  # too short
        "0" * 33,  # too long
        "",
    ],
)
def test_find_file_rejects_unsafe_id(tmp_path, monkeypatch, bad_id):
    monkeypatch.setattr(settings, "job_storage_root", str(tmp_path))
    assert jobs_mod.find_file(bad_id) is None


def test_find_file_accepts_valid_hex32(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "job_storage_root", str(tmp_path))
    entry = jobs_mod.store_file("doc.txt", b"hi", pages=None)
    assert jobs_mod.find_file(entry.file_id) is not None


def test_find_job_root_rejects_traversal(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "job_storage_root", str(tmp_path))
    assert jobs_mod.find_job_root("../etc") is None
    assert jobs_mod.find_job_root("../../tmp") is None


def test_files_endpoint_rejects_traversal(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "job_storage_root", str(tmp_path))
    client = TestClient(app)
    # FastAPI normalises the URL path, but the validator must still reject
    # the parameter form once it lands in find_file.
    r = client.get("/api/files/not-a-hex32-id")
    assert r.status_code == 404


def test_safe_under_blocks_escape(tmp_path):
    root = tmp_path / "root"
    root.mkdir()
    inside = root / "a.txt"
    inside.write_text("ok")
    assert jobs_mod.safe_under(inside, root) == inside.resolve()

    with pytest.raises(ValueError):
        jobs_mod.safe_under(tmp_path / "outside.txt", root)


def test_safe_under_resolves_symlink_escape(tmp_path):
    root = tmp_path / "root"
    root.mkdir()
    target = tmp_path / "secret.txt"
    target.write_text("nope")
    link = root / "link.txt"
    link.symlink_to(target)
    with pytest.raises(ValueError):
        jobs_mod.safe_under(link, root)


def test_artifact_endpoint_rejects_bad_name(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "job_storage_root", str(tmp_path))
    client = TestClient(app)
    job_id = "a" * 32
    (tmp_path / job_id).mkdir()
    r = client.get(f"/api/jobs/{job_id}/artifacts/..%2Fetc%2Fpasswd")
    assert r.status_code in (400, 404)


def test_storage_root_created_0700(tmp_path, monkeypatch):
    target = tmp_path / "custom-root"
    monkeypatch.setattr(settings, "job_storage_root", str(target))
    root = jobs_mod._root()
    assert root.exists()
    mode = root.stat().st_mode & 0o777
    assert mode == 0o700, f"expected 0700, got {oct(mode)}"


def test_hex32_validator():
    assert jobs_mod._is_safe_id("a" * 32)
    assert jobs_mod._is_safe_id("0123456789abcdef" * 2)
    assert not jobs_mod._is_safe_id("A" * 32)  # uppercase
    assert not jobs_mod._is_safe_id("g" * 32)
    assert not jobs_mod._is_safe_id("../" + "a" * 29)
    assert not jobs_mod._is_safe_id("")
