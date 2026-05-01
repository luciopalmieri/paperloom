# pdf-ocr

Local web app that turns dirty scanned PDFs and images into clean
Markdown using a locally-hosted GLM-OCR model (via Ollama), bundled with
a configurable suite of PDF tools that can be chained over one or more
input files.

One of the bundled tools is a **document anonymizer** built on
[OpenAI Privacy Filter](https://github.com/openai/privacy-filter)
(Apache 2.0). All inference runs locally — no input files ever leave
the machine.

## Status

Phase 1a — skeletons live. `npm run dev` boots both processes; locale-prefixed routing (`/it`, `/en`), theme toggle, and `GET /api/health` work. OCR pipeline + tools + anonymizer land in later phases (see [`doc/phase-0.md`](doc/phase-0.md)).

## Architecture

Hybrid:

- **Frontend** — Next.js 16 App Router, TypeScript, shadcn/ui,
  Tailwind v4, `next-intl`, `next-themes`. Port 3000.
- **Backend** — FastAPI (Python 3.11+), `uv` for dependencies.
  Port 8000.
- **Models** — Ollama (`glm-ocr:latest`) on port 11434 + OpenAI Privacy
  Filter Python package (CPU by default).

Full design: [`doc/prompt/architecture.md`](doc/prompt/architecture.md).

## Requirements

- Node 20+
- Python 3.11+
- [Ollama](https://ollama.ai) with `glm-ocr:latest` pulled
- [OpenAI Privacy Filter](https://github.com/openai/privacy-filter)
  cloned locally and installed into the backend venv (anonymizer tool):
  ```bash
  git clone https://github.com/openai/privacy-filter ~/src/opf
  cd backend && uv pip install -e ~/src/opf
  ```
- ~4 GB free disk for the OPF model checkpoint (downloaded on first
  run to `~/.opf/privacy_filter`)
- For the HTML/Markdown → PDF tools (Phase 3d): native libraries
  required by WeasyPrint. On macOS: `brew install pango`. Without
  these, the three tools are still listed in the catalogue but emit
  a `weasyprint_unavailable` event when invoked. `pdf-to-html` does
  not need them.

## Setup — native (default)

```bash
# Pull the OCR model (needed from Phase 3 onwards; Phase 1a/2 work without it)
ollama pull glm-ocr:latest

# Install frontend + backend deps (one-shot helper)
npm run install:all

# Run both processes from the repo root
npm run dev
```

Open http://localhost:3000. Backend health: http://localhost:8000/api/health.

## Setup — Docker (alternative, Phase 1b)

Ollama stays native on the host. Only `web` and `backend` containerise.

```bash
# Make sure Ollama is already running natively
ollama serve

# Boot the stack (dev overlay enables bind mounts + reload)
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

Containers reach Ollama via `host.docker.internal:11434`. See
[`doc/phase-0.md`](doc/phase-0.md) §9 for the full dual-base-URL contract.

## Documentation

- [`doc/phase-0.md`](doc/phase-0.md) — locked execution plan: file
  tree, dependency lists, OCR + anonymizer pipeline contracts, Docker
  spec.
- [`doc/prompt/PROMPT.md`](doc/prompt/PROMPT.md) — full project brief,
  scope, success criteria, conversation contract.
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

[MIT](LICENSE).

This project depends on
[OpenAI Privacy Filter](https://github.com/openai/privacy-filter),
licensed under Apache 2.0.
