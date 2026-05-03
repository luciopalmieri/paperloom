# Product

## Register

brand

## Users

Three overlapping audiences, all technical:

- **Agent builders** wiring document tools into LLM pipelines (Claude Desktop, Cursor, Cline, Agno, LangChain). They evaluate by MCP fit, allowlist security, and how cleanly OCR streams into a chain.
- **Privacy-aware knowledge workers** ingesting personal corpora (notebooks, manuals, photographed books) into local-first wikis or RAG indices. They evaluate by what stays on the machine and the audit trail.
- **Open-source-leaning developers** picking between paperloom, marker, docling, MinerU. They evaluate by benchmarks, single-model footprint, and whether the README respects their time.

Context when visiting the home page: comparing options, scanning for a reason to install, checking that the project is real (active, opinionated, not vaporware). Reading on a laptop, often with three other tabs open.

## Product Purpose

Paperloom is a local-first document toolkit. It pairs SOTA OCR (GLM-OCR via Ollama, rank #1 on OmniDocBench V1.5) with 19 chainable PDF/Markdown/HTML/image tools and a built-in PII anonymizer, exposed as a Python library, a CLI, an MCP server, and a Next.js web app from one codebase.

Success for the home page: a qualified visitor leaves with three things internalized — (1) it runs on their machine, (2) it uses real frontier-model AI, named and benchmarked, (3) it is open source and honest about when it is the wrong choice.

Failure for the home page: visitor mistakes it for another SaaS landing or another vague "AI document tool" and bounces.

## Brand Personality

Three words: **opinionated, rigorous, sovereign**.

- **Opinionated.** The README says "Don't." in bold to its own users when their hardware is too weak. It tells you when to use `pdftotext` instead. That voice carries to the home page — confident, declarative, willing to say what it isn't.
- **Rigorous.** Benchmarks are cited with rank and version. Privacy modes are named (local / hybrid / cloud) and the UI shows which one is active. Claims are anchored to verifiable artifacts.
- **Sovereign.** Local-first is identity, not feature. Cloud is opt-in and visible. The user owns their bytes.

Voice on the page: short declarative sentences, technical specifics over adjectives, dry rather than warm. No "empower", no "seamless", no "unleash".

## Anti-references

Decided based on open-source ethos and the goal of highlighting that paperloom uses real AI without falling into category reflexes:

- **SaaS-cream landing pages.** Pastel gradients, gradient text, soft-shadow cards, hero-metric template, identical icon-heading-text card grids. Generic startup energy.
- **Corporate enterprise.** Stock illustrations of "professionals collaborating", navy + orange, trust badges, multi-paragraph mission statements before the product is shown.
- **AI-product purple-and-teal mimic.** The Anthropic-mimic / ChatGPT-mimic glow-effects-and-sparkle-icons reflex. Paperloom uses AI; the page should say so plainly with the model name and benchmark, not with mystical iconography. AI should read as engineering choice, not as marketing aura.
- **Dark-blue developer-tool default.** The Vercel / Linear navy + neon-blue reflex. Editorial-typographic register applies regardless of theme; do not collapse into category-default chrome.

## Design Principles

1. **Practice what you preach.** Paperloom is local-first and privacy-respecting; the home page should feel quiet, owned, un-tracked. No tracker pixels, no vendor scripts, no cookie banners. Type and whitespace, not surveillance UX.
2. **Show the AI, name the model.** When AI is referenced, name it (GLM-OCR, OpenAI Privacy Filter), cite the benchmark (94.62 OmniDocBench V1.5, rank #1), link the source. The credibility comes from specifics, not from glow.
3. **Open-source legible.** Surface the real artifacts: GitHub link, license (MIT), install paths (`uvx`, `pip`, `pnpm`), backend health. A visitor should be able to install paperloom in three commands without scrolling past one screen of marketing fluff.
4. **Tell the truth about fit.** The home page should be willing to say when paperloom is the wrong tool (already-digital text → use `pdftotext`). Honesty is a moat against bigger competitors.
5. **Editorial rigor over decoration.** Hierarchy through type scale + weight. No decorative gradients, no glassmorphism, no animated glow. Motion exists only when it earns the user something (e.g. SSE streaming visual).

## Accessibility & Inclusion

- WCAG 2.2 AA as the floor. Color-only signaling is banned (privacy mode, health pill, link state must combine color + text/icon).
- `prefers-reduced-motion` respected for all animations, including any hero motion added during craft.
- Light + dark themes both first-class. Theme switch already exists; new design must look intentional in both.
- i18n: English + Italian. New strings go through `next-intl`, both locales updated in the same change.
- Keyboard: full tab path on all interactive surfaces, visible focus rings (existing tokens: `--ring`).
- Type: minimum 16px body for prose; line length capped 65–75ch.
