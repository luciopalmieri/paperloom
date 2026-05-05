# Fixtures

Each fixture is **`<name>.pdf` + `<name>.expected.md`** — input and hand-curated ground truth.

## Conventions

- **License:** CC-BY, public domain, or your own work. No copyrighted material. Document the source per fixture below.
- **Coverage:** aim for one per category in the matrix below.
- **Size:** keep individual PDFs under 5 MB. Crop or downsample if needed.
- **Ground truth:** the `.expected.md` is the *target*, not a strict golden. The benchmark scorer is similarity-based, not byte-equal.

## Categories

| Category | Why it stresses OCR |
|---|---|
| Clean digital PDF | Baseline — every tool should ace it |
| Scanned office doc | Realistic noise, skew, JPEG artifacts |
| Multi-column scientific | Reading order is the hard part |
| Tables, dense | Cell boundaries, merged cells |
| Math equations | Inline TeX, display blocks |
| Handwritten / low quality | Where Tesseract dies and VLMs shine |
| Non-English (ES, IT, ZH) | Tokenizer + alphabet coverage |
| Mixed image + text | Figure captions, embedded screenshots |

## Current fixtures

(empty — populate before running benchmarks)

| Name | Category | Source | License |
|---|---|---|---|
| _none yet_ | | | |
