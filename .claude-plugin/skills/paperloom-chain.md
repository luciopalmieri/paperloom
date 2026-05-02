---
name: paperloom-chain
description: Compose multiple paperloom tools into a pipeline (e.g. pdf-to-images → ocr-to-markdown → anonymize → markdown-to-pdf). Use when the user describes a multi-step document workflow rather than a single transform. Each step's output feeds the next.
---

# paperloom-chain

Use the `paperloom` MCP server's `run_tool` (or typed wrappers) to compose a pipeline. There is no single "chain" tool over MCP — chain manually by passing outputs as inputs to the next step.

## When to use

- User describes 2+ transforms: "scan, OCR, redact, then re-merge to PDF", "split this PDF into pages, OCR each, output a single markdown".
- User mentions "pipeline", "workflow", "automate this".

## Recipe templates

**Scan → searchable + redacted PDF**
1. `register_file(scanned.pdf)` → `fid_pdf`
2. `ocr_to_markdown(fid_pdf)` → `inline_text` or `out.md`
3. `register_file(out.md)` → `fid_md`
4. `anonymize(fid_md, preset="balanced")` → `redacted.md`
5. `register_file(redacted.md)` → `fid_red`
6. `markdown_to_pdf(fid_red)` → final PDF

**Multi-PDF merge with watermark**
1. `register_file(...)` for each → `[fid1, fid2, ...]`
2. `merge_pdfs([fid1, fid2, ...])` → `merged.pdf`
3. `register_file(merged.pdf)` → `fid_merged`
4. `add_watermark(fid_merged, text="CONFIDENTIAL")` → `final.pdf`

**Image set → single PDF**
1. Register every image → `[fid1, ...]`
2. `images_to_pdf([fid1, ...])` → PDF

## Tips

- Use `list_paperloom_tools()` to discover slugs and param hints if you're unsure.
- Surface `node.progress` and `node.end` events to the user — chains can be slow.
- If a step errors with `recoverable: false`, stop the chain and surface the code.
