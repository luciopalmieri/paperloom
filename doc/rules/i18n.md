# i18n-rules.md

IT/EN translation conventions. **Read before adding any user-visible
string.**

## Library

- `next-intl` only. Configured in `i18n/request.ts`, locales in
  `messages/it.json` and `messages/en.json`.
- Routing: locale-prefixed (`/it/...`, `/en/...`). Default locale
  detected from `Accept-Language`, fallback `en`.
- Use Context7 MCP for `next-intl` API specifics — don't guess.

## Key naming

- Nested by feature, kebab-case for keys, camelCase forbidden:
  `tools.anonymizer.title`, `ocr.split-view.empty-state`.
- One `messages/<locale>.json` file per locale, no per-component
  partials.
- Plurals via ICU MessageFormat (`{count, plural, one {# file}
  other {# files}}`).
- Variables via ICU placeholders (`Welcome, {name}`). No string
  concatenation in JSX.

## In code

- Never hardcode user-visible strings in JSX. Always:

  ```tsx
  const t = useTranslations('tools.anonymizer');
  return <h1>{t('title')}</h1>;
  ```

- Numbers, dates, file sizes, percentages: format via `useFormatter`.
  Never `.toLocaleString()` directly.
- ARIA labels are user-visible — they go through `t()` too.
- Server components: use `getTranslations()` / `getFormatter()`.

## Fallback

- Missing key in active locale → fall back to `en`.
- Missing in `en` too → log to console in dev, render the key path in
  prod (so it's obvious in QA).

## Coverage

- Both `it.json` and `en.json` must contain every key. CI check (later
  phase) verifies parity.
- New feature = update both files in the same PR. Do not ship an EN-only
  feature.

## What does NOT get translated

- Tool slugs in URLs (`/tools/pdf-to-images`) — kebab-case English,
  stable forever.
- File extensions, technical identifiers, model names (`glm-ocr:latest`).
- OPF entity category names in the redaction report JSON — these are
  protocol fields, not UI labels. Translate them only when **rendering**
  the report in the UI.

## Tone

- IT: informal "tu", concise. Match shadcn's UX register, not a legal
  document.
- EN: same register. Avoid "please" / "kindly" / pleasantries in UI
  microcopy. Action verbs first ("Upload file", not "Please upload your
  file").
