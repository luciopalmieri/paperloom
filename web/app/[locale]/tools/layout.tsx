import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { isLandingMode } from "@/lib/landing";

export default async function ToolsLayout({
  children,
}: {
  children: ReactNode;
}) {
  if (isLandingMode) {
    return <LandingToolsPlaceholder />;
  }
  return <>{children}</>;
}

async function LandingToolsPlaceholder() {
  const t = await getTranslations("home.landing-tools-banner");
  return (
    <main
      id="main"
      className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-2xl flex-col justify-center gap-6 px-6 py-16"
    >
      <p className="text-muted-foreground font-mono text-[11px] tracking-[0.18em] uppercase">
        {t("eyebrow")}
      </p>
      <h1 className="font-mono text-3xl leading-tight font-semibold tracking-tight md:text-4xl">
        {t("title")}
      </h1>
      <p className="text-foreground/80 max-w-[60ch] text-base leading-relaxed">
        {t("body")}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <Link
          href="/#install"
          className="bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-ring inline-flex h-11 items-center px-5 font-mono text-sm tracking-wide focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          {t("install")} ↓
        </Link>
        <Link
          href="/"
          className="border-border hover:bg-accent focus-visible:ring-ring inline-flex h-11 items-center border px-5 font-mono text-sm tracking-wide focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          {t("back")}
        </Link>
      </div>
    </main>
  );
}
