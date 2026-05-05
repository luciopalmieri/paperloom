# Paperloom

> **Local-first document toolkit. Agent-native. Your files never leave your machine by default.**

**Paperloom** pairs a streaming OCR pipeline (GLM-OCR via [Ollama](https://ollama.ai)) with a chainable suite of PDF / Markdown / HTML / image tools and a built-in PII anonymizer. It ships three surfaces from the same code: a Python library, a CLI, and an MCP server — plus a Next.js web app on top.

---

## Why paperloom

paperloom's edge is **agent orchestration with privacy primitives**, on top of a **state-of-the-art OCR model**:

> **Model choice — GLM-OCR.** Scores **94.62 on OmniDocBench V1.5 (rank #1)** and is SOTA on formula / table recognition and information extraction. paperloom commits to **tracking the current SOTA** — when a stronger open model ships, the Ollama pin gets updated and the older one moves to an opt-in setting.

What paperloom adds, on top of the model:

- **19 chainable PDF / Markdown / HTML / image tools** (split, merge, watermark, rotate, redact, OCR, …) composable in one streaming pipeline.
- **Built-in PII anonymizer** (OpenAI Privacy Filter) inline in the same chain — no second pass, no external service.
- **MCP server with a security model** — directory allowlist + opaque `file_id` references so an agent can't read arbitrary paths.
- **Streaming SSE, page-by-page.** Mid-run results visible while the tail still runs; resumable batch.
- **Three surfaces from one codebase** — Python library, CLI, MCP server — plus a Next.js web app.
- **One Ollama model dependency**, not a model zoo.

**Companion projects, not competitors.** Tools like [`marker`](https://github.com/datalab-to/marker), [`docling`](https://github.com/docling-project/docling), and [`MinerU`](https://github.com/opendatalab/mineru) focus on the model layer and are excellent there. paperloom doesn't try to out-research them — it tracks the SOTA model and invests in orchestration, privacy primitives, and developer ergonomics. If raw model quality on dense scientific PDFs is the only axis you care about, run [our benchmarks](./doc/benchmarks.md) on your corpus and pick what wins for you.

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
| **Use as MCP server (Claude Desktop, Cursor, Cline, Agno)** | `uvx --from paperloom paperloom-mcp` | stdio MCP server with all 19 tools |
| **Use as Python library / CLI in scripts** | `pip install paperloom` (or `uvx paperloom doctor`) | `from paperloom import ocr_to_markdown, ...` + `paperloom` CLI |
| **Run the web app + dev** | `git clone … && pnpm install && pnpm dev` | Next.js UI on `localhost:3000`, FastAPI on `:8000` |

All three share the same backend code. See [`doc/distribution.md`](doc/distribution.md) for full details.

> **Promo video?** A self-contained Remotion project lives in [`video-promo/`](video-promo/) for rendering a 15-second demo (used in talks and the README hero). Independent install, deletable without affecting the main project. See [`video-promo/README.md`](video-promo/README.md).

---

## Quick start

### As an agent tool (MCP)

```bash
ollama pull glm-ocr:latest      # one-time, ~5 GB
```

Wire `uvx --from paperloom paperloom-mcp` into your MCP client. For Claude Desktop, edit
`~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "paperloom": {
      "command": "uvx",
      "args": ["--from", "paperloom", "paperloom-mcp"],
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
pip install 'paperloom[all]'     # everything published on PyPI
```

The OPF anonymizer is **not** a PyPI extra — it's distributed as a git repo. paperloom auto-installs it on the first `anonymize` call (~250 MB Python deps + ~4 GB checkpoint). Disable the auto-installer with `PAPERLOOM_AUTO_INSTALL_OPF=0` and run it yourself:

```bash
uv pip install 'opf @ git+https://github.com/openai/privacy-filter@main'
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
- [`doc/release-checklist.md`](doc/release-checklist.md) — pre-publish runbook (Tier 1 automatable / Tier 2 manual / Tier 3 TestPyPI).
- [`doc/rules/`](doc/rules/) — coding/UI conventions:
  [`anonymizer`](doc/rules/anonymizer.md),
  [`a11y`](doc/rules/a11y.md),
  [`i18n`](doc/rules/i18n.md),
  [`shadcn`](doc/rules/shadcn.md).

## Disclaimer

paperloom is provided **as-is, with no warranty**. A few things that need saying in plain language before the LICENSE text covers them legally:

- **OCR output may contain errors.** Vision models misread digits, drop columns, hallucinate text on noisy scans. For legal, medical, financial, or regulatory decisions, treat paperloom output as a draft and have a human verify against the source.
- **PII anonymization is statistical, not a guarantee.** OpenAI Privacy Filter catches most names, emails, phone numbers, IDs, but it can miss entities — especially in non-English text or unusual formats. Re-read every redacted file before sharing it. paperloom is not a substitute for a compliance review.
- **Privacy depends on your configuration.** In default `local` mode, files never leave your machine. With `OCR_PROVIDER=mistral` (or any future cloud provider), document bytes are sent to that provider. When paperloom runs as an MCP server inside a cloud-LLM client (Claude Desktop, ChatGPT, Cursor, etc.), tool I/O traverses that client's API. The privacy badge in the web UI and the MCP banner on stderr always show the active mode — read them before processing sensitive material.
- **You are responsible for the documents you process.** paperloom does not verify that you have the right to OCR or redact a given file. Don't run it on material you don't own or have explicit permission to use.

By using paperloom you accept these limits. Liability is disclaimed in the [LICENSE](LICENSE) — this section just makes it readable.

## License

[MIT](LICENSE). Optional dependency on [OpenAI Privacy Filter](https://github.com/openai/privacy-filter) (Apache 2.0) when the anonymizer extra is installed.
