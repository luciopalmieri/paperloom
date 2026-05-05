"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

type Props = {
  label: string;
  command: string;
};

export function InstallSnippet({ label, command }: Props) {
  const t = useTranslations("home.install");
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      toast.success(t("copied"));
      setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error("Clipboard unavailable");
    }
  }

  return (
    <div className="group/snippet border-border bg-card relative flex flex-col gap-2 border p-5">
      <div className="text-muted-foreground font-mono text-[11px] tracking-wide uppercase">
        {label}
      </div>
      <div className="flex items-start justify-between gap-3">
        <code className="text-foreground font-mono text-sm leading-relaxed break-words">
          <span className="text-muted-foreground select-none">$ </span>
          {command}
        </code>
        <button
          type="button"
          onClick={copy}
          aria-label={t("copy-aria", { label })}
          className="text-muted-foreground hover:text-foreground focus-visible:ring-ring shrink-0 font-mono text-[11px] tracking-wide uppercase transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          {copied ? t("copied") : t("copy")}
        </button>
      </div>
    </div>
  );
}
