"use client";

import {
  ArrowRight,
  Copy,
  Download,
  RefreshCw,
  RotateCw,
  Square,
  Upload,
} from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { AiBadge } from "@/components/ui/ai-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link } from "@/i18n/navigation";
import { backendUrl } from "@/lib/api";
import { formatPageRange, parsePageRange } from "@/lib/page-range";

const AUTO_OCR_THRESHOLD = 10;

type UploadResp = { file_id: string; filename: string; size: number; pages: number | null };
type Artifact = { name: string; size: number; url: string };
type RunStatus = "idle" | "uploading" | "running" | "cancelled" | "done" | "error";
type PageStatus = "pending" | "processing" | "done" | "skipped" | "cancelled";

type PageFigures = { saved: number; total: number };

type State = {
  uploaded: UploadResp | null;
  jobId: string | null;
  pages: Record<number, string>;
  pageOrder: number[];
  donePages: Set<number>;
  doneCount: number;
  totalPages: number;
  runPages: number[];
  activePage: number | null;
  status: RunStatus;
  error: string | null;
  artifacts: Artifact[];
  includeImages: boolean;
  pageFigures: Record<number, PageFigures>;
};

const initialState: State = {
  uploaded: null,
  jobId: null,
  pages: {},
  pageOrder: [],
  donePages: new Set<number>(),
  doneCount: 0,
  totalPages: 0,
  runPages: [],
  activePage: null,
  status: "idle",
  error: null,
  artifacts: [],
  includeImages: false,
  pageFigures: {},
};

const MAX_MB = 50;
const MAX_PAGES = 200;

const IMAGE_EXTS = [".png", ".jpg", ".jpeg", ".webp", ".tif", ".tiff", ".bmp", ".gif"];
const ACCEPTED_EXTS = [".pdf", ...IMAGE_EXTS];

const isImageName = (name: string) => {
  const lower = name.toLowerCase();
  return IMAGE_EXTS.some((ext) => lower.endsWith(ext));
};

export function OcrTool() {
  const t = useTranslations("tools.ocr-to-markdown");
  const f = useFormatter();
  const [state, setState] = useState<State>(initialState);
  const [previewBust, setPreviewBust] = useState(0);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [pageInput, setPageInput] = useState("");
  const [pendingRun, setPendingRun] = useState(false);
  const [mobileTab, setMobileTab] = useState<"pages" | "preview" | "markdown">("preview");
  const esRef = useRef<EventSource | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const previewRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const markdownRefs = useRef<Record<number, HTMLPreElement | null>>({});
  const thumbStripRef = useRef<HTMLOListElement | null>(null);

  useEffect(() => () => esRef.current?.close(), []);

  const reset = () => {
    esRef.current?.close();
    esRef.current = null;
    setState(initialState);
    setPreviewBust(0);
    setSelected(new Set());
    setPageInput("");
    setPendingRun(false);
  };

  const startOcrJob = useCallback(
    async (uploaded: UploadResp, runPages: number[], includeImages: boolean) => {
      let jobId: string;
      const params: Record<string, unknown> = {};
      if (runPages.length > 0) params.pages = runPages;
      if (includeImages) params.include_images = true;
      try {
        const r = await fetch(backendUrl("/api/jobs"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tools: [{ slug: "ocr-to-markdown", params }],
            inputs: [uploaded.file_id],
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

      setPendingRun(false);
      setState((s) => ({
        ...s,
        jobId,
        runPages,
        status: "running",
        pages: {},
        pageOrder: [],
        donePages: new Set<number>(),
        doneCount: 0,
        artifacts: [],
        error: null,
        activePage: runPages[0] ?? 1,
        pageFigures: {},
      }));

      const es = new EventSource(backendUrl(`/api/jobs/${jobId}/events`));
      esRef.current = es;

      es.addEventListener("ocr.page", (ev) => {
        const data = JSON.parse((ev as MessageEvent).data) as {
          page: number;
          markdown_chunk: string;
          page_done: boolean;
        };
        setState((s) => {
          const prev = s.pages[data.page] ?? "";
          const next = { ...s.pages, [data.page]: prev + data.markdown_chunk };
          const order = s.pageOrder.includes(data.page)
            ? s.pageOrder
            : [...s.pageOrder, data.page];
          const donePages = data.page_done
            ? new Set([...s.donePages, data.page])
            : s.donePages;
          return {
            ...s,
            pages: next,
            pageOrder: order,
            donePages,
            doneCount: data.page_done ? s.doneCount + 1 : s.doneCount,
            activePage: data.page,
          };
        });
      });

      es.addEventListener("ocr.page.replace", (ev) => {
        const data = JSON.parse((ev as MessageEvent).data) as {
          page: number;
          markdown_final: string;
          figures_saved?: number;
          figures_total?: number;
        };
        setState((s) => {
          const fig: PageFigures = {
            saved: data.figures_saved ?? 0,
            total: data.figures_total ?? 0,
          };
          return {
            ...s,
            pages: { ...s.pages, [data.page]: data.markdown_final },
            pageFigures: { ...s.pageFigures, [data.page]: fig },
          };
        });
      });

      es.addEventListener("done", (ev) => {
        const data = JSON.parse((ev as MessageEvent).data) as { artifacts: Artifact[] };
        setState((s) => {
          const totalSaved = Object.values(s.pageFigures).reduce(
            (acc, f) => acc + f.saved,
            0,
          );
          const totalDetected = Object.values(s.pageFigures).reduce(
            (acc, f) => acc + f.total,
            0,
          );
          if (s.includeImages && totalDetected > 0 && totalSaved === 0) {
            toast.warning(t("figures-none-warning"));
          } else if (s.includeImages && totalSaved > 0 && totalSaved < totalDetected) {
            toast.info(
              t("figures-partial", { saved: totalSaved, total: totalDetected }),
            );
          }
          return {
            ...s,
            artifacts: data.artifacts ?? [],
            status: "done",
            activePage: null,
          };
        });
        es.close();
        esRef.current = null;
      });

      es.addEventListener("error", () => {
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
    setState((s) => ({ ...s, status: "cancelled", activePage: null }));
    toast.info(t("stopped"));
  };

  const restart = async () => {
    if (!state.uploaded) return;
    const parsed = parsePageRange(pageInput, state.totalPages);
    await startOcrJob(state.uploaded, parsed, state.includeImages);
  };

  const replace = () => {
    reset();
    inputRef.current?.click();
  };

  const onRotate = async () => {
    if (!state.uploaded) return;
    if (typeof window !== "undefined") {
      const confirmed = window.confirm(t("rotate-confirm"));
      if (!confirmed) return;
    }
    esRef.current?.close();
    esRef.current = null;
    try {
      const r = await fetch(
        backendUrl(`/api/files/${state.uploaded.file_id}/rotate?degrees=90`),
        { method: "POST" },
      );
      if (!r.ok) {
        setState((s) => ({ ...s, error: t("error-generic"), status: "error" }));
        return;
      }
    } catch {
      setState((s) => ({ ...s, error: t("error-generic"), status: "error" }));
      return;
    }
    setPreviewBust((n) => n + 1);
    const uploaded = state.uploaded;
    await startOcrJob(uploaded, [], state.includeImages);
  };

  const onUpload = async (file: File) => {
    reset();
    const lower = file.name.toLowerCase();
    if (!ACCEPTED_EXTS.some((ext) => lower.endsWith(ext))) {
      setState((s) => ({ ...s, error: t("error-not-supported"), status: "error" }));
      return;
    }
    if (file.size > MAX_MB * 1024 * 1024) {
      setState((s) => ({ ...s, error: t("error-too-large"), status: "error" }));
      return;
    }

    setState((s) => ({ ...s, status: "uploading", error: null }));
    const fd = new FormData();
    fd.append("file", file);

    let uploaded: UploadResp;
    try {
      const r = await fetch(backendUrl("/api/files"), { method: "POST", body: fd });
      if (r.status === 413) {
        const j = await r.json().catch(() => ({}));
        const code = j?.detail?.code;
        setState((s) => ({
          ...s,
          status: "error",
          error: code === "too_many_pages" ? t("error-too-many-pages") : t("error-too-large"),
        }));
        return;
      }
      if (!r.ok) {
        setState((s) => ({ ...s, status: "error", error: t("error-generic") }));
        return;
      }
      uploaded = (await r.json()) as UploadResp;
    } catch {
      setState((s) => ({ ...s, status: "error", error: t("error-generic") }));
      return;
    }

    const totalPages = uploaded.pages ?? 1;
    setState((s) => ({
      ...s,
      uploaded,
      totalPages,
      status: "idle",
    }));

    const isImage = isImageName(uploaded.filename);
    if (!isImage && totalPages > AUTO_OCR_THRESHOLD) {
      setPendingRun(true);
      return;
    }
    await startOcrJob(uploaded, [], state.includeImages);
  };

  const totalToProcess =
    state.runPages.length > 0 ? state.runPages.length : state.totalPages;
  const progressPercent = totalToProcess
    ? Math.round((state.doneCount / totalToProcess) * 100)
    : 0;

  const fullMarkdown = useMemo(
    () => state.pageOrder.map((p) => state.pages[p] ?? "").join("\n\n"),
    [state.pageOrder, state.pages],
  );

  const onCopyMarkdown = async () => {
    try {
      await navigator.clipboard.writeText(fullMarkdown);
      toast.success(t("copied"));
    } catch {
      toast.error(t("copy-failed"));
    }
  };

  const liveAnnouncement =
    totalToProcess > 0 && state.doneCount > 0
      ? t("page-processed", { n: state.doneCount, total: totalToProcess })
      : "";

  const pageStatus = useCallback(
    (p: number): PageStatus => {
      if (state.donePages.has(p)) return "done";
      if (state.runPages.length > 0 && !state.runPages.includes(p)) return "skipped";
      if (state.activePage === p && state.status === "running") return "processing";
      if (state.status === "cancelled" && state.runPages.includes(p) && !state.donePages.has(p))
        return "cancelled";
      if (state.runPages.length === 0 && state.status === "cancelled" && !state.donePages.has(p))
        return "cancelled";
      return "pending";
    },
    [state.donePages, state.runPages, state.activePage, state.status],
  );

  const jumpToPage = useCallback(
    (p: number) => {
      setState((s) => ({ ...s, activePage: p }));
      previewRefs.current[p]?.scrollIntoView({ behavior: "smooth", block: "start" });
      markdownRefs.current[p]?.scrollIntoView({ behavior: "smooth", block: "start" });
    },
    [],
  );

  const updateSelection = useCallback((next: Set<number>) => {
    setSelected(next);
    setPageInput(formatPageRange(next));
  }, []);

  const toggleSelected = useCallback((p: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      setPageInput(formatPageRange(next));
      return next;
    });
  }, []);

  const onThumbKeyDown = useCallback(
    (e: React.KeyboardEvent, p: number) => {
      if (e.key === "ArrowDown" || e.key === "ArrowRight") {
        e.preventDefault();
        const next = Math.min(state.totalPages, p + 1);
        jumpToPage(next);
        const el = thumbStripRef.current?.querySelector<HTMLButtonElement>(
          `[data-thumb="${next}"]`,
        );
        el?.focus();
      } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
        e.preventDefault();
        const prev = Math.max(1, p - 1);
        jumpToPage(prev);
        const el = thumbStripRef.current?.querySelector<HTMLButtonElement>(
          `[data-thumb="${prev}"]`,
        );
        el?.focus();
      } else if (e.key === " ") {
        e.preventDefault();
        toggleSelected(p);
      }
    },
    [state.totalPages, jumpToPage, toggleSelected],
  );

  const selectAll = () => {
    updateSelection(new Set(Array.from({ length: state.totalPages }, (_, i) => i + 1)));
  };

  const clearSelection = () => updateSelection(new Set());

  const onRangeInputChange = (value: string) => {
    setPageInput(value);
    setSelected(new Set(parsePageRange(value, state.totalPages)));
  };

  const runSelected = async () => {
    if (!state.uploaded) return;
    const parsed = parsePageRange(pageInput, state.totalPages);
    if (parsed.length === 0) return;
    await startOcrJob(state.uploaded, parsed, state.includeImages);
  };

  const runAll = async () => {
    if (!state.uploaded) return;
    await startOcrJob(state.uploaded, [], state.includeImages);
  };

  return (
    <main id="main" className="mx-auto flex min-h-screen max-w-7xl flex-col gap-4 px-6 py-8">
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

      {!state.uploaded && (
        <button
          type="button"
          aria-label={t("upload-aria")}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
          }}
          onDrop={(e) => {
            e.preventDefault();
            const file = e.dataTransfer.files?.[0];
            if (file) onUpload(file);
          }}
          className="border-input bg-card hover:bg-muted flex h-48 flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed text-sm transition-colors"
        >
          <Upload className="text-muted-foreground size-8" aria-hidden />
          <span className="font-medium">{t("drop-here")}</span>
          <span className="text-muted-foreground text-xs">
            {t("drop-help", { maxMb: MAX_MB, maxPages: MAX_PAGES })}
          </span>
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf,image/png,image/jpeg,image/webp,image/tiff,image/bmp,image/gif"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onUpload(f);
          e.target.value = "";
        }}
      />

      {state.error && (
        <div role="alert" className="text-destructive text-sm">
          {state.error}
        </div>
      )}

      {state.status === "uploading" && <p className="text-sm">{t("uploading")}</p>}

      {state.uploaded && state.totalPages > 0 && (
        <>
          <Progress value={progressPercent} aria-label={`${progressPercent}%`} />

          <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
            {liveAnnouncement}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm">
              <span className="font-medium">{state.uploaded.filename}</span>
              <span className="text-muted-foreground text-xs tabular-nums">
                {f.number(state.doneCount)} / {f.number(totalToProcess)}
              </span>
              {state.status === "cancelled" && (
                <span className="text-warning text-xs">
                  · {t("status-cancelled")}
                </span>
              )}
              {state.status === "done" && (
                <span className="text-success text-xs">
                  · {t("status-done")}
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {state.status === "running" && (
                <Button size="sm" variant="outline" onClick={stop}>
                  <Square className="mr-1 size-3" aria-hidden />
                  {t("stop")}
                </Button>
              )}
              {state.status !== "running" && state.jobId !== null && (
                <Button size="sm" variant="outline" onClick={restart}>
                  <RefreshCw className="mr-1 size-3" aria-hidden />
                  {selected.size > 0 ? t("run-selected", { n: selected.size }) : t("restart")}
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={replace}>
                <Upload className="mr-1 size-3" aria-hidden />
                {t("replace")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={onCopyMarkdown}
                disabled={fullMarkdown.length === 0}
              >
                <Copy className="mr-1 size-3" aria-hidden />
                {t("copy")}
              </Button>
              {state.artifacts.length > 0 &&
                state.artifacts.map((a) => (
                  <a
                    key={a.name}
                    href={backendUrl(a.url)}
                    download={a.name}
                    className="bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-ring/50 inline-flex h-8 items-center justify-center gap-1.5 rounded-md px-3 text-xs font-medium focus-visible:ring-2 focus-visible:outline-none"
                  >
                    <Download className="size-3" aria-hidden />
                    {t("download", {
                      name: a.name,
                      size: f.number(a.size, { style: "unit", unit: "byte" }),
                    })}
                  </a>
                ))}
              {state.uploaded && (
                <Link
                  href={`/tools/chain?initial=ocr-to-markdown&from=${state.uploaded.file_id}`}
                  className="border-input hover:bg-muted focus-visible:ring-ring/50 inline-flex h-8 items-center justify-center gap-1.5 rounded-md border px-3 text-xs font-medium focus-visible:ring-2 focus-visible:outline-none"
                >
                  {t("continue")}
                  <ArrowRight className="size-3" aria-hidden />
                </Link>
              )}
            </div>
          </div>

          {pendingRun && (
            <div
              role="region"
              aria-labelledby="pre-run-title"
              className="border-warning/40 bg-warning/10 text-foreground flex flex-col gap-3 rounded-md border p-3 text-sm"
            >
              <div>
                <p id="pre-run-title" className="font-medium">
                  {t("pre-run-title", { count: state.totalPages })}
                </p>
                <p className="text-xs opacity-80">{t("pre-run-body")}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={runAll}>
                  {t("run-all", { n: state.totalPages })}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={runSelected}
                  disabled={parsePageRange(pageInput, state.totalPages).length === 0}
                >
                  {t("run-selected", {
                    n: parsePageRange(pageInput, state.totalPages).length,
                  })}
                </Button>
              </div>
            </div>
          )}

          {state.totalPages > 1 && (
            <div className="bg-muted/40 flex flex-col gap-2 rounded-md border p-2">
              <div className="flex flex-wrap items-end gap-2">
                <div className="flex flex-col gap-1">
                  <Label htmlFor="ocr-page-range" className="text-xs">
                    {t("range-label")}
                  </Label>
                  <Input
                    id="ocr-page-range"
                    value={pageInput}
                    placeholder={t("range-placeholder")}
                    onChange={(e) => onRangeInputChange(e.target.value)}
                    className="h-8 w-44 text-xs"
                    aria-describedby="ocr-page-range-help"
                  />
                </div>
                <Button
                  size="xs"
                  variant="outline"
                  onClick={runSelected}
                  disabled={
                    state.status === "running" ||
                    parsePageRange(pageInput, state.totalPages).length === 0
                  }
                >
                  {t("run-selected", {
                    n: parsePageRange(pageInput, state.totalPages).length,
                  })}
                </Button>
                {selected.size > 0 ? (
                  <Button size="xs" variant="ghost" onClick={clearSelection}>
                    {t("clear-selection")}
                  </Button>
                ) : (
                  <Button size="xs" variant="ghost" onClick={selectAll}>
                    {t("select-all")}
                  </Button>
                )}
                {selected.size > 0 && (
                  <span className="text-muted-foreground ml-auto text-xs">
                    {t("selected-count", { n: selected.size, total: state.totalPages })}
                  </span>
                )}
              </div>
              <p id="ocr-page-range-help" className="text-muted-foreground text-xs">
                {t("range-help")}
              </p>
            </div>
          )}

          <label
            className={
              "inline-flex min-h-6 items-center gap-2 py-1.5 text-xs cursor-pointer " +
              (state.status === "running" ? "text-muted-foreground cursor-not-allowed" : "")
            }
          >
            <input
              type="checkbox"
              checked={state.includeImages}
              disabled={state.status === "running"}
              onChange={(e) =>
                setState((s) => ({ ...s, includeImages: e.target.checked }))
              }
              className="h-4 w-4"
            />
            <span className="font-medium">{t("include-figures-label")}</span>
            <span className="text-muted-foreground">{t("include-figures-help")}</span>
          </label>

          <div role="tablist" aria-label={t("view-tabs-label")} className="flex gap-1 md:hidden">
            <MobileTab
              id="ocr-tab-pages"
              controls="ocr-panel-pages"
              label={t("tab-pages")}
              active={mobileTab === "pages"}
              onClick={() => setMobileTab("pages")}
            />
            <MobileTab
              id="ocr-tab-preview"
              controls="ocr-panel-preview"
              label={t("tab-preview")}
              active={mobileTab === "preview"}
              onClick={() => setMobileTab("preview")}
            />
            <MobileTab
              id="ocr-tab-markdown"
              controls="ocr-panel-markdown"
              label={t("tab-markdown")}
              active={mobileTab === "markdown"}
              onClick={() => setMobileTab("markdown")}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-[10rem_1fr_1fr]">
            <Card
              role="tabpanel"
              id="ocr-panel-pages"
              aria-labelledby="ocr-tab-pages"
              className={
                "overflow-hidden " +
                (mobileTab === "pages" ? "" : "hidden md:block")
              }
            >
              <CardHeader className="flex flex-row items-center justify-between gap-2 px-3 py-2">
                <CardTitle as="h2" className="text-xs font-semibold uppercase tracking-wide">{t("tab-pages")}</CardTitle>
                {selected.size === 0 && state.totalPages > 1 && (
                  <button
                    type="button"
                    onClick={selectAll}
                    className="text-muted-foreground hover:text-foreground text-xs underline-offset-2 hover:underline"
                  >
                    {t("select")}
                  </button>
                )}
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[70vh]">
                  <ol
                    ref={thumbStripRef}
                    aria-label={t("tab-pages")}
                    className="flex flex-col gap-2 p-2"
                  >
                    {Array.from({ length: state.totalPages }, (_, i) => i + 1).map((p) => {
                      const active = state.activePage === p;
                      const isFirstFocusable =
                        state.activePage == null && p === 1;
                      const statusLabel = t(`page-status-${pageStatus(p)}`);
                      return (
                        <PageThumbnail
                          key={p}
                          fileId={state.uploaded!.file_id}
                          page={p}
                          bust={previewBust}
                          active={active}
                          tabIndex={active || isFirstFocusable ? 0 : -1}
                          status={pageStatus(p)}
                          selected={selected.has(p)}
                          statusLabel={statusLabel}
                          ariaLabel={t("page-aria", { page: p, status: statusLabel })}
                          selectAriaLabel={t("select-page-aria", { page: p })}
                          figures={state.pageFigures[p]}
                          onClick={() => jumpToPage(p)}
                          onToggle={() => toggleSelected(p)}
                          onKeyDown={(e) => onThumbKeyDown(e, p)}
                        />
                      );
                    })}
                  </ol>
                </ScrollArea>
              </CardContent>
            </Card>

            <Card
              role="tabpanel"
              id="ocr-panel-preview"
              aria-labelledby="ocr-tab-preview"
              className={
                "overflow-hidden " +
                (mobileTab === "preview" ? "" : "hidden md:block")
              }
            >
              <CardHeader className="flex flex-row items-center justify-between gap-2">
                <CardTitle as="h2" className="text-sm font-semibold">{t("tab-preview")}</CardTitle>
                {state.uploaded && isImageName(state.uploaded.filename) && (
                  <Button size="sm" variant="outline" onClick={onRotate}>
                    <RotateCw className="mr-1 size-3" aria-hidden />
                    {t("rotate")}
                  </Button>
                )}
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[70vh]">
                  <div className="flex flex-col gap-4 p-4">
                    {Array.from({ length: state.totalPages }, (_, i) => i + 1).map((p) => (
                      <div
                        key={p}
                        ref={(el) => {
                          previewRefs.current[p] = el;
                        }}
                      >
                        <PagePreview
                          fileId={state.uploaded!.file_id}
                          page={p}
                          bust={previewBust}
                          alt={t("page-of", { page: p, filename: state.uploaded!.filename })}
                        />
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>

            <Card
              role="tabpanel"
              id="ocr-panel-markdown"
              aria-labelledby="ocr-tab-markdown"
              className={
                "overflow-hidden " +
                (mobileTab === "markdown" ? "" : "hidden md:block")
              }
            >
              <CardHeader>
                <CardTitle as="h2" className="text-sm font-semibold">{t("tab-markdown")}</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[70vh]">
                  <div
                    aria-label={t("stream-region")}
                    className="prose prose-sm dark:prose-invert max-w-none p-4"
                  >
                    {state.pageOrder.length === 0 ? (
                      <p className="text-muted-foreground">{t("no-output-yet")}</p>
                    ) : (
                      state.pageOrder.map((p) => (
                        <pre
                          key={p}
                          ref={(el) => {
                            markdownRefs.current[p] = el;
                          }}
                          data-page={p}
                          className="bg-muted mb-4 overflow-x-auto rounded p-3 text-xs whitespace-pre-wrap"
                        >
                          {state.pages[p]}
                        </pre>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </main>
  );
}

function MobileTab({
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

const STATUS_DOT: Record<PageStatus, string> = {
  pending: "bg-muted-foreground/40",
  processing: "bg-info animate-pulse",
  done: "bg-success",
  skipped: "bg-muted-foreground/20",
  cancelled: "bg-warning",
};

const PageThumbnail = memo(function PageThumbnail({
  fileId,
  page,
  bust,
  active,
  tabIndex,
  status,
  selected,
  statusLabel,
  ariaLabel,
  selectAriaLabel,
  figures,
  onClick,
  onToggle,
  onKeyDown,
}: {
  fileId: string;
  page: number;
  bust: number;
  active: boolean;
  tabIndex: 0 | -1;
  status: PageStatus;
  selected: boolean;
  statusLabel: string;
  ariaLabel: string;
  selectAriaLabel: string;
  figures?: PageFigures;
  onClick: (page: number) => void;
  onToggle: (page: number) => void;
  onKeyDown: (e: React.KeyboardEvent, page: number) => void;
}) {
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    setLoaded(false);
  }, [bust]);
  const url =
    backendUrl(`/api/files/${fileId}/preview?page=${page}`) + (bust ? `&v=${bust}` : "");

  return (
    <li
      style={{ contentVisibility: "auto", containIntrinsicSize: "auto 180px" }}
      className={
        "group focus-within:ring-ring/50 relative flex flex-col items-stretch rounded-md border p-1 text-xs transition-colors focus-within:ring-2 " +
        (active
          ? "border-primary"
          : selected
            ? "border-foreground/40 bg-muted/40"
            : "border-input")
      }
    >
      <button
        type="button"
        data-thumb={page}
        tabIndex={tabIndex}
        aria-current={active ? "true" : undefined}
        onClick={() => onClick(page)}
        onKeyDown={(e) => onKeyDown(e, page)}
        aria-label={ariaLabel}
        className="focus:outline-none"
      >
        <div className="border-input relative aspect-[8.5/11] w-full overflow-hidden rounded border">
          <Skeleton
            className={
              "absolute inset-0 transition-opacity duration-200 ease-out-quart " +
              (loaded ? "opacity-0" : "opacity-100")
            }
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt=""
            aria-hidden
            loading="lazy"
            decoding="async"
            className={
              "absolute inset-0 block h-full w-full object-cover transition-opacity duration-200 ease-out-quart " +
              (loaded ? "opacity-100" : "opacity-0")
            }
            onLoad={() => setLoaded(true)}
          />
        </div>
        <div className="mt-1 flex items-center justify-between gap-1">
          <span className="font-medium">{page}</span>
          <span className="flex items-center gap-1">
            <span
              aria-hidden
              className={`inline-block size-2 rounded-full ${STATUS_DOT[status]}`}
            />
            <span className="text-muted-foreground text-xs">{statusLabel}</span>
          </span>
        </div>
        {figures && figures.total > 0 && (
          <div
            className={
              "mt-0.5 text-right text-xs tabular-nums " +
              (figures.saved === figures.total ? "text-success" : "text-warning")
            }
          >
            {figures.saved}/{figures.total} fig
          </div>
        )}
      </button>
      <label
        className="absolute top-1 left-1 flex h-6 w-6 cursor-pointer items-center justify-center rounded bg-background/90 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 has-[:checked]:opacity-100"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggle(page)}
          className="h-3.5 w-3.5"
          aria-label={selectAriaLabel}
        />
      </label>
    </li>
  );
});

const PagePreview = memo(function PagePreview({
  fileId,
  page,
  alt,
  bust = 0,
}: {
  fileId: string;
  page: number;
  alt: string;
  bust?: number;
}) {
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    setLoaded(false);
  }, [bust]);
  const url = backendUrl(`/api/files/${fileId}/preview?page=${page}`) + (bust ? `&v=${bust}` : "");
  return (
    <div
      style={{ contentVisibility: "auto", containIntrinsicSize: "auto 800px" }}
      className="border-input relative overflow-hidden rounded border"
    >
      {!loaded && <Skeleton className="aspect-[8.5/11] w-full" />}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={alt}
        loading="lazy"
        decoding="async"
        className={loaded ? "block w-full" : "hidden"}
        onLoad={() => setLoaded(true)}
      />
    </div>
  );
});
