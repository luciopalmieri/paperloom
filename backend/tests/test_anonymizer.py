import io
import json
import zipfile
from dataclasses import dataclass
from typing import Any

import pypdfium2 as pdfium
from fastapi.testclient import TestClient

from paperloom.anonymizer import detect, redact, report
from paperloom.anonymizer.detect import Span
from paperloom.config import settings
from paperloom.main import app


def test_redact_apply_groups_per_category():
    text = "Mail a@b.com and c@d.com, call 555-1234."
    spans = [
        Span("private_email", 5, 12, "a@b.com"),
        Span("private_email", 17, 24, "c@d.com"),
        Span("private_phone", 31, 39, "555-1234"),
    ]
    out, redactions = redact.apply(text, spans)
    assert out == "Mail [REDACTED:PRIVATE_EMAIL:1] and [REDACTED:PRIVATE_EMAIL:2], call [REDACTED:PRIVATE_PHONE:1]."
    assert [r.span_id for r in redactions] == [
        "PRIVATE_EMAIL:1",
        "PRIVATE_EMAIL:2",
        "PRIVATE_PHONE:1",
    ]


def test_redact_skips_overlapping_spans():
    text = "a@b.com"
    spans = [
        Span("private_email", 0, 7, "a@b.com"),
        Span("private_url", 2, 7, "b.com"),  # overlap → skipped
    ]
    out, redactions = redact.apply(text, spans)
    assert out == "[REDACTED:PRIVATE_EMAIL:1]"
    assert len(redactions) == 1


def test_report_schema_complete():
    text = "x"
    spans = [Span("private_email", 0, 1, "x")]
    _, redactions = redact.apply(text, spans)
    rep = report.build(
        job_id="abc",
        input_filename="doc.md",
        input_format="md",
        preset="balanced",
        redactions=redactions,
    )
    assert rep["schema_version"] == "1"
    assert rep["job_id"] == "abc"
    assert set(rep["stats"]["by_category"].keys()) == set(detect.CATEGORIES)
    assert rep["stats"]["total_spans"] == 1
    assert rep["redactions"][0]["original_hash"].startswith("sha256:")
    assert "x" not in json.dumps(rep)  # raw value never appears


def test_detect_language_heuristic():
    en = "The user signed up yesterday and confirmed via email."
    it = "Questa è la sua casa, però non è sicura. Sono qui."
    assert detect.detect_language(en) == "en"
    assert detect.detect_language(it) == "non-en"


# ----- end-to-end via the chain executor -----


@dataclass
class _FakeOpfSpan:
    category: str
    start: int
    end: int


@dataclass
class _FakeOpfResult:
    spans: list[_FakeOpfSpan]


class _FakeOpf:
    def __init__(self, **_: Any) -> None:
        pass

    def redact(self, text: str) -> _FakeOpfResult:
        # Match "alice@example.com" in our fixture text.
        s = text.find("alice@example.com")
        spans = []
        if s >= 0:
            spans.append(_FakeOpfSpan("private_email", s, s + len("alice@example.com")))
        return _FakeOpfResult(spans)


def test_anonymize_chain_emits_report(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "job_storage_root", str(tmp_path))

    # Patch the OPF symbol the detect module imports lazily.
    import paperloom.anonymizer.detect as det

    def fake_build_opf(preset: str, device: str) -> _FakeOpf:
        return _FakeOpf()

    monkeypatch.setattr(det, "_build_opf", fake_build_opf)
    monkeypatch.setattr(det, "_opf_available", lambda: True)

    client = TestClient(app)
    md = b"Contact alice@example.com for info."
    fid = client.post(
        "/api/files",
        files={"file": ("notes.md", md, "text/markdown")},
    ).json()["file_id"]

    job = client.post(
        "/api/jobs",
        json={
            "tools": [{"slug": "anonymize", "params": {"preset": "balanced"}}],
            "inputs": [fid],
        },
    ).json()
    job_id = job["job_id"]

    with client.stream("GET", f"/api/jobs/{job_id}/events") as r:
        body = b"".join(r.iter_bytes()).decode()

    assert "event: anonymize.span" in body
    assert "event: done" in body

    out_root = tmp_path / job_id / "out"
    redacted = next(out_root.glob("*-redacted.md"))
    assert "alice@example.com" not in redacted.read_text()
    assert "[REDACTED:PRIVATE_EMAIL:1]" in redacted.read_text()

    rep = json.loads((out_root / "redactions.report.json").read_text())
    assert rep["stats"]["total_spans"] == 1
    assert rep["stats"]["by_category"]["private_email"] == 1


def test_anonymize_emits_error_when_opf_missing(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "job_storage_root", str(tmp_path))
    # Disable auto-install so we exercise the explicit error path.
    monkeypatch.setenv("PAPERLOOM_AUTO_INSTALL_OPF", "0")

    import paperloom.anonymizer.detect as det

    monkeypatch.setattr(det, "_opf_available", lambda: False)

    client = TestClient(app)
    fid = client.post(
        "/api/files",
        files={"file": ("notes.md", b"hello", "text/markdown")},
    ).json()["file_id"]

    job = client.post(
        "/api/jobs",
        json={"tools": [{"slug": "anonymize", "params": {}}], "inputs": [fid]},
    ).json()
    with client.stream("GET", f"/api/jobs/{job['job_id']}/events") as r:
        body = b"".join(r.iter_bytes()).decode()
    assert "opf_not_installed" in body


def test_anonymize_auto_install_attempts_when_opf_missing(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "job_storage_root", str(tmp_path))
    monkeypatch.setenv("PAPERLOOM_AUTO_INSTALL_OPF", "1")

    import paperloom.anonymizer.detect as det
    from paperloom.anonymizer import _lazy_install

    monkeypatch.setattr(det, "_opf_available", lambda: False)

    called: list[bool] = []

    def fake_install(emit=None):
        called.append(True)
        if emit:
            emit("simulated install attempt")
        # Pretend install fails so we don't actually pull torch.
        return False

    monkeypatch.setattr(_lazy_install, "install_opf", fake_install)

    client = TestClient(app)
    fid = client.post(
        "/api/files",
        files={"file": ("notes.md", b"hello", "text/markdown")},
    ).json()["file_id"]

    job = client.post(
        "/api/jobs",
        json={"tools": [{"slug": "anonymize", "params": {}}], "inputs": [fid]},
    ).json()
    with client.stream("GET", f"/api/jobs/{job['job_id']}/events") as r:
        body = b"".join(r.iter_bytes()).decode()

    assert called == [True]
    assert "installing_opf" in body
    assert "opf_install_failed" in body
