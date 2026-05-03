import { useTranslations } from "next-intl";
import { setRequestLocale } from "next-intl/server";

import { HealthPill } from "@/components/home/health-pill";
import { InstallSnippet } from "@/components/home/install-snippet";
import { WovenMark } from "@/components/home/woven-mark";
import { Link } from "@/i18n/navigation";
import { DOCS_URL, LICENSE_URL, REPO_URL, isLandingMode } from "@/lib/landing";

type Props = { params: Promise<{ locale: string }> };

export default async function HomePage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <Home />;
}

type WhatItem = { n: string; title: string; body: string };

function Home() {
  const t = useTranslations("home");
  const whatItems = (t.raw("what.items") as WhatItem[]) ?? [];

  return (
    <main id="main" className="text-foreground">
      <section
        aria-labelledby="hero-heading"
        className="border-border relative border-b"
      >
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-10 px-6 pt-16 pb-20 md:grid-cols-12 md:gap-12 md:pt-24 md:pb-28">
          <div className="md:col-span-7">
            <p className="text-muted-foreground font-mono text-[11px] tracking-[0.18em] uppercase">
              {t("eyebrow")}
            </p>
            <h1
              id="hero-heading"
              className="mt-5 font-mono text-5xl leading-[0.95] font-semibold tracking-tight md:text-7xl lg:text-[5.5rem]"
            >
              Paper<span className="text-muted-foreground/70">loom</span>
            </h1>
            <p className="text-foreground/80 mt-7 max-w-[60ch] text-lg leading-relaxed md:text-xl">
              {t("lede")}
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              {isLandingMode ? (
                <>
                  <a
                    href="#install"
                    className="bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-ring inline-flex h-11 items-center px-5 font-mono text-sm tracking-wide focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
                  >
                    {t("install-cta")} ↓
                  </a>
                  <a
                    href={REPO_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="border-border hover:bg-accent focus-visible:ring-ring inline-flex h-11 items-center border px-5 font-mono text-sm tracking-wide focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
                  >
                    {t("repo-cta")} ↗
                  </a>
                </>
              ) : (
                <>
                  <Link
                    href="/tools/ocr-to-markdown"
                    className="bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-ring inline-flex h-11 items-center px-5 font-mono text-sm tracking-wide focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
                  >
                    {t("ocr-cta")} →
                  </Link>
                  <Link
                    href="/tools"
                    className="border-border hover:bg-accent focus-visible:ring-ring inline-flex h-11 items-center border px-5 font-mono text-sm tracking-wide focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
                  >
                    {t("tools-cta")}
                  </Link>
                  <a
                    href="#install"
                    className="text-muted-foreground hover:text-foreground focus-visible:ring-ring ml-1 inline-flex h-11 items-center font-mono text-sm tracking-wide underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:outline-none"
                  >
                    {t("install-cta")} ↓
                  </a>
                </>
              )}
            </div>
            {!isLandingMode && (
              <div className="mt-10">
                <HealthPill />
              </div>
            )}
          </div>
          <div
            aria-hidden
            className="text-foreground/90 relative hidden md:col-span-5 md:flex md:items-start md:justify-end"
          >
            <WovenMark
              animated
              className="text-foreground h-auto w-full max-w-[360px]"
            />
          </div>
        </div>
      </section>

      <section
        aria-labelledby="what-heading"
        className="border-border border-b"
      >
        <div className="mx-auto max-w-6xl px-6 py-20 md:py-24">
          <h2
            id="what-heading"
            className="text-muted-foreground font-mono text-[11px] tracking-[0.18em] uppercase"
          >
            {t("what.title")}
          </h2>
          <ol className="mt-10 grid gap-12 md:grid-cols-3 md:gap-10">
            {whatItems.map((item) => (
              <li key={item.n} className="flex flex-col gap-4">
                <span
                  aria-hidden
                  className="text-muted-foreground/60 font-mono text-sm tabular-nums"
                >
                  {item.n}
                </span>
                <h3 className="text-2xl font-semibold tracking-tight">
                  {item.title}
                </h3>
                <p className="text-foreground/75 max-w-[40ch] leading-relaxed">
                  {item.body}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section
        aria-labelledby="ai-heading"
        className="border-border border-b"
      >
        <div className="mx-auto grid max-w-6xl gap-10 px-6 py-20 md:grid-cols-12 md:gap-12 md:py-24">
          <div className="md:col-span-5">
            <h2
              id="ai-heading"
              className="text-muted-foreground font-mono text-[11px] tracking-[0.18em] uppercase"
            >
              {t("ai.title")}
            </h2>
            <p className="text-foreground/80 mt-6 max-w-[42ch] text-lg leading-relaxed">
              {t("ai.body")}
            </p>
          </div>
          <dl className="md:col-span-7 md:pl-6">
            <FactRow
              label={t("ai.model-label")}
              value={t("ai.model-name")}
              meta={t("ai.model-via")}
              metaHref="https://ollama.ai"
            />
            <FactRow
              label={t("ai.benchmark-label")}
              value={t("ai.benchmark-score")}
              meta={t("ai.benchmark-rank")}
            />
            <FactRow
              label={t("ai.anonymizer-label")}
              value={t("ai.anonymizer-name")}
              meta={t("ai.anonymizer-license")}
              metaHref="https://github.com/openai/privacy-filter"
            />
          </dl>
        </div>
      </section>

      <section
        id="install"
        aria-labelledby="install-heading"
        className="border-border border-b scroll-mt-20"
      >
        <div className="mx-auto max-w-6xl px-6 py-20 md:py-24">
          <h2
            id="install-heading"
            className="text-muted-foreground font-mono text-[11px] tracking-[0.18em] uppercase"
          >
            {t("install.title")}
          </h2>
          <p className="text-foreground/75 mt-6 max-w-[60ch] leading-relaxed">
            {t("install.subtitle")}
          </p>
          <div className="mt-10 grid gap-px bg-border md:grid-cols-3 md:border md:border-border">
            <InstallSnippet
              label={t("install.mcp-label")}
              command={t("install.mcp-cmd")}
            />
            <InstallSnippet
              label={t("install.lib-label")}
              command={t("install.lib-cmd")}
            />
            <InstallSnippet
              label={t("install.web-label")}
              command={t("install.web-cmd")}
            />
          </div>
        </div>
      </section>

      <section
        aria-labelledby="not-for-heading"
        className="border-border border-b"
      >
        <div className="mx-auto max-w-6xl px-6 py-20 md:py-24">
          <h2
            id="not-for-heading"
            className="text-muted-foreground font-mono text-[11px] tracking-[0.18em] uppercase"
          >
            {t("not-for.title")}
          </h2>
          <p className="text-foreground/80 mt-6 max-w-[68ch] text-lg leading-relaxed">
            {t("not-for.body")}{" "}
            <code className="bg-muted text-foreground rounded px-1.5 py-0.5 font-mono text-base">
              pdftotext
            </code>{" "}
            {t("not-for.alt")}
          </p>
        </div>
      </section>

      <footer className="mx-auto max-w-6xl px-6 py-10">
        <div className="text-muted-foreground flex flex-wrap items-center gap-x-6 gap-y-2 font-mono text-xs tracking-wide">
          <span>paperloom {t("footer.version")}</span>
          <span aria-hidden className="text-border">/</span>
          <a
            href={REPO_URL}
            target="_blank"
            rel="noreferrer"
            className="hover:text-foreground focus-visible:ring-ring underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:outline-none"
          >
            {t("footer.repo")} ↗
          </a>
          <a
            href={LICENSE_URL}
            target="_blank"
            rel="noreferrer"
            className="hover:text-foreground focus-visible:ring-ring underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:outline-none"
          >
            {t("footer.license")} ↗
          </a>
          <a
            href={DOCS_URL}
            target="_blank"
            rel="noreferrer"
            className="hover:text-foreground focus-visible:ring-ring underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:outline-none"
          >
            {t("footer.docs")} ↗
          </a>
        </div>
      </footer>
    </main>
  );
}

type FactRowProps = {
  label: string;
  value: string;
  meta?: string;
  metaHref?: string;
};

function FactRow({ label, value, meta, metaHref }: FactRowProps) {
  return (
    <div className="border-border flex flex-col gap-1 border-t py-5 first:border-t-0 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
      <dt className="text-muted-foreground font-mono text-[11px] tracking-[0.18em] uppercase">
        {label}
      </dt>
      <dd className="flex items-baseline gap-3">
        <span className="text-foreground font-mono text-2xl font-medium tabular-nums">
          {value}
        </span>
        {meta &&
          (metaHref ? (
            <a
              href={metaHref}
              target="_blank"
              rel="noreferrer"
              className="text-muted-foreground hover:text-foreground focus-visible:ring-ring text-sm underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:outline-none"
            >
              {meta} ↗
            </a>
          ) : (
            <span className="text-muted-foreground text-sm">{meta}</span>
          ))}
      </dd>
    </div>
  );
}
