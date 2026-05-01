"use client";

import { useTranslations } from "next-intl";

import { Link, usePathname } from "@/i18n/navigation";

type Crumb = { href?: string; labelKey: string; namespace?: string };

const SEGMENTS: Record<string, Crumb> = {
  tools: { href: "/tools", labelKey: "tools", namespace: "nav" },
  chain: { href: "/tools/chain", labelKey: "title", namespace: "tools.chain" },
  "ocr-to-markdown": {
    href: "/tools/ocr-to-markdown",
    labelKey: "title",
    namespace: "tools.ocr-to-markdown",
  },
};

export function Breadcrumbs() {
  const pathname = usePathname();
  const tNav = useTranslations("nav");
  const tChain = useTranslations("tools.chain");
  const tOcr = useTranslations("tools.ocr-to-markdown");

  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 0) return null;

  const labelFor = (slug: string): string => {
    if (slug === "tools") return tNav("tools");
    if (slug === "chain") return tChain("title");
    if (slug === "ocr-to-markdown") return tOcr("title");
    return slug;
  };

  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm">
      {parts.map((slug, idx) => {
        const isLast = idx === parts.length - 1;
        const href = "/" + parts.slice(0, idx + 1).join("/");
        const label = labelFor(slug);
        return (
          <span key={href} className="flex items-center gap-2">
            {idx > 0 && (
              <span className="text-muted-foreground/50" aria-hidden>
                /
              </span>
            )}
            {isLast ? (
              <span className="text-foreground" aria-current="page">
                {label}
              </span>
            ) : (
              <Link
                href={SEGMENTS[slug]?.href ?? href}
                className="text-muted-foreground hover:text-foreground"
              >
                {label}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
