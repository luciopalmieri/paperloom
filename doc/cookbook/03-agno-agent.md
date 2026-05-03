# Use paperloom from an Agno agent

[Agno](https://github.com/agno-agi/agno) supports MCP tools natively. Two paths:

## Path 1 — MCP (stdio)

Best for "use paperloom as one of my agent's tools" with no extra setup.

```python
from agno.agent import Agent
from agno.tools.mcp import MCPTools

paperloom = MCPTools(
    command="uvx",
    args=["paperloom-mcp"],
    env={
        "PAPERLOOM_MCP_ALLOWED_DIRS": "/Users/you/Documents,/Users/you/Downloads",
    },
)

agent = Agent(tools=[paperloom])
agent.print_response("OCR the file at ~/Downloads/scan.pdf and summarize the contract terms.")
```

The agent gets `register_file`, `register_inline`, `ocr_to_markdown`, `anonymize`, `run_tool`, etc. as native tool calls.

## Path 2 — direct Python library

Best when you want fully synchronous tool calls without spawning a subprocess. No `register_file` indirection — the agent passes paths directly.

```python
from agno.agent import Agent
from agno.tools import tool
from paperloom import ocr_to_markdown, anonymize

@tool
def paperloom_ocr(path: str) -> str:
    """OCR a local PDF or image and return Markdown."""
    return ocr_to_markdown(path)

@tool
def paperloom_anonymize(text: str, preset: str = "balanced") -> str:
    """Redact PII from markdown/text. preset is balanced|recall|precision."""
    return anonymize(text, preset=preset)

agent = Agent(tools=[paperloom_ocr, paperloom_anonymize])
agent.print_response("Read /tmp/case.pdf, redact PII, then summarize.")
```

## When to pick which

| Need | Path |
|---|---|
| Multiple agents / clients want paperloom | MCP — one server, many consumers |
| Hard isolation (paperloom in its own venv) | MCP — `uvx` runs in a separate process |
| Lowest latency, no subprocess | Library |
| You want the security allowlist enforced | MCP — library trusts caller-provided paths |
| Quick prototype | Library |

For production agents handling untrusted inputs, prefer **MCP**. The `register_file` + allowlist + `file_id` model is the whole point — direct library calls bypass it.
