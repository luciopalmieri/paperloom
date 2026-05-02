# architecture.md

Hybrid Next.js + FastAPI contract.

## Processes

| Process | Port  | Owner   | Purpose                                       |
|---------|-------|---------|-----------------------------------------------|
| Next.js | 3000  | `web/`  | UI, upload, viewer, chain builder, downloads  |
| FastAPI | 8000  | `backend/` | PDF tools, OCR adapter, OPF anonymizer    |
| Ollama  | 11434 | system  | `glm-ocr:latest` inference                    |

`pnpm dev` runs Next + FastAPI together via `concurrently`. Ollama
must already be running (user installs separately — see `README.md`).

## Repo layout

```
/
├── web/                # Next.js 16 App Router
│   ├── app/
│   ├── components/ui/  # shadcn primitives (CLI-installed)
│   ├── components/     # feature components
│   ├── i18n/
│   ├── messages/
│   └── lib/
├── backend/            # FastAPI + OPF + OCR adapter (also published to PyPI as `paperloom`)
│   ├── pyproject.toml  # uv-managed, hatchling build
│   ├── README.md       # PyPI-facing
│   ├── paperloom/      # the importable package
│   │   ├── __init__.py # public API exports
│   │   ├── _api.py     # ocr_to_markdown / anonymize / Chain wrappers
│   │   ├── cli.py      # `paperloom` CLI entry
│   │   ├── mcp_server.py # `paperloom-mcp` entry
│   │   ├── main.py     # FastAPI app
│   │   ├── routers/
│   │   ├── tools/
│   │   ├── ocr/
│   │   └── anonymizer/
│   └── tests/          # pytest + bench/ harness
├── .claude-plugin/     # Claude Code plugin manifest, skills, slash commands
├── doc/
│   ├── architecture.md # this file
│   ├── distribution.md
│   ├── benchmarks.md
│   ├── cookbook/       # copy-paste recipes
│   ├── rules/          # live conventions (anonymizer, a11y, i18n, shadcn)
│   └── archive/        # historical: PROMPT.md, phase-0.md
├── README.md
├── LICENSE             # MIT
└── CLAUDE.md
```

## REST endpoints (FastAPI)

All under `/api`. JSON unless noted.

### Jobs

- `POST /api/jobs` — create a job. Body: `{ tools: [...], inputs: [fileIds] }`.
  Returns `{ job_id }`.
- `GET /api/jobs/{job_id}` — job metadata + status.
- `GET /api/jobs/{job_id}/events` — SSE stream (see below).
- `GET /api/jobs/{job_id}/artifacts/{name}` — download artifact.
- `DELETE /api/jobs/{job_id}` — cancel + cleanup.

### Files

- `POST /api/files` — multipart upload. Returns `{ file_id, filename, size, pages? }`.
- `GET /api/files/{file_id}` — metadata.
- `GET /api/files/{file_id}/preview?page=<n>` — page preview PNG.

### Tools-specific (examples)

- `POST /api/ocr` — convenience wrapper over `POST /api/jobs` with
  `tools: ["ocr-to-markdown"]`. Returns `{ job_id }`.
- `POST /api/anonymize` — convenience wrapper. Returns `{ job_id }`.

### Health

- `GET /api/health` — returns `{ ollama: bool, opf: bool }`.

## SSE event schema

All job streams emit JSON events with a `type` discriminator.

Common envelope:

```json
{ "type": "<event>", "job_id": "uuid", "ts": "ISO8601", "...": "..." }
```

Event types:

- `progress` — `{ tool, node_id, percent }`
- `ocr.page` — `{ page, markdown_chunk, page_done: bool }`
- `anonymize.span` — `{ category, count }`
- `node.start` / `node.end` — chain node lifecycle
- `error` — `{ message, recoverable }`
- `done` — `{ artifacts: [{ name, size, url }] }`

Frontend uses `EventSource` (no SSE library). Reconnect on transient
errors.

## Job storage

```
/tmp/paperloom/
  <job_id>/
    inputs/             # uploaded files
    work/               # intermediate per-tool outputs
    out/                # final artifacts
      out.md
      images/
      redactions.report.json
    job.json            # metadata
```

Background task in FastAPI deletes jobs > 24h old on a 1h timer.

## Limits

Enforced server-side (HTTP 413 on violation, also returned via SSE
`error` if streaming):

- `MAX_FILE_SIZE_MB=50`
- `MAX_PDF_PAGES=200`
- `MAX_FILES_PER_JOB=10`

Client mirrors these for UX feedback. Do not rely on client checks
alone.

## CORS

FastAPI allows `http://localhost:3000` only. No `*`. No credentials
(stateless, no auth).

## Errors

- HTTP 4xx for client errors (validation, oversize, unsupported format).
- HTTP 5xx for server errors (Ollama down, OPF crashed, disk full).
- All errors include `{ code, message, hint? }`. `code` is a stable
  string identifier; UI maps it to a translated message.

## Non-goals (v1)

- No persistence beyond `/tmp`.
- No multi-user, no auth, no auth tokens.
- No queue — jobs run inline in the request handler (FastAPI background
  task). Add a queue (RQ / Celery) only if a real bottleneck shows up.
- No GPU-only paths. CPU must work end-to-end.
