# Benchmarks

Honest comparison of paperloom vs. [marker-pdf](https://github.com/datalab-to/marker), [docling](https://github.com/docling-project/docling), and [MinerU](https://github.com/opendatalab/mineru) on a fixed corpus.

## Status

**Scaffolding only — no results yet.** The runner and scorer live under [`backend/tests/bench/`](../backend/tests/bench/). To produce the table below:

```bash
# 1. Drop license-clean fixtures into backend/tests/bench/fixtures/ (PDF + .expected.md pair)
# 2. Set up sibling venvs for each comparator:
uv venv .bench-marker && .bench-marker/bin/uv pip install marker-pdf
uv venv .bench-docling && .bench-docling/bin/uv pip install docling
# 3. Run + score:
python backend/tests/bench/run.py --all
python backend/tests/bench/score.py --update-doc
```

## Methodology

- One PDF + a hand-curated `.expected.md` per fixture. Ground truth is similarity-target, not byte-equal.
- Each tool runs in its own venv to avoid dep conflicts.
- Metrics:
  - **Similarity** — Levenshtein-normalized ratio between output and ground truth (0–1).
  - **Heading F1** — F1 on lines starting with `#`.
  - **Table cell F1** — F1 on `|`-delimited cells.
  - **Wall (s)** — seconds per fixture on the same hardware.
- Hardware footprint and Ollama / model versions are recorded next to each run.

## What we expect

paperloom is unlikely to beat marker / docling / MinerU on **raw similarity** — they have larger teams and more research behind them. Where paperloom should hold its own:

- **Setup time** — single Ollama dep vs. multi-GB model zoo per tool.
- **Streaming** — paperloom emits markdown page-by-page; competitors are batch.
- **Combined OCR + redaction** — paperloom does both in one chain. Competitors require external glue.

The point of publishing the table is not to win the row — it's to let readers pick the right tool for their workload.

## Results

_(empty — populate via the runner above)_
