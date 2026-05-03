# Roadmap

Tracked future work. Not commitments — priorities shift with usage. PRs welcome on any item.

## Provider abstraction (in progress)

The `OCRBackend` protocol in `paperloom/ocr/backends/` lets paperloom swap OCR engines without changing tool code. Today: Ollama (local, default), Mistral (cloud), stub (testing).

Planned providers:

- **OpenAI vision** — `gpt-4o-mini` or successor. Useful when the user already has an OpenAI key.
- **Anthropic vision** — Claude (Sonnet/Opus) with image input. Useful for users on the Anthropic API.
- **Bedrock / Vertex** — managed wrappers for the above. Lower priority — the underlying providers are usually a saner first step.
- **AWS Textract** / **Google Document AI** / **Azure Document Intelligence** — enterprise OCR services with their own per-page pricing and security postures.

Each cloud provider follows the same checklist:

1. Implement `OCRBackend` (`stream_page`, optional `process_pdf_batch`).
2. Add settings in `paperloom/config.py` (API key, model, mode).
3. Document trade-offs in `doc/privacy.md`.
4. Add a fixture in `backend/tests/bench/fixtures/` so the new provider gets benchmarked alongside the others.
5. Update the provider list in `paperloom.ocr.backends.available_providers()` and the doctor command.

## Anonymizer alternatives

OPF is solid but English-biased. Future work:

- **Multilingual baseline** — evaluate Presidio, multilingual NER models, or a Mistral / OpenAI structured-output workflow as opt-in providers.
- **Custom redaction rules** — let the user supply a regex / dictionary list to extend OPF's categories without retraining.

Important constraint from `doc/rules/anonymizer.md`: any anonymizer backend must remain **offline** (no outbound HTTP) by default. Cloud anonymization is interesting but it's a separate product, not the same tool.

## Streaming for cloud OCR

Mistral's `/v1/ocr` is non-streaming. Today our cloud backend returns the full markdown in one shot (batch mode) or splits the PDF into pages and makes one call per page (per-page mode, costlier).

If Mistral or another provider ships a streaming OCR endpoint, expose it via a new optional `OCRBackend.stream_pdf` method so per-page chunks land as they're produced.

## Audit log

When the user is in `hybrid` or `cloud` mode, log every cloud egress (provider, page count, byte count, duration) to a local JSON-lines file. Useful for compliance review and for diffing local vs. cloud cost over time. Not enabled by default — opt-in via `PAPERLOOM_AUDIT_LOG=/path/to/audit.jsonl`.

## MCP enhancements

- **Resources, not just tools.** Currently paperloom exposes only MCP tools. Adding MCP `resources` lets the agent enumerate previously OCR'd documents in a session without re-registering them.
- **Prompts.** Pre-canned MCP prompts for "OCR + anonymize" and "PDF cleanup" so users can `/paperloom-anonymize` from any MCP-aware UI without typing the chain.
- **Notifications.** Surface anonymizer span counts as MCP notifications so the agent can react during a long-running chain.

## Library API stability

`paperloom.ocr_to_markdown`, `anonymize`, `Chain`, `arun_chain`, `list_tools`, `PaperloomError` — these are committed surfaces under SemVer (see `doc/distribution.md`).

Tighten the public-vs-private boundary by:

- Adding `__all__` to every internal module so accidental re-exports stop landing as part of the public API.
- A linting rule (or test) that fails CI when something imports from `paperloom.<internal_module>` outside paperloom itself.

## Tests + benchmarks

- **Real benchmark fixtures.** `backend/tests/bench/fixtures/` is empty. Drop in 10-20 license-clean PDFs across the categories listed in the bench README, populate `*.expected.md`, and run `python tests/bench/run.py --all` to publish the comparison table.
- **Provider matrix in CI.** Run the test suite against `OCR_PROVIDER=stub` (always) and `ollama` (when an Ollama service is available). Cloud providers stay out of CI to avoid burning credits.
- **Property tests for chain composition.** Generate random valid chains and assert the output matches the expected schema.

## Distribution

- **Publish to PyPI.** Pre-release first (`paperloom==0.1.0rc1`) to validate the install path on a clean machine, then `0.1.0`.
- **GitHub Action for release.** On `v*` tag, run tests, build wheels, publish to PyPI, update the Claude Code plugin marketplace metadata.
- **Homebrew formula.** Long shot but sometimes useful for users who don't want a Python venv on their PATH.

## UI

- **Settings page** to switch OCR provider without restarting the backend (today: env var + restart).
- **Privacy mode banner** when the user uploads a file under `hybrid` or `cloud` mode — a one-time confirmation so they don't accidentally send PII to a cloud provider.
- **History panel** of past jobs, per file, with the privacy mode active when they ran. Helpful for audits.

## Closed questions (decisions logged)

- **Multiple PyPI packages?** No — single `paperloom` package, two scripts (`paperloom`, `paperloom-mcp`). Splitting would double maintenance for marginal benefit.
- **Bundle Ollama binaries?** No — Ollama is a system dependency. Wrapping it would couple paperloom to Ollama's release cadence.
- **Build a hosted SaaS?** No — that's a different product. This repo stays local-first.
