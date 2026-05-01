# PROMPT — paperloom

Local web app that turns dirty scanned PDFs and images into clean Markdown
using a locally-hosted GLM-OCR model (via Ollama), and bundles a
configurable suite of PDF tools that I can chain over one or more input
files (PDF / image) to produce one or more outputs (PDF, image, Markdown,
HTML). Markdown exports preserve figures as a sibling `images/` folder
referenced from the `.md` file.

One of the tools is a **document anonymizer** built on top of OpenAI
Privacy Filter (https://github.com/openai/privacy-filter) — used as the
detection + redaction engine. The anonymizer must be composable with the
other tools (e.g. OCR → anonymize → export Markdown). All inference runs
locally; no input bytes leave the machine.

---

## Architecture (decided)

Hybrid:

- **Frontend** — Next.js 16 App Router + Turbopack, TypeScript,
  shadcn/ui, Tailwind v4, `next-intl`, `next-themes`. Runs on `:3000`.
- **Backend** — FastAPI (Python 3.11+), `uv` for deps, runs on `:8000`.
  Hosts: PDF tools, OCR adapter (calls Ollama), anonymizer (wraps OPF).
- **Models** — Ollama on `:11434` (`glm-ocr:latest`). OPF Python package
  installed in backend venv (downloads weights on first run to
  `~/.opf/privacy_filter`).
- **Inter-process** — Frontend → Backend over REST + SSE for streaming.
  Backend → Ollama via `POST :11434/api/generate` (Ollama native, NOT
  OpenAI-compat — vision unstable there).
- **Job storage** — filesystem `/tmp/paperloom/<jobId>/`, TTL 24h, cleaned
  by a background task in FastAPI.
- **Auth** — none. Single-user local app.
- **Dev startup** — `npm run dev` runs Next + FastAPI together via
  `concurrently`.

Full inter-process contract: see [`architecture.md`](./architecture.md).

## Limits (decided)

- Per file: 50 MB max, 200 pages max for PDFs.
- Per job: 10 input files max.
- Enforced both client-side (UX guardrails) and server-side
  (FastAPI rejects oversize requests).

## Languages

- UI: IT + EN, default = browser locale, fallback EN.
- OPF: English-primary; IT documents work but recall may drop. Surface a
  warning in the anonymizer UI for non-EN inputs.

---

## Tool catalogue (v1)

Generic, single-purpose tools. Each is a tile in the catalogue and a route
under `/tools/<slug>`. AI-powered tools carry a distinct visual badge and
icon in every surface (catalogue tile, tool page, chain builder).

**Document conversion** (deterministic):
- `pdf-to-images` — render each page to PNG/JPG, configurable DPI.
- `images-to-pdf` — combine images into a single PDF.
- `pdf-to-text` — extract embedded text layer (no OCR).
- `pdf-to-html` — preserve simple layout.
- `html-to-pdf` — single page or paginated.
- `markdown-to-pdf` — via headless render.
- `markdown-to-html` — standalone HTML doc.

**PDF manipulation** (deterministic):
- `merge-pdfs` — concatenate N inputs in given order.
- `split-pdf` — by page range or every N pages.
- `compress-pdf` — re-encode images, drop fonts, configurable quality.
- `rotate-pages` — 90/180/270 per-page or whole-doc.
- `reorder-pages` — drag-and-drop reorder.
- `delete-pages` — remove selected pages.
- `extract-pages` — keep selected pages as new PDF.
- `add-page-numbers` — configurable position/format.
- `add-watermark` — text or image, configurable opacity/position.
- `strip-metadata` — remove author / title / creation tool fields.

**OCR & AI** (badged "AI"):
- `ocr-to-markdown` — GLM-OCR via Ollama. Renders each page → image → MD,
  preserves tables, headings, figures (figures saved into `images/` and
  linked from MD).
- `anonymize` — OPF text PII detection + redaction, returns redacted
  artifact + `redactions.report.json`. See
  [`anonymizer-rules.md`](./anonymizer-rules.md).

**Composability**: all tools accept `inputs[]` and produce `outputs[]`.
Outputs of one tool can feed another. The chain builder lets the user
arrange a sequence (or DAG, TBD with you) of tools per job. Chain runs
server-side and streams progress per node.

> Catalogue layout (clear cards, single-purpose pages, multi-file input,
> obvious CTA, visible output, no tool hidden behind modals) is the
> common pattern of any well-organised PDF toolbox. Do not copy any
> existing site's branding, copy, icons, or visual language. UI design
> derives from shadcn/ui primitives only.

---

## OCR pipeline (high-level)

1. Upload validated by Next, forwarded to FastAPI as multipart.
2. FastAPI renders each PDF page → PNG (server-side; pick **one** of
   `pdf2image` or `pypdfium2` in Phase 0, do not introduce both).
3. For each page image: call Ollama `POST /api/generate` with
   `model=glm-ocr:latest`, request streaming.
4. Tokens stream back to FastAPI → SSE forward to Next → split-view UI
   updates the corresponding page section as Markdown chunks arrive.
5. Figures detected during OCR are saved under `<jobId>/images/` and
   referenced as `![](./images/fig-<n>.png)` in the output `.md`.
6. Final artifact: zip of `out.md` + `images/`. One-click download.

### Ollama setup (source of truth — do not deviate)

Install:

```bash
curl -fsSL https://ollama.ai/install.sh | sh   # macOS / Linux
ollama --version
ollama pull glm-ocr:latest
ollama serve   # auto-starts on most installs; explicit if needed
```

Endpoint and request shape (used by the FastAPI OCR adapter):

- URL: `http://localhost:11434/api/generate`
- Body: `{ "model": "glm-ocr:latest", "prompt": "<...>", "stream": true }`
- API mode: **Ollama native** (`/api/generate`). Do **not** use the
  OpenAI-compatible endpoint (`/v1/chat/completions`) — vision requests
  return `502 Bad Gateway` there.

Smoke test:

```bash
curl http://localhost:11434/api/generate -d '{
  "model": "glm-ocr:latest",
  "prompt": "Hello",
  "stream": false
}'
```

Verify model:

```bash
ollama list
ollama show glm-ocr:latest
ollama ps
```

---

## Anonymizer pipeline (high-level)

OPF (Apache 2.0) is the only detection engine. Entity taxonomy is
**fixed** by OPF's training and **must not be re-invented**:

`account_number`, `private_address`, `private_email`, `private_person`,
`private_phone`, `private_url`, `private_date`, `secret`.

OPF is text-only. **No face detection in v1.** If face redaction in
images is requested later, it is a separate tool with a separate library
— do not silently extend OPF claims.

Full integration rules (sidecar pattern, report schema, redaction tokens,
guarantees): see [`anonymizer-rules.md`](./anonymizer-rules.md).

---

## UI requirements

- **Split view** for OCR: original document on the left (page-by-page),
  Markdown on the right, scroll-synced.
- **Theme** toggle: dark / light / system (system default).
- **Language** toggle: IT / EN.
- **AI badge** on every AI-powered tool — catalogue, tool page, chain
  builder. Distinct, consistent, never confusable with deterministic
  tools.
- **Always visible upload preview** — user sees what they uploaded
  before any processing.
- **Always one-click download** for every supported output format.
- **Streaming progress** for long jobs (per page / per detected entity).
  Never block the UI. Use `aria-live="polite"` for screen readers.
- All UI built from shadcn/ui primitives. No hand-rolled components when
  shadcn ships one. See [`shadcn-rules.md`](./shadcn-rules.md).

---

## Required reading (in order, before writing any code)

1. [`../../CLAUDE.md`](../../CLAUDE.md) — global behavioural rules.
2. [`architecture.md`](./architecture.md) — frontend/backend contract,
   ports, REST + SSE schemas, job storage layout.
3. [`shadcn-rules.md`](./shadcn-rules.md) — shadcn/ui usage rules.
4. [`i18n-rules.md`](./i18n-rules.md) — IT/EN translation conventions.
5. [`a11y-rules.md`](./a11y-rules.md) — accessibility rules.
6. [`anonymizer-rules.md`](./anonymizer-rules.md) — OPF integration rules.

**Context7 MCP is mandatory** for any library, framework, SDK, API, CLI
tool, or cloud service question — even ones you think you know
(Next.js, shadcn/ui, Tailwind v4, FastAPI, `uv`, `next-intl`,
`next-themes`, Ollama client libs, `pdf2image`, `pypdfium2`, OPF, etc.).
Workflow: `resolve-library-id` → `query-docs` with the full question.
If the answer is unsatisfying, retry once with `researchMode: true`.
Do **not** rely on pre-App-Router or pre-Tailwind-v4 training data.
Skip Context7 only for: refactoring, business-logic debugging, code
review, general programming concepts.

---

## Constraints (non-negotiable)

Always:
- Show user what they uploaded before processing.
- Make output downloadable in one click for every supported format.
- Keep the tool catalogue discoverable — never hide tools behind modals.
- Mark AI-powered tools with a clear, consistent visual signal
  everywhere.
- Emit a redaction report whenever the anonymizer runs, even if empty.
- Stream progress for long jobs — never block the UI.
- Use the **Context7 MCP server** before writing or modifying any code
  that touches a library, framework, SDK, API, CLI, or cloud service —
  even ones you think you know.

Never:
- Send user files to a remote service. Local inference only.
- Re-render the full document on every OCR token; update per page.
- Re-implement detection logic that OPF already provides.
- Invent a parallel privacy taxonomy. Use OPF's 8 categories verbatim.
- Use the OpenAI-compatible Ollama endpoint for vision. Use
  `/api/generate`.
- Copy UI, copy, branding, or icons from any existing PDF tool site.

---

## SUCCESS BRIEF

**Output type and length**: phased plan executed one step at a time.
Phase 0 = written plan only (architecture confirmation, file tree,
dependency lists for Next and FastAPI, OCR pipeline contract, anonymizer
pipeline contract). Phases 1..N = concrete code changes, smallest viable
slice first. No phase larger than reviewable in one sitting.

**Recipient reaction**: I should be able to run the app locally after
Phase 1 with a stub OCR adapter (split view working, no real model yet),
then incrementally swap in real Ollama, the chain builder, the
anonymizer, i18n, and theming — each its own phase.

**Does NOT sound like**:
- A monolithic "here is the whole app" dump.
- Generic Next.js boilerplate from pre-App-Router tutorials.
- Hand-rolled UI when a shadcn primitive exists.
- Speculative abstractions, plugin systems, or feature flags I didn't
  ask for.
- An anonymizer that calls a remote API or leaks input bytes off-box.

**Success means**: I run `npm run dev`, drop a scanned PDF, see pages on
the left, GLM-OCR Markdown streaming on the right, switch IT↔EN and
dark↔light without reload, go to `/tools`, chain
`pdf-to-images → ocr-to-markdown → anonymize`, and download a zip
containing `out.md`, `images/`, and `redactions.report.json`.

---

## CONVERSATION

**DO NOT start implementing yet.** Before any code, do this:

1. Read all files listed under "Required reading" above. Confirm each in
   a one-line summary so I know you actually read them.
2. List the **3 rules from those context files that matter most for
   this task and why** (one sentence each).
3. Surface clarifying questions you still have. Use the
   `AskUserQuestion` tool. Topics I expect (not exhaustive): OCR prompt
   template per page, table-preservation strategy, chain execution model
   (sequential vs DAG), where intermediate artifacts live within a
   chain, OPF operating point preset (precision vs recall), what to do
   for IT inputs given OPF's English-primary training, file ingestion
   limits beyond the defaults already locked in.
4. Give me your execution plan in **at most 5 phases**. Each phase:
   `goal`, `files touched`, `verification step`. No phase larger than I
   can review in one sitting.

**Begin work only after I have answered your clarifying questions and
approved the plan.**

If you are about to break one of the constraints above (add a
non-asked abstraction, touch unrelated code, hit the OpenAI-compat
Ollama endpoint, hand-roll a component shadcn already ships, route
anonymizer traffic off-box, invent a privacy taxonomy), **stop and tell
me first.**
