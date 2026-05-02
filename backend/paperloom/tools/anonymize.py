from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from pathlib import Path
from typing import Any

from paperloom.anonymizer import _lazy_install, detect, redact, report
from paperloom.config import settings
from paperloom.tools import register

_TEXT_EXT = {".md", ".markdown", ".txt"}
_OPF_CHECKPOINT_DIR = Path.home() / ".opf" / "privacy_filter"


def _opf_phase(preset: str, device: str) -> str:
    """Pick the most accurate label for the next anonymize step.

    The OPF instance lives in module-level cache, so a process restart
    (e.g. uvicorn --reload after a backend edit) wipes it even though
    the ~4 GB checkpoint is still on disk. Distinguish the two costs:
    a fresh download vs. a RAM reload. Once cached, skip the load
    label entirely and report detection directly.
    """
    if detect.is_loaded(preset, device):
        return "detecting"
    has_checkpoint = _OPF_CHECKPOINT_DIR.is_dir() and any(_OPF_CHECKPOINT_DIR.iterdir())
    return "loading_opf" if has_checkpoint else "downloading_opf"


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
    text-only by design (doc/rules/anonymizer.md). Phase 4 v1 keeps the
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

        # Surface the expensive phase to the client. The first ever
        # job downloads ~4 GB into ~/.opf/privacy_filter; later jobs
        # in a fresh process pay only the cold RAM load; jobs in a
        # warm process skip both.
        yield "node.progress", {
            "job_id": job_id,
            "step": step,
            "tool": "anonymize",
            "phase": _opf_phase(preset, settings.opf_device),
            "filename": inp.name,
        }

        async def _detect() -> list[detect.Span]:
            return await asyncio.to_thread(
                detect.detect,
                text,
                preset=preset,
                device=settings.opf_device,
            )

        try:
            spans = await _detect()
        except detect.OPFNotInstalled as exc:
            if not _lazy_install.auto_install_enabled():
                yield "error", {
                    "job_id": job_id,
                    "code": "opf_not_installed",
                    "message": str(exc),
                    "recoverable": False,
                }
                return
            # Surface the install as a progress phase so the SSE client
            # can render a "installing OPF…" banner instead of a stall.
            yield "node.progress", {
                "job_id": job_id,
                "step": step,
                "tool": "anonymize",
                "phase": "installing_opf",
                "filename": inp.name,
            }
            install_lines: list[str] = []
            ok = await asyncio.to_thread(
                _lazy_install.install_opf,
                lambda line: install_lines.append(line),
            )
            if not ok:
                yield "error", {
                    "job_id": job_id,
                    "code": "opf_install_failed",
                    "message": "auto-install failed; run `pip install paperloom[anonymizer]` manually",
                    "log_tail": install_lines[-20:],
                    "recoverable": False,
                }
                return
            spans = await _detect()

        for span in spans:
            yield "anonymize.span", {
                "job_id": job_id,
                "category": span.category,
                "count": 1,
            }

        yield "node.progress", {
            "job_id": job_id,
            "step": step,
            "tool": "anonymize",
            "phase": "writing_report",
            "filename": inp.name,
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
