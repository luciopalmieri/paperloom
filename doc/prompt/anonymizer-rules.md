# anonymizer-rules.md

Integration rules for the **Anonymize** tool. The detection engine is
[OpenAI Privacy Filter (OPF)](https://github.com/openai/privacy-filter),
**Apache 2.0**, used as a Python dependency in the FastAPI backend. Read
the OPF README before wiring this in. Do not re-implement detection.

## Runtime

- OPF is a Python package. Install in the backend venv:
  `uv pip install -e <path>` from a vendored clone, or
  `uv pip install opf` if/when published. Track exact source in
  `backend/pyproject.toml`.
- Model checkpoint downloads to `~/.opf/privacy_filter` on first run.
  Do not bundle weights in the repo. Document the first-run download
  in the README.
- Inference can run on CPU (`--device cpu`) or GPU. Default to CPU for
  predictability across user machines. Make device a backend env var:
  `OPF_DEVICE=cpu|cuda|mps`.

## Entity taxonomy (verbatim — do not extend, do not rename)

OPF's 8 categories:

1. `account_number`
2. `private_address`
3. `private_email`
4. `private_person`
5. `private_phone`
6. `private_url`
7. `private_date`
8. `secret`

Use these strings exactly in the redaction report and in API contracts.
Do not invent labels (e.g. `iban`, `fiscal_code`, `dob`) — they fall
under `account_number` / `private_person` / `private_date` / `secret`
depending on context. OPF decides; we surface what it returns.

## What OPF does NOT do

- **No face detection.** OPF is text-only token classification.
  v1 has no image face redaction. If the user wants it later, ship it as
  a separate AI tool with a separate library (e.g. `mediapipe`) — never
  silently extend OPF claims.
- **No structured-document layout reasoning.** OPF takes text in, gives
  spans back. For PDFs and images, run OCR first (the `ocr-to-markdown`
  tool), then run anonymize on the resulting text.

## Operating-point preset

- Default: balanced (OPF default).
- Expose two extra presets in the UI: `recall` (broader masking) and
  `precision` (narrower). Map to OPF's runtime sequence-decoding
  parameters. Pick the exact mapping in Phase 0 from the OPF README's
  "Operating-Point Calibration" section.
- Default IT documents: warn the user that OPF is English-primary;
  recall may drop. Suggest the `recall` preset for IT.

## Redaction token format

Replace each detected span with:

```
[REDACTED:{CATEGORY}:{N}]
```

- `CATEGORY` = uppercased OPF label (e.g. `PRIVATE_EMAIL`).
- `N` = 1-indexed counter, **per category, per document**. Resets per
  job, not per page.
- The token is opaque — do not encode the original value into it.

## Report schema (`redactions.report.json`)

Emitted on every anonymize run, even if zero spans detected.

```json
{
  "schema_version": "1",
  "job_id": "uuid",
  "input": { "filename": "...", "format": "pdf|md|txt" },
  "engine": { "name": "opf", "version": "<from package>", "preset": "balanced|recall|precision" },
  "stats": { "total_spans": 0, "by_category": { "private_email": 0, "...": 0 } },
  "redactions": [
    {
      "id": "PRIVATE_EMAIL:1",
      "category": "private_email",
      "page": 1,
      "offset_start": 142,
      "offset_end": 168,
      "original_hash": "sha256:...",
      "replacement": "[REDACTED:PRIVATE_EMAIL:1]"
    }
  ]
}
```

- `original_hash` = SHA-256 of the original span. Never the raw value.
- `page` is 1-indexed for paginated inputs (PDFs / OCR'd PDFs).
  For Markdown / plain text, `page` is `null`.
- `by_category` always lists all 8 categories with zero where absent.

## Privacy guarantees (must hold)

- **No network egress** from the anonymizer code path. Block by:
  no outbound HTTP client wired into the anonymizer module; backend
  process runs with restricted env. CI lint should flag any `httpx` /
  `requests` import inside `backend/anonymizer/`.
- **No raw values in logs.** Never log the original span. Log only the
  hash + category.
- **Temp files wiped on job completion** (success or failure). Job
  storage TTL covered by the `/tmp/pdf-ocr/<jobId>/` cleanup task.
- **Report contains hashes only** of original values (above).

## API surface (FastAPI)

- `POST /api/anonymize` — multipart input, returns `{ job_id }`.
- `GET /api/anonymize/{job_id}/events` — SSE stream of progress events:
  `{ type: "span", category, count }` per detected span,
  `{ type: "done", report_url, artifact_url }` on completion.
- `GET /api/anonymize/{job_id}/report` — the JSON report.
- `GET /api/anonymize/{job_id}/artifact` — the redacted file.

Full schemas: see [`architecture.md`](./architecture.md).

## UI rules (anonymizer page)

- Show OPF version + license (Apache 2.0) in the tool's footer.
- Show a non-EN warning banner when input language is detected as
  non-English.
- Render the report as a table grouped by category with counts; allow
  download of the raw JSON.
- Mark the tool with the AI badge (see
  [`shadcn-rules.md`](./shadcn-rules.md)).
- Never display original spans alongside their replacement in the UI by
  default — defeats the purpose. If a "what was redacted" preview is
  added, it must be opt-in and warn the user.
