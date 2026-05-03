"use client";

import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { backendUrl } from "@/lib/api";
import { cn } from "@/lib/utils";

type Component = {
  name: string;
  provider: string;
  is_local: boolean;
  detail: string;
};

type Privacy = {
  mode: "local" | "hybrid" | "cloud";
  components: Component[];
  caveats: string[];
};

type Status = {
  version: string;
  privacy: Privacy;
};

const MODE_VARIANT: Record<Privacy["mode"], "default" | "secondary" | "destructive"> = {
  local: "default",
  hybrid: "secondary",
  cloud: "destructive",
};

const MODE_LABEL: Record<Privacy["mode"], string> = {
  local: "Local",
  hybrid: "Hybrid",
  cloud: "Cloud",
};

export function PrivacyBadge() {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const fetchStatus = async () => {
      try {
        const r = await fetch(backendUrl("/api/status"), { cache: "no-store" });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = (await r.json()) as Status;
        if (alive) {
          setStatus(data);
          setError(null);
        }
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "fetch failed");
      }
    };
    void fetchStatus();
    const id = setInterval(fetchStatus, 30_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  if (error || !status) {
    return null;
  }

  const { privacy, version } = status;
  const variant = MODE_VARIANT[privacy.mode];
  const label = MODE_LABEL[privacy.mode];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Privacy mode: ${label}`}
        className="focus-visible:ring-ring/50 rounded-4xl outline-none focus-visible:ring-[3px]"
      >
        <Badge
          variant={variant}
          className={cn(
            "cursor-pointer gap-1.5 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider",
            privacy.mode === "local" && "bg-emerald-600 text-white hover:bg-emerald-600/90",
          )}
        >
          <span
            aria-hidden
            className={cn(
              "size-1.5 rounded-full",
              privacy.mode === "local" && "bg-emerald-200",
              privacy.mode === "hybrid" && "bg-amber-300",
              privacy.mode === "cloud" && "bg-red-200",
            )}
          />
          {label}
        </Badge>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="text-xs font-semibold">
          Privacy mode: <span className="uppercase">{privacy.mode}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {privacy.components.map((c) => (
          <DropdownMenuItem
            key={c.name}
            className="flex flex-col items-start gap-0.5 text-xs"
            disabled
          >
            <div className="flex w-full items-center justify-between font-medium">
              <span className="capitalize">{c.name}</span>
              <span
                className={cn(
                  "rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase",
                  c.is_local
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                    : "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
                )}
              >
                {c.is_local ? "local" : "cloud"}
              </span>
            </div>
            <span className="text-muted-foreground">{c.detail}</span>
          </DropdownMenuItem>
        ))}
        {privacy.caveats.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Caveats
            </DropdownMenuLabel>
            {privacy.caveats.map((c, i) => (
              <DropdownMenuItem
                key={i}
                className="text-[11px] text-muted-foreground whitespace-normal break-normal"
                disabled
              >
                {c}
              </DropdownMenuItem>
            ))}
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-[10px] text-muted-foreground">
          paperloom v{version}
        </DropdownMenuLabel>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
