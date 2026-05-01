import { getTranslations, setRequestLocale } from "next-intl/server";

import { ToolTile } from "@/components/catalogue/tile";
import { Link } from "@/i18n/navigation";

type Props = { params: Promise<{ locale: string }> };

type Entry = {
  slug: string;
  ai?: boolean;
  available: boolean;
  href?: string;
};

const chainHref = (slug: string) => `/tools/chain?initial=${slug}`;

const SECTIONS: { key: "ai" | "conversion" | "manipulation"; tools: Entry[] }[] = [
  {
    key: "ai",
    tools: [
      {
        slug: "ocr-to-markdown",
        ai: true,
        available: true,
        href: "/tools/ocr-to-markdown",
      },
      {
        slug: "anonymize",
        ai: true,
        available: true,
        href: chainHref("anonymize"),
      },
    ],
  },
  {
    key: "conversion",
    tools: [
      { slug: "pdf-to-images", available: true, href: chainHref("pdf-to-images") },
      { slug: "images-to-pdf", available: true, href: chainHref("images-to-pdf") },
      { slug: "pdf-to-text", available: true, href: chainHref("pdf-to-text") },
      { slug: "pdf-to-html", available: true, href: chainHref("pdf-to-html") },
      { slug: "html-to-pdf", available: true, href: chainHref("html-to-pdf") },
      { slug: "markdown-to-pdf", available: true, href: chainHref("markdown-to-pdf") },
      { slug: "markdown-to-html", available: true, href: chainHref("markdown-to-html") },
    ],
  },
  {
    key: "manipulation",
    tools: [
      { slug: "merge-pdfs", available: true, href: chainHref("merge-pdfs") },
      { slug: "split-pdf", available: true, href: chainHref("split-pdf") },
      { slug: "compress-pdf", available: true, href: chainHref("compress-pdf") },
      { slug: "rotate-pages", available: true, href: chainHref("rotate-pages") },
      { slug: "reorder-pages", available: true, href: chainHref("reorder-pages") },
      { slug: "delete-pages", available: true, href: chainHref("delete-pages") },
      { slug: "extract-pages", available: true, href: chainHref("extract-pages") },
      { slug: "add-page-numbers", available: true, href: chainHref("add-page-numbers") },
      { slug: "add-watermark", available: true, href: chainHref("add-watermark") },
      { slug: "strip-metadata", available: true, href: chainHref("strip-metadata") },
    ],
  },
];

export default async function ToolsCataloguePage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const tCat = await getTranslations("tools.catalogue");
  const tNames = await getTranslations("tools.names");

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-8 px-6 py-8">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{tCat("title")}</h1>
          <p className="text-muted-foreground mt-1">{tCat("subtitle")}</p>
        </div>
        <Link
          href="/tools/chain"
          className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-9 items-center justify-center rounded-md px-3 text-sm font-medium"
        >
          {tCat("open-chain")}
        </Link>
      </header>

      {SECTIONS.map((section) => (
        <section key={section.key} className="flex flex-col gap-3">
          <h2 className="text-sm font-medium tracking-tight">
            {tCat(
              section.key === "ai"
                ? "section-ai"
                : section.key === "conversion"
                  ? "section-conversion"
                  : "section-manipulation",
            )}
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {section.tools.map((tool) => (
              <ToolTile
                key={tool.slug}
                slug={tool.slug}
                name={tNames(tool.slug as Parameters<typeof tNames>[0])}
                ai={tool.ai}
                available={tool.available}
                href={tool.href}
                comingLabel={tCat("coming-soon")}
              />
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}
