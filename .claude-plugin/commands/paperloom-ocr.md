---
name: paperloom-ocr
description: OCR a local PDF or image to Markdown via paperloom (local GLM-OCR through Ollama). Pass the file path as argument.
---

Use the `paperloom` MCP server: `register_file($1)` then `ocr_to_markdown(file_id)`. Show the resulting Markdown to the user. If the file is large, save it to a `.md` next to the source and report the path.
