# Remote Agno + cloud OCR (Mistral)

Scenario: an Agno agent runs on a remote server. The server has no GPU, so running Ollama locally is impractical. You want OCR delivered by a cloud provider — for example **Mistral Document AI** — while keeping the rest of paperloom's chain (anonymizer, PDF transforms, watermarking, …) on the same machine.

paperloom supports this since the `OCRBackend` provider abstraction. Set `OCR_PROVIDER=mistral` and the OCR layer flips to Mistral. Everything else stays local.

## Trade-offs you're accepting

paperloom flips into **`hybrid` privacy mode** the moment you enable a cloud OCR provider. Both the CLI banner and the web UI badge call this out. Specifically:

| Layer | What changes |
|---|---|
| OCR | PDF / image bytes leave your server, hit Mistral's API |
| Anonymizer | unchanged — still OPF, still local |
| Transport | unchanged — still localhost / stdio |
| Driving LLM | depends on Agno's configured model (often cloud) |

If both OCR and the driving LLM are cloud, you're effectively a routing layer. paperloom is still useful (anonymizer + chain), but the privacy model is closer to a cloud SaaS than to "local-first." Be honest with users about it.

## Set up the cloud provider

```bash
# Pick the OCR provider
export OCR_PROVIDER=mistral
export MISTRAL_API_KEY="sk-..."

# Cost vs UX trade-off:
# - "batch"    (default) — one Mistral API call per PDF. Cheaper. No streaming.
# - "per_page"           — one call per rendered page. Costlier. Streams page-by-page.
export MISTRAL_OCR_MODE=batch
```

Verify with `paperloom doctor`:

```
$ paperloom doctor
paperloom 0.1.0 — environment check

  Privacy mode: HYBRID
    - ocr: mistral [CLOUD] — mistral mistral-ocr-latest (batch mode) — cloud round-trip
    - anonymizer: opf [local] — OpenAI Privacy Filter, runs on CPU/GPU locally
    ! Cloud components active: ocr. Inputs to these components leave the machine.
    ! MCP transport: when the calling client runs on a cloud LLM provider …
```

## Wire Agno → paperloom (MCP, remote)

Two transport options:

### Option 1: paperloom-mcp on the same machine as Agno (simplest)

Run `paperloom-mcp` in the same VPS where Agno runs. Agno talks to it over stdio.

```python
from agno.agent import Agent
from agno.tools.mcp import MCPTools

paperloom = MCPTools(
    command="uvx",
    args=["paperloom-mcp"],
    env={
        "OCR_PROVIDER": "mistral",
        "MISTRAL_API_KEY": os.environ["MISTRAL_API_KEY"],
        "MISTRAL_OCR_MODE": "batch",
        "PAPERLOOM_MCP_ALLOWED_DIRS": "/var/data/inbox,/var/data/output",
    },
)

agent = Agent(tools=[paperloom])
agent.print_response("OCR the file at /var/data/inbox/contract.pdf, redact PII, save to /var/data/output/contract.clean.md.")
```

Agno's MCP integration handles the stdio framing. paperloom does the work locally on the same VPS, the OCR API call goes to Mistral.

### Option 2: paperloom backend as a REST service, Agno calls HTTP

If you want Agno on box A and paperloom on box B (e.g. paperloom on a beefier worker), expose paperloom's FastAPI to box A and skip MCP entirely:

```bash
# On box B (the paperloom host)
OCR_PROVIDER=mistral MISTRAL_API_KEY=sk-... \
  uv run uvicorn paperloom.main:app --host 0.0.0.0 --port 8000
```

> **Important:** binding to `0.0.0.0` exposes paperloom on the network. paperloom does not ship REST authentication. Put it behind an SSH tunnel, a private network, or a reverse proxy with auth. **Never** put a public-IP paperloom on the open internet — privacy mode will report it as cloud and the threat surface includes anyone who can reach the port.

On box A, write Agno tools that POST to `https://paperloom.private/api/files` and `/api/jobs`. The wire protocol is documented in [`doc/architecture.md`](../architecture.md).

## Fully cloud-OCR + local-anonymize chain (Mistral OCR → OPF redact)

A common production flow on a remote Agno server: OCR via Mistral (fast, no GPU) → anonymize via OPF (local, offline). Run as a single chain so paperloom emits a single zip artifact.

```python
import os
os.environ.setdefault("OCR_PROVIDER", "mistral")  # before importing paperloom

from paperloom import Chain

result = Chain([
    ("ocr-to-markdown", {}),
    ("anonymize", {"preset": "balanced"}),
]).run(["/var/data/inbox/medical-form.pdf"])

print(result["job_id"])
print(list((result["root"] / "out").iterdir()))
```

The OCR step calls Mistral. The anonymize step runs OPF locally. Privacy mode is `hybrid`. The redactions report (`redactions.report.json`) lives next to the output `.md` and is itself local-only.

## When paperloom is *not* the right answer

If your **whole** workflow is cloud — Mistral OCR, an OpenAI-driven Agno agent, no anonymization, no local PDF transforms — paperloom is mostly a routing layer. You'd be better served by:

- **[`mistralai`](https://pypi.org/project/mistralai/) directly** as an Agno tool — fewer moving parts.
- **[`marker-pdf`](https://github.com/datalab-to/marker)** for higher-quality cloud-augmented OCR on complex layouts.
- **[`docling`](https://github.com/docling-project/docling)** for IBM-style structured `DoclingDocument` extraction.

paperloom shines when you compose **OCR + anonymize + multi-step PDF workflows** in one chain — and especially when at least the anonymizer (or the whole pipeline by default) stays local. If your shape is just "PDF → markdown via cloud," there's nothing wrong with using a thinner tool.

## Recap

- `OCR_PROVIDER=mistral` switches OCR to Mistral, leaves everything else local.
- `MISTRAL_OCR_MODE=batch` (default) is cheaper. `=per_page` brings back streaming.
- Privacy mode flips to `hybrid` automatically — `paperloom status`, the web UI badge, and the MCP banner all surface this.
- **Don't** expose paperloom's FastAPI on a public IP without auth.
- For pure cloud OCR with no orchestration, consider `mistralai` directly — paperloom's value is the chain, not the OCR step.
