# Benchmark suite

Compare paperloom against [`marker-pdf`](https://github.com/datalab-to/marker), [`docling`](https://github.com/docling-project/docling), and [`MinerU`](https://github.com/opendatalab/mineru) on a fixed corpus.

## Why

paperloom does not claim to win on raw OCR quality. The point of this suite is to **publish numbers honestly** — readers can see where each tool is strong and pick the right one.

## Layout

```
tests/bench/
├── README.md              # this file
├── run.py                 # runner: per-fixture, per-tool, per-metric
├── score.py               # text similarity / table preservation metrics
├── fixtures/              # input PDFs + ground-truth markdown
│   ├── README.md          # how to add fixtures (license, conventions)
│   └── ...
└── results/               # JSON output, one per (fixture, tool) combo
```

Results are committed under `doc/benchmarks.md` after a full run.

## Methodology

1. **Fixtures** are real PDFs with public licenses (CC-BY, public domain, or arXiv submissions). Each ships with a hand-curated `<name>.expected.md` that we treat as ground truth.
2. **Each tool** runs in its own venv (`uv venv .bench-paperloom`, `.bench-marker`, …) to avoid dep conflicts.
3. **Metrics:**
   - **Text similarity** — Levenshtein-normalized similarity between output and ground truth.
   - **Heading preservation** — F1 on `^#+ ` lines.
   - **Table preservation** — F1 on table cells (delimited by `|`).
   - **Wall-clock** — seconds per page on the same hardware.
4. **One machine, one corpus.** Results are reproducible from a clean checkout via `python tests/bench/run.py --all`.

## Adding fixtures

Drop a `<name>.pdf` and its `<name>.expected.md` in `fixtures/`. Update `fixtures/README.md` with the source URL and license.

## Running

```bash
# Install paperloom + (separately) the comparators
uv venv .bench-paperloom && .bench-paperloom/bin/uv pip install -e backend
uv venv .bench-marker && .bench-marker/bin/uv pip install marker-pdf
uv venv .bench-docling && .bench-docling/bin/uv pip install docling

# Run
python tests/bench/run.py --tool paperloom --fixture all
python tests/bench/run.py --all   # everything

# Aggregate
python tests/bench/score.py --update-doc  # writes doc/benchmarks.md
```

## Status

Scaffolding only — fixtures and runner harness in progress. Track progress in [`doc/benchmarks.md`](../../../doc/benchmarks.md).
