# Wrap paperloom as LangChain tools

LangChain's `@tool` decorator is the smallest path. Same pattern works for LlamaIndex's `FunctionTool`.

```python
from langchain_core.tools import tool
from paperloom import ocr_to_markdown, anonymize, Chain

@tool
def ocr_pdf(path: str) -> str:
    """OCR a PDF or image to Markdown via local Ollama. Returns the Markdown."""
    return ocr_to_markdown(path)

@tool
def redact_pii(text: str, preset: str = "balanced") -> str:
    """Redact PII from markdown/text. preset is balanced, recall, or precision."""
    return anonymize(text, preset=preset)

@tool
def scan_to_clean_pdf(input_pdf: str) -> str:
    """Scan → OCR → redact → re-render PDF. Returns the path of the final PDF."""
    result = Chain([
        ("pdf-to-images", {"dpi": 200}),
        ("ocr-to-markdown", {}),
        ("anonymize", {"preset": "balanced"}),
        ("markdown-to-pdf", {}),
    ]).run([input_pdf])
    final = next(p for p in (result["root"] / "out").iterdir() if p.suffix == ".pdf")
    return str(final)

# Wire into any agent runtime that consumes a list of tools.
tools = [ocr_pdf, redact_pii, scan_to_clean_pdf]
```

## Notes

- LangChain agents pass arbitrary strings as `path` — paperloom does not enforce an allowlist when called as a library. If your agent receives untrusted input, prefer the MCP server path (Recipe 06).
- `ocr_pdf` reads the entire Markdown into the chat; for long PDFs return a path instead and let the agent open it in chunks.
