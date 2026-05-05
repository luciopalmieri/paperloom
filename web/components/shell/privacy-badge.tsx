"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
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
  detail_key: string;
  detail_params: Record<string, string>;
};

type Caveat = {
  text: string;
  key: string;
  params: Record<string, string>;
};

type Privacy = {
  mode: "local" | "hybrid" | "cloud";
  components: Component[];
  caveats: Caveat[];
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

export function PrivacyBadge() {
  const t = useTranslations("privacy");
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
  const label = t(`mode-${privacy.mode}` as "mode-local" | "mode-hybrid" | "mode-cloud");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t("label", { mode: label })}
        className="focus-visible:ring-ring/50 rounded-4xl outline-none focus-visible:ring-[3px]"
      >
        <Badge
          variant={variant}
          className={cn(
            "gap-1.5 px-2.5 py-1 text-xs font-semibold uppercase tracking-wider",
            privacy.mode === "local" && "bg-success text-background hover:bg-success/90",
          )}
        >
          <span
            aria-hidden
            className={cn(
              "size-1.5 rounded-full",
              privacy.mode === "local" && "bg-background/70",
              privacy.mode === "hybrid" && "bg-warning",
              privacy.mode === "cloud" && "bg-destructive",
            )}
          />
          {label}
        </Badge>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="px-3 py-2 text-xs font-semibold">
          {t("header")}: <span>{label}</span>
        </div>
        <DropdownMenuSeparator />
        <div className="flex flex-col gap-2 px-3 py-2">
          {privacy.components.map((c) => (
            <div key={c.name} className="flex flex-col gap-0.5 text-xs">
              <div className="flex w-full items-center justify-between font-medium">
                <span>
                  {t.has(`component.${c.name}`)
                    ? t(`component.${c.name}` as "component.ocr")
                    : c.name}
                </span>
                <span
                  className={cn(
                    "rounded px-1.5 py-0.5 text-xs font-semibold uppercase",
                    c.is_local
                      ? "bg-success/15 text-success"
                      : "bg-warning/15 text-warning",
                  )}
                >
                  {c.is_local ? t("scope-local") : t("scope-cloud")}
                </span>
              </div>
              <span className="text-muted-foreground">
                {t.has(c.detail_key)
                  ? t(c.detail_key as "detail.ocr.ollama", c.detail_params)
                  : c.detail}
              </span>
            </div>
          ))}
        </div>
        {privacy.caveats.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <div className="text-muted-foreground px-3 pt-2 text-xs font-semibold uppercase tracking-wider">
              {t("caveats")}
            </div>
            <div className="flex flex-col gap-1.5 px-3 pb-2 pt-1">
              {privacy.caveats.map((c, i) => (
                <p
                  key={i}
                  className="text-muted-foreground text-xs leading-snug"
                >
                  {t.has(c.key)
                    ? t(c.key as "caveat.mcp_client", c.params)
                    : c.text}
                </p>
              ))}
            </div>
          </>
        )}
        <DropdownMenuSeparator />
        <div className="text-muted-foreground px-3 py-2 text-xs">
          {t("version", { version })}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
