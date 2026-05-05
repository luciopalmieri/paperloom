"use client";

import {
  ArrowDown,
  ArrowUp,
  Download,
  Plus,
  RotateCw,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { OpfInstallBanner } from "@/components/anonymize/install-banner";
import {
  EventTimeline,
  type TimelineItem,
  type TimelineItemStatus,
} from "@/components/chain/event-timeline";
import { AiBadge } from "@/components/ui/ai-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { backendUrl } from "@/lib/api";

type ParamSpec =
  | { name: string; type: "number"; default?: number; required?: boolean }
  | { name: string; type: "text"; default?: string; required?: boolean }
  | {
      name: string;
      type: "enum";
      options: string[];
      default?: string;
      required?: boolean;
    };

type ToolDef = { slug: string; ai?: boolean; params: ParamSpec[] };

const POSITIONS = [
  "bottom-center",
  "bottom-left",
  "bottom-right",
  "top-center",
  "top-left",
  "top-right",
  "center",
];

const TOOLS: ToolDef[] = [
  { slug: "ocr-to-markdown", ai: true, params: [] },
  {
    slug: "anonymize",
    ai: true,
    params: [
      {
        name: "preset",
        type: "enum",
        options: ["balanced", "recall", "precision"],
        default: "balanced",
      },
    ],
  },
  { slug: "pdf-to-text", params: [] },
  { slug: "pdf-to-images", params: [{ name: "dpi", type: "number", default: 150 }] },
  { slug: "merge-pdfs", params: [] },
  {
    slug: "split-pdf",
    params: [
      { name: "every_n", type: "number", default: 1 },
      { name: "ranges", type: "text" },
    ],
  },
  { slug: "extract-pages", params: [{ name: "pages", type: "text", required: true }] },
  { slug: "delete-pages", params: [{ name: "pages", type: "text", required: true }] },
  {
    slug: "rotate-pages",
    params: [
      {
        name: "degrees",
        type: "enum",
        options: ["90", "180", "270"],
        default: "90",
      },
      { name: "pages", type: "text" },
    ],
  },
  { slug: "reorder-pages", params: [{ name: "order", type: "text", required: true }] },
  { slug: "compress-pdf", params: [{ name: "quality", type: "number", default: 75 }] },
  { slug: "strip-metadata", params: [] },
  { slug: "images-to-pdf", params: [] },
  { slug: "markdown-to-html", params: [] },
  { slug: "markdown-to-pdf", params: [] },
  { slug: "html-to-pdf", params: [] },
  { slug: "pdf-to-html", params: [] },
  {
    slug: "add-page-numbers",
    params: [
      { name: "position", type: "enum", options: POSITIONS, default: "bottom-center" },
      { name: "format", type: "text", default: "{page} / {total}" },
      { name: "font_size", type: "number", default: 10 },
    ],
  },
  {
    slug: "add-watermark",
    params: [
      { name: "text", type: "text", required: true },
      { name: "position", type: "enum", options: POSITIONS, default: "center" },
      { name: "opacity", type: "number", default: 0.25 },
      { name: "font_size", type: "number", default: 64 },
      { name: "rotation", type: "number", default: 30 },
    ],
  },
];

const TOOL_BY_SLUG = new Map(TOOLS.map((t) => [t.slug, t]));

type FileState = { file_id: string; filename: string; size: number; pages: number | null };
type NodeState = { uid: string; slug: string; params: Record<string, string> };
type Artifact = { name: string; size: number; url: string };
type Status = "idle" | "running" | "done" | "error" | "cancelled";

const newUid = () => Math.random().toString(36).slice(2, 9);
const DRAFT_KEY = "paperloom.chain.draft.v1";

function defaultParams(def: ToolDef): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of def.params) {
    if (p.default !== undefined) out[p.name] = String(p.default);
    else out[p.name] = "";
  }
  return out;
}

function paramsForBackend(node: NodeState): Record<string, unknown> {
  const def = TOOL_BY_SLUG.get(node.slug);
  if (!def) return {};
  const out: Record<string, unknown> = {};
  for (const p of def.params) {
    const raw = (node.params[p.name] ?? "").trim();
    if (!raw) continue;
    if (p.type === "number") {
      const n = Number(raw);
      if (!Number.isNaN(n)) out[p.name] = n;
    } else if (p.name === "order") {
      out[p.name] = raw
        .split(",")
        .map((x) => Number(x.trim()))
        .filter((n) => Number.isFinite(n));
    } else {
      out[p.name] = raw;
    }
  }
  return out;
}

export function ChainBuilder({
  initial,
  fromFileId,
}: {
  initial?: string;
  fromFileId?: string;
}) {
  const t = useTranslations("tools.chain");
  const tNames = useTranslations("tools.names");
  const tParams = useTranslations("tools.params");
  const tCat = useTranslations("tools.catalogue");
  const tAnon = useTranslations("tools.anonymize");

  const initialUid = useId();
  const initialNode = initial && TOOL_BY_SLUG.has(initial)
    ? [{ uid: initialUid, slug: initial, params: defaultParams(TOOL_BY_SLUG.get(initial)!) }]
    : [];

  const [files, setFiles] = useState<FileState[]>([]);
  const [nodes, setNodes] = useState<NodeState[]>(initialNode);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [rawEvents, setRawEvents] = useState<string[]>([]);
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [liveAnnouncement, setLiveAnnouncement] = useState<string>("");
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [nonEnWarning, setNonEnWarning] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  const hasAnonymize = nodes.some((n) => n.slug === "anonymize");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const esRef = useRef<EventSource | null>(null);
  const nodeRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Restore draft on mount (skip when ?initial or ?from provided — explicit
  // user intent). When ?from is provided, prefill that file via the metadata
  // endpoint so the user does not have to re-upload.
  useEffect(() => {
    if (initial || fromFileId) {
      if (fromFileId) {
        let cancelled = false;
        (async () => {
          try {
            const r = await fetch(backendUrl(`/api/files/${fromFileId}`));
            if (!r.ok) return;
            const data = (await r.json()) as FileState;
            if (cancelled) return;
            setFiles([data]);
          } catch {
            // ignore — user can still upload manually
          }
        })();
        setHydrated(true);
        return () => {
          cancelled = true;
        };
      }
      setHydrated(true);
      return;
    }
    try {
      const raw = window.localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { files?: FileState[]; nodes?: NodeState[] };
        if (parsed.files?.length || parsed.nodes?.length) {
          setFiles(parsed.files ?? []);
          setNodes(parsed.nodes ?? []);
          toast.success(t("draft-restored"), {
            action: {
              label: t("draft-discard"),
              onClick: () => {
                setFiles([]);
                setNodes([]);
                window.localStorage.removeItem(DRAFT_KEY);
              },
            },
          });
        }
      }
    } catch {
      // ignore
    }
    setHydrated(true);
  }, [initial, fromFileId, t]);

  // Persist draft.
  useEffect(() => {
    if (!hydrated) return;
    try {
      if (files.length === 0 && nodes.length === 0) {
        window.localStorage.removeItem(DRAFT_KEY);
      } else {
        window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ files, nodes }));
      }
    } catch {
      // ignore
    }
  }, [files, nodes, hydrated]);

  useEffect(() => () => esRef.current?.close(), []);

  // Keyboard shortcuts: Cmd/Ctrl+Enter to run, Esc to cancel.
  // Refs avoid stale closures.
  const runRef = useRef<() => void>(() => {});
  const cancelRef = useRef<() => void>(() => {});
  const statusRef = useRef<Status>("idle");
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isField =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        if (statusRef.current !== "running") runRef.current();
        return;
      }
      if (e.key === "Escape" && !isField && statusRef.current === "running") {
        e.preventDefault();
        cancelRef.current();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const upload = async (f: File) => {
    const fd = new FormData();
    fd.append("file", f);
    const r = await fetch(backendUrl("/api/files"), { method: "POST", body: fd });
    if (!r.ok) {
      setError(t("error-upload-failed", { name: f.name }));
      toast.error(t("error-upload-failed", { name: f.name }));
      return;
    }
    const data = (await r.json()) as FileState;
    setFiles((prev) => [...prev, data]);
    toast.success(t("upload-success", { name: data.filename }));
  };

  const onUpload = async (selected: FileList | File[]) => {
    setError(null);
    const list = Array.from(selected).slice(0, 10 - files.length);
    for (const f of list) await upload(f);
  };

  const addNode = (slug: string) => {
    const def = TOOL_BY_SLUG.get(slug);
    if (!def) return;
    const newNode = { uid: newUid(), slug, params: defaultParams(def) };
    setNodes((prev) => [...prev, newNode]);
    toast.success(t("tool-added", { name: tNames(slug as Parameters<typeof tNames>[0]) }));
  };

  const moveNode = (idx: number, dir: -1 | 1) => {
    setNodes((prev) => {
      const j = idx + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[j]] = [next[j], next[idx]];
      const movedUid = next[j].uid;
      requestAnimationFrame(() => nodeRefs.current[movedUid]?.focus());
      return next;
    });
  };

  const removeNode = (idx: number) =>
    setNodes((prev) => prev.filter((_, i) => i !== idx));

  const updateParam = (idx: number, key: string, value: string) =>
    setNodes((prev) =>
      prev.map((n, i) => (i === idx ? { ...n, params: { ...n.params, [key]: value } } : n)),
    );

  const startOver = () => {
    esRef.current?.close();
    esRef.current = null;
    setFiles([]);
    setNodes([]);
    setStatus("idle");
    setError(null);
    setRawEvents([]);
    setTimeline([]);
    setArtifacts([]);
    setNonEnWarning(null);
    setLiveAnnouncement("");
    try {
      window.localStorage.removeItem(DRAFT_KEY);
    } catch {
      // ignore
    }
  };

  const cancelRun = () => {
    if (status !== "running") return;
    esRef.current?.close();
    esRef.current = null;
    setStatus("cancelled");
    statusRef.current = "cancelled";
    setTimeline((prev) =>
      prev.map((item) =>
        item.status === "active"
          ? { ...item, status: "error", endedAt: Date.now(), sublabel: t("event-cancelled") }
          : item,
      ),
    );
    toast.info(t("event-cancelled-toast"));
  };

  const updateActiveTimeline = useCallback(
    (mutate: (item: TimelineItem) => TimelineItem) => {
      setTimeline((prev) => {
        const idx = prev.findIndex((it) => it.status === "active");
        if (idx < 0) return prev;
        const next = [...prev];
        next[idx] = mutate(next[idx]);
        return next;
      });
    },
    [],
  );

  const run = async () => {
    setError(null);
    if (files.length === 0) {
      setError(t("error-no-input"));
      return;
    }
    if (nodes.length === 0) {
      setError(t("error-no-nodes"));
      return;
    }

    setStatus("running");
    statusRef.current = "running";
    setRawEvents([]);
    setArtifacts([]);
    setNonEnWarning(null);
    setLiveAnnouncement("");

    // Seed timeline: one row per node, all pending.
    const seeded: TimelineItem[] = nodes.map((n, i) => ({
      id: n.uid,
      label: `${i + 1}. ${tNames(n.slug as Parameters<typeof tNames>[0])}`,
      status: "pending" as TimelineItemStatus,
    }));
    setTimeline(seeded);

    const body = {
      tools: nodes.map((n) => ({ slug: n.slug, params: paramsForBackend(n) })),
      inputs: files.map((f) => f.file_id),
    };

    let jobId: string;
    try {
      const r = await fetch(backendUrl("/api/jobs"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        setError(r.status >= 500 ? t("error-server") : t("error-bad-request"));
        setStatus("error");
        return;
      }
      jobId = (await r.json()).job_id as string;
    } catch {
      setError(t("error-server"));
      setStatus("error");
      return;
    }

    const es = new EventSource(backendUrl(`/api/jobs/${jobId}/events`));
    esRef.current = es;

    const pushRaw = (name: string, payload: unknown) => {
      setRawEvents((prev) => [...prev, `${name}: ${JSON.stringify(payload)}`].slice(-100));
    };

    es.addEventListener("node.start", (ev) => {
      const data = JSON.parse((ev as MessageEvent).data) as { tool?: string; index?: number };
      pushRaw("node.start", data);
      const idx = data.index ?? 0;
      setTimeline((prev) => {
        const next = prev.map((it, i) =>
          i < idx
            ? { ...it, status: "done" as TimelineItemStatus, endedAt: it.endedAt ?? Date.now() }
            : i === idx
              ? { ...it, status: "active" as TimelineItemStatus, startedAt: Date.now() }
              : it,
        );
        return next;
      });
      const slug = data.tool ?? "";
      const name = TOOL_BY_SLUG.has(slug)
        ? tNames(slug as Parameters<typeof tNames>[0])
        : slug;
      setLiveAnnouncement(t("event-starting", { name }));
    });

    es.addEventListener("node.end", (ev) => {
      const data = JSON.parse((ev as MessageEvent).data) as { tool?: string; index?: number };
      pushRaw("node.end", data);
      const idx = data.index ?? 0;
      setTimeline((prev) =>
        prev.map((it, i) =>
          i === idx
            ? {
                ...it,
                status: "done" as TimelineItemStatus,
                endedAt: Date.now(),
                sublabel: undefined,
              }
            : it,
        ),
      );
    });

    es.addEventListener("progress", (ev) => {
      const data = JSON.parse((ev as MessageEvent).data);
      pushRaw("progress", data);
    });

    es.addEventListener("ocr.page", (ev) => {
      const data = JSON.parse((ev as MessageEvent).data) as {
        page: number;
        total?: number;
        page_done?: boolean;
      };
      pushRaw("ocr.page", data);
      if (data.page_done && data.total) {
        updateActiveTimeline((item) => ({
          ...item,
          sublabel: t("event-processing", { page: data.page, total: data.total ?? 0 }),
        }));
      }
    });

    es.addEventListener("anonymize.span", (ev) => {
      const data = JSON.parse((ev as MessageEvent).data);
      pushRaw("anonymize.span", data);
    });

    es.addEventListener("node.progress", (ev) => {
      const data = JSON.parse((ev as MessageEvent).data) as {
        tool?: string;
        phase?: string;
        filename?: string;
      };
      pushRaw("node.progress", data);
      const phase = data.phase ?? "";
      const known = ["downloading_opf", "loading_opf", "detecting", "writing_report"] as const;
      if ((known as readonly string[]).includes(phase)) {
        const human = t(
          (`progress.${phase}` as unknown) as Parameters<typeof t>[0],
          { filename: data.filename ?? "" },
        );
        updateActiveTimeline((item) => ({ ...item, sublabel: human }));
        setLiveAnnouncement(human);
      }
    });

    es.addEventListener("anonymize.warn", (ev) => {
      const data = JSON.parse((ev as MessageEvent).data) as {
        code: string;
        suggested_preset?: string;
      };
      pushRaw("anonymize.warn", data);
      if (data.code === "non_en_input") {
        setNonEnWarning(data.suggested_preset ?? "recall");
      }
    });

    es.addEventListener("error", (ev) => {
      const me = ev as MessageEvent;
      if (typeof me.data === "string" && me.data.length > 0) {
        let message = t("error-generic");
        try {
          const data = JSON.parse(me.data) as { code?: string; message?: string };
          message = data.message ?? data.code ?? message;
        } catch {
          // use generic
        }
        setError(message);
        setStatus("error");
        setTimeline((prev) =>
          prev.map((it) =>
            it.status === "active"
              ? { ...it, status: "error" as TimelineItemStatus, endedAt: Date.now() }
              : it,
          ),
        );
        es.close();
        esRef.current = null;
        return;
      }
      if (es.readyState === EventSource.CLOSED) {
        setError(t("error-reconnect"));
        setStatus("error");
      }
    });

    es.addEventListener("done", (ev) => {
      const data = JSON.parse((ev as MessageEvent).data) as { artifacts: Artifact[] };
      pushRaw("done", data);
      setArtifacts(data.artifacts ?? []);
      setStatus("done");
      statusRef.current = "done";
      setTimeline((prev) =>
        prev.map((it) =>
          it.status === "active" || it.status === "pending"
            ? { ...it, status: "done" as TimelineItemStatus, endedAt: Date.now() }
            : it,
        ),
      );
      setLiveAnnouncement(t("run-success"));
      toast.success(t("run-success"));
      es.close();
      esRef.current = null;
    });
  };

  runRef.current = run;
  cancelRef.current = cancelRun;
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const sortedTools = useMemo(
    () =>
      TOOLS.slice().sort((a, b) =>
        tNames(a.slug as Parameters<typeof tNames>[0]).localeCompare(
          tNames(b.slug as Parameters<typeof tNames>[0]),
        ),
      ),
    [tNames],
  );

  const statusBadgeVariant: "outline" | "destructive" | "secondary" =
    status === "error" || status === "cancelled"
      ? "destructive"
      : status === "done"
        ? "secondary"
        : "outline";

  const statusLabel =
    status === "cancelled" ? t("status-cancelled") : t(`status-${status}`);

  return (
    <main
      id="main"
      className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 px-6 py-8 pb-28 sm:pb-8"
    >
      <header>
        <h1 className="font-mono text-2xl font-semibold tracking-tight">
          {t("title")}
        </h1>
        <p className="text-muted-foreground mt-2 max-w-prose text-base">
          {t("subtitle")}
        </p>
      </header>

      {hasAnonymize && <OpfInstallBanner />}

      <Card>
        <CardHeader>
          <CardTitle as="h2" className="text-sm font-semibold">
            {t("selected-files", { count: files.length })}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (e.dataTransfer.files?.length) onUpload(e.dataTransfer.files);
            }}
            className="border-input hover:bg-muted focus-visible:ring-ring/50 flex h-32 flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none sm:h-24"
          >
            <Upload className="text-muted-foreground size-5" aria-hidden />
            <span>{t("drop-files")}</span>
            <span className="text-muted-foreground text-xs">
              {t("drop-hint", { max: 10 })}
            </span>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="application/pdf,.pdf,image/png,image/jpeg,image/webp,image/tiff,image/bmp,image/gif"
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.length) onUpload(e.target.files);
              }}
            />
          </button>
          {files.length > 0 && (
            <ul className="flex flex-col gap-1 text-sm">
              {files.map((f) => (
                <li key={f.file_id} className="flex items-center justify-between">
                  <span className="truncate">
                    <code className="text-xs">{f.filename}</code>
                    {f.pages !== null && (
                      <span className="text-muted-foreground ml-2 text-xs">
                        {t("pages-count", { count: f.pages })}
                      </span>
                    )}
                  </span>
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    aria-label={t("remove-file")}
                    onClick={() =>
                      setFiles((prev) => prev.filter((x) => x.file_id !== f.file_id))
                    }
                  >
                    <Trash2 className="size-3" aria-hidden />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle as="h2" className="flex flex-col items-stretch gap-2 text-sm font-semibold sm:flex-row sm:items-center sm:justify-between">
            <span>{t("steps-title")}</span>
            <ToolPicker
              label={t("add-tool")}
              tools={sortedTools}
              tNames={tNames}
              onPick={addNode}
            />
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {nodes.length === 0 && (
            <p className="text-muted-foreground text-sm">{t("no-nodes")}</p>
          )}
          {nodes.map((node, idx) => {
            const def = TOOL_BY_SLUG.get(node.slug)!;
            const name = tNames(node.slug as Parameters<typeof tNames>[0]);
            return (
              <div
                key={node.uid}
                ref={(el) => {
                  nodeRefs.current[node.uid] = el;
                }}
                role="group"
                aria-label={t("node-label", { n: idx + 1, name })}
                aria-roledescription={t("node-roledescription")}
                className="border-input focus-visible:ring-ring/50 rounded-lg border p-3 focus-visible:ring-2 focus-visible:outline-none"
                onKeyDown={(e) => {
                  if (e.key === "Delete") {
                    if ((e.target as HTMLElement).tagName === "INPUT") return;
                    if ((e.target as HTMLElement).tagName === "SELECT") return;
                    e.preventDefault();
                    removeNode(idx);
                  } else if (e.altKey && e.key === "ArrowUp") {
                    e.preventDefault();
                    moveNode(idx, -1);
                  } else if (e.altKey && e.key === "ArrowDown") {
                    e.preventDefault();
                    moveNode(idx, 1);
                  }
                }}
                tabIndex={0}
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Badge variant="secondary">{idx + 1}</Badge>
                    <span>{name}</span>
                    {def.ai && <AiBadge />}
                  </div>
                  <div className="flex gap-1">
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      aria-label={t("move-up")}
                      disabled={idx === 0}
                      onClick={() => moveNode(idx, -1)}
                    >
                      <ArrowUp className="size-3" aria-hidden />
                    </Button>
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      aria-label={t("move-down")}
                      disabled={idx === nodes.length - 1}
                      onClick={() => moveNode(idx, 1)}
                    >
                      <ArrowDown className="size-3" aria-hidden />
                    </Button>
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      aria-label={t("remove-node")}
                      onClick={() => removeNode(idx)}
                    >
                      <Trash2 className="size-3" aria-hidden />
                    </Button>
                  </div>
                </div>
                {def.params.length > 0 && (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {def.params.map((p) => (
                      <div key={p.name} className="flex flex-col gap-1">
                        <Label htmlFor={`${node.uid}-${p.name}`} className="text-xs">
                          {tParams(p.name as Parameters<typeof tParams>[0])}
                          {p.required && " *"}
                        </Label>
                        {p.type === "enum" ? (
                          <select
                            id={`${node.uid}-${p.name}`}
                            value={node.params[p.name] ?? ""}
                            onChange={(e) => updateParam(idx, p.name, e.target.value)}
                            aria-required={p.required}
                            className="border-input bg-background focus-visible:ring-ring/50 h-8 rounded-md border px-2 text-sm focus-visible:ring-2 focus-visible:outline-none"
                          >
                            <option value=""></option>
                            {p.options.map((opt) => (
                              <option key={opt} value={opt}>
                                {opt}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <Input
                            id={`${node.uid}-${p.name}`}
                            type={p.type === "number" ? "number" : "text"}
                            value={node.params[p.name] ?? ""}
                            onChange={(e) => updateParam(idx, p.name, e.target.value)}
                            aria-required={p.required}
                            className="h-8"
                          />
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {error && (
        <div
          role="alert"
          className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
        >
          <p className="text-destructive text-sm">{error}</p>
          {(status === "error" || status === "cancelled") && (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => void run()}>
                <RotateCw className="mr-1 size-3" aria-hidden />
                {t("retry")}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setError(null)}>
                <X className="mr-1 size-3" aria-hidden />
                {t("clear")}
              </Button>
            </div>
          )}
        </div>
      )}

      {nonEnWarning && (
        <p
          role="status"
          className="bg-warning/10 text-foreground border-warning/40 flex items-start gap-2 rounded border p-2 text-sm"
        >
          <span aria-hidden>⚠</span>
          <span>{tAnon("non-en-warning", { preset: nonEnWarning })}</span>
        </p>
      )}

      {(timeline.length > 0 || rawEvents.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle as="h2" className="text-sm font-semibold">{t("events")}</CardTitle>
          </CardHeader>
          <CardContent>
            <EventTimeline
              items={timeline}
              rawEvents={rawEvents}
              liveAnnouncement={liveAnnouncement}
            />
          </CardContent>
        </Card>
      )}

      {artifacts.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {artifacts.map((a) => (
            <a
              key={a.name}
              href={backendUrl(a.url)}
              download={a.name}
              className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-9 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium"
            >
              <Download className="size-4" aria-hidden /> {t("download", { name: a.name })}
            </a>
          ))}
        </div>
      )}

      <div className="bg-background/95 fixed inset-x-0 bottom-0 z-30 border-t px-6 py-3 backdrop-blur sm:static sm:border-0 sm:bg-transparent sm:px-0 sm:py-0 sm:backdrop-blur-none">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Badge variant={statusBadgeVariant} aria-live="polite">
              {statusLabel}
            </Badge>
            {(files.length > 0 || nodes.length > 0) && status !== "running" && (
              <Button size="sm" variant="ghost" onClick={startOver}>
                {t("start-over")}
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {status === "running" ? (
              <Button size="sm" variant="outline" onClick={cancelRun}>
                {t("cancel")}
              </Button>
            ) : null}
            <Button onClick={run} disabled={status === "running"}>
              {status === "running" ? t("running") : t("run")}
            </Button>
          </div>
        </div>
      </div>

      <p className="text-muted-foreground text-xs">{tCat("subtitle")}</p>
      {hasAnonymize && (
        <p className="text-muted-foreground text-xs">{tAnon("footer-license")}</p>
      )}
    </main>
  );
}

function ToolPicker({
  label,
  tools,
  tNames,
  onPick,
}: {
  label: string;
  tools: ToolDef[];
  tNames: (key: string) => string;
  onPick: (slug: string) => void;
}) {
  const selectRef = useRef<HTMLSelectElement>(null);

  const openPicker = () => {
    const el = selectRef.current;
    if (!el) return;
    type SelectWithPicker = HTMLSelectElement & { showPicker?: () => void };
    const withPicker = el as SelectWithPicker;
    if (typeof withPicker.showPicker === "function") {
      withPicker.showPicker();
    } else {
      el.focus();
    }
  };

  return (
    <div className="relative inline-flex">
      <Label htmlFor="tool-picker" className="sr-only">
        {label}
      </Label>
      <select
        ref={selectRef}
        id="tool-picker"
        defaultValue=""
        onChange={(e) => {
          if (e.target.value) {
            onPick(e.target.value);
            e.target.value = "";
          }
        }}
        className="absolute inset-0 cursor-pointer opacity-0"
        aria-label={label}
      >
        <option value="" disabled>
          {label}
        </option>
        {tools.map((tt) => (
          <option key={tt.slug} value={tt.slug}>
            {tNames(tt.slug)}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={openPicker}
        className="bg-background border-input hover:bg-muted focus-visible:ring-ring/50 inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none"
      >
        <Plus className="size-3.5" aria-hidden />
        {label}
      </button>
    </div>
  );
}
