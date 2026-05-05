# Scan → OCR → redact → re-render PDF in one chain

Common end-to-end privacy workflow: take a scanned PDF, OCR it, redact PII, output a clean PDF.

## CLI form

```bash
paperloom chain \
  --steps pdf-to-images,ocr-to-markdown,anonymize,markdown-to-pdf \
  --params dpi=200,preset=balanced \
  -o ./clean \
  scan.pdf
```

Outputs land in `./clean/`. The intermediate `.md` and per-step artifacts stay under `~/.paperloom/<job_id>/`.

## Library form

```python
from paperloom import Chain

result = Chain([
    ("pdf-to-images", {"dpi": 200}),
    ("ocr-to-markdown", {}),
    ("anonymize", {"preset": "balanced"}),
    ("markdown-to-pdf", {}),
]).run(["scan.pdf"])

print("job:", result["job_id"])
print("outputs:", list((result["root"] / "out").iterdir()))
```

## Why these steps

1. **`pdf-to-images`** at 200 DPI gives the OCR model crisp inputs without exploding RAM. Bump to 300 only for tiny fonts.
2. **`ocr-to-markdown`** writes one Markdown file with H1/H2/tables preserved.
3. **`anonymize`** runs OPF over the markdown, emits `*-redacted.md` and a `redactions.report.json`.
4. **`markdown-to-pdf`** re-renders via WeasyPrint. Requires the `pdf` extra (`pip install paperloom[pdf]` and `brew install pango` on macOS).

## Skipping steps

- Already have a digital PDF with a text layer? Drop step 1, replace step 2 with `pdf-to-text`.
- Don't need a final PDF? Stop at step 3 and read `*-redacted.md` directly.
