import type { ReactNode } from "react";

import { AiBadge } from "@/components/ui/ai-badge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";

type Props = {
  slug: string;
  name: string;
  ai?: boolean;
  available: boolean;
  href?: string;
  comingLabel: string;
};

export function ToolTile({ slug, name, ai, available, href, comingLabel }: Props) {
  const inner: ReactNode = (
    <Card
      data-slot="tool-tile"
      className={`h-full ${available ? "hover:border-foreground/30" : "opacity-60"}`}
    >
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2 text-base">
          <span>{name}</span>
          {ai && <AiBadge />}
        </CardTitle>
      </CardHeader>
      <CardContent className="text-muted-foreground flex items-center justify-between text-xs">
        <code>{slug}</code>
        {!available && <Badge variant="outline">{comingLabel}</Badge>}
      </CardContent>
    </Card>
  );

  if (available && href) {
    return (
      <Link href={href} className="block">
        {inner}
      </Link>
    );
  }

  return <div aria-disabled={!available}>{inner}</div>;
}
