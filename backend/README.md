# paperloom

> **Local-first document toolkit. Streaming OCR + PII anonymizer + 19 chainable tools. MCP-native.**

`paperloom` is the Python library and MCP server behind [paperloom](https://github.com/luciopalmieri/paperloom) — a local-first web app for OCR, PDF/Markdown/HTML transforms, and PII redaction. Every tool runs on your machine. No cloud round-trips, no telemetry.

## Why paperloom (vs. marker, docling, MinerU)

paperloom rides a **state-of-the-art OCR model** — GLM-OCR scores **94.62 on OmniDocBench V1.5 (rank #1)** and is SOTA on formula / table recognition and information extraction. paperloom commits to **tracking the current SOTA**: when a stronger open model ships, the Ollama pin gets updated.

paperloom's value-add is **agent orchestration around the model**:

- **19 chainable tools** — `pdf-to-images → ocr → anonymize → markdown-to-pdf` in one call.
- **MCP server with security model** — `register_file` + path allowlist + `file_id` tokens. Drop-in for Claude Desktop, Claude Code, Cursor, Cline, Agno.
- **Built-in PII redaction** — OPF model, 8 entity categories, verbatim.
- **Streaming SSE** — Markdown emits page-by-page as the OCR model writes it.
- **One Ollama dep** — reuses any GLM-OCR model you already pulled. No multi-GB model zoo download.

## Install

```bash
# Library + CLI + MCP server (no PDF rendering, no anonymizer):
uvx paperloom doctor

# Full toolkit:
uvx --with 'paperloom[all]' paperloom doctor

# Or pip:
pip install paperloom            # core
pip install 'paperloom[pdf]'     # + WeasyPrint (markdown→pdf, html→pdf)
pip install 'paperloom[anonymizer]'  # + OPF (anonymize tool)
pip install 'paperloom[all]'     # everything
```

`pdf` extra needs native libs (`brew install pango` on macOS). `anonymizer` extra downloads a ~4 GB model checkpoint to `~/.opf/privacy_filter` on first use.

## Use as a library

```python
from paperloom import ocr_to_markdown, anonymize, Chain

# One-shot OCR
md = ocr_to_markdown("scan.pdf")

# Redact PII
clean = anonymize(md, preset="balanced")

# Compose tools
result = Chain([
    ("pdf-to-images", {"dpi": 200}),
    ("ocr-to-markdown", {}),
    ("anonymize", {"preset": "recall"}),
]).run(["doc.pdf"])
```

## Use as an MCP server

```bash
uvx paperloom-mcp
```

Wire into Claude Desktop:

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

## Use from the CLI

```bash
paperloom ocr scan.pdf -o out.md
paperloom anonymize out.md --preset recall
paperloom chain --steps pdf-to-images,ocr-to-markdown,anonymize doc.pdf
paperloom doctor      # check Ollama, glm-ocr, OPF, allowlist
```

## Requirements

- **Ollama** with `glm-ocr:latest` pulled (`ollama pull glm-ocr:latest`).
- Python 3.11+.
- **Hardware:** GLM-OCR is RAM-bound. Recommended: Apple Silicon M-series Pro with ≥ 24 GB unified RAM, or x86 with 24 GB+ GPU VRAM. Minimum 16 GB. **Below 16 GB the OS can freeze hard enough to require a reboot — don't.**
- (Optional) `pango` for the `pdf` extra; ~4 GB checkpoint for the `anonymizer` extra (auto-downloaded on first call).

## License

MIT. Depends on [OpenAI Privacy Filter](https://github.com/openai/privacy-filter) (Apache 2.0) when the anonymizer extra is installed.
