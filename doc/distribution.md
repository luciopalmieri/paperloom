# Distribution

paperloom ships from a single repo as **three install surfaces**, each targeting a different audience. They share the same backend code under `backend/paperloom/`.

## Surfaces

| Surface | Audience | Install | Entry points |
|---|---|---|---|
| **PyPI library + CLI** | Python devs, data scientists, scripters | `pip install paperloom` | `paperloom` (CLI), `from paperloom import ...` (lib), `paperloom-mcp` (server script) |
| **Claude Code plugin** | Claude Code users | `/plugin marketplace add luciopalmieri/paperloom && /plugin install paperloom` | Slash commands (`/paperloom-ocr`, `/paperloom-anonymize`, `/paperloom-doctor`), skills, MCP server auto-wired |
| **Web app (clone + dev)** | Self-hosters, contributors, UI users | `git clone … && pnpm install:all && pnpm dev` | `localhost:3000` (Next.js), `localhost:8000` (FastAPI) |

## What's in each

### PyPI: `paperloom`

Single package. `paperloom` script + `paperloom-mcp` script land in `$VENV/bin/`. Optional extras keep the default install lean:

```
paperloom                  # core: OCR, PDF tools, MCP server  (~50 MB after deps)
paperloom[pdf]             # + WeasyPrint (markdown→pdf, html→pdf)
paperloom[anonymizer]      # + OPF (PII redaction)             (~250 MB Python deps + ~4 GB model on first use)
paperloom[all]             # everything
```

`paperloom[anonymizer]` is the heavyweight — pulled torch + transformers + a one-time 4 GB model checkpoint. The `anonymize` tool also auto-installs OPF on first call (configurable via `PAPERLOOM_AUTO_INSTALL_OPF=0`), so most users never need to choose the extra explicitly.

`paperloom[pdf]` needs native libs: `brew install pango` (macOS) or `apt install libpango-1.0-0 libpangoft2-1.0-0` (Linux).

### Claude Code plugin: `.claude-plugin/`

Thin manifest that wires `uvx paperloom-mcp` as the plugin's MCP server, plus three slash commands and three skills. Everything else is in PyPI — the plugin pulls it transitively via `uvx`.

```
.claude-plugin/
├── plugin.json            # manifest: MCP server + plugin meta
├── marketplace.json       # marketplace entry (for repo-as-marketplace)
├── skills/
│   ├── paperloom-ocr.md       # auto-matched when user asks to OCR
│   ├── paperloom-anonymize.md # auto-matched when user asks to redact PII
│   └── paperloom-chain.md     # auto-matched for multi-step workflows
└── commands/
    ├── paperloom-ocr.md       # /paperloom-ocr <path>
    ├── paperloom-anonymize.md # /paperloom-anonymize <path>
    └── paperloom-doctor.md    # /paperloom-doctor
```

### Repo: web UI + dev

Full monorepo. `pnpm install:all` runs `pnpm install` (web) and `cd backend && uv sync` (backend). `pnpm dev` boots both. Docker compose available for containerized runs (see `docker-compose.yml` + `docker-compose.dev.yml`).

## Why three surfaces, not one

| Constraint | Implication |
|---|---|
| Agent users want zero-clone | → `uvx paperloom-mcp` (no repo, no node) |
| Library users hate setup | → PyPI install (no repo, no node, no Ollama unless they OCR) |
| Web UI users want a real app | → Docker / pnpm dev |
| All three share the same Python | → one package source, `backend/paperloom/`, three deployment shapes |

The MCP server is the same Python module wrapped as a `[project.scripts]` entry. The CLI is the same library functions wrapped in `argparse`. The web app calls into the same FastAPI app. **No duplicated logic**, just three thin entry points.

## Versioning

| Component | Versioned by |
|---|---|
| `paperloom` PyPI | SemVer; `paperloom.__version__` is canonical |
| Claude Code plugin | Tracks `paperloom` PyPI version (no independent bumps) |
| Web app | Tracks repo tags |

Public API (covered by SemVer):

- `paperloom.ocr_to_markdown`
- `paperloom.anonymize`
- `paperloom.Chain`
- `paperloom.arun_chain`
- `paperloom.list_tools`
- `paperloom.PaperloomError`
- The MCP tool surface (`register_file`, `register_inline`, `run_tool`, typed wrappers, `list_paperloom_tools`)
- The CLI subcommands and flags

Anything else (`paperloom.tools.*`, `paperloom.chain`, `paperloom.jobs`, `paperloom.routers`, `paperloom.config`, `paperloom.main`) is internal — may change between minor versions.

## Releasing

1. Bump `version` in `backend/pyproject.toml` and `paperloom._api.__version__`.
2. Update plugin `version` in `.claude-plugin/plugin.json` to match.
3. Tag: `git tag v0.x.y && git push --tags`.
4. Build + publish: `cd backend && uv build && uv publish` (needs PyPI token).
5. The Claude Code plugin auto-resolves to the new version on next `uvx paperloom-mcp` invocation (uvx caches by version pin; users on `latest` get it automatically).
