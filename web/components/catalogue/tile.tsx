import type { ReactNode } from "react";

import { AiBadge } from "@/components/ui/ai-badge";
import { Badge } from "@/components/ui/badge";
import { Link } from "@/i18n/navigation";

type OpfStatus = { label: string; tone: "ready" | "needed" };

type Props = {
  slug: string;
  name: string;
  ai?: boolean;
  available: boolean;
  href?: string;
  comingLabel: string;
  opfStatus?: OpfStatus | null;
};

export function ToolTile({ name, ai, available, href, comingLabel, opfStatus }: Props) {
  const meta: ReactNode = (
    <span className="flex shrink-0 items-center gap-2">
      {ai && <AiBadge />}
      {opfStatus && (
        <Badge
          variant={opfStatus.tone === "ready" ? "secondary" : "outline"}
          className={
            opfStatus.tone === "needed" ? "border-warning/50 text-warning" : ""
          }
        >
          {opfStatus.label}
        </Badge>
      )}
      {!available && <Badge variant="outline">{comingLabel}</Badge>}
    </span>
  );

  const content = (
    <>
      <h3 className="text-sm font-medium leading-snug">{name}</h3>
      {meta}
    </>
  );

  const base =
    "flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5 transition-colors";

  if (available && href) {
    return (
      <Link
        href={href}
        className={`${base} hover:bg-muted hover:border-foreground/30 focus-visible:ring-ring/50 focus-visible:ring-2 focus-visible:outline-none`}
      >
        {content}
      </Link>
    );
  }

  return (
    <div aria-disabled="true" className={`${base} opacity-60 cursor-not-allowed`}>
      {content}
    </div>
  );
}
