# shadcn-rules.md

Usage rules for shadcn/ui in this project. **Read these before adding any
UI component.**

## Install

- Use the CLI only: `npx shadcn@latest add <component>`. Never copy-paste
  component source manually from the docs.
- Components land in `components/ui/` and are owned by this repo. Edit
  them freely; do not pin to upstream.
- Init once at Phase 1: `npx shadcn@latest init` with Tailwind v4 preset,
  base color = `neutral`, CSS variables = yes.
- For shadcn API or CLI questions, use Context7 MCP first
  (`resolve-library-id` → `query-docs`). Don't rely on training data.

## Compose, don't wrap

- Build feature components by composing shadcn primitives — do not wrap
  them in thin pass-through components.
- If a hand-rolled component duplicates a shadcn primitive (`Dialog`,
  `Sheet`, `Command`, `DropdownMenu`, `Form`, `Tabs`, `Toast`,
  `Tooltip`, `Popover`, `Accordion`, `ScrollArea`, `Skeleton`,
  `Progress`, `Select`, `Combobox`, `Table`, `Badge`, `Button`,
  `Input`, `Textarea`, `Card`, `Separator`, `Label`, `Switch`,
  `Checkbox`, `RadioGroup`, `Slider`, `Calendar`, `DatePicker`),
  delete it and use the primitive.

## Theme

- Theme via CSS variables in `app/globals.css`. Do not pass colour props.
- Dark/light/system handled by `next-themes`. Default `system`.
- Single accent token for AI-powered surfaces (see "AI badge" below).
  All other tokens stay shadcn defaults.

## AI badge (project-specific)

AI-powered tools must look distinct everywhere. One reusable component:

```tsx
// components/ui/ai-badge.tsx — composes shadcn Badge
export function AiBadge() {
  return (
    <Badge variant="outline" className="border-violet-500 text-violet-500">
      <Sparkles className="mr-1 size-3" aria-hidden /> AI
    </Badge>
  );
}
```

Rules:
- Use `AiBadge` on every catalogue tile, tool page header, and chain-
  builder node for AI tools. No exceptions.
- Pair with the `Sparkles` icon (lucide). Do not vary the icon per tool.
- Never use the AI accent for non-AI tools.

## Forbidden

- No Material UI, Chakra, Mantine, Ant Design, NextUI, HeroUI.
- No raw Radix UI imports — go through shadcn.
- No `headlessui` — go through shadcn.
- No `className` overrides that fight the design system (e.g. forcing
  brand colours on `Button` defaults). Extend via variants instead.

## Tailwind

- Tailwind v4 only. Use `@theme` in `globals.css` for tokens.
- No `tailwind.config.ts` JS-side configuration unless v4 cannot express
  it via CSS.
- Use shadcn's class-merge helper (`cn()` from `lib/utils.ts`) for any
  conditional class composition.

## Icons

- `lucide-react` only. No emoji as iconography. No SVG sprites.

## Forms

- All forms via shadcn `Form` (which wraps `react-hook-form` + `zod`).
- Validate on submit, surface errors via `FormMessage`. No alert dialogs
  for validation.
