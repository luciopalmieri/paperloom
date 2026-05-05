# RAG ingest: PDF folder → one Markdown per source

OCR every PDF under `./inbox/` and write a parallel `.md` to `./out/`. Streams page-by-page; small enough for a notebook cell, scales to hundreds of files via `asyncio.gather`.

```python
import asyncio
from pathlib import Path

from paperloom import arun_chain, PaperloomError

INBOX = Path("inbox")
OUT = Path("out"); OUT.mkdir(exist_ok=True)

async def ocr_one(pdf: Path) -> Path | None:
    try:
        result = await arun_chain(
            [{"slug": "ocr-to-markdown", "params": {"image_strategy": "auto"}}],
            [pdf],
        )
    except PaperloomError as exc:
        print(f"skip {pdf.name}: {exc.code}")
        return None
    md = next((p for p in (result["root"] / "out").iterdir() if p.suffix == ".md"), None)
    if md is None:
        return None
    dest = OUT / f"{pdf.stem}.md"
    dest.write_text(md.read_text(encoding="utf-8"), encoding="utf-8")
    return dest

async def main() -> None:
    pdfs = sorted(INBOX.glob("*.pdf"))
    print(f"OCRing {len(pdfs)} PDFs…")
    # Cap concurrency: GLM-OCR is GPU-/CPU-bound, parallel won't help past 2-3.
    sem = asyncio.Semaphore(2)
    async def guarded(p):
        async with sem:
            return await ocr_one(p)
    out_paths = await asyncio.gather(*(guarded(p) for p in pdfs))
    print(f"wrote {sum(1 for p in out_paths if p)} .md files to {OUT}/")

asyncio.run(main())
```

## Notes

- **Cap concurrency** at 2-3 even with strong GPUs — Ollama serializes per model. Higher just queues.
- For very long PDFs, pass `pages="1-50"` to OCR a window first; iterate.
- Add a `(slug="anonymize", ...)` step to redact in the same pass — see [03-scan-clean-pdf.md](03-scan-clean-pdf.md).
