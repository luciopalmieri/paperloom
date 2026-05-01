# PageMind

> **Intelligence for your documents. Stays on your machine.**

**PageMind** is a local-first web app that pairs a streaming OCR
pipeline (GLM-OCR via [Ollama](https://ollama.ai)) with a chainable
suite of PDF / Markdown / HTML / image tools. Your files never leave
your computer — local AI by default, remote LLMs are an opt-in.

---

## Features

- **Streaming OCR** — drop a scanned PDF or a phone photo, get
  Markdown page-by-page as the model writes it.
- **Document anonymizer** — built on
  [OpenAI Privacy Filter](https://github.com/openai/privacy-filter)
  (Apache 2.0). 8 entity categories, verbatim.
- **Chain builder** — compose any of the 19 wired tools into a
  pipeline. Reorder with `Alt+↑` / `Alt+↓`, remove with `Delete`.
- **Image input for OCR** — JPEG/PNG/WebP/TIFF/BMP/GIF, with EXIF
  auto-rotate and a one-click 90° rotate fallback in the preview.
- **i18n** — English and Italian, with light/dark themes.
- **Local-only** — all inference (OCR, anonymizer) runs on your
  machine. No telemetry, no cloud round-trips.

## Quick start

```bash
# 1. Pull the OCR model (~5 GB)
ollama pull glm-ocr:latest

# 2. Install JS + Python deps
npm run install:all

# 3. Run the app
npm run dev
```

Open <http://localhost:3000>. That's it.

> Backend health check: <http://localhost:8000/api/health>.

## Usage

Three entry points, picked from the home page:

| Page                       | What it does                                       |
| -------------------------- | -------------------------------------------------- |
| `/tools/ocr-to-markdown`   | Drop a PDF or image. Stream Markdown side-by-side. |
| `/tools`                   | Catalogue of every tool, with AI badges.           |
| `/tools/chain`             | Compose tools into a pipeline. Multi-file inputs.  |

### Example: scan + OCR + anonymize in one run

1. Open `/tools/chain`.
2. Upload one or more scanned PDFs.
3. Add nodes: `pdf-to-images` → `ocr-to-markdown` → `anonymize`.
4. Hit **Run**.
5. Download `out.zip` — contains `out.md`, `images/`, and
   `redactions.report.json`.

### Catalogue deep-links

Every tile on `/tools` deep-links to the chain builder with that tool
pre-added: `/tools/chain?initial=<slug>`.

## Installation

### Requirements

- **Node.js** 20+
- **Python** 3.11+ with [`uv`](https://docs.astral.sh/uv/)
- **Ollama** with `glm-ocr:latest` pulled
- ~4 GB free disk for the OPF model checkpoint (downloaded on first
  run to `~/.opf/privacy_filter`)

### Anonymizer (opt-in)

The `anonymize` tool depends on
[OpenAI Privacy Filter](https://github.com/openai/privacy-filter).
It is **not** installed by default — it brings in torch +
transformers (~250 MB of Python deps) and downloads a model
checkpoint (~4 GB) into `~/.opf/privacy_filter` on first use.

When you add an `anonymize` node in `/tools/chain` without OPF
installed, the UI shows an in-app banner explaining the trade-off
and giving you the install command to copy. Or run it directly:

```bash
npm run install:opf
```

That maps to `cd backend && uv sync --extra anonymizer`. Restart
`npm run dev` afterwards. Everything stays on your machine — no
telemetry, no cloud round-trips. Once installed, subsequent runs
are fully offline.

### HTML / Markdown → PDF (optional)

`html-to-pdf`, `markdown-to-pdf`, and `markdown-to-html` use
[WeasyPrint](https://weasyprint.org/), which needs native libraries:

```bash
# macOS
brew install pango
```

Without these, the three converters still appear but emit
`weasyprint_unavailable`. `pdf-to-html` does **not** need them.

### Docker (alternative)

Containerises only `web` and `backend` — Ollama stays native on the
host so it can use your GPU.

```bash
ollama serve   # native, on the host
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

Containers reach Ollama via `host.docker.internal:11434`. See
[`doc/phase-0.md`](doc/phase-0.md) §9.

## Architecture

```
┌────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Next.js 16    │────▶│  FastAPI        │────▶│  Ollama         │
│  (port 3000)   │ SSE │  (port 8000)    │ HTTP│  glm-ocr        │
└────────────────┘     └─────────────────┘     └─────────────────┘
                              │
                              ▼
                       ┌────────────────┐
                       │  OpenAI        │
                       │  Privacy       │
                       │  Filter (CPU)  │
                       └────────────────┘
```

- **Frontend** — Next.js 16 App Router, TypeScript, shadcn/ui,
  Tailwind v4, `next-intl`, `next-themes`.
- **Backend** — FastAPI on Python 3.11+, `uv` for deps, SSE streams
  for OCR + chain progress.
- **Models** — Ollama (`glm-ocr:latest`) + OpenAI Privacy Filter
  (CPU by default).

Full design: [`doc/prompt/architecture.md`](doc/prompt/architecture.md).

## Development

```bash
npm run dev          # web + api with reload
npm run lint:web     # ESLint flat config
npm run build:web    # production web build
npm run test:api     # backend pytest
```

The repo is a Turborepo-style npm workspace: the web app lives in
`web/`, the FastAPI backend in `backend/`, and shared docs in `doc/`.

## Documentation

- [`doc/phase-0.md`](doc/phase-0.md) — execution plan, file tree,
  pipeline contracts, Docker spec.
- [`doc/prompt/PROMPT.md`](doc/prompt/PROMPT.md) — project brief,
  scope, conversation contract.
- [`doc/prompt/architecture.md`](doc/prompt/architecture.md) —
  inter-process contract.
- [`doc/prompt/shadcn-rules.md`](doc/prompt/shadcn-rules.md) — UI
  conventions.
- [`doc/prompt/i18n-rules.md`](doc/prompt/i18n-rules.md) — IT/EN
  conventions.
- [`doc/prompt/a11y-rules.md`](doc/prompt/a11y-rules.md) —
  accessibility (WCAG 2.2 AA).
- [`doc/prompt/anonymizer-rules.md`](doc/prompt/anonymizer-rules.md) —
  OPF integration rules.

## License

[MIT](LICENSE). Depends on
[OpenAI Privacy Filter](https://github.com/openai/privacy-filter)
(Apache 2.0).
