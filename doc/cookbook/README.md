# Cookbook

Copy-paste recipes. Each one is short and assumes you've already run `ollama pull glm-ocr:latest` (or set up a cloud OCR provider — see recipe 09).

| # | Recipe | What it does |
|---|---|---|
| 01 | [`01-llm-wiki-ingest.md`](01-llm-wiki-ingest.md) | Ingest documents into a personal Markdown wiki (Karpathy's pattern). Three paths: MCP, library, CLI — with pros/cons. |
| 02 | [`02-rag-ingest.md`](02-rag-ingest.md) | OCR a folder of PDFs into one Markdown file per source for a RAG pipeline. |
| 03 | [`03-agno-agent.md`](03-agno-agent.md) | Use paperloom as a tool from an Agno agent (MCP vs. library). |
| 04 | [`04-claude-desktop.md`](04-claude-desktop.md) | Wire paperloom into Claude Desktop and drive it from chat. |
| 05 | [`05-scan-clean-pdf.md`](05-scan-clean-pdf.md) | Scan → OCR → redact → re-render PDF in one chain. |
| 06 | [`06-batch-merge-invoices.md`](06-batch-merge-invoices.md) | Merge a glob of invoice PDFs, watermark, strip metadata. |
| 07 | [`07-redact-medical.md`](07-redact-medical.md) | Batch-redact PII from a folder of `.md` notes via OPF. |
| 08 | [`08-langchain-tool.md`](08-langchain-tool.md) | Wrap paperloom calls as LangChain tools. |
| 09 | [`09-remote-agno-cloud-ocr.md`](09-remote-agno-cloud-ocr.md) | Remote Agno server with Mistral cloud OCR. Privacy implications. |
| 10 | [`10-photo-batch-to-wiki.md`](10-photo-batch-to-wiki.md) | Batch-ingest 1000+ phone photos / scans into the LLM Wiki. Resumable, streaming, privacy-audited. |
