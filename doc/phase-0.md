# phase-0.md

Phase 0 deliverable per `doc/prompt/PROMPT.md` "SUCCESS BRIEF" — written plan only, no code yet. Locks the contracts so Phases 1–4 are mechanical.

Sources cross-checked via Context7 MCP (mandatory per CLAUDE.md / PROMPT): `next-intl`, `pypdfium2`, Ollama API, Next.js 16. OPF (`openai/privacy-filter`) is not indexed in Context7 — its operating-point mapping is the **only** unconfirmed item in this doc and is flagged below for confirmation at Phase 4 start by direct README read.

User answers locked in the conversation that produced this doc:

- Chain execution model: **sequential pipeline only**.
- PDF page renderer: **`pypdfium2`**.
- OCR prompt template: **single fixed prompt baked into adapter**.
- IT input: **warn + suggest `recall` preset, default stays `balanced`**.

---

## 1. Architecture confirmation

Hybrid Next.js + FastAPI as fixed in `architecture.md`. No deviations.

| Process | Port  | Owner      | Purpose                                       |
|---------|-------|------------|-----------------------------------------------|
| Next.js | 3000  | `web/`     | UI, upload, viewer, chain builder, downloads  |
| FastAPI | 8000  | `backend/` | PDF tools, OCR adapter, OPF anonymizer        |
| Ollama  | 11434 | system     | `glm-ocr:latest` inference                    |

Inter-process:

- Frontend → Backend: REST + SSE (`EventSource`, no library).
- Backend → Ollama: `POST http://localhost:11434/api/generate` with `stream: true`. Ollama returns **NDJSON** (newline-delimited JSON), one `{model, created_at, response, done}` object per line. Backend translates NDJSON → SSE for the browser.
- **Do NOT use** Ollama's OpenAI-compatible endpoint (`/v1/chat/completions`). PROMPT bans it — vision returns `502 Bad Gateway`.

Job storage `/tmp/pdf-ocr/<jobId>/` with 24h TTL cleaned by an async background task in FastAPI lifespan. CORS allows `http://localhost:3000` only. No auth, no queue, no GPU-only paths.

Limits enforced server-side (HTTP 413), mirrored client-side for UX:

- `MAX_FILE_SIZE_MB=50`
- `MAX_PDF_PAGES=200`
- `MAX_FILES_PER_JOB=10`

---

## 2. Repo file tree

Final layout after Phase 4. Each phase populates a subset; tree shown in full so directories never get added speculatively.

```
/
├── package.json                    # root: "dev" runs concurrently(next, uvicorn)
├── README.md                       # install steps incl. Ollama pull, OPF first-run note
├── LICENSE                         # MIT (already in repo)
├── CLAUDE.md                       # behavioural rules (already in repo)
├── .gitignore                      # node_modules, .next, .venv, /tmp/pdf-ocr, ~/.opf
│
├── doc/
│   ├── phase-0.md                  # THIS FILE
│   └── prompt/
│       ├── PROMPT.md
│       ├── architecture.md
│       ├── shadcn-rules.md
│       ├── i18n-rules.md
│       ├── a11y-rules.md
│       └── anonymizer-rules.md
│
├── web/                            # Next.js 16 App Router
│   ├── package.json
│   ├── next.config.ts              # wrapped by createNextIntlPlugin
│   ├── tsconfig.json
│   ├── eslint.config.mjs
│   ├── postcss.config.mjs
│   ├── components.json             # shadcn config (Tailwind v4, neutral, CSS vars)
│   ├── proxy.ts                    # next-intl middleware (Next 16+ uses proxy.ts, not middleware.ts)
│   │
│   ├── app/
│   │   ├── layout.tsx              # root layout, sets <html lang> from locale, wraps NextIntlClientProvider + ThemeProvider
│   │   ├── globals.css             # Tailwind v4 @theme tokens + shadcn CSS vars
│   │   ├── favicon.ico
│   │   └── [locale]/
│   │       ├── layout.tsx
│   │       ├── page.tsx            # home — links to /tools and /tools/ocr-to-markdown
│   │       └── tools/
│   │           ├── page.tsx        # catalogue
│   │           ├── ocr-to-markdown/page.tsx
│   │           ├── anonymize/page.tsx
│   │           ├── pdf-to-images/page.tsx
│   │           ├── images-to-pdf/page.tsx
│   │           ├── pdf-to-text/page.tsx
│   │           ├── pdf-to-html/page.tsx
│   │           ├── html-to-pdf/page.tsx
│   │           ├── markdown-to-pdf/page.tsx
│   │           ├── markdown-to-html/page.tsx
│   │           ├── merge-pdfs/page.tsx
│   │           ├── split-pdf/page.tsx
│   │           ├── compress-pdf/page.tsx
│   │           ├── rotate-pages/page.tsx
│   │           ├── reorder-pages/page.tsx
│   │           ├── delete-pages/page.tsx
│   │           ├── extract-pages/page.tsx
│   │           ├── add-page-numbers/page.tsx
│   │           ├── add-watermark/page.tsx
│   │           ├── strip-metadata/page.tsx
│   │           └── chain/page.tsx  # sequential chain builder
│   │
│   ├── components/
│   │   ├── ui/                     # shadcn primitives, CLI-installed
│   │   │   ├── ai-badge.tsx        # composes shadcn Badge per shadcn-rules.md
│   │   │   └── ...                 # button, card, dialog, form, input, label,
│   │   │                           # progress, scroll-area, select, separator,
│   │   │                           # skeleton, sonner, switch, tabs, tooltip
│   │   ├── upload/uploader.tsx
│   │   ├── viewer/page-render.tsx
│   │   ├── viewer/markdown-pane.tsx
│   │   ├── viewer/split-view.tsx   # composes ScrollArea + Card; scroll-sync
│   │   ├── chain/builder.tsx       # keyboard-accessible sequential list
│   │   ├── chain/node.tsx
│   │   ├── catalogue/tile.tsx
│   │   ├── theme/theme-toggle.tsx  # next-themes
│   │   └── i18n/locale-switch.tsx
│   │
│   ├── i18n/
│   │   ├── routing.ts              # defineRouting({ locales, defaultLocale, localePrefix })
│   │   ├── navigation.ts           # createNavigation(routing)
│   │   └── request.ts              # getRequestConfig
│   │
│   ├── messages/
│   │   ├── en.json
│   │   └── it.json
│   │
│   └── lib/
│       ├── utils.ts                # cn() — shadcn class-merge helper
│       ├── api.ts                  # typed fetch wrapper for FastAPI
│       └── sse.ts                  # EventSource hook with reconnect
│
├── backend/                        # FastAPI + uv
│   ├── pyproject.toml              # uv-managed; Python ≥3.11
│   ├── .python-version
│   ├── README.md
│   │
│   ├── src/
│   │   ├── __init__.py
│   │   ├── main.py                 # FastAPI app + lifespan (cleanup task) + CORS
│   │   ├── config.py               # env: OPF_DEVICE, MAX_*, OLLAMA_URL, MODEL
│   │   ├── sse.py                  # SSE response helper, NDJSON→SSE bridge
│   │   ├── jobs.py                 # job lifecycle, /tmp/pdf-ocr/<id>/ layout
│   │   ├── chain.py                # sequential executor (DAG out of scope v1)
│   │   │
│   │   ├── routers/
│   │   │   ├── health.py           # GET /api/health
│   │   │   ├── files.py            # POST /api/files, GET /api/files/{id}/preview
│   │   │   ├── jobs.py             # POST /api/jobs, GET events, artifacts, DELETE
│   │   │   ├── ocr.py              # POST /api/ocr (convenience wrapper)
│   │   │   └── anonymize.py        # POST /api/anonymize, GET .../report, .../artifact
│   │   │
│   │   ├── ocr/
│   │   │   ├── __init__.py
│   │   │   ├── render.py           # pypdfium2 page → PNG bytes
│   │   │   ├── prompts.py          # SINGLE fixed prompt for GLM-OCR
│   │   │   ├── stub.py             # canned MD chunks per page (Phase 2)
│   │   │   ├── ollama.py           # POST /api/generate streaming, NDJSON parser
│   │   │   └── pipeline.py         # orchestrate render→ollama→figures→md
│   │   │
│   │   ├── anonymizer/
│   │   │   ├── __init__.py
│   │   │   ├── detect.py           # OPF spans
│   │   │   ├── redact.py           # [REDACTED:CAT:N] substitution
│   │   │   └── report.py           # redactions.report.json builder
│   │   │
│   │   └── tools/
│   │       ├── pdf_to_images.py
│   │       ├── images_to_pdf.py
│   │       ├── pdf_to_text.py
│   │       ├── pdf_to_html.py
│   │       ├── html_to_pdf.py
│   │       ├── markdown_to_pdf.py
│   │       ├── markdown_to_html.py
│   │       ├── merge_pdfs.py
│   │       ├── split_pdf.py
│   │       ├── compress_pdf.py
│   │       ├── rotate_pages.py
│   │       ├── reorder_pages.py
│   │       ├── delete_pages.py
│   │       ├── extract_pages.py
│   │       ├── add_page_numbers.py
│   │       ├── add_watermark.py
│   │       └── strip_metadata.py
│   │
│   └── tests/
│       ├── test_health.py
│       ├── test_files.py
│       ├── test_ocr_stub.py
│       ├── test_ocr_ndjson.py
│       ├── test_anonymizer_report.py
│       └── test_no_egress.py       # CI lint: no httpx/requests in anonymizer/
```

**Files explicitly removed** from the original Create Next App scaffold (already deleted in working tree per `git status`): top-level `app/`, `package.json`, `next.config.ts`, `tsconfig.json`, `eslint.config.mjs`, `postcss.config.mjs`, `public/`. Replaced by `web/` subtree above.

---

## 3. Dependency lists

### 3.1 Frontend (`web/package.json`)

Runtime:

| Package          | Why                                           |
|------------------|-----------------------------------------------|
| `next`           | 16.x App Router (Turbopack default)           |
| `react`, `react-dom` | 19.x peer of Next 16                      |
| `next-intl`      | i18n; routing + ICU + RSC support             |
| `next-themes`    | dark/light/system, no FOUC                    |
| `tailwindcss`    | v4, CSS-only config via `@theme`              |
| `@tailwindcss/postcss` | v4 PostCSS plugin                       |
| `tailwind-merge` | required by shadcn `cn()`                     |
| `clsx`           | required by shadcn `cn()`                     |
| `class-variance-authority` | shadcn primitives                   |
| `lucide-react`   | icons (only icon source per shadcn-rules)     |
| `react-hook-form` | shadcn `Form`                                |
| `@hookform/resolvers` | zod resolver                             |
| `zod`            | form schemas + API DTOs                       |
| `sonner`         | shadcn toaster (used by upload errors)        |
| `tailwindcss-animate` | shadcn animations                        |

Dev:

| Package          | Why                                           |
|------------------|-----------------------------------------------|
| `typescript`, `@types/react`, `@types/react-dom`, `@types/node` | TS support  |
| `eslint`, `eslint-config-next` | lint                            |
| `concurrently`   | root `npm run dev` runs Next + FastAPI together |

shadcn primitives are CLI-installed (`npx shadcn@latest add <name>`); each pulls the required Radix sub-deps. No raw Radix imports per `shadcn-rules.md`.

### 3.2 Backend (`backend/pyproject.toml`)

Python ≥3.11. `uv` for env + lockfile (`uv lock`, `uv sync`).

Runtime:

| Package                  | Why                                       |
|--------------------------|-------------------------------------------|
| `fastapi`                | HTTP + SSE                                |
| `uvicorn[standard]`      | ASGI server                               |
| `python-multipart`       | multipart upload parser                   |
| `pydantic`               | DTOs / config                             |
| `pydantic-settings`      | env-driven config                         |
| `httpx`                  | async client → Ollama (streaming)         |
| `pypdfium2`              | PDF page rendering (LOCKED, not pdf2image) |
| `pypdf`                  | PDF manipulation (merge/split/rotate/extract/strip) |
| `Pillow`                 | image I/O for OCR pipeline + tools        |
| `weasyprint` *or* `playwright` | html→pdf, markdown→pdf (pick at Phase 3 start; lean WeasyPrint = no headless browser dep) |
| `markdown-it-py`         | md→html                                   |
| `opf` *(or vendored clone)* | OPF detection engine (anonymizer-rules) |

Dev:

| Package          | Why                                           |
|------------------|-----------------------------------------------|
| `pytest`, `pytest-asyncio`, `httpx[cli]` | tests                |
| `ruff`           | lint + format                                 |
| `mypy`           | type check                                    |

`backend/anonymizer/**` must NOT import `httpx` or `requests`. Enforced by a CI lint rule in Phase 4 (`tests/test_no_egress.py` parses imports in that subtree).

---

## 4. OCR pipeline contract

### 4.1 Trigger

`POST /api/jobs` with `{ tools: ["ocr-to-markdown"], inputs: [<file_id>...] }`, or convenience `POST /api/ocr` (same effect).

### 4.2 Steps

For each input file, in order:

1. Validate (size ≤ 50 MB, pages ≤ 200).
2. Render each page → PNG via `pypdfium2`:

   ```python
   from pypdfium2 import PdfDocument
   pdf = PdfDocument(path)
   for i, page in enumerate(pdf):
       bitmap = page.render(scale=300 / 72)  # 300 DPI
       img = bitmap.to_pil()                 # PIL.Image RGB
       png_bytes = _pil_to_png(img)
   ```

   Scale `300/72 ≈ 4.167` matches Context7's recommended high-res default.

3. For each page PNG, call Ollama:

   ```http
   POST http://localhost:11434/api/generate
   Content-Type: application/json

   {
     "model": "glm-ocr:latest",
     "prompt": "<single fixed prompt — see §4.3>",
     "images": ["<base64 PNG>"],
     "stream": true
   }
   ```

   Response = NDJSON stream. Parse line-by-line:

   ```json
   {"model":"glm-ocr:latest","created_at":"...","response":"# Heading\n","done":false}
   {"model":"glm-ocr:latest","created_at":"...","response":"more text","done":false}
   ...
   {"model":"glm-ocr:latest","created_at":"...","response":"","done":true,"done_reason":"stop"}
   ```

4. Backend translates each NDJSON line → SSE event:

   ```
   event: ocr.page
   data: {"job_id":"…","page":N,"markdown_chunk":"…","page_done":false}
   ```

   On NDJSON `done:true`, emit a final `page_done:true` event for that page.

5. Figures detected by GLM-OCR (placeholder syntax in prompt — see §4.3) saved as `<jobId>/images/fig-<n>.png`. The page's MD references them as `![](./images/fig-<n>.png)`.

6. After all pages: assemble `out.md`, build zip `out.md` + `images/`, emit `done` event with `artifacts: [{ name: "out.zip", url, size }]`.

### 4.3 Single fixed prompt

Locked in `backend/src/ocr/prompts.py` as one string constant. Draft (final wording finalised at Phase 3 start, but shape locked here):

```
You are an OCR engine. Convert the given page image into clean Markdown.
Rules:
- Preserve heading hierarchy with #, ##, ###.
- Preserve tables in GitHub-flavoured Markdown.
- Preserve lists (ordered + unordered).
- For each figure or non-text region, emit a placeholder line:
  [[FIGURE:fig-N]]
  where N is a 1-indexed counter local to this page. Do not describe the figure.
- Preserve reading order. Do not invent text. If a region is illegible, output [illegible].
- Output Markdown only. No explanations, no JSON, no commentary.
```

Backend post-processes `[[FIGURE:fig-N]]` placeholders: extracts the corresponding cropped region from the page bitmap (TBD Phase 3 — simplest v1: drop the placeholder and let GLM-OCR handle in-place; iterate if needed) and rewrites placeholder to `![](./images/fig-<global-n>.png)`.

### 4.4 Tables

Strategy locked: rely on GLM-OCR's GFM table output. No second pass with a layout-aware model. If quality is insufficient post-Phase 3, raise as a separate concern.

### 4.5 Streaming UI

Per `a11y-rules.md`: streamed MD region wrapped in a single `aria-live="polite"` container, not per-chunk. Per-page MD updates only the corresponding page section — never re-render the entire document on each token.

---

## 5. Anonymizer pipeline contract

### 5.1 Trigger

`POST /api/anonymize` (convenience) or as a node in a chain after `ocr-to-markdown`.

Input artefact types: `pdf`, `md`, `txt`. For `pdf` input, the chain must include OCR upstream — anonymizer never reaches into PDF binaries.

### 5.2 Steps

1. Read text input; for paginated inputs, retain page boundaries (page index per span).
2. Run OPF detection with selected preset → spans `[(category, start, end), …]`.
3. Build replacement map per OPF's 8-category taxonomy verbatim:

   - `account_number`, `private_address`, `private_email`, `private_person`,
     `private_phone`, `private_url`, `private_date`, `secret`.

4. For each span, replace original text with `[REDACTED:{CATEGORY}:{N}]` where:

   - `CATEGORY` = uppercased label (`PRIVATE_EMAIL`, etc.).
   - `N` = 1-indexed counter **per category, per job** (resets per job, not per page).

5. Compute SHA-256 of every original span. Never log or persist the raw value.
6. Write `redactions.report.json` (schema below) and the redacted artefact (`out.md` if MD input, `out.txt` if plain text). Always emit the report, even on zero spans.

### 5.3 Report schema (`redactions.report.json`)

Verbatim from `anonymizer-rules.md`:

```json
{
  "schema_version": "1",
  "job_id": "uuid",
  "input": { "filename": "...", "format": "pdf|md|txt" },
  "engine": { "name": "opf", "version": "<from package>", "preset": "balanced|recall|precision" },
  "stats": {
    "total_spans": 0,
    "by_category": {
      "account_number": 0, "private_address": 0, "private_email": 0,
      "private_person": 0, "private_phone": 0, "private_url": 0,
      "private_date": 0, "secret": 0
    }
  },
  "redactions": [
    {
      "id": "PRIVATE_EMAIL:1",
      "category": "private_email",
      "page": 1,
      "offset_start": 142,
      "offset_end": 168,
      "original_hash": "sha256:...",
      "replacement": "[REDACTED:PRIVATE_EMAIL:1]"
    }
  ]
}
```

`page` is `null` for non-paginated inputs (md/txt). `by_category` always lists all 8 keys.

### 5.4 Operating-point preset mapping

Three UI presets exposed: `balanced` (default), `recall`, `precision`.

**OPF ↔ preset mapping is unconfirmed** — Context7 does not index `openai/privacy-filter`. Per `anonymizer-rules.md`, the exact mapping must come from the OPF README's "Operating-Point Calibration" section. Action plan:

- **Phase 4, step 1** — clone `https://github.com/openai/privacy-filter`, read README, extract the calibration parameters (likely a per-category decoding threshold and/or a global beam/score cutoff). Lock the mapping in `backend/src/anonymizer/detect.py` and append the resolved values to this doc as §5.4.1 before any UI surfaces them.
- Until then, presets are wired in the UI but call OPF with its library-default arguments for `balanced`. `recall` and `precision` raise a clearly-labelled `NotImplementedError` if the README read has not happened yet — fail loud, do not silently fall back.

This is the single intentional unknown in Phase 0 and the only blocker that defers from research to implementation time.

### 5.5 IT input handling

Locked: detect non-EN input via a lightweight check (heuristic on OPF input or `langdetect` if needed), show a banner suggesting the `recall` preset. **Default stays `balanced`**, no auto-switch — user picks.

### 5.6 Privacy guarantees (must hold)

- No outbound HTTP from `backend/anonymizer/**`. Enforced by `tests/test_no_egress.py` (AST-walks the package, fails on any `httpx`/`requests`/`urllib`/`urllib3`/`socket` import).
- No raw values logged. Hash + category only.
- Job temp files wiped on completion (success or failure) by the existing TTL cleaner; no extra path needed.
- Report contains hashes only (above).

### 5.7 API surface

- `POST /api/anonymize` — multipart input → `{ job_id }`.
- `GET /api/anonymize/{job_id}/events` — SSE: `{ type: "anonymize.span", category, count }` per detected span, `{ type: "done", report_url, artifact_url }` on completion.
- `GET /api/anonymize/{job_id}/report` → JSON.
- `GET /api/anonymize/{job_id}/artifact` → redacted file.

### 5.8 UI rules

- AI badge present on tile, page header, chain-builder node.
- Footer shows OPF version + Apache-2.0 license.
- Banner shown for non-EN input.
- Report rendered as a table grouped by category with counts; raw JSON downloadable.
- Original spans never displayed alongside replacements by default.

---

## 6. Inter-process contract recap

REST routes (full list, all under `/api`):

| Method | Path                                  | Purpose                              |
|--------|---------------------------------------|--------------------------------------|
| GET    | `/api/health`                         | `{ ollama: bool, opf: bool }`        |
| POST   | `/api/files`                          | multipart upload → `{ file_id, ... }`|
| GET    | `/api/files/{file_id}`                | metadata                             |
| GET    | `/api/files/{file_id}/preview?page=N` | PNG preview                          |
| POST   | `/api/jobs`                           | create job from `{ tools, inputs }`  |
| GET    | `/api/jobs/{job_id}`                  | metadata                             |
| GET    | `/api/jobs/{job_id}/events`           | SSE stream                           |
| GET    | `/api/jobs/{job_id}/artifacts/{name}` | download                             |
| DELETE | `/api/jobs/{job_id}`                  | cancel + cleanup                     |
| POST   | `/api/ocr`                            | wrapper → `POST /api/jobs`           |
| POST   | `/api/anonymize`                      | wrapper → `POST /api/jobs`           |
| GET    | `/api/anonymize/{job_id}/report`      | JSON report                          |
| GET    | `/api/anonymize/{job_id}/artifact`    | redacted file                        |

SSE event types (envelope `{ type, job_id, ts, ... }`):

- `progress` — `{ tool, node_id, percent }`
- `node.start` / `node.end` — chain node lifecycle
- `ocr.page` — `{ page, markdown_chunk, page_done }`
- `anonymize.span` — `{ category, count }`
- `error` — `{ code, message, hint?, recoverable }`
- `done` — `{ artifacts: [{ name, size, url }] }`

Errors:

- HTTP 4xx for client errors (validation, oversize, unsupported format).
- HTTP 5xx for server errors (Ollama down, OPF crashed, disk full).
- Body: `{ code, message, hint? }`. UI maps `code` to a translated message.

---

## 7. Phase plan recap (≤5 phases)

| Phase | Goal | Verify |
|-------|------|--------|
| **0** | This doc. | User reads, approves. |
| **1** | Skeletons (`web/`, `backend/`), `concurrently` dev script, `next-intl` locale-prefixed routes (`/it`, `/en`), `next-themes`, shadcn init (Tailwind v4 + neutral + CSS vars), `GET /api/health`. | `npm run dev` boots both; `curl :8000/api/health` returns JSON; locale + theme toggles work no-reload; `<html lang>` updates on switch. |
| **2** | Upload + OCR split-view with **stub** adapter. `POST /api/files`, `pypdfium2` page render, SSE plumbing, canned MD chunks per page, AI badge, `aria-live` region. | Drop scanned PDF → pages render left, canned MD streams right per page, scroll-sync. |
| **3** | Real Ollama OCR + figures + zip + tool catalogue + sequential chain builder + 17 deterministic tools. | Chain `pdf-to-images → ocr-to-markdown` runs end-to-end; zip downloads; all tools reachable from catalogue; chain builder fully keyboard-driven. |
| **4** | Anonymizer (OPF) + IT banner + report + no-egress lint + PROMPT success scenario end-to-end. **First sub-task**: read OPF README, lock §5.4 preset mapping, append to this doc. | PROMPT success — drop scanned PDF, chain `pdf-to-images → ocr-to-markdown → anonymize`, download zip with `out.md` + `images/` + `redactions.report.json`. |

Phase 3 is the heaviest. If too big for one review sitting it splits into 3a (real Ollama + figures + zip) and 3b (catalogue + chain builder + 17 deterministic tools) — flagged at Phase 3 start.

---

## 8. Open questions / known unknowns

1. **OPF preset → runtime parameter mapping** (§5.4). Resolution: read README at Phase 4 start, append §5.4.1.
2. **Figure cropping strategy** (§4.3 second paragraph). Resolution: try GLM-OCR-only path first at Phase 3; introduce a layout-detection step only if the placeholder approach yields unusable figures.
3. **`weasyprint` vs `playwright`** for `html-to-pdf` / `markdown-to-pdf`. Resolution: pick at Phase 3 start. WeasyPrint preferred (no headless-browser dep) unless a known PROMPT requirement (e.g. JS-heavy HTML) demands playwright.

These are the only items in this doc that are not fully locked. Everything else is final.

---

## 9. Docker option (approved — Phase 1b sub-phase)

Native is canonical. Docker is an **alternative** path covering only `web/` + `backend/`. Ollama stays native on the host (preserves Apple Silicon Metal acceleration) and is reached from containers via `host.docker.internal:11434`.

### 9.1 Files

```
/
├── docker-compose.yml              # base: web + backend
├── docker-compose.dev.yml          # overlay: bind mounts + reload
├── .dockerignore
└── docker/
    ├── web.Dockerfile              # multi-stage: deps → build → runner (Node 22 LTS)
    └── backend.Dockerfile          # Python 3.11-slim + uv + system libs
```

System libs in `backend.Dockerfile` (apt): `libcairo2 libpango-1.0-0 libpangoft2-1.0-0 libgdk-pixbuf-2.0-0 libffi8 shared-mime-info` — required by WeasyPrint at runtime if §8 chooses it. If `playwright` wins instead, replace with `playwright`'s install step.

### 9.2 Compose services

```yaml
# docker-compose.yml (base)
services:
  backend:
    build: { context: ., dockerfile: docker/backend.Dockerfile }
    ports: ["8000:8000"]
    environment:
      OLLAMA_URL: "http://host.docker.internal:11434"
      OPF_DEVICE: "cpu"
      MAX_FILE_SIZE_MB: "50"
      MAX_PDF_PAGES: "200"
      MAX_FILES_PER_JOB: "10"
    volumes:
      - opf-cache:/root/.opf
      - pdf-ocr-tmp:/tmp/pdf-ocr
    extra_hosts:
      - "host.docker.internal:host-gateway"   # Linux parity; macOS no-op

  web:
    build: { context: ., dockerfile: docker/web.Dockerfile }
    ports: ["3000:3000"]
    environment:
      BACKEND_URL_INTERNAL: "http://backend:8000"   # SSR / server components
      NEXT_PUBLIC_BACKEND_URL: "http://localhost:8000"  # browser
    depends_on: [backend]

volumes:
  opf-cache:
  pdf-ocr-tmp:
```

```yaml
# docker-compose.dev.yml (overlay — `docker compose -f docker-compose.yml -f docker-compose.dev.yml up`)
services:
  backend:
    command: ["uv", "run", "uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
    volumes:
      - ./backend/src:/app/src
      - ./backend/tests:/app/tests
  web:
    command: ["npm", "run", "dev"]
    volumes:
      - ./web:/app
      - /app/node_modules    # anonymous volume keeps container's node_modules
      - /app/.next
```

### 9.3 Dual base-URL contract

Frontend resolves backend URL by execution context:

- **Server-side** (RSC, route handlers, `fetch` from server): `process.env.BACKEND_URL_INTERNAL` → `http://backend:8000` in Docker, `http://localhost:8000` natively.
- **Browser** (`EventSource`, client `fetch`): `process.env.NEXT_PUBLIC_BACKEND_URL` → `http://localhost:8000` in both setups.

Helper in `web/lib/api.ts`:

```ts
export const backendUrl = (path: string) => {
  const base = typeof window === "undefined"
    ? process.env.BACKEND_URL_INTERNAL ?? "http://localhost:8000"
    : process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";
  return `${base}${path}`;
};
```

### 9.4 README addition

Two clearly-labelled sections: **Native (default)** and **Docker (alternative)**. Native section keeps the existing `npm run dev` flow. Docker section shows `docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build` and notes that Ollama must be running natively beforehand.

### 9.5 Phase placement

- **Phase 1a** — native skeletons + `npm run dev` (per §7 Phase 1 row).
- **Phase 1b** — Docker files. Verifiable independently: `docker compose up --build` boots both, `:3000` serves the same home page, `:8000/api/health` returns JSON, browser `EventSource` from container web → container backend works.

Phase 1b is intentionally small (~5 files, ~150 LOC) and gated behind 1a passing — keeps both paths green.
