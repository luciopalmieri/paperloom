"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { backendUrl } from "@/lib/api";

type Health = { ollama: boolean; opf: boolean };

export function HealthPill() {
  const t = useTranslations("home");
  const [state, setState] = useState<"checking" | "ok" | "down">("checking");
  const [detail, setDetail] = useState<Health | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(backendUrl("/api/health"))
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: Health) => {
        if (cancelled) return;
        setDetail(data);
        setState("ok");
      })
      .catch(() => {
        if (cancelled) return;
        setState("down");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const label =
    state === "checking"
      ? t("health-checking")
      : state === "ok"
        ? t("health-ok")
        : t("health-down");

  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">{t("health-label")}:</span>
      <Badge variant={state === "ok" ? "secondary" : "outline"} aria-live="polite">
        {label}
      </Badge>
      {detail && (
        <span className="text-muted-foreground text-xs">
          ollama: {detail.ollama ? "✓" : "✗"} · opf: {detail.opf ? "✓" : "✗"}
        </span>
      )}
    </div>
  );
}
