"use client";

import { ArrowDown, ArrowUp, Download, Plus, Trash2, Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import { OpfInstallBanner } from "@/components/anonymize/install-banner";
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
type Status = "idle" | "running" | "done" | "error";

const newUid = () => Math.random().toString(36).slice(2, 9);

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

export function ChainBuilder({ initial }: { initial?: string }) {
  const t = useTranslations("tools.chain");
  const tNames = useTranslations("tools.names");
  const tParams = useTranslations("tools.params");
  const tCat = useTranslations("tools.catalogue");

  const initialUid = useId();
  const initialNode = initial && TOOL_BY_SLUG.has(initial)
    ? [{ uid: initialUid, slug: initial, params: defaultParams(TOOL_BY_SLUG.get(initial)!) }]
    : [];

  const [files, setFiles] = useState<FileState[]>([]);
  const [nodes, setNodes] = useState<NodeState[]>(initialNode);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [events, setEvents] = useState<string[]>([]);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [nonEnWarning, setNonEnWarning] = useState<string | null>(null);
  const tAnon = useTranslations("tools.anonymize");
  const hasAnonymize = nodes.some((n) => n.slug === "anonymize");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => () => esRef.current?.close(), []);

  const upload = async (f: File) => {
    const fd = new FormData();
    fd.append("file", f);
    const r = await fetch(backendUrl("/api/files"), { method: "POST", body: fd });
    if (!r.ok) {
      setError(t("error-generic"));
      return;
    }
    const data = (await r.json()) as FileState;
    setFiles((prev) => [...prev, data]);
  };

  const onUpload = async (selected: FileList | File[]) => {
    setError(null);
    const list = Array.from(selected).slice(0, 10 - files.length);
    for (const f of list) await upload(f);
  };

  const addNode = (slug: string) => {
    const def = TOOL_BY_SLUG.get(slug);
    if (!def) return;
    setNodes((prev) => [...prev, { uid: newUid(), slug, params: defaultParams(def) }]);
  };

  const moveNode = (idx: number, dir: -1 | 1) => {
    setNodes((prev) => {
      const j = idx + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
  };

  const removeNode = (idx: number) =>
    setNodes((prev) => prev.filter((_, i) => i !== idx));

  const updateParam = (idx: number, key: string, value: string) =>
    setNodes((prev) =>
      prev.map((n, i) => (i === idx ? { ...n, params: { ...n.params, [key]: value } } : n)),
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
    setEvents([]);
    setArtifacts([]);
    setNonEnWarning(null);

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
        setError(t("error-generic"));
        setStatus("error");
        return;
      }
      jobId = (await r.json()).job_id as string;
    } catch {
      setError(t("error-generic"));
      setStatus("error");
      return;
    }

    const es = new EventSource(backendUrl(`/api/jobs/${jobId}/events`));
    esRef.current = es;

    const handle = (name: string, payload: unknown) => {
      setEvents((prev) => [...prev, `${name}: ${JSON.stringify(payload)}`].slice(-100));
    };

    for (const evt of [
      "node.start",
      "node.end",
      "progress",
      "ocr.page",
      "anonymize.span",
    ] as const) {
      es.addEventListener(evt, (ev) => {
        const data = JSON.parse((ev as MessageEvent).data);
        handle(evt, data);
      });
    }
    es.addEventListener("anonymize.warn", (ev) => {
      const data = JSON.parse((ev as MessageEvent).data) as {
        code: string;
        suggested_preset?: string;
      };
      handle("anonymize.warn", data);
      if (data.code === "non_en_input") {
        setNonEnWarning(data.suggested_preset ?? "recall");
      }
    });
    es.addEventListener("error", () => {
      if (es.readyState === EventSource.CLOSED) {
        setError(t("error-generic"));
        setStatus("error");
      }
    });
    es.addEventListener("done", (ev) => {
      const data = JSON.parse((ev as MessageEvent).data) as { artifacts: Artifact[] };
      setArtifacts(data.artifacts ?? []);
      setStatus("done");
      es.close();
      esRef.current = null;
    });
  };

  const sortedTools = useMemo(
    () =>
      TOOLS.slice().sort((a, b) =>
        tNames(a.slug as Parameters<typeof tNames>[0]).localeCompare(
          tNames(b.slug as Parameters<typeof tNames>[0]),
        ),
      ),
    [tNames],
  );

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 px-6 py-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground mt-1">{t("subtitle")}</p>
      </header>

      {hasAnonymize && <OpfInstallBanner />}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">
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
            className="border-input hover:bg-muted flex h-24 flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed text-sm transition-colors"
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
          <CardTitle className="flex items-center justify-between text-sm font-medium">
            <span>Chain</span>
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
            return (
              <div
                key={node.uid}
                className="border-input rounded-lg border p-3"
                onKeyDown={(e) => {
                  if (e.key === "Delete") {
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
                    <span>{tNames(node.slug as Parameters<typeof tNames>[0])}</span>
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
                            className="border-input bg-background h-8 rounded-md border px-2 text-sm"
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
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}

      {nonEnWarning && (
        <p
          role="status"
          className="border-warning/50 text-warning-foreground bg-amber-50 border-amber-300 rounded border p-2 text-sm dark:bg-amber-950/40"
        >
          {tAnon("non-en-warning", { preset: nonEnWarning })}
        </p>
      )}

      <div className="flex items-center justify-between">
        <Badge variant={status === "error" ? "destructive" : "outline"}>
          {t(`status-${status}` as "status-idle" | "status-running" | "status-done" | "status-error")}
        </Badge>
        <Button onClick={run} disabled={status === "running"}>
          {status === "running" ? t("running") : t("run")}
        </Button>
      </div>

      {artifacts.length > 0 && (
        <div className="flex gap-2">
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

      {events.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">{t("events")}</CardTitle>
          </CardHeader>
          <CardContent>
            <pre
              aria-live="polite"
              className="bg-muted max-h-72 overflow-auto rounded p-3 text-xs whitespace-pre-wrap"
            >
              {events.join("\n")}
            </pre>
          </CardContent>
        </Card>
      )}

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
  return (
    <div className="flex items-center gap-2">
      <Label htmlFor="tool-picker" className="sr-only">
        {label}
      </Label>
      <select
        id="tool-picker"
        defaultValue=""
        onChange={(e) => {
          if (e.target.value) {
            onPick(e.target.value);
            e.target.value = "";
          }
        }}
        className="border-input bg-background h-8 rounded-md border px-2 text-sm"
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
      <Plus className="text-muted-foreground size-4" aria-hidden />
    </div>
  );
}
