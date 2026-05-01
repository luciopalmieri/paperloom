from __future__ import annotations

from collections.abc import AsyncIterator
from pathlib import Path
from typing import Any

from src.anonymizer import detect, redact, report
from src.config import settings
from src.tools import register

_TEXT_EXT = {".md", ".markdown", ".txt"}


@register("anonymize")
async def run(
    job_id: str,
    job_root: Path,
    inputs: list[Path],
    params: dict[str, Any],
    step: int,
) -> AsyncIterator[tuple[str, dict[str, Any]]]:
    """Anonymise text inputs (.md / .txt) via OPF.

    PDFs/images must run through ocr-to-markdown first — anonymizer is
    text-only by design (anonymizer-rules.md). Phase 4 v1 keeps the
    chain explicit: caller composes ocr-to-markdown → anonymize.
    """
    preset = str(params.get("preset", "balanced"))
    if preset not in detect.PRESETS:
        yield "error", {
            "job_id": job_id,
            "code": "bad_preset",
            "message": f"preset must be one of {detect.PRESETS}",
        }
        return

    out_dir = job_root / "work" / str(step)
    out_dir.mkdir(parents=True, exist_ok=True)
    outputs: list[str] = []

    for inp in inputs:
        if inp.suffix.lower() not in _TEXT_EXT:
            # Anonymizer is text-only; skip non-text inputs silently
            # so it can sit at the end of an OCR chain that emits .md
            # alongside images/.
            continue

        text = inp.read_text(encoding="utf-8")
        language = detect.detect_language(text)
        if language == "non-en":
            yield "anonymize.warn", {
                "job_id": job_id,
                "code": "non_en_input",
                "filename": inp.name,
                "suggested_preset": "recall",
            }

        try:
            spans = detect.detect(text, preset=preset, device=settings.opf_device)
        except detect.OPFNotInstalled as exc:
            yield "error", {
                "job_id": job_id,
                "code": "opf_not_installed",
                "message": str(exc),
                "recoverable": False,
            }
            return

        for span in spans:
            yield "anonymize.span", {
                "job_id": job_id,
                "category": span.category,
                "count": 1,
            }

        redacted_text, redactions = redact.apply(text, spans)

        out_md = out_dir / f"{inp.stem}-redacted{inp.suffix}"
        out_md.write_text(redacted_text, encoding="utf-8")
        outputs.append(str(out_md))

        rep = report.build(
            job_id=job_id,
            input_filename=inp.name,
            input_format=inp.suffix.lstrip(".") or "txt",
            preset=preset,
            redactions=redactions,
            page_lookup=None,
        )
        report_path = out_dir / "redactions.report.json"
        report.write(rep, report_path)
        outputs.append(str(report_path))

    if not outputs:
        yield "error", {
            "job_id": job_id,
            "code": "no_text_input",
            "message": "anonymize needs .md / .markdown / .txt input — chain it after ocr-to-markdown",
        }
        return

    yield "node.end", {"step": step, "tool": "anonymize", "outputs": outputs}
