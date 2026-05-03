"use client";

import { Copy, Play, RefreshCw, Square, Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import { Fragment, memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { OpfInstallBanner } from "@/components/anonymize/install-banner";
import { AiBadge } from "@/components/ui/ai-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { backendUrl } from "@/lib/api";

const ACCEPTED_EXTS = [".md", ".txt", ".markdown"];
const MAX_KB = 500;
const PRESETS = ["balanced", "recall", "precision"] as const;
type Preset = (typeof PRESETS)[number];

type Span = {
  category: string;
  offset_start: number;
  offset_end: number;
};

type Artifact = { name: string; size: number; url: string };
type RunStatus = "idle" | "uploading" | "running" | "cancelled" | "done" | "error";
type MobileTab = "original" | "redacted";

type Phase =
  | "queued"
  | "downloading_opf"
  | "loading_opf"
  | "installing_opf"
  | "detecting"
  | "writing_report"
  | null;

type PhaseKey =
  | "phase-queued"
  | "phase-downloading_opf"
  | "phase-loading_opf"
  | "phase-installing_opf"
  | "phase-detecting"
  | "phase-writing_report";

type State = {
  fileId: string | null;
  filename: string | null;
  originalText: string;
  redactedText: string;
  spans: Span[];
  jobId: string | null;
  status: RunStatus;
  error: string | null;
  preset: Preset;
  phase: Phase;
  startedAt: number | null;
};

const initialState: State = {
  fileId: null,
  filename: null,
  originalText: "",
  redactedText: "",
  spans: [],
  jobId: null,
  status: "idle",
  error: null,
  preset: "balanced",
  phase: null,
  startedAt: null,
};

export function AnonymizeTool() {
  const t = useTranslations("tools.anonymize");
  const [state, setState] = useState<State>(initialState);
  const [pasteText, setPasteText] = useState("");
  const [mobileTab, setMobileTab] = useState<MobileTab>("original");
  const esRef = useRef<EventSource | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => () => esRef.current?.close(), []);

  // Live tick of "seconds since job started" while running. Cheap setInterval —
  // we tick once a second, only re-render the elapsed line.
  const [elapsedMs, setElapsedMs] = useState(0);
  useEffect(() => {
    if (state.status !== "running" || state.startedAt === null) {
      setElapsedMs(0);
      return;
    }
    const start = state.startedAt;
    setElapsedMs(Date.now() - start);
    const id = window.setInterval(() => {
      setElapsedMs(Date.now() - start);
    }, 1000);
    return () => window.clearInterval(id);
  }, [state.status, state.startedAt]);

  const reset = () => {
    esRef.current?.close();
    esRef.current = null;
    setState(initialState);
    setPasteText("");
  };

  const isExtAllowed = (name: string) => {
    const lower = name.toLowerCase();
    return ACCEPTED_EXTS.some((ext) => lower.endsWith(ext));
  };

  const startJob = useCallback(
    async (fileId: string, originalText: string, filename: string, preset: Preset) => {
      let jobId: string;
      try {
        const r = await fetch(backendUrl("/api/jobs"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tools: [{ slug: "anonymize", params: { preset } }],
            inputs: [fileId],
          }),
        });
        if (!r.ok) {
          setState((s) => ({ ...s, status: "error", error: t("error-generic") }));
          return;
        }
        const j = (await r.json()) as { job_id: string };
        jobId = j.job_id;
      } catch {
        setState((s) => ({ ...s, status: "error", error: t("error-generic") }));
        return;
      }

      setState((s) => ({
        ...s,
        fileId,
        filename,
        originalText,
        redactedText: "",
        spans: [],
        jobId,
        status: "running",
        error: null,
        preset,
        phase: "queued",
        startedAt: Date.now(),
      }));

      const es = new EventSource(backendUrl(`/api/jobs/${jobId}/events`));
      esRef.current = es;

      es.addEventListener("node.progress", (ev) => {
        const data = JSON.parse((ev as MessageEvent).data) as { phase?: string };
        if (!data.phase) return;
        const valid: Phase[] = [
          "downloading_opf",
          "loading_opf",
          "installing_opf",
          "detecting",
          "writing_report",
        ];
        if (valid.includes(data.phase as Phase)) {
          setState((s) => ({ ...s, phase: data.phase as Phase }));
        }
      });

      es.addEventListener("anonymize.span", (ev) => {
        const data = JSON.parse((ev as MessageEvent).data) as {
          category: string;
          offset_start: number;
          offset_end: number;
        };
        setState((s) => ({
          ...s,
          spans: [
            ...s.spans,
            {
              category: data.category,
              offset_start: data.offset_start,
              offset_end: data.offset_end,
            },
          ],
        }));
      });

      es.addEventListener("done", async (ev) => {
        const data = JSON.parse((ev as MessageEvent).data) as { artifacts: Artifact[] };
        const redactedArtifact = (data.artifacts ?? []).find((a) =>
          a.name.endsWith(".md") || a.name.endsWith(".txt") || a.name.endsWith(".markdown"),
        );
        let redactedText = "";
        if (redactedArtifact) {
          try {
            const resp = await fetch(backendUrl(redactedArtifact.url));
            if (resp.ok) redactedText = await resp.text();
          } catch {
            // ignore — still mark done
          }
        }
        setState((s) => ({ ...s, redactedText, status: "done", phase: null }));
        es.close();
        esRef.current = null;
      });

      es.addEventListener("error", (ev) => {
        const me = ev as MessageEvent;
        if (typeof me.data === "string" && me.data.length > 0) {
          let message = t("error-generic");
          try {
            const data = JSON.parse(me.data) as { code?: string; message?: string };
            message = data.message ?? data.code ?? message;
          } catch {
            // generic
          }
          setState((s) =>
            s.status === "cancelled" ? s : { ...s, status: "error", error: message },
          );
          es.close();
          esRef.current = null;
          return;
        }
        if (es.readyState === EventSource.CLOSED) {
          setState((s) =>
            s.status === "cancelled"
              ? s
              : { ...s, status: "error", error: t("error-generic") },
          );
        }
      });
    },
    [t],
  );

  const stop = () => {
    esRef.current?.close();
    esRef.current = null;
    setState((s) => ({ ...s, status: "cancelled", phase: null }));
    toast.info(t("stopped"));
  };

  const resume = useCallback(() => {
    if (!state.fileId || !state.filename) return;
    void startJob(state.fileId, state.originalText, state.filename, state.preset);
  }, [startJob, state.fileId, state.filename, state.originalText, state.preset]);

  const uploadAndRun = async (text: string, filename: string, preset: Preset) => {
    if (!text.trim()) {
      setState((s) => ({ ...s, status: "error", error: t("error-empty") }));
      return;
    }
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    if (blob.size > MAX_KB * 1024) {
      setState((s) => ({ ...s, status: "error", error: t("error-too-large") }));
      return;
    }
    setState((s) => ({ ...s, status: "uploading", error: null }));
    const fd = new FormData();
    fd.append("file", blob, filename);

    try {
      const r = await fetch(backendUrl("/api/files"), { method: "POST", body: fd });
      if (!r.ok) {
        setState((s) => ({ ...s, status: "error", error: t("error-generic") }));
        return;
      }
      const data = (await r.json()) as { file_id: string; filename: string };
      await startJob(data.file_id, text, data.filename, preset);
    } catch {
      setState((s) => ({ ...s, status: "error", error: t("error-generic") }));
    }
  };

  const onUploadFile = async (file: File) => {
    if (!isExtAllowed(file.name)) {
      setState((s) => ({ ...s, status: "error", error: t("error-not-supported") }));
      return;
    }
    if (file.size > MAX_KB * 1024) {
      setState((s) => ({ ...s, status: "error", error: t("error-too-large") }));
      return;
    }
    const text = await file.text();
    await uploadAndRun(text, file.name, state.preset);
  };

  const onRunPaste = async () => {
    if (!pasteText.trim()) {
      setState((s) => ({ ...s, status: "error", error: t("error-empty") }));
      return;
    }
    await uploadAndRun(pasteText, "pasted.md", state.preset);
  };

  const replace = () => {
    reset();
    fileInputRef.current?.click();
  };

  const setPreset = (preset: Preset) => setState((s) => ({ ...s, preset }));

  const onCopyRedacted = async () => {
    try {
      await navigator.clipboard.writeText(state.redactedText);
      toast.success(t("copied"));
    } catch {
      toast.error(t("copy-failed"));
    }
  };

  const totalChars = state.originalText.length;
  const detectedCount = state.spans.length;
  const progressPercent =
    state.status === "running" && totalChars > 0
      ? Math.min(
          99,
          Math.round(
            (state.spans.reduce(
              (acc, s) => Math.max(acc, s.offset_end),
              0,
            ) /
              totalChars) *
              100,
          ),
        )
      : state.status === "done"
        ? 100
        : 0;

  const hasInput = state.fileId !== null;
  const isRunning = state.status === "running" || state.status === "uploading";

  return (
    <main
      id="main"
      className="mx-auto flex min-h-screen max-w-7xl flex-col gap-4 px-6 py-8"
    >
      <header className="flex items-start justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <h1 className="font-mono text-2xl font-semibold tracking-tight">
              {t("title")}
            </h1>
            <AiBadge />
          </div>
          <p className="text-muted-foreground max-w-prose text-base">{t("subtitle")}</p>
        </div>
      </header>

      <OpfInstallBanner />

      {!hasInput && (
        <>
          <button
            type="button"
            aria-label={t("drop-here")}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const file = e.dataTransfer.files?.[0];
              if (file) void onUploadFile(file);
            }}
            className="border-input bg-card hover:bg-muted flex h-40 flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed text-sm transition-colors"
          >
            <Upload className="text-muted-foreground size-7" aria-hidden />
            <span className="font-medium">{t("drop-here")}</span>
            <span className="text-muted-foreground text-xs">
              {t("drop-help", { maxKb: MAX_KB })}
            </span>
          </button>

          <div className="flex flex-col gap-2">
            <Label htmlFor="anonymize-paste" className="text-sm font-medium">
              {t("paste-label")}
            </Label>
            <textarea
              id="anonymize-paste"
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder={t("paste-placeholder")}
              rows={6}
              className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 rounded-lg border p-3 font-mono text-sm transition-colors focus-visible:ring-3 focus-visible:outline-none"
            />
            <div className="flex flex-wrap items-end gap-3">
              <PresetPicker preset={state.preset} onChange={setPreset} t={t} />
              <Button
                onClick={() => void onRunPaste()}
                disabled={isRunning || !pasteText.trim()}
              >
                {t("paste-run")}
              </Button>
            </div>
          </div>
        </>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept=".md,.txt,.markdown,text/markdown,text/plain"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void onUploadFile(f);
          e.target.value = "";
        }}
      />

      {state.error && (
        <div role="alert" className="text-destructive text-sm">
          {state.error}
        </div>
      )}

      {state.status === "uploading" && <p className="text-sm">{t("uploading")}</p>}

      {hasInput && (
        <>
          <Progress value={progressPercent} aria-label={`${progressPercent}%`} />

          {state.status === "running" && elapsedMs > 5000 && (
            <p
              role="status"
              aria-live="polite"
              className="text-muted-foreground text-xs"
            >
              {t("slow-hint")}
            </p>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-3 text-sm">
              {state.filename && (
                <span className="font-mono text-xs">{state.filename}</span>
              )}
              <CountChip
                label={t("detected", { count: detectedCount })}
                tone={detectedCount > 0 ? "warning" : "muted"}
              />
              {state.status === "running" && state.phase && (
                <span className="text-muted-foreground text-xs">
                  · {t(`phase-${state.phase}` as PhaseKey)}
                </span>
              )}
              {state.status === "running" && elapsedMs > 0 && (
                <span
                  className="text-muted-foreground text-xs tabular-nums"
                  aria-live="polite"
                >
                  · {formatElapsed(elapsedMs)}
                </span>
              )}
              {state.status === "done" && (
                <span className="text-success text-xs">· {t("masked", { count: detectedCount })}</span>
              )}
              {state.status === "cancelled" && (
                <span className="text-warning text-xs">· {t("stopped")}</span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <PresetPicker preset={state.preset} onChange={setPreset} t={t} compact />
              {state.status === "running" && (
                <Button size="sm" variant="outline" onClick={stop}>
                  <Square className="mr-1 size-3" aria-hidden />
                  {t("stop")}
                </Button>
              )}
              {state.status === "cancelled" && (
                <Button size="sm" variant="default" onClick={resume}>
                  <Play className="mr-1 size-3" aria-hidden />
                  {t("resume")}
                </Button>
              )}
              {(state.status === "done" || state.status === "error") && (
                <Button size="sm" variant="outline" onClick={resume}>
                  <RefreshCw className="mr-1 size-3" aria-hidden />
                  {t("rerun")}
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={replace}>
                <Upload className="mr-1 size-3" aria-hidden />
                {t("replace")}
              </Button>
              {state.status === "done" && state.redactedText.length > 0 && (
                <Button size="sm" variant="outline" onClick={onCopyRedacted}>
                  <Copy className="mr-1 size-3" aria-hidden />
                  {t("copy")}
                </Button>
              )}
            </div>
          </div>

          <div role="tablist" aria-label={t("view-tabs-label")} className="flex gap-1 md:hidden">
            <TabPill
              id="anon-tab-original"
              controls="anon-panel-original"
              label={t("tab-original")}
              active={mobileTab === "original"}
              onClick={() => setMobileTab("original")}
            />
            <TabPill
              id="anon-tab-redacted"
              controls="anon-panel-redacted"
              label={t("tab-redacted")}
              active={mobileTab === "redacted"}
              onClick={() => setMobileTab("redacted")}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Card
              role="tabpanel"
              id="anon-panel-original"
              aria-labelledby="anon-tab-original"
              data-scanning={state.status === "running" ? "true" : undefined}
              className={
                "anon-scan relative overflow-hidden " +
                (mobileTab === "original" ? "" : "hidden md:block")
              }
            >
              <CardHeader>
                <CardTitle as="h2" className="text-sm font-semibold">
                  {t("tab-original")}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[70vh]">
                  <HighlightedText
                    text={state.originalText}
                    spans={state.spans}
                    spanAriaLabel={(s) =>
                      t("span-aria", {
                        start: s.offset_start,
                        end: s.offset_end,
                        category: s.category,
                      })
                    }
                  />
                </ScrollArea>
              </CardContent>
            </Card>

            <Card
              role="tabpanel"
              id="anon-panel-redacted"
              aria-labelledby="anon-tab-redacted"
              className={mobileTab === "redacted" ? "" : "hidden md:block"}
            >
              <CardHeader>
                <CardTitle as="h2" className="text-sm font-semibold">
                  {t("tab-redacted")}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[70vh]">
                  <div
                    aria-label={t("stream-region")}
                    className="font-mono text-sm whitespace-pre-wrap p-4 leading-relaxed"
                  >
                    {state.status === "done" ? (
                      state.redactedText.length > 0 ? (
                        state.redactedText
                      ) : (
                        <span className="text-muted-foreground">{t("no-pii")}</span>
                      )
                    ) : (
                      <span className="text-muted-foreground">…</span>
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>

          <p className="text-muted-foreground text-xs">{t("footer-license")}</p>
        </>
      )}
    </main>
  );
}

const HighlightedText = memo(function HighlightedText({
  text,
  spans,
  spanAriaLabel,
}: {
  text: string;
  spans: Span[];
  spanAriaLabel: (s: Span) => string;
}) {
  const segments = useMemo(() => buildSegments(text, spans), [text, spans]);
  return (
    <div className="font-mono text-sm whitespace-pre-wrap p-4 leading-relaxed">
      {segments.map((seg, idx) =>
        seg.span ? (
          <mark
            key={idx}
            aria-label={spanAriaLabel(seg.span)}
            className="bg-warning/25 text-foreground rounded-sm px-0.5"
          >
            {seg.text}
          </mark>
        ) : (
          <Fragment key={idx}>{seg.text}</Fragment>
        ),
      )}
    </div>
  );
});

function formatElapsed(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

type Segment = { text: string; span: Span | null };

function buildSegments(text: string, spans: Span[]): Segment[] {
  if (spans.length === 0) return [{ text, span: null }];
  const sorted = [...spans].sort((a, b) => a.offset_start - b.offset_start);
  const out: Segment[] = [];
  let cursor = 0;
  for (const s of sorted) {
    if (s.offset_start < cursor) continue; // overlap, skip
    if (s.offset_start > cursor) {
      out.push({ text: text.slice(cursor, s.offset_start), span: null });
    }
    out.push({ text: text.slice(s.offset_start, s.offset_end), span: s });
    cursor = s.offset_end;
  }
  if (cursor < text.length) {
    out.push({ text: text.slice(cursor), span: null });
  }
  return out;
}

function PresetPicker({
  preset,
  onChange,
  t,
  compact,
}: {
  preset: Preset;
  onChange: (p: Preset) => void;
  t: ReturnType<typeof useTranslations<"tools.anonymize">>;
  compact?: boolean;
}) {
  return (
    <div className={compact ? "flex items-center gap-2" : "flex flex-col gap-1"}>
      <Label htmlFor="anonymize-preset" className="text-xs">
        {t("preset-label")}
      </Label>
      <select
        id="anonymize-preset"
        value={preset}
        onChange={(e) => onChange(e.target.value as Preset)}
        className="border-input bg-background focus-visible:ring-ring/50 h-8 rounded-md border px-2 text-sm focus-visible:ring-2 focus-visible:outline-none"
      >
        <option value="balanced">{t("preset-balanced")}</option>
        <option value="recall">{t("preset-recall")}</option>
        <option value="precision">{t("preset-precision")}</option>
      </select>
    </div>
  );
}

function CountChip({
  label,
  tone,
}: {
  label: string;
  tone: "warning" | "muted";
}) {
  const cls =
    tone === "warning"
      ? "bg-warning/15 text-warning"
      : "bg-muted text-muted-foreground";
  return (
    <span
      className={
        "inline-flex items-center rounded px-2 py-0.5 text-xs font-semibold " + cls
      }
    >
      {label}
    </span>
  );
}

function TabPill({
  id,
  controls,
  label,
  active,
  onClick,
}: {
  id: string;
  controls: string;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      id={id}
      aria-controls={controls}
      aria-selected={active}
      tabIndex={active ? 0 : -1}
      onClick={onClick}
      className={
        "focus-visible:ring-ring/50 inline-flex h-10 flex-1 items-center justify-center rounded-md text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none " +
        (active
          ? "bg-foreground text-background"
          : "border-input bg-background text-muted-foreground border")
      }
    >
      {label}
    </button>
  );
}
