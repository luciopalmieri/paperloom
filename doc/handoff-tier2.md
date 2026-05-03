# Handoff — Tier 2 release tests for paperloom

> **Copy the block below as the first message in a new Claude Code session.** It's self-contained: paths, branch, what's verified, what's left, and the rules of engagement.

> **CLEANUP — DELETE THIS FILE WHEN DONE.** It was committed by mistake; the resume session must `git rm doc/handoff-tier2.md` and commit that as its final step before tagging the release.

---

## Prompt to paste

```
You're picking up the Tier 2 release-test pass for `paperloom` before publishing to PyPI. The goal: walk every Tier 2 checkbox in doc/release-checklist.md to a confirmed pass or a documented fix, then advance to Tier 3 (TestPyPI dry-run) and finally Tier 4 (production publish).

## Context (read first)

- Repo root: /Users/luciopalmieri/Projects/_training/paperloom
- Branch: feat/distribution-mcp-plugin (do not switch off it)
- Tier 1 (automatable smoke) is fully green. Last verified at commit `82e74f3` after the anonymize-page split (`f806e15`) — re-run if any backend file under `backend/paperloom/` changes again.
- Tier 2 is partially exercised in dev mode. The privacy badge, anonymize tool (paste + file), and the chain end-to-end have been seen working live on the user's machine.
- Tier 3 + Tier 4 not yet attempted.

## Source of truth

doc/release-checklist.md is canonical. Use the Tier 2 section's checkboxes verbatim. Do NOT invent new acceptance criteria. If a check passes, mark it done and move on. If it fails, surface the failure to the user with: (a) what the failing artifact looks like, (b) the smallest fix you can think of, (c) wait for confirmation before editing.

## What's already known good (don't re-test, just confirm at a glance)

- Privacy badge in the header polls /api/status and renders local/hybrid/cloud variants. Italian + English copy in messages/{en,it}.json.
- `paperloom doctor` and `paperloom status --json` print the privacy mode at the top.
- `paperloom-mcp` prints a stderr banner at startup with the privacy summary.
- Anonymize tool: paste-text, .md upload, scanning sweep on the Original panel during run, elapsed timer, slow-hint after 5s, Stop → Resume button, Done → Run again button.
- Chain artifacts: GET /api/jobs/{id}/artifacts/{name} now resolves both <jobid>/<name> (out.zip) and <jobid>/out/<name> (every other file).
- pyproject extras: `[pdf]` and `[all]` only. `[anonymizer]` was intentionally removed (OPF is git-only — pip refuses direct-URL deps in published wheels). OPF auto-installs on first `anonymize` call via paperloom/anonymizer/_lazy_install.py. Disable with PAPERLOOM_AUTO_INSTALL_OPF=0.

## Bugs already fixed in earlier commits — do not regress

- `[anonymizer]` extra removed from pyproject.toml. Don't add it back.
- Chain `done` event now emits one artifact per output file (not just out.zip), so single-tool consumers can fetch the .md without unzipping.
- Artifacts router falls back to <jobid>/out/<name> for non-zip files.
- Anonymize tool's Original/Redacted layout: `data-scanning="true"` on the Original Card during running; CSS keyframes in app/globals.css under `.anon-scan`. Honors prefers-reduced-motion.
- Privacy badge uses plain divs inside DropdownMenuContent (not DropdownMenuLabel/Item) — Base UI requires Group wrappers and the badge is informational, not actionable.

## What's left

Remaining Tier 2 items (per doc/release-checklist.md):

- [ ] 2.6 MCP from Claude Desktop — wire `uvx paperloom-mcp` into claude_desktop_config.json on the user's Mac, restart, drive a real OCR. Look for the banner in ~/Library/Logs/Claude/mcp-server-paperloom.log.
- [ ] 2.7 Mistral backend (real API) — only if user has an API key with budget. `OCR_PROVIDER=mistral MISTRAL_API_KEY=... paperloom ocr small.pdf`.
- [ ] 2.8 OPF auto-install reproduction — uninstall opf from the venv, trigger an anonymize chain, watch for `installing_opf` in the SSE event stream.

After Tier 2 is green:

- Tier 3 (TestPyPI dry-run) — needs the user to register at test.pypi.org and generate an API token. Steps in checklist.
- Tier 4 (production publish) — only after Tier 3.

## Rules

1. The user runs the tests. You guide step-by-step, one step per turn. Wait for OK or a screenshot/log before moving on.
2. Default to normal prose for diagnostic walkthroughs (the user dislikes terse caveman replies in this part of the workflow). Caveman is fine for commits and code-only replies.
3. Never skip hooks, never amend the previous commit, never push without explicit ask. Sign commits with --author "Lucio Palmieri <l.palmieri@shopfully.com>" — the user is the sole author on this branch.
4. If a fix is needed, surface it first, wait for confirmation. Only edit the minimum needed; don't refactor adjacent code.
5. Run `cd backend && uv run pytest -q` after any backend change. Run `pnpm tsc --noEmit && pnpm lint` after any web change.
6. If the user has stale dev servers running, ask them to restart. uvicorn --reload is reliable for paperloom/* changes but not always for chain.py edits.

Start by:
1. Reading doc/release-checklist.md to confirm Tier 2 line items.
2. Reading the last 5 commit messages on the branch (`git log --oneline -10`).
3. Asking the user which Tier 2 step they want to start with — 2.6 (Claude Desktop) is the highest signal because it's the primary use case.

## Final cleanup (must do before tagging the release)

doc/handoff-tier2.md was committed by mistake. As the final step of the publish flow — after Tier 4 has shipped the wheel — delete it:

    git rm doc/handoff-tier2.md
    git commit -m "chore: drop transient release handoff doc"

Do NOT leave it in main. Do NOT include it in the published wheel (it isn't, since the wheel only ships `paperloom/`, but the repo would still carry it).
```

---

## Why this format

- Prompt body is fenced so paste-as-message gives Claude exactly that text and nothing else.
- "Read first" / "Don't regress" / "Rules" sections prevent the new session from re-doing work or re-introducing fixed bugs.
- Anchors the new session to `doc/release-checklist.md` as canonical, so you don't have to re-explain the checklist on every turn.
- Calls out the user's preference for prose-mode in walkthroughs, so the new session doesn't default to caveman during testing.
