# Paperloom

> **Local-first document toolkit. Agent-native. Your files never leave your machine by default.**

**Paperloom** pairs a streaming OCR pipeline (GLM-OCR via [Ollama](https://ollama.ai)) with a chainable suite of PDF / Markdown / HTML / image tools and a built-in PII anonymizer. It ships three surfaces from the same code: a Python library, a CLI, and an MCP server — plus a Next.js web app on top.

---

## Why paperloom (vs. marker, docling, MinerU)

paperloom's edge is **agent orchestration with privacy primitives**, on top of a **state-of-the-art OCR model**:

> **Model choice — GLM-OCR.** Scores **94.62 on OmniDocBench V1.5 (rank #1)** and is SOTA on formula / table recognition and information extraction. paperloom commits to **tracking the current SOTA** — when a stronger open model ships, the Ollama pin gets updated and the older one moves to an opt-in setting. We don't try to out-research [`marker`](https://github.com/datalab-to/marker), [`docling`](https://github.com/docling-project/docling), or [`MinerU`](https://github.com/opendatalab/mineru) on the model layer; we ride the best available model and focus on what's around it.

The orchestration layer:

| Capability | paperloom | marker | docling | MinerU | ocrmypdf |
|---|---|---|---|---|---|
| PDF/image → Markdown | ✅ (GLM-OCR) | ✅ (Surya + opt. LLM) | ✅ (VLM+OCR) | ✅ (VLM+OCR) | ❌ (PDF only) |
| 19 chainable tools (split, merge, watermark, …) | ✅ | ❌ | ❌ | ❌ | ❌ |
| Built-in PII redaction | ✅ (OPF) | ❌ | ❌ | ❌ | ❌ |
| MCP server with security model | ✅ (allowlist + file_id) | ❌ | ❌ | ❌ | ❌ |
| Streaming SSE (page-by-page) | ✅ | ❌ | ❌ | ❌ | ❌ |
| Web UI included | ✅ | ❌ | ❌ | ❌ | ❌ |
| Python library + CLI | ✅ | ✅ | ✅ | ✅ | ✅ |
| Single model dependency | ✅ (one Ollama model) | ❌ (multi) | ❌ (multi) | ❌ (multi) | ✅ (Tesseract) |

**Pick paperloom when:** you're building an agent workflow, you need PII redaction in the same pipeline as OCR, you prefer one Ollama model over a model zoo, or you want a web UI bundled.

**Pick the others when:** raw OCR quality on complex layouts (math, tables, multi-column scientific PDFs) is the only thing that matters. Run our [benchmarks](./doc/benchmarks.md) on your own corpus before deciding.

### Where paperloom shines

paperloom is over-engineered for ingesting already-digital PDFs — for those, `pdftotext` and a 10-line script will do. The orchestration, streaming, and privacy primitives earn their keep in three concrete scenarios:

- **LLM Wiki / personal knowledge base from pixels.** [Karpathy's LLM Wiki pattern](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) assumes an agent maintains a Markdown wiki on disk. Plain agents can only ingest text. With paperloom, anything you can photograph or scan — books, notebooks, whiteboards, paper archives — becomes a wiki page with audited provenance. See cookbooks [`01`](doc/cookbook/01-llm-wiki-ingest.md) (the pattern) and [`10`](doc/cookbook/10-photo-batch-to-wiki.md) (1000+ phone photos at once).
- **Bulk scanned / photographed documents.** Hundreds-to-thousands of phone photos or flatbed scans of a corpus you own (textbooks, manuals, legal binders, family archives). The batch script in cookbook [`10`](doc/cookbook/10-photo-batch-to-wiki.md) is resumable — a crash on page 800 of 1500 doesn't lose the first 800. The frontmatter records `ocr_provider` and `privacy_mode` so you can audit later which pages stayed local.
- **Bulky manuals and long documents.** A 400-page workshop manual or a multi-volume textbook is exactly where streaming OCR pays off. Markdown emerges page by page over SSE — you can sanity-check early pages while the tail still runs, and the per-page emission means a mid-run failure costs you a single page rather than a whole job. See [`05-scan-clean-pdf.md`](doc/cookbook/05-scan-clean-pdf.md) for the chain pattern, [`10-photo-batch-to-wiki.md`](doc/cookbook/10-photo-batch-to-wiki.md) for resumable batch ingest.

If your inputs are already-digital text, prefer `paperloom.tools.pdf_to_text` (or plain `pdftotext`) — it's 100× faster and 100% accurate. paperloom's value lives in the pixel-to-Markdown path, the chainable post-processing, and the privacy-audited storage.

> **Local-first, with cloud opt-in.** OCR runs on Ollama by default (everything on your machine). Need a cloud OCR provider? Set `OCR_PROVIDER=mistral` for Mistral Document AI — paperloom flips to "hybrid" privacy mode and the web UI badge turns amber so you always see when bytes leave your box. The MCP server prints the same banner on stderr at startup. Full breakdown in [`doc/privacy.md`](doc/privacy.md).

---

## Hardware requirements

paperloom runs the OCR model **locally**. RAM and unified-memory pressure is the bottleneck — not CPU clock.

| Spec | Behavior |
|---|---|
| **Recommended** | Apple Silicon **M-series Pro** (M2 Pro / M3 Pro / M4 Pro / M5 Pro) with **≥ 24 GB unified RAM**, or x86 with a 24 GB+ GPU. Verified working on a Mac M5 Pro / 24 GB. |
| **Minimum** | 16 GB unified RAM (Apple Silicon) or 16 GB GPU VRAM (NVIDIA). Expect single-page OCR to take 8–15 s and page-batches to stutter under memory pressure. |
| **Below minimum** | **Don't.** On 8 GB / 16 GB intel Macs and low-end laptops the GLM-OCR model can saturate memory mid-page — observed symptoms include the OS freezing hard enough to require a reboot. The anonymizer (~4 GB checkpoint) compounds this. |

If you can't meet the bar, two safe options:

- Use **`pdf-to-text`** (no OCR — extracts the existing text layer) for digitally generated PDFs.
- Run paperloom on a server / workstation and consume it remotely via the FastAPI HTTP surface or MCP over the network (not stdio).

Disk: ~5 GB for the GLM-OCR model + ~4 GB for the OPF anonymizer checkpoint when first installed.

## Three install paths

| You want… | Run | Get |
|---|---|---|
| **Use as MCP server (Claude Desktop, Cursor, Cline, Agno)** | `uvx paperloom-mcp` | stdio MCP server with all 19 tools |
| **Use as Python library / CLI in scripts** | `pip install paperloom` (or `uvx paperloom doctor`) | `from paperloom import ocr_to_markdown, ...` + `paperloom` CLI |
| **Run the web app + dev** | `git clone … && pnpm install && pnpm dev` | Next.js UI on `localhost:3000`, FastAPI on `:8000` |

All three share the same backend code. See [`doc/distribution.md`](doc/distribution.md) for full details.

---

## Quick start

### As an agent tool (MCP)

```bash
ollama pull glm-ocr:latest      # one-time, ~5 GB
```

Wire `uvx paperloom-mcp` into your MCP client. For Claude Desktop, edit
`~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "paperloom": {
      "command": "uvx",
      "args": ["paperloom-mcp"],
      "env": {
        "PAPERLOOM_MCP_ALLOWED_DIRS": "/Users/you/Documents,/Users/you/Downloads"
      }
    }
  }
}
```

Restart Claude Desktop. Done.

### As a Claude Code plugin

```bash
/plugin marketplace add luciopalmieri/paperloom
/plugin install paperloom
```

Bundles the MCP server config + `/paperloom-ocr`, `/paperloom-anonymize`, `/paperloom-doctor` slash commands + skills the model can match against.

### As a Python library

```bash
pip install paperloom            # core (OCR, PDF tools, MCP server)
pip install 'paperloom[pdf]'     # + WeasyPrint for markdown→pdf, html→pdf
pip install 'paperloom[anonymizer]'  # + OPF for PII redaction
pip install 'paperloom[all]'     # everything
```

```python
from paperloom import ocr_to_markdown, anonymize, Chain

md = ocr_to_markdown("scan.pdf")
clean = anonymize(md, preset="balanced")

# Or compose:
result = Chain([
    ("pdf-to-images", {"dpi": 200}),
    ("ocr-to-markdown", {}),
    ("anonymize", {"preset": "recall"}),
]).run(["doc.pdf"])
```

`anonymizer` extra downloads ~4 GB on first use. The `pdf` extra needs `brew install pango` (macOS) or equivalent.

### As a CLI

```bash
paperloom ocr scan.pdf -o out.md
paperloom anonymize out.md --preset recall
paperloom chain --steps pdf-to-images,ocr-to-markdown,anonymize doc.pdf
paperloom doctor      # check Ollama, glm-ocr, allowlist, extras
```

### As the full web app (dev mode)

```bash
ollama pull glm-ocr:latest
pnpm install:all
pnpm dev
```

Open <http://localhost:3000>. Backend health check at <http://localhost:8000/api/health>.

---

## Features

- **Streaming OCR** — drop a scanned PDF or phone photo, watch Markdown emit page by page over SSE.
- **PII anonymizer** — built on [OpenAI Privacy Filter](https://github.com/openai/privacy-filter) (Apache 2.0). 8 entity categories, verbatim. **Auto-installs on first use.**
- **Chain builder** (web UI) — compose any of the 19 wired tools. Reorder with `Alt+↑` / `Alt+↓`, remove with `Delete`.
- **Image input for OCR** — JPEG / PNG / WebP / TIFF / BMP / GIF, with EXIF auto-rotate.
- **i18n** — English + Italian, light + dark.
- **Local-only** — no telemetry, no cloud round-trips. Even the anonymizer model runs on CPU by default.

---

## Tools available over MCP and library

OCR: `ocr-to-markdown`, `pdf-to-text`, `pdf-to-images`, `images-to-pdf`
Anonymize: `anonymize`
Page ops: `extract-pages`, `delete-pages`, `rotate-pages`, `reorder-pages`, `split-pdf`, `merge-pdfs`
Render: `markdown-to-html`, `markdown-to-pdf`, `html-to-pdf`, `pdf-to-html`
Quality: `compress-pdf`, `strip-metadata`, `add-page-numbers`, `add-watermark`

---

## MCP security model

The MCP server is the most exposed surface, so it's locked down:

- **Path allowlist.** `register_file` only accepts paths under `PAPERLOOM_MCP_ALLOWED_DIRS` (default: `~/Documents`, `~/Downloads`, `~/Desktop`). Symlinks resolved before the check — a symlink under an allowed dir pointing outside is rejected.
- **No raw paths in tool args.** All processing goes through opaque `file_id` tokens validated as 32-char hex. The LLM cannot ask paperloom to operate on `/etc/passwd` or `~/.ssh/id_rsa`, even if a malicious document tries to inject that instruction.
- **stdio only.** No HTTP listener, no auth needed: same trust boundary as the user that launched the MCP client.
- **Same size limits as the web upload.** `max_file_size_mb` (50) and `max_pdf_pages` (200).

---

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

- **Frontend** — Next.js 16 App Router, TypeScript, shadcn/ui, Tailwind v4, `next-intl`, `next-themes`.
- **Backend** — FastAPI on Python 3.11+, `uv` for deps, SSE streams for OCR + chain progress.
- **Models** — Ollama (`glm-ocr:latest`) + OpenAI Privacy Filter (CPU by default).

Full design: [`doc/architecture.md`](doc/architecture.md).

---

## Development

```bash
pnpm dev             # web + api with reload
pnpm lint:web        # ESLint flat config
pnpm build:web       # production web build
pnpm test:api        # backend pytest
```

The repo is a pnpm workspace: web app in `web/`, FastAPI backend (and the Python library) in `backend/`, shared docs in `doc/`.

---

## Documentation

- [`doc/architecture.md`](doc/architecture.md) — inter-process contract.
- [`doc/distribution.md`](doc/distribution.md) — install paths and packaging strategy.
- [`doc/privacy.md`](doc/privacy.md) — four-layer privacy model and runtime mode.
- [`doc/cookbook/`](doc/cookbook/) — copy-paste recipes:
  [LLM Wiki](doc/cookbook/01-llm-wiki-ingest.md),
  [RAG ingest](doc/cookbook/02-rag-ingest.md),
  [Agno](doc/cookbook/03-agno-agent.md),
  [Claude Desktop](doc/cookbook/04-claude-desktop.md),
  [scan→clean PDF](doc/cookbook/05-scan-clean-pdf.md),
  [merge invoices](doc/cookbook/06-batch-merge-invoices.md),
  [redact medical notes](doc/cookbook/07-redact-medical.md),
  [LangChain tool](doc/cookbook/08-langchain-tool.md),
  [remote Agno + cloud OCR](doc/cookbook/09-remote-agno-cloud-ocr.md),
  [batch phone photos → wiki](doc/cookbook/10-photo-batch-to-wiki.md).
- [`doc/benchmarks.md`](doc/benchmarks.md) — paperloom vs. marker vs. docling on a fixed corpus.
- [`doc/roadmap.md`](doc/roadmap.md) — planned work (more OCR providers, audit log, MCP resources/prompts).
- [`doc/rules/`](doc/rules/) — coding/UI conventions:
  [`anonymizer`](doc/rules/anonymizer.md),
  [`a11y`](doc/rules/a11y.md),
  [`i18n`](doc/rules/i18n.md),
  [`shadcn`](doc/rules/shadcn.md).

## License

[MIT](LICENSE). Optional dependency on [OpenAI Privacy Filter](https://github.com/openai/privacy-filter) (Apache 2.0) when the anonymizer extra is installed.
