"use client";

import { Download, RotateCw, Upload } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { AiBadge } from "@/components/ui/ai-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { backendUrl } from "@/lib/api";

type UploadResp = { file_id: string; filename: string; size: number; pages: number | null };
type Artifact = { name: string; size: number; url: string };

const MAX_MB = 50;
const MAX_PAGES = 200;

type State = {
  uploaded: UploadResp | null;
  jobId: string | null;
  pages: Record<number, string>;
  pageOrder: number[];
  doneCount: number;
  totalPages: number;
  error: string | null;
  uploading: boolean;
  artifacts: Artifact[];
};

const initial: State = {
  uploaded: null,
  jobId: null,
  pages: {},
  pageOrder: [],
  doneCount: 0,
  totalPages: 0,
  error: null,
  uploading: false,
  artifacts: [],
};

const IMAGE_EXTS = [".png", ".jpg", ".jpeg", ".webp", ".tif", ".tiff", ".bmp", ".gif"];
const ACCEPTED_EXTS = [".pdf", ...IMAGE_EXTS];

const isImageName = (name: string) => {
  const lower = name.toLowerCase();
  return IMAGE_EXTS.some((ext) => lower.endsWith(ext));
};

export function OcrTool() {
  const t = useTranslations("tools.ocr-to-markdown");
  const f = useFormatter();
  const [state, setState] = useState<State>(initial);
  const [previewBust, setPreviewBust] = useState(0);
  const esRef = useRef<EventSource | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => () => esRef.current?.close(), []);

  const reset = () => {
    esRef.current?.close();
    esRef.current = null;
    setState(initial);
    setPreviewBust(0);
  };

  const startOcrJob = async (uploaded: UploadResp) => {
    let jobId: string;
    try {
      const r = await fetch(backendUrl("/api/jobs"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tools: ["ocr-to-markdown"],
          inputs: [uploaded.file_id],
        }),
      });
      if (!r.ok) {
        setState((s) => ({ ...s, error: t("error-generic") }));
        return;
      }
      const j = (await r.json()) as { job_id: string };
      jobId = j.job_id;
    } catch {
      setState((s) => ({ ...s, error: t("error-generic") }));
      return;
    }

    setState((s) => ({ ...s, jobId }));

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
        return {
          ...s,
          pages: next,
          pageOrder: order,
          doneCount: data.page_done ? s.doneCount + 1 : s.doneCount,
        };
      });
    });

    es.addEventListener("done", (ev) => {
      const data = JSON.parse((ev as MessageEvent).data) as { artifacts: Artifact[] };
      setState((s) => ({ ...s, artifacts: data.artifacts ?? [] }));
      es.close();
      esRef.current = null;
    });

    es.addEventListener("error", () => {
      // SSE reconnects on transient errors automatically. Surface a generic
      // error only if the stream cannot be re-opened.
      if (es.readyState === EventSource.CLOSED) {
        setState((s) => ({ ...s, error: t("error-generic") }));
      }
    });
  };

  const onRotate = async () => {
    if (!state.uploaded) return;
    esRef.current?.close();
    esRef.current = null;
    try {
      const r = await fetch(
        backendUrl(`/api/files/${state.uploaded.file_id}/rotate?degrees=90`),
        { method: "POST" },
      );
      if (!r.ok) {
        setState((s) => ({ ...s, error: t("error-generic") }));
        return;
      }
    } catch {
      setState((s) => ({ ...s, error: t("error-generic") }));
      return;
    }
    setPreviewBust((n) => n + 1);
    const uploaded = state.uploaded;
    setState((s) => ({
      ...s,
      jobId: null,
      pages: {},
      pageOrder: [],
      doneCount: 0,
      artifacts: [],
      error: null,
    }));
    await startOcrJob(uploaded);
  };

  const onUpload = async (file: File) => {
    reset();
    const lower = file.name.toLowerCase();
    if (!ACCEPTED_EXTS.some((ext) => lower.endsWith(ext))) {
      setState((s) => ({ ...s, error: t("error-not-supported") }));
      return;
    }
    if (file.size > MAX_MB * 1024 * 1024) {
      setState((s) => ({ ...s, error: t("error-too-large") }));
      return;
    }

    setState((s) => ({ ...s, uploading: true, error: null }));
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
          uploading: false,
          error: code === "too_many_pages" ? t("error-too-many-pages") : t("error-too-large"),
        }));
        return;
      }
      if (!r.ok) {
        setState((s) => ({ ...s, uploading: false, error: t("error-generic") }));
        return;
      }
      uploaded = (await r.json()) as UploadResp;
    } catch {
      setState((s) => ({ ...s, uploading: false, error: t("error-generic") }));
      return;
    }

    setState((s) => ({
      ...s,
      uploaded,
      uploading: false,
      totalPages: uploaded.pages ?? 0,
    }));

    await startOcrJob(uploaded);
  };

  const progressPercent = state.totalPages
    ? Math.round((state.doneCount / state.totalPages) * 100)
    : 0;

  return (
    <main className="mx-auto flex min-h-screen max-w-7xl flex-col gap-4 px-6 py-8">
      <header className="flex items-start justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
            <AiBadge />
          </div>
          <p className="text-muted-foreground">{t("subtitle")}</p>
        </div>
      </header>

      {!state.uploaded && (
        <button
          type="button"
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
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf,image/png,image/jpeg,image/webp,image/tiff,image/bmp,image/gif"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onUpload(f);
            }}
          />
        </button>
      )}

      {state.error && (
        <div role="alert" className="text-destructive text-sm">
          {state.error}
        </div>
      )}

      {state.uploading && <p className="text-sm">{t("uploading")}</p>}

      {state.uploaded && state.jobId && (
        <>
          <Progress value={progressPercent} aria-label={`${progressPercent}%`} />

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Card className="overflow-hidden">
              <CardHeader className="flex flex-row items-center justify-between gap-2">
                <CardTitle className="text-sm font-medium">{state.uploaded.filename}</CardTitle>
                {isImageName(state.uploaded.filename) && (
                  <button
                    type="button"
                    onClick={onRotate}
                    aria-label={t("rotate")}
                    className="border-input hover:bg-muted inline-flex h-7 items-center gap-1 rounded-md border px-2 text-xs"
                  >
                    <RotateCw className="size-3" aria-hidden />
                    {t("rotate")}
                  </button>
                )}
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[70vh]">
                  <div className="flex flex-col gap-4 p-4">
                    {Array.from({ length: state.totalPages }, (_, i) => i + 1).map((p) => (
                      <PagePreview
                        key={p}
                        fileId={state.uploaded!.file_id}
                        page={p}
                        bust={previewBust}
                        alt={t("page-of", { page: p, filename: state.uploaded!.filename })}
                      />
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>

            <Card className="overflow-hidden">
              <CardHeader>
                <CardTitle className="text-sm font-medium">Markdown</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[70vh]">
                  <div
                    aria-live="polite"
                    aria-label={t("stream-region")}
                    className="prose prose-sm dark:prose-invert max-w-none p-4"
                  >
                    {state.pageOrder.length === 0 ? (
                      <p className="text-muted-foreground">{t("no-output-yet")}</p>
                    ) : (
                      state.pageOrder.map((p) => (
                        <pre
                          key={p}
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

          <div className="flex items-center justify-between">
            <p className="text-muted-foreground text-xs">
              {f.number(state.doneCount)} / {f.number(state.totalPages)}
            </p>
            {state.artifacts.length > 0 && (
              <div className="flex gap-2">
                {state.artifacts.map((a) => (
                  <a
                    key={a.name}
                    href={backendUrl(a.url)}
                    download={a.name}
                    className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-9 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium"
                  >
                    <Download className="size-4" aria-hidden />
                    {t("download", {
                      name: a.name,
                      size: f.number(a.size, { style: "unit", unit: "byte" }),
                    })}
                  </a>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </main>
  );
}

function PagePreview({
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
    <div className="border-input relative overflow-hidden rounded border">
      {!loaded && <Skeleton className="aspect-[8.5/11] w-full" />}
      {/* Server-rendered PNG; the backend handles caching/etag in later phases. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={alt}
        className={loaded ? "block w-full" : "hidden"}
        onLoad={() => setLoaded(true)}
      />
    </div>
  );
}
