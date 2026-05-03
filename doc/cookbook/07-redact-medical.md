# Redact PII from a folder of Markdown notes

> **⚠ Use with care for sensitive data.** PII anonymization is statistical, not guaranteed. OPF catches most names, emails, phone numbers, IDs — but it can miss entities, especially in non-English text or unusual formats. Re-read every redacted file before sharing it. paperloom is **not a substitute for a compliance review** (HIPAA, GDPR, etc.). See the [Disclaimer](../../README.md#disclaimer) for the full caveat.

Run OPF over every `.md` under `./notes/`. Output goes to `./redacted/`. **First call auto-installs OPF** (~250 MB Python deps + ~4 GB checkpoint). Subsequent calls are fast.

```python
from pathlib import Path
from paperloom import anonymize, PaperloomError

NOTES = Path("notes")
OUT = Path("redacted"); OUT.mkdir(exist_ok=True)

for md in sorted(NOTES.glob("*.md")):
    try:
        clean = anonymize(md, preset="recall")  # bias toward redacting more
    except PaperloomError as exc:
        print(f"skip {md.name}: {exc.code}")
        continue
    (OUT / md.name).write_text(clean, encoding="utf-8")
    print(f"redacted {md.name}")
```

## Tips

- **Preset choice:**
  - `balanced` — default; good recall, low false positives.
  - `recall` — safer for non-English or noisy text; expect more false redactions.
  - `precision` — bias toward fewer false positives. Use only after you've validated recall on a sample.
- The redaction format (`<account_number>`, `<private_email>`, …) is verbatim from OPF — don't rename.
- A JSON report alongside each output describes every span that was redacted (category, offsets). Useful for audits.
- To disable auto-install (keep the explicit two-step flow), set `PAPERLOOM_AUTO_INSTALL_OPF=0`.
