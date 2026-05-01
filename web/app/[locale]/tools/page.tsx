import { getTranslations, setRequestLocale } from "next-intl/server";

import { ToolTile } from "@/components/catalogue/tile";

type Props = { params: Promise<{ locale: string }> };

type Entry = {
  slug: string;
  ai?: boolean;
  available: boolean;
  href?: string;
};

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
      { slug: "anonymize", ai: true, available: false },
    ],
  },
  {
    key: "conversion",
    tools: [
      { slug: "pdf-to-images", available: false },
      { slug: "images-to-pdf", available: false },
      { slug: "pdf-to-text", available: false },
      { slug: "pdf-to-html", available: false },
      { slug: "html-to-pdf", available: false },
      { slug: "markdown-to-pdf", available: false },
      { slug: "markdown-to-html", available: false },
    ],
  },
  {
    key: "manipulation",
    tools: [
      { slug: "merge-pdfs", available: false },
      { slug: "split-pdf", available: false },
      { slug: "compress-pdf", available: false },
      { slug: "rotate-pages", available: false },
      { slug: "reorder-pages", available: false },
      { slug: "delete-pages", available: false },
      { slug: "extract-pages", available: false },
      { slug: "add-page-numbers", available: false },
      { slug: "add-watermark", available: false },
      { slug: "strip-metadata", available: false },
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
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{tCat("title")}</h1>
        <p className="text-muted-foreground mt-1">{tCat("subtitle")}</p>
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
