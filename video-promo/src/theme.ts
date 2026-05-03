// Mirrors web/app/globals.css token system (dark theme — matches the
// preferred screenshot palette). Keep in sync if the main palette evolves.
export const theme = {
  background: "oklch(0.145 0 0)",
  foreground: "oklch(0.985 0 0)",
  card: "oklch(0.205 0 0)",
  border: "oklch(1 0 0 / 10%)",
  muted: "oklch(0.269 0 0)",
  mutedForeground: "oklch(0.708 0 0)",
  primary: "oklch(0.922 0 0)",
  primaryForeground: "oklch(0.205 0 0)",
  success: "oklch(0.78 0.13 155)",
  warning: "oklch(0.82 0.13 65)",
  info: "oklch(0.75 0.15 250)",
  ai: "oklch(0.78 0.13 290)",
  fontMono:
    "ui-monospace, SFMono-Regular, Menlo, Monaco, 'Cascadia Mono', Consolas, monospace",
  fontSans:
    "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  ease: "cubic-bezier(0.25, 1, 0.5, 1)",
};
