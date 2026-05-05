from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass

from paperloom.anonymizer.detect import Span


@dataclass(slots=True)
class RedactedSpan:
    span_id: str
    category: str
    start: int
    end: int
    original_text: str
    replacement: str


def apply(text: str, spans: list[Span]) -> tuple[str, list[RedactedSpan]]:
    """Replace each span with `[REDACTED:{CATEGORY}:{N}]`.

    N is 1-indexed per category, per document (the chain is one job, so the
    reset-per-job rule from doc/rules/anonymizer.md collapses to per-document).
    Spans must not overlap; if they do, later spans are skipped — OPF is
    expected to dedupe upstream when `discard_overlapping_predicted_spans`
    is on.
    """
    counters: dict[str, int] = defaultdict(int)
    redactions: list[RedactedSpan] = []
    spans_sorted = sorted(spans, key=lambda s: (s.start, s.end))

    pieces: list[str] = []
    cursor = 0
    for span in spans_sorted:
        if span.start < cursor:
            # Overlap — skip rather than corrupt offsets.
            continue
        counters[span.category] += 1
        n = counters[span.category]
        token = f"[REDACTED:{span.category.upper()}:{n}]"
        pieces.append(text[cursor : span.start])
        pieces.append(token)
        redactions.append(
            RedactedSpan(
                span_id=f"{span.category.upper()}:{n}",
                category=span.category,
                start=span.start,
                end=span.end,
                original_text=text[span.start : span.end],
                replacement=token,
            )
        )
        cursor = span.end

    pieces.append(text[cursor:])
    return "".join(pieces), redactions
