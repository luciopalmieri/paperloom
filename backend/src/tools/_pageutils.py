from __future__ import annotations


def parse_page_spec(spec: str, total: int) -> list[int]:
    """Parse a 1-indexed page spec like "1,3-5,8" into a sorted unique 0-indexed list.

    Out-of-range pages are clipped silently. Empty spec → all pages.
    """
    spec = (spec or "").strip()
    if not spec:
        return list(range(total))

    out: set[int] = set()
    for token in spec.split(","):
        token = token.strip()
        if not token:
            continue
        if "-" in token:
            a, b = token.split("-", 1)
            try:
                start = int(a) if a else 1
                end = int(b) if b else total
            except ValueError:
                continue
            for p in range(start, end + 1):
                if 1 <= p <= total:
                    out.add(p - 1)
        else:
            try:
                p = int(token)
            except ValueError:
                continue
            if 1 <= p <= total:
                out.add(p - 1)
    return sorted(out)
