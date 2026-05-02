---
name: paperloom-anonymize
description: Redact PII from a local Markdown/text file via paperloom (offline OPF model). Pass the file path as argument; optionally append --preset balanced|recall|precision.
---

Use the `paperloom` MCP server: `register_file($1)` then `anonymize(file_id, preset=...)`. Show the user the path of the redacted file and the categories detected (from the redactions report). If OPF is being installed for the first time, surface the `installing_opf` progress so the user understands the pause.
