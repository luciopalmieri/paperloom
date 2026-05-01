from __future__ import annotations

import importlib.util
from dataclasses import dataclass

# OPF's 8 categories. Verbatim from anonymizer-rules.md — DO NOT extend
# or rename. The OCR / external code paths must accept these strings as-is.
CATEGORIES: tuple[str, ...] = (
    "account_number",
    "private_address",
    "private_email",
    "private_person",
    "private_phone",
    "private_url",
    "private_date",
    "secret",
)

PRESETS: tuple[str, ...] = ("balanced", "recall", "precision")


@dataclass(slots=True)
class Span:
    category: str
    start: int
    end: int
    text: str


class OPFNotInstalled(RuntimeError):
    pass


def _opf_available() -> bool:
    return importlib.util.find_spec("opf") is not None


def _build_opf(preset: str, device: str) -> object:
    """Build a configured OPF instance.

    Phase-0 §5.4: exact calibration mappings for `recall` / `precision` are
    not pinned yet (OPF README does not enumerate parameter values). For now
    we differentiate via `discard_overlapping_predicted_spans` which is the
    only documented knob with obvious precision impact. Tighten later when
    OPF ships canonical calibration files.
    """
    if not _opf_available():
        raise OPFNotInstalled(
            "OPF not installed. Clone https://github.com/openai/privacy-filter "
            "and run `uv pip install -e <path>` in the backend venv.",
        )
    from opf import OPF  # noqa: PLC0415

    discard = preset == "precision"
    return OPF(
        device="cpu" if device == "cpu" else "cuda",
        output_mode="typed",
        decode_mode="viterbi",
        discard_overlapping_predicted_spans=discard,
        output_text_only=False,
    )


def detect(text: str, *, preset: str = "balanced", device: str = "cpu") -> list[Span]:
    if preset not in PRESETS:
        raise ValueError(f"unknown preset: {preset}")
    opf = _build_opf(preset, device)
    result = opf.redact(text)  # type: ignore[attr-defined]

    spans: list[Span] = []
    for raw in getattr(result, "spans", []):
        category = getattr(raw, "category", None) or getattr(raw, "label", None)
        start = getattr(raw, "start", None)
        end = getattr(raw, "end", None)
        if category not in CATEGORIES or start is None or end is None:
            continue
        spans.append(Span(category=category, start=int(start), end=int(end), text=text[start:end]))
    return spans


def detect_language(text: str) -> str:
    """Cheap heuristic: return 'en' or 'non-en'. Phase 4 ships a stub so
    the IT-input warning banner has something to drive. Replace with a
    real lang detector (langdetect / fasttext-lid) only if the false
    positive rate becomes a UX problem.
    """
    if not text:
        return "en"
    sample = text.lower()
    italian_signals = (
        " della ",
        " degli ",
        " gli ",
        " perché",
        " però",
        " sono ",
        " questa ",
        " questo ",
    )
    hits = sum(1 for s in italian_signals if s in sample)
    return "non-en" if hits >= 2 else "en"
