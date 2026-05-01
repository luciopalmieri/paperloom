from __future__ import annotations

import hashlib
import importlib.metadata
import json
from pathlib import Path

from src.anonymizer.detect import CATEGORIES
from src.anonymizer.redact import RedactedSpan

SCHEMA_VERSION = "1"


def _opf_version() -> str:
    try:
        return importlib.metadata.version("opf")
    except importlib.metadata.PackageNotFoundError:
        return "unknown"


def build(
    *,
    job_id: str,
    input_filename: str,
    input_format: str,
    preset: str,
    redactions: list[RedactedSpan],
    page_lookup: dict[int, int] | None = None,
) -> dict:
    """Build the redactions.report.json payload.

    `page_lookup` maps span.start → 1-indexed page number for paginated
    inputs. None means the input is plain text (page = null).
    """
    by_category: dict[str, int] = {c: 0 for c in CATEGORIES}
    redactions_payload = []
    for r in redactions:
        by_category[r.category] = by_category.get(r.category, 0) + 1
        page = None
        if page_lookup is not None:
            page = page_lookup.get(r.start)
        redactions_payload.append(
            {
                "id": r.span_id,
                "category": r.category,
                "page": page,
                "offset_start": r.start,
                "offset_end": r.end,
                "original_hash": "sha256:"
                + hashlib.sha256(r.original_text.encode("utf-8")).hexdigest(),
                "replacement": r.replacement,
            }
        )

    return {
        "schema_version": SCHEMA_VERSION,
        "job_id": job_id,
        "input": {"filename": input_filename, "format": input_format},
        "engine": {"name": "opf", "version": _opf_version(), "preset": preset},
        "stats": {"total_spans": len(redactions), "by_category": by_category},
        "redactions": redactions_payload,
    }


def write(report: dict, dest: Path) -> None:
    dest.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
