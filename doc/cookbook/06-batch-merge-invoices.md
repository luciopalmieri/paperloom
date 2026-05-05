# Batch invoice merge with watermark + metadata strip

Glue together every PDF under `./invoices/`, watermark "PROCESSED", strip metadata.

```python
from pathlib import Path
from paperloom import Chain

inputs = sorted(Path("invoices").glob("*.pdf"))
print(f"merging {len(inputs)} invoices…")

result = Chain([
    ("merge-pdfs", {}),
    ("add-watermark", {"text": "PROCESSED", "opacity": 0.15}),
    ("strip-metadata", {}),
]).run(inputs)

final = next((p for p in (result["root"] / "out").iterdir() if p.suffix == ".pdf"))
final.replace("invoices-merged.pdf")
print("→ invoices-merged.pdf")
```

## Variations

- Add `("add-page-numbers", {"position": "bottom-center", "format": "{page} / {total}"})` before the watermark.
- Want one PDF per N invoices instead of one giant file? Replace `merge-pdfs` with `split-pdf` after merge:
  ```python
  Chain([
      ("merge-pdfs", {}),
      ("split-pdf", {"every_n": 10}),
  ]).run(inputs)
  ```
- Compress aggressively: append `("compress-pdf", {"quality": 60})`. Drops file size 30-60 % on raster-heavy invoices.
