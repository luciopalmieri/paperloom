# a11y-rules.md

Accessibility rules. Target: **WCAG 2.2 AA**.

## Keyboard

- Every interactive element reachable via Tab, in logical reading order.
- Focus must be visibly indicated. Never set `outline: none` without a
  custom equivalent (`focus-visible:ring-2 ring-ring`).
- Chain builder operable from the keyboard:
  - Arrow keys move between nodes.
  - Enter activates a node's settings.
  - Delete removes the focused node.
  - Drag-and-drop has a keyboard equivalent (move up / move down).
- Modal/dialog focus trap and `Escape` to close — shadcn `Dialog`
  handles this correctly; do not override.

## ARIA

- Every form input has a `<Label htmlFor>` or `aria-labelledby`. No
  placeholder-as-label.
- Streaming OCR / streaming anonymization progress: announce updates via
  `aria-live="polite"`. Wrap the streamed region in a single live region;
  do not put `aria-live` on every chunk.
- Errors: `role="alert"` for blocking errors, `aria-live="polite"` for
  passive notices.
- Icons that carry no meaning beyond decoration: `aria-hidden="true"`.
- Icons that ARE the only label for a control: provide `aria-label` (and
  pass through `t()` — see [`i18n-rules.md`](./i18n-rules.md)).

## Contrast

- Text vs background: minimum 4.5:1 (normal), 3:1 (large text 18pt+ /
  14pt bold+).
- UI components / state indicators: 3:1.
- AI badge accent must meet 3:1 against both light and dark backgrounds.
  Verify before shipping.

## Motion

- Respect `prefers-reduced-motion`. Disable non-essential transitions
  and animations. Streaming progress is essential — keep it.

## Images

- All images conveying information must have meaningful `alt` text.
- Decorative images: `alt=""`.
- The original-document panel (PDF page renders) treats each rendered
  page image as informative; alt text = `Page {n} of {filename}` via
  `t()`.

## Forms

- Required fields indicated visually AND with `aria-required="true"`.
- Validation errors associated to the field via `aria-describedby`.
- Don't validate on every keystroke for fields that haven't been
  submitted; that's noisy for screen readers.

## Language

- `<html lang>` set to current locale and updated on switch.
- Inline locale switches (rare here) wrapped in `<span lang="...">`.

## Don'ts

- No drag-and-drop with no keyboard alternative.
- No tooltips as the only source of essential information (touch
  devices, screen readers may not surface them).
- No autofocus traps that move focus around without user action.
- No flashing content > 3Hz.
