# LLM Wiki: ingest documents into a personal Markdown wiki

Pattern from [Andrej Karpathy's LLM Wiki gist](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f). The idea: an agent maintains a persistent Markdown wiki on your disk that grows over time. New sources get ingested into wiki pages with frontmatter metadata; old pages get cross-linked and refined.

paperloom solves the **ingest** step for sources that aren't already text — scanned PDFs, phone photos of whiteboards, fotographed pages of books. Without paperloom, an LLM agent can ingest only digital text. With paperloom, anything you can scan or photograph becomes a wiki page.

## Wiki layout (target)

```
$PAPERLOOM_WIKI_ROOT          # default: ~/wiki
├── index.md                  # human-edited or agent-generated front page
├── papers/                   # one .md per paper, frontmatter at top
│   ├── transformer-vaswani-2017.md
│   └── ...
├── books/
├── notes/
└── people/
```

Each wiki page starts with a YAML frontmatter block so an agent (or tooling like Obsidian / Foam) can query by tag, year, source, etc.:

```markdown
---
slug: transformer-vaswani-2017
title: "Attention Is All You Need"
authors: [Vaswani, Shazeer, Parmar, ...]
year: 2017
source: papers/transformer-vaswani-2017.pdf
tags: [transformers, attention, nlp]
ingested: 2026-05-03
ocr_provider: ollama
privacy_mode: local
---

# Attention Is All You Need

[ ... OCR'd Markdown body, possibly with agent-added preamble or summary ... ]
```

The `ocr_provider` and `privacy_mode` fields let you audit later: "show me all wiki pages that touched a cloud OCR provider."

---

## Three ways to drive the ingest

| Path | When to pick |
|---|---|
| **A) MCP from Claude Desktop / Cursor** | You already chat with an agent and want it to manage the wiki incrementally. Most aligned with Karpathy's pattern. |
| **B) Python library script** | You have a folder of PDFs to bulk-ingest, or you want a cron job. Deterministic, no LLM required for the OCR step. |
| **C) CLI one-liners** | You're a shell person. Minimal toolkit. |

All three end up writing the same wiki layout. Mix them — they don't conflict.

### Path A: MCP from a chat agent

**Setup.** Wire `paperloom-mcp` into your MCP client. For Claude Desktop, edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "paperloom": {
      "command": "uvx",
      "args": ["paperloom-mcp"],
      "env": {
        "PAPERLOOM_MCP_ALLOWED_DIRS": "/Users/you/Documents,/Users/you/Downloads,/Users/you/wiki",
        "PAPERLOOM_WIKI_ROOT": "/Users/you/wiki"
      }
    }
  }
}
```

Add the wiki path to the allowlist so paperloom can read sources you stash there. Add filesystem MCP support (Claude Desktop has a built-in filesystem connector, or use `@modelcontextprotocol/server-filesystem`) so the agent can write the resulting `.md`.

**Drive it.**

> Ingest `~/Downloads/transformer-paper.pdf` into my wiki under `papers/`. Use the slug `transformer-vaswani-2017`. Add tags `[transformers, attention, nlp]`. Anonymization off — this is a public paper.

The agent calls `register_file` → `ocr_to_markdown` (paperloom MCP), then `paperloom_status()` to record `privacy_mode` in the frontmatter, then writes to `~/wiki/papers/transformer-vaswani-2017.md` via the filesystem MCP. Then asks if you want it to update `~/wiki/index.md` with a link.

**Pros**
- LLM does the *organization* work (slug, tags, summary, cross-links). That's the whole point of Karpathy's pattern.
- Conversational. You say "ingest this", "tag it differently", "rewrite the summary" and the agent iterates.
- Privacy mode and provider are tracked automatically in the frontmatter.

**Cons**
- The agent's driving model (Anthropic for Claude Desktop, OpenAI for ChatGPT desktop, etc.) sees the OCR'd text. **You are not fully local in this path** — see [`doc/privacy.md`](../privacy.md).
- Non-deterministic: the agent picks the slug. Sometimes it picks oddly. Re-prompt or hand-edit.
- Slow for large batches. Each ingest is a conversation turn.

### Path B: Python library script

For batch ingest. Drop PDFs into `~/wiki/_inbox/`, run the script, get one wiki page per PDF.

```python
"""Batch-ingest PDFs into the LLM Wiki.

Usage: drop PDFs into $PAPERLOOM_WIKI_ROOT/_inbox/, then run this script.
Each PDF becomes $PAPERLOOM_WIKI_ROOT/<category>/<slug>.md with frontmatter.
"""

import os
import re
from datetime import date
from pathlib import Path

from paperloom import ocr_to_markdown, anonymize, PaperloomError
from paperloom.privacy import current_state

WIKI = Path(os.environ.get("PAPERLOOM_WIKI_ROOT", Path.home() / "wiki"))
INBOX = WIKI / "_inbox"
DEFAULT_CATEGORY = "papers"

ANONYMIZE_INGEST = False  # set True for sensitive material

def slugify(name: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return s[:80] or "untitled"

def ingest_one(pdf: Path) -> Path:
    md = ocr_to_markdown(pdf)
    if ANONYMIZE_INGEST:
        md = anonymize(md, preset="balanced")

    state = current_state()
    slug = slugify(pdf.stem)
    category = DEFAULT_CATEGORY
    out_dir = WIKI / category
    out_dir.mkdir(parents=True, exist_ok=True)
    dest = out_dir / f"{slug}.md"

    frontmatter = (
        f"---\n"
        f"slug: {slug}\n"
        f'title: "{pdf.stem}"\n'
        f"source: {category}/{pdf.name}\n"
        f"ingested: {date.today().isoformat()}\n"
        f"ocr_provider: {state['components'][0]['provider']}\n"
        f"privacy_mode: {state['mode']}\n"
        f"anonymized: {ANONYMIZE_INGEST}\n"
        f"---\n\n"
    )
    dest.write_text(frontmatter + md, encoding="utf-8")
    # Move the source PDF next to the wiki page so the link in frontmatter resolves.
    pdf.replace(out_dir / pdf.name)
    return dest

def main() -> None:
    INBOX.mkdir(parents=True, exist_ok=True)
    pdfs = sorted(INBOX.glob("*.pdf"))
    print(f"ingesting {len(pdfs)} PDFs from {INBOX}…")
    for pdf in pdfs:
        try:
            dest = ingest_one(pdf)
            print(f"  → {dest.relative_to(WIKI)}")
        except PaperloomError as exc:
            print(f"  skip {pdf.name}: {exc.code}")

if __name__ == "__main__":
    main()
```

**Pros**
- Deterministic. Same input, same output, every time.
- Cron-friendly. Put it on a `launchd` job and your wiki self-populates.
- No driving LLM in the loop — if you keep the OCR provider local (default Ollama), this is fully local end-to-end. The frontmatter records `privacy_mode: local` and you can prove it.
- Bulk-friendly. Hundreds of PDFs in one run.

**Cons**
- No "intelligence". Slug = filename slugified, category = hardcoded default. No tags, no summary, no cross-linking. You can layer those on by enriching this script (see Path C below) or by handing it off to Path A afterward.
- The script needs maintenance — Path A's agent can adapt to schema changes; this script is brittle.

### Path C: CLI one-liners

For shell-fluent users. Smallest surface.

```bash
# OCR + write to wiki under papers/
paperloom ocr ~/Downloads/contract.pdf | tee "$PAPERLOOM_WIKI_ROOT/papers/contract.md"

# OCR + redact + write
paperloom ocr ~/Downloads/medical-record.pdf | \
  paperloom anonymize - --preset recall | \
  tee "$PAPERLOOM_WIKI_ROOT/notes/medical-redacted.md"

# Check what privacy mode the wiki is being written under
paperloom status --json | jq '.privacy.mode'
```

**Pros**
- Minimal. No script to maintain. Pipe-friendly.
- Composable. Layer your own `awk` / `sed` / `yq` for frontmatter generation, slug rules, etc.

**Cons**
- No frontmatter automation. You'd have to write a wrapper to prepend YAML — at which point you're back to Path B.
- No agent intelligence either. Pure UNIX plumbing.

---

## Mixing the paths

A common workflow we've seen:

1. **Path B (cron)** populates `$WIKI/_drafts/` from `_inbox/` overnight. Plain frontmatter, no tags, no summary.
2. **Path A (chat agent)** is invoked the next morning: "for every page in `_drafts/`, write a 3-paragraph summary at the top, pick tags from this controlled vocabulary, move it to `papers/` or `notes/`, and link it from `index.md`."

This way the bulk OCR is deterministic and local; the *enrichment* uses an LLM and benefits from agent reasoning. The privacy mode in the frontmatter tells you which steps were local vs. cloud.

## Querying the wiki

Once the frontmatter convention is in place, queries become trivial:

```bash
# All papers from 2024 with the "transformers" tag
grep -rl 'year: 2024' "$PAPERLOOM_WIKI_ROOT/papers/" | \
  xargs grep -l 'transformers'

# Pages that touched a cloud OCR provider (audit trail)
grep -rl 'privacy_mode: hybrid' "$PAPERLOOM_WIKI_ROOT/"
```

For a richer query layer, point any of [Obsidian](https://obsidian.md/), [Foam](https://foambubble.github.io/), or [Logseq](https://logseq.com/) at `$PAPERLOOM_WIKI_ROOT` — they all read frontmatter natively.

## Notes

- **Anonymization is opt-in per ingest.** The script above has `ANONYMIZE_INGEST = False`. Flip it for medical, legal, HR material. Path A users say "anonymize this one" in the prompt.
- **Don't OCR what's already digital.** If the PDF has a text layer, use `paperloom.tools.pdf_to_text` instead of `ocr_to_markdown` — it's 100× faster and 100% accurate.
- **Wiki backups matter.** If your wiki is the canonical record, make sure it's in a git repo or a backed-up directory. paperloom doesn't manage that for you.
