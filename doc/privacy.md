# Privacy model

paperloom is **local-first by design**. This document explains exactly what that means — and the cases where data does leave your machine, so you can make informed decisions before pointing paperloom at sensitive material.

## The four-layer model

We split privacy into four independent layers. Each one is either **local** (computation on your machine) or **cloud** (bytes traverse a third party).

| # | Layer | What it does | Default | Override |
|---|---|---|---|---|
| 1 | **OCR** | Text recognition from PDFs and images | Ollama (`glm-ocr`) — local | `OCR_PROVIDER=mistral` (cloud) |
| 2 | **Anonymizer** | PII detection and redaction | OpenAI Privacy Filter — local | none (no cloud variant exists) |
| 3 | **Transport** | How paperloom receives requests | stdio (MCP) or `localhost` (HTTP) | exposing FastAPI on a public network |
| 4 | **Driving LLM** | The model that decides which tools to call | **outside paperloom's boundary** | depends on the calling client |

paperloom controls layers 1–3 directly. Layer 4 is **the calling agent's responsibility** — paperloom cannot see what model your MCP client uses.

## What "privacy mode" means

paperloom exposes a runtime privacy mode based on layers 1–3:

- **`local`** — every paperloom component (OCR, anonymizer) is local. Bytes you submit to paperloom never leave your machine via paperloom itself.
- **`hybrid`** — at least one paperloom component is cloud (typically OCR). Inputs to that component leave the machine.
- **`cloud`** — every paperloom component is cloud. Rare in practice (the anonymizer has no cloud variant).

The mode is computed at runtime. You can see it via:

- **Web UI** — badge in the header. Green = local, amber = hybrid, red = cloud. Click for details and caveats.
- **CLI** — `paperloom status` (machine-readable: `paperloom status --json`).
- **Doctor** — `paperloom doctor` includes the mode at the top of its report.
- **MCP banner** — printed to stderr when the MCP server starts.
- **MCP tool** — agents can call `paperloom_status()` and inspect the response.
- **HTTP** — `GET /api/status`.

## The MCP / cloud-LLM caveat (always present)

When you use paperloom from an MCP client whose driving LLM is in the cloud — Claude Desktop, Cursor, ChatGPT desktop, Gemini, etc. — your data flow is:

```
You → MCP Client → [cloud LLM provider's API] → MCP Client → paperloom (local)
                                                                    ↓
You ← MCP Client ← [cloud LLM provider's API] ← MCP Client ← paperloom (local)
```

Both arrows pass through the LLM provider's API as the agent reasons about your request. Concretely:

- The **prompt you typed** is sent to the LLM provider.
- The **decision to call paperloom** happens inside the LLM provider.
- The **result of paperloom's tool call** is sent back to the LLM provider as a `tool_result` block.
- The **LLM's response that summarizes the result** is generated in the cloud and sent back to you.

paperloom's OCR and anonymization run locally — but the OCR'd text and the redacted text both transit the LLM provider when used in this flow.

**This is a property of cloud-hosted MCP clients, not of paperloom.** If you want a fully local pipeline:

- Use the Python library or CLI directly (skip MCP entirely).
- Use a local-LLM MCP client (e.g. an MCP-aware Ollama wrapper, or `aider` configured against a local model).
- Run paperloom as a FastAPI service and call its REST endpoints from your own local-only orchestration code.

## Layer-by-layer detail

### Layer 1: OCR

paperloom ships two OCR backends today. More may follow — see [`roadmap.md`](roadmap.md).

**Ollama (default, local).** GLM-OCR runs on your machine via Ollama on port 11434. The model is downloaded once (~5 GB) into `~/.ollama/models/`. No network traffic during OCR.

**Mistral (`OCR_PROVIDER=mistral`, cloud).** Uses Mistral's `/v1/ocr` API. The image bytes (per-page mode) or the full PDF (batch mode, default) are sent to Mistral over HTTPS. Trade-offs:

| Mode (env: `MISTRAL_OCR_MODE`) | Cost | Streaming UX | Notes |
|---|---|---|---|
| `batch` (default) | One billable document per PDF | All pages arrive in one response | Cheaper, no per-page progress |
| `per_page` | One billable document per page | Per-page chunks (matches Ollama UX) | More expensive, smoother UI |

Pick `batch` for most workloads. Pick `per_page` if you specifically need page-level streaming (long PDFs in interactive UI) and the cost tradeoff is acceptable.

### Layer 2: Anonymizer

The anonymizer (`anonymize` tool) uses [OpenAI Privacy Filter](https://github.com/openai/privacy-filter), an open-weights model. It runs on your machine — CPU by default, GPU via `OPF_DEVICE=cuda`. The ~4 GB checkpoint downloads to `~/.opf/privacy_filter` on first use.

**There is no cloud anonymizer in paperloom**, and we don't plan to add one. PII detection is exactly the kind of work where you don't want the input crossing a network boundary.

### Layer 3: Transport

paperloom can be reached three ways:

- **stdio MCP** — `paperloom-mcp` reads JSON-RPC frames on stdin/stdout. No network listener. Used by Claude Desktop, Cursor, Cline.
- **HTTP localhost** — FastAPI on `127.0.0.1:8000`. Used by the web UI and any local script.
- **HTTP public** — same FastAPI, but you bind it to a non-loopback address. **Considered cloud for the purpose of the privacy mode** because at this point the threat model includes anyone who can reach that interface. paperloom does not ship authentication on the REST API.

If you want to expose paperloom to a remote agent, prefer placing it behind a tunnel, an SSH port-forward, or a private-network proxy with auth — not directly on a public IP.

### Layer 4: Driving LLM

The model that calls paperloom's tools is, by definition, outside paperloom. paperloom can't introspect or control it. Examples:

- **Claude Desktop** → Anthropic API (cloud).
- **Cursor** → varies; whatever model the user configured.
- **`aider` with `--model ollama/llama3`** → local.
- **A custom Python script using `paperloom` as a library** → no LLM involved at all.

The privacy mode `caveats` list always reminds you of this layer. The web UI badge expands the caveat on click.

## FAQ

**Q. Am I local when I use Claude Desktop?**
A. Partially. paperloom processes your bytes locally (layers 1–3 are local in default config). But the agent driving Claude Desktop is Anthropic's API, so your prompts and the OCR/anonymized output flow through Anthropic during the conversation. If full E2E locality is the requirement, use a local-LLM MCP client or skip MCP entirely.

**Q. Does Mistral see my PDFs in Mistral mode?**
A. Yes. In `batch` mode the entire PDF is sent. In `per_page` mode each rendered page image is sent. Both are stored briefly per Mistral's retention policy — check Mistral's terms.

**Q. Can I block all cloud egress at the OS level?**
A. Yes, and we recommend it for high-sensitivity workflows. paperloom in default config does not need any outbound traffic except localhost (Ollama on 11434). Block everything else with your firewall and the only failure mode is "you tried to set `OCR_PROVIDER=mistral` and it errored at the request" — which is the desired behavior.

**Q. Does the auto-installer for OPF leak any data?**
A. The installer fetches code and weights from GitHub / Hugging Face on first use. After install, OPF runs offline. If your environment forbids that one-time fetch, install OPF manually via `uv pip install 'opf @ git+https://github.com/openai/privacy-filter@main'` from a vetted mirror, then the runtime is fully offline. Set `PAPERLOOM_AUTO_INSTALL_OPF=0` to suppress the auto-installer.

**Q. Is there logging? Telemetry?**
A. No telemetry. paperloom emits structured logs via Python's `logging` to stderr; nothing leaves the machine unless your OS-level log shipper is configured to forward stderr.

## Verifying yourself

The honest test: run `paperloom doctor` and inspect what it reports. Pair it with a packet capture (`tcpdump`, Little Snitch, etc.) on a clean machine while you OCR a sample PDF in default mode. The only flow you should see is paperloom ↔ Ollama on `127.0.0.1:11434`.

If you spot anything else, file an issue — that would be a bug.
