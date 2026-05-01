"use client";

import { Check, Copy, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { backendUrl } from "@/lib/api";

const INSTALL_COMMAND = "npm run install:opf";

type Health = { ollama: boolean; opf: boolean };

export function OpfInstallBanner() {
  const t = useTranslations("tools.anonymize");
  const [installed, setInstalled] = useState<boolean | null>(null);
  const [copied, setCopied] = useState(false);
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

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(INSTALL_COMMAND);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked — user can still select-and-copy from the <code> block.
    }
  };

  return (
    <Card className="border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/40">
      <CardHeader>
        <CardTitle className="text-base">{t("install-title")}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        <p>{t("install-body")}</p>
        <div className="flex flex-col gap-1">
          <p className="text-muted-foreground text-xs">{t("install-cmd-label")}</p>
          <div className="flex items-center gap-2">
            <code className="bg-muted flex-1 rounded px-2 py-1 text-xs">
              {INSTALL_COMMAND}
            </code>
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
        </div>
        <p className="text-muted-foreground text-xs">{t("install-restart")}</p>
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
