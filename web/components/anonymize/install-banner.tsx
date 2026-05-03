"use client";

import { Check, Copy, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { backendUrl } from "@/lib/api";

const INSTALL_COMMAND = "pnpm install:opf";
const RESTART_COMMAND = "pnpm dev";

type Health = { ollama: boolean; opf: boolean };

export function OpfInstallBanner() {
  const t = useTranslations("tools.anonymize");
  const [installed, setInstalled] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(false);

  const refresh = async () => {
    setChecking(true);
    try {
      const r = await fetch(backendUrl("/api/health"));
      if (!r.ok) {
        setInstalled(null);
        return;
      }
      const data = (await r.json()) as Health;
      setInstalled(Boolean(data.opf));
    } catch {
      setInstalled(null);
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  if (installed === true) return null;

  return (
    <Card
      role="region"
      aria-labelledby="opf-install-title"
      className="border-warning/40 bg-warning/10 text-foreground"
    >
      <CardHeader>
        <CardTitle as="h2" id="opf-install-title" className="text-base">
          {t("install-title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        <p>{t("install-body")}</p>
        <div className="flex flex-col gap-1">
          <p className="text-muted-foreground text-xs">{t("install-cmd-label")}</p>
          <CopyableCommand command={INSTALL_COMMAND} variant="block" />
        </div>
        <p className="text-muted-foreground text-xs">
          {t.rich("install-restart", {
            cmd: () => <CopyableCommand command={RESTART_COMMAND} variant="inline" />,
          })}
        </p>
        <div>
          <Button size="sm" variant="ghost" onClick={refresh} disabled={checking}>
            <RefreshCw
              className={`mr-1 size-3 ${checking ? "animate-spin" : ""}`}
              aria-hidden
            />
            {t("install-recheck")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function CopyableCommand({
  command,
  variant,
}: {
  command: string;
  variant: "block" | "inline";
}) {
  const t = useTranslations("tools.anonymize");
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked — user can still select the <code> manually.
    }
  };

  if (variant === "inline") {
    return (
      <span className="inline-flex items-center gap-1 align-middle">
        <code className="bg-muted rounded px-1 py-0.5 text-xs">{command}</code>
        <button
          type="button"
          onClick={copy}
          aria-label={copied ? t("install-copied") : t("install-copy")}
          aria-live="polite"
          className="hover:bg-muted text-muted-foreground inline-flex size-5 items-center justify-center rounded transition-colors"
        >
          {copied ? (
            <Check className="size-3" aria-hidden />
          ) : (
            <Copy className="size-3" aria-hidden />
          )}
        </button>
      </span>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <code className="bg-muted flex-1 rounded px-2 py-1 text-xs">{command}</code>
      <Button size="sm" variant="outline" onClick={copy} aria-live="polite">
        {copied ? (
          <>
            <Check className="mr-1 size-3" aria-hidden /> {t("install-copied")}
          </>
        ) : (
          <>
            <Copy className="mr-1 size-3" aria-hidden /> {t("install-copy")}
          </>
        )}
      </Button>
    </div>
  );
}
