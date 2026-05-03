# Batch-ingest phone photos / scans into the LLM Wiki

Companion to [`01-llm-wiki-ingest.md`](01-llm-wiki-ingest.md). That recipe walks through the wiki layout and the three driving paths (MCP, library, CLI). This one is the **scaled-up** version: thousands of phone photos or scanned pages of a corpus you actually own — a textbook, a binder of handwritten notes, a workshop manual, an archive of personal letters — that you want to turn into a queryable Markdown wiki overnight.

This is the use case where paperloom earns its keep:

- **Source is pixels, not text.** `pdftotext` and friends can't help. OCR is mandatory.
- **Volume is high.** Hundreds to thousands of pages. The 5 GB GLM-OCR model and the local-first guarantees amortize cleanly.
- **Pages-per-document is large.** A 400-page manual benefits from streaming OCR — you see Markdown emerge page by page, can sanity-check early pages while the tail still runs, and can recover from a mid-run crash without redoing what's done.
- **You want the audit trail.** `privacy_mode` and `ocr_provider` recorded in frontmatter prove which pages stayed local vs. touched a cloud OCR provider.

## Layout

One subfolder per document. Photos inside in lexicographic order = page order.

```
~/wiki/
├── _inbox/
│   ├── manuale-officina-fiat-126/
│   │   ├── page-001.jpg
│   │   ├── page-002.jpg
│   │   └── ...
│   └── quaderno-appunti-2024/
│       ├── IMG_0001.jpg
│       └── ...
├── papers/                          # ← script writes here
└── _done/                           # ← script moves processed folders here
```

The script writes one `papers/<slug>.md` per document, with frontmatter, then moves the source folder into `_done/`. Re-running is safe: any folder whose `papers/<slug>.md` already exists is skipped.

## Script

Save as `ingest_photos.py` next to your wiki (or anywhere — it reads `PAPERLOOM_WIKI_ROOT`):

```python
"""Batch-ingest phone photos / scans into an LLM Wiki.

Layout: $WIKI/_inbox/<doc-name>/page-001.jpg, page-002.jpg, ...
Output: $WIKI/papers/<slug>.md  (frontmatter + OCR markdown)

Idempotent — re-running skips folders whose output .md already exists.
"""

import logging
import os
import re
import sys
import time
from datetime import date
from pathlib import Path

from paperloom import Chain, PaperloomError
from paperloom.privacy import current_state

WIKI = Path(os.environ.get("PAPERLOOM_WIKI_ROOT", Path.home() / "wiki"))
INBOX = WIKI / "_inbox"
OUT = WIKI / "papers"
DONE = WIKI / "_done"
LOG = WIKI / "_ingest.log"

ANONYMIZE = False                # flip True for medical / legal / HR material
IMG_EXT = {".jpg", ".jpeg", ".png", ".webp", ".tiff", ".bmp", ".heic"}

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    handlers=[logging.FileHandler(LOG), logging.StreamHandler(sys.stdout)],
)
log = logging.getLogger("ingest")


def slugify(name: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return s[:80] or "untitled"


def doc_folders() -> list[Path]:
    return sorted(p for p in INBOX.iterdir() if p.is_dir())


def pages_in(folder: Path) -> list[Path]:
    return sorted(
        p for p in folder.iterdir()
        if p.is_file() and p.suffix.lower() in IMG_EXT
    )


def first_markdown_in(root: Path) -> Path | None:
    out = root / "out"
    target = out if out.is_dir() else root
    for p in sorted(target.rglob("*")):
        if p.is_file() and p.suffix.lower() in {".md", ".txt"}:
            return p
    return None


def ingest_folder(folder: Path) -> Path | None:
    slug = slugify(folder.name)
    dest = OUT / f"{slug}.md"
    if dest.exists():
        log.info("skip %s (already in papers/)", slug)
        return None

    pages = pages_in(folder)
    if not pages:
        log.warning("skip %s (no images)", slug)
        return None

    log.info("ingest %s — %d pages", slug, len(pages))
    t0 = time.time()

    steps: list[tuple[str, dict]] = [
        ("images-to-pdf", {}),
        ("ocr-to-markdown", {}),
    ]
    if ANONYMIZE:
        steps.append(("anonymize", {"preset": "balanced"}))

    result = Chain(steps).run([str(p) for p in pages])
    md_path = first_markdown_in(Path(result["root"]))
    if md_path is None:
        raise PaperloomError("no_output", f"chain produced no .md for {slug}")
    md = md_path.read_text(encoding="utf-8")

    state = current_state()
    fm = (
        f"---\n"
        f"slug: {slug}\n"
        f'title: "{folder.name}"\n'
        f"pages: {len(pages)}\n"
        f"ingested: {date.today().isoformat()}\n"
        f"ocr_provider: {state['components'][0]['provider']}\n"
        f"privacy_mode: {state['mode']}\n"
        f"anonymized: {ANONYMIZE}\n"
        f"---\n\n"
    )
    OUT.mkdir(parents=True, exist_ok=True)
    dest.write_text(fm + md, encoding="utf-8")

    DONE.mkdir(parents=True, exist_ok=True)
    folder.rename(DONE / folder.name)

    dt = time.time() - t0
    log.info(
        "  → %s (%.1fs, %.1fs/page)",
        dest.relative_to(WIKI), dt, dt / len(pages),
    )
    return dest


def main() -> None:
    INBOX.mkdir(parents=True, exist_ok=True)
    folders = doc_folders()
    log.info("found %d folders in %s", len(folders), INBOX)
    ok = fail = 0
    for f in folders:
        try:
            if ingest_folder(f) is not None:
                ok += 1
        except PaperloomError as e:
            log.error("fail %s: %s — %s", f.name, e.code, e)
            fail += 1
        except Exception as e:  # noqa: BLE001 — keep the batch moving
            log.exception("crash %s: %s", f.name, e)
            fail += 1
    log.info("done — ok=%d fail=%d", ok, fail)


if __name__ == "__main__":
    main()
```

## Run it

```bash
ollama pull glm-ocr:latest                       # one-time, ~5 GB
pip install paperloom                            # core
# pip install 'paperloom[anonymizer]'            # only if ANONYMIZE = True
mkdir -p ~/wiki/_inbox/manuale-officina-fiat-126
# drop photos in there, named so lexicographic = page order
python ingest_photos.py
```

The log streams to stdout and to `~/wiki/_ingest.log` so you can `tail -f` from another shell while it runs.

## Why this is the sweet spot for paperloom

A back-of-envelope on a real run — Mac M-series Pro / 24 GB unified RAM, default GLM-OCR via Ollama:

- **8–15 s/page** for OCR on phone-quality photos.
- **1500 pages ≈ 4–6 hours**. Run overnight, wake up to a wiki.
- **Streaming pays off twice.** Inside one document: you can `tail -f` the page-level events from the FastAPI surface (or watch the chain logs) while a 400-page manual is mid-flight. Across documents: a crash on doc #37 doesn't lose docs #1–36 — re-run, the `papers/<slug>.md` existence check skips them.

If your input were already-digital PDFs you should not be running this script — `paperloom.tools.pdf_to_text` (or plain `pdftotext`) is 100× faster and lossless. Photos and scans are where the OCR pipeline justifies itself.

## Operational gotchas

- **HEIC iPhone photos.** The script's extension list includes `.heic`, but Pillow doesn't decode HEIC out of the box. Either `pip install pillow-heif` (and import it once at script top), or pre-convert with `sips -s format jpeg *.heic` (macOS) / `heif-convert` (Linux).
- **Memory pressure on huge documents.** `images-to-pdf` materializes all pages before OCR. If a single folder has more than ~300 photos, split it into volumes (`vol-1/`, `vol-2/`) — the wiki page can be re-stitched later with a 5-line concat script, or you can post-process via Path A from `01-llm-wiki-ingest.md`.
- **Page order = lexicographic.** Phone burst names like `IMG_9998.jpg, IMG_9999.jpg, IMG_0001.jpg` will sort wrong across the wrap-around. Rename to zero-padded `page-001.jpg` before ingest, or pre-rotate filenames with a small shell script.
- **EXIF orientation is handled.** GLM-OCR + paperloom auto-rotate based on EXIF, so a phone held sideways won't break OCR. If the photo lies about orientation (rare, mostly screenshots), strip EXIF and rotate manually.
- **Skew and dewarping are not.** paperloom doesn't do aggressive page-edge detection or curved-spine dewarping. For book-spine photos consider running [ScanTailor](https://scantailor.org/) or [`unpaper`](https://github.com/unpaper/unpaper) on the inbox first.
- **Sanity-check the first run.** Take 20 representative photos, run the script on a one-folder inbox, open the resulting `.md`. If quality is below your bar, fix the inputs (lighting, deskew) before committing 6 hours of OCR to the rest.

## After ingest: enrichment

The script gives you raw OCR'd Markdown plus minimal frontmatter (slug, page count, provider, privacy mode). The *intelligent* part — picking real titles, tags, summaries, cross-links — is a separate pass. Two options:

- **Path A from recipe 01.** Open Claude Desktop, point an agent at `~/wiki/papers/`, ask it to enrich the frontmatter and link related pages.
- **Local LLM enrichment.** Run a small model (Llama / Qwen) over each `.md` and have it propose tags from a controlled vocabulary; commit only the diff.

Either way, the OCR + privacy-audited storage step is now done deterministically and reproducibly, which is what you want when 1500 pages are at stake.
