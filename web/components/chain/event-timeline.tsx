"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  Loader2,
  XOctagon,
} from "lucide-react";
import { useTranslations } from "next-intl";

export type TimelineItemStatus = "pending" | "active" | "done" | "error" | "warning";

export type TimelineItem = {
  id: string;
  label: string;
  sublabel?: string;
  status: TimelineItemStatus;
  startedAt?: number;
  endedAt?: number;
};

type Props = {
  items: TimelineItem[];
  rawEvents: string[];
  liveAnnouncement?: string;
};

const ICON: Record<TimelineItemStatus, typeof Circle> = {
  pending: Circle,
  active: Loader2,
  done: CheckCircle2,
  error: XOctagon,
  warning: AlertTriangle,
};

const ICON_COLOR: Record<TimelineItemStatus, string> = {
  pending: "text-muted-foreground",
  active: "text-primary",
  done: "text-emerald-600 dark:text-emerald-400",
  error: "text-destructive",
  warning: "text-amber-600 dark:text-amber-400",
};

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem ? `${m}m ${rem}s` : `${m}m`;
}

export function EventTimeline({ items, rawEvents, liveAnnouncement }: Props) {
  const t = useTranslations("tools.chain");

  if (items.length === 0 && rawEvents.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">{t("events-waiting")}</p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <ol
        role="list"
        aria-label={t("events-timeline-label")}
        className="flex flex-col gap-2"
      >
        {items.map((item) => {
          const Icon = ICON[item.status];
          const duration =
            item.startedAt && item.endedAt
              ? formatDuration(item.endedAt - item.startedAt)
              : undefined;
          return (
            <li
              key={item.id}
              aria-current={item.status === "active" ? "step" : undefined}
              className="flex items-start gap-3 text-sm"
            >
              <Icon
                aria-hidden
                className={`mt-0.5 size-4 shrink-0 ${ICON_COLOR[item.status]} ${
                  item.status === "active" ? "animate-spin" : ""
                }`}
              />
              <div className="flex flex-1 flex-col">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{item.label}</span>
                  {duration && (
                    <span className="text-muted-foreground text-xs tabular-nums">
                      {duration}
                    </span>
                  )}
                </div>
                {item.sublabel && (
                  <span className="text-muted-foreground text-xs">{item.sublabel}</span>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      {liveAnnouncement && (
        <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
          {liveAnnouncement}
        </div>
      )}
      {rawEvents.length > 0 && (
        <details className="text-xs">
          <summary className="text-muted-foreground hover:text-foreground cursor-pointer select-none">
            {t("events-show-raw")}
          </summary>
          <pre className="bg-muted mt-2 max-h-72 overflow-auto rounded p-3 whitespace-pre-wrap">
            {rawEvents.join("\n")}
          </pre>
        </details>
      )}
    </div>
  );
}
