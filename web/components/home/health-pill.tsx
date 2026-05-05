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
    <div className="flex flex-col gap-2 text-sm sm:flex-row sm:items-center">
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="flex items-center gap-2"
      >
        <span className="text-muted-foreground">{t("health-label")}:</span>
        <Badge variant={state === "ok" ? "secondary" : "outline"}>{label}</Badge>
      </div>
      {detail && (
        <ul className="text-muted-foreground flex flex-wrap gap-x-3 gap-y-1 text-xs">
          <SubsystemRow
            label={t("subsystem-ocr")}
            ok={detail.ollama}
            okText={t("subsystem-ready")}
            missingText={t("subsystem-missing")}
          />
          <SubsystemRow
            label={t("subsystem-anonymizer")}
            ok={detail.opf}
            okText={t("subsystem-ready")}
            missingText={t("subsystem-missing")}
          />
        </ul>
      )}
    </div>
  );
}

function SubsystemRow({
  label,
  ok,
  okText,
  missingText,
}: {
  label: string;
  ok: boolean;
  okText: string;
  missingText: string;
}) {
  return (
    <li className="flex items-center gap-1">
      <span aria-hidden className={ok ? "text-success" : "text-warning"}>
        {ok ? "✓" : "✗"}
      </span>
      <span>
        {label}: {ok ? okText : missingText}
      </span>
    </li>
  );
}
