import type { ReactNode } from "react";

import { AiBadge } from "@/components/ui/ai-badge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

export function ToolTile({ slug, name, ai, available, href, comingLabel, opfStatus }: Props) {
  const inner: ReactNode = (
    <Card
      data-slot="tool-tile"
      className={`h-full transition-colors ${
        available ? "hover:border-foreground/30" : "opacity-60"
      }`}
    >
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2 text-base">
          <span>{name}</span>
          {ai && <AiBadge />}
        </CardTitle>
      </CardHeader>
      <CardContent className="text-muted-foreground flex items-center justify-between gap-2 text-xs">
        <code className="truncate">{slug}</code>
        <div className="flex items-center gap-2">
          {opfStatus && (
            <Badge
              variant={opfStatus.tone === "ready" ? "secondary" : "outline"}
              className={
                opfStatus.tone === "needed"
                  ? "border-amber-300 text-amber-900 dark:border-amber-700 dark:text-amber-100"
                  : ""
              }
            >
              {opfStatus.label}
            </Badge>
          )}
          {!available && <Badge variant="outline">{comingLabel}</Badge>}
        </div>
      </CardContent>
    </Card>
  );

  if (available && href) {
    return (
      <Link
        href={href}
        className="focus-visible:ring-ring/50 block rounded-lg focus-visible:ring-2 focus-visible:outline-none"
      >
        {inner}
      </Link>
    );
  }

  return (
    <div role="link" aria-disabled="true" tabIndex={0} className="cursor-not-allowed">
      {inner}
    </div>
  );
}
