---
name: paperloom-ocr
description: OCR a local PDF or image to Markdown using paperloom's local GLM-OCR pipeline. Use when the user wants to extract text from scanned PDFs, phone photos, or any image, with structure preserved (headings, tables, lists). Output is GitHub-flavored Markdown emitted page by page.
---

# paperloom-ocr

Use the `paperloom` MCP server to OCR a local file to Markdown. Everything runs on the user's machine — no cloud round-trips.

## When to use

- User says "OCR this PDF", "extract text from this scan", "convert this image to text/markdown".
- User mentions a phone photo, scanned document, screenshot of text, or PDF without an embedded text layer.
- Avoid for digitally generated PDFs that already have a text layer — `paperloom_pdf_to_text` (no OCR) is faster.

## How

1. Call `register_file(path)` with the absolute path. Source must live under `PAPERLOOM_MCP_ALLOWED_DIRS` (default: `~/Documents`, `~/Downloads`, `~/Desktop`).
2. Take the returned `file_id` and call `ocr_to_markdown(file_id, pages=..., include_images=False, image_strategy="auto")`.
3. Read the inlined `inline_text` (small results) or open the path in `outputs[0]`.

## Tips

- `pages="1,3-5"` runs OCR only on those pages. Big perf win on long PDFs.
- `image_strategy="objects"` adds figure crops; "llm" lets GLM caption them. Default `auto` picks heuristically.
- Errors come in-band (`{"error": {"code": ...}}`) — surface the code to the user instead of retrying blindly.
- If the result mentions `ollama_unreachable`, suggest `ollama serve` and `ollama pull glm-ocr:latest`.
