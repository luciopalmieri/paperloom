# paperloom video-promo

Standalone Remotion project for paperloom promotional videos. **Independent from the main workspace** (separate `package.json`, separate `node_modules`). Delete this folder anytime; the main project is unaffected.

## Why separate

- No coupling with `web/` or backend deps
- Heavy Chromium-based renderer stays out of the main install
- Build-time only: never imported at runtime by the product

## Install (one-off)

```bash
cd video-promo
npm install        # or pnpm install / bun install
```

> First run downloads Chromium (~300 MB). Cached afterwards.

## Develop the video

```bash
npm run studio
```

Opens Remotion Studio on `localhost:3000`. Live preview, scrub timeline, tweak props.

## Render

```bash
npm run render          # → out/paperloom-15s.mp4
npm run render:webm     # → out/paperloom-15s.webm
npm run render:gif      # → out/paperloom-15s.gif (heavier, slower)
```

Output goes in `out/` (gitignored).

## Composition

Single 15-second clip at 1920×1080 / 30 fps. Five scenes:

| Frames | Length | Scene | Purpose |
|---|---|---|---|
| 0–60 | 2 s | Title | paperloom wordmark + tagline |
| 60–120 | 2 s | Drop | PDF lands in the dropzone |
| 120–300 | 6 s | OcrStream | Page thumbs fill in, Markdown streams |
| 300–390 | 3 s | Anonymize | PII spans get masked one by one |
| 390–450 | 2 s | Outro | Wordmark + repo URL |

Edit budgets in `src/Demo.tsx`.

## Theme

Colors come from `src/theme.ts`, mirroring `web/app/globals.css` (OKLCH tokens). Update there if the main palette evolves.

## Delete cleanly

```bash
rm -rf video-promo/
```

Removes everything: Remotion deps, scenes, render output. No traces in the main project.
