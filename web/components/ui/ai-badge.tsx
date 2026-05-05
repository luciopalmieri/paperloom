import { Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";

export function AiBadge() {
  return (
    <Badge variant="outline" className="border-ai text-ai">
      <Sparkles className="mr-1 size-3" aria-hidden /> AI
    </Badge>
  );
}
