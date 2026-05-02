# Cookbook

Copy-paste recipes. Each one is short and assumes you've already run `ollama pull glm-ocr:latest`.

| Recipe | What it does |
|---|---|
| [`01-rag-ingest.md`](01-rag-ingest.md) | OCR a PDF directory and emit one Markdown file per source for a RAG pipeline |
| [`02-redact-medical.md`](02-redact-medical.md) | Redact PII from a folder of `.md` notes with the OPF model |
| [`03-scan-clean-pdf.md`](03-scan-clean-pdf.md) | Scan → OCR → redact → re-render PDF in one chain |
| [`04-batch-merge-invoices.md`](04-batch-merge-invoices.md) | Merge a glob of invoice PDFs, watermark, strip metadata |
| [`05-claude-desktop.md`](05-claude-desktop.md) | Wire paperloom into Claude Desktop and drive it from chat |
| [`06-agno-agent.md`](06-agno-agent.md) | Use paperloom as a tool from an Agno agent over MCP |
| [`07-langchain-tool.md`](07-langchain-tool.md) | Wrap paperloom calls as LangChain tools |
