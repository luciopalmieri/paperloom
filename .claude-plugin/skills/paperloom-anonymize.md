---
name: paperloom-anonymize
description: Redact PII (names, addresses, emails, phones, dates, URLs, account numbers, secrets) from Markdown or plain text using paperloom's local OPF model. Use when the user asks to anonymize, redact, scrub, sanitize, or remove personal data from a text/markdown file. Runs offline — text never leaves the machine.
---

# paperloom-anonymize

Use the `paperloom` MCP server to redact PII from a `.md`/`.txt` file via the local OPF model.

## When to use

- User says "anonymize", "redact", "scrub PII", "remove names from this", "make this safe to share".
- Input is text or markdown. For PDFs: chain `ocr-to-markdown` (or `pdf-to-text`) → `anonymize`.
- The user is on a privacy-sensitive workflow (medical, legal, HR, customer support). Default to anonymization rather than direct LLM exposure.

## How

1. `register_file(path)` for an existing `.md` / `.txt` file. (For PDFs: register, OCR first, then chain to anonymize.)
2. `anonymize(file_id, preset="balanced")`. Presets:
   - `balanced` — default; good recall + acceptable false positives.
   - `recall` — bias toward redacting more (safer for non-English or noisy text).
   - `precision` — bias toward fewer false positives (cleaner output).
3. Output is in `outputs` — there's `<name>-redacted.md` and `redactions.report.json`. Show both to the user.

## Notes

- **First run installs OPF automatically** (~250 MB Python deps + ~4 GB model checkpoint). Surface the `installing_opf` progress event so the user understands the wait. Disable via env `PAPERLOOM_AUTO_INSTALL_OPF=0`.
- Categories are fixed: `account_number`, `private_address`, `private_email`, `private_person`, `private_phone`, `private_url`, `private_date`, `secret`. Don't promise additional ones.
- For non-English text, OPF accuracy drops. Suggest `preset="recall"` and a manual review pass.
