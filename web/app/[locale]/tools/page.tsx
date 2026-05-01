import { getTranslations, setRequestLocale } from "next-intl/server";

import {
  CatalogueGrid,
  type CatalogueSection,
} from "@/components/catalogue/catalogue-grid";
import { backendUrl } from "@/lib/api";

type Props = { params: Promise<{ locale: string }> };

type Entry = {
  slug: string;
  ai?: boolean;
  available: boolean;
  href?: string;
  pdfInput?: boolean;
  imageInput?: boolean;
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
        pdfInput: true,
        imageInput: true,
      },
      {
        slug: "anonymize",
        ai: true,
        available: true,
        href: chainHref("anonymize"),
        pdfInput: true,
      },
    ],
  },
  {
    key: "conversion",
    tools: [
      { slug: "pdf-to-images", available: true, href: chainHref("pdf-to-images"), pdfInput: true },
      { slug: "images-to-pdf", available: true, href: chainHref("images-to-pdf"), imageInput: true },
      { slug: "pdf-to-text", available: true, href: chainHref("pdf-to-text"), pdfInput: true },
      { slug: "pdf-to-html", available: true, href: chainHref("pdf-to-html"), pdfInput: true },
      { slug: "html-to-pdf", available: true, href: chainHref("html-to-pdf") },
      { slug: "markdown-to-pdf", available: true, href: chainHref("markdown-to-pdf") },
      { slug: "markdown-to-html", available: true, href: chainHref("markdown-to-html") },
    ],
  },
  {
    key: "manipulation",
    tools: [
      { slug: "merge-pdfs", available: true, href: chainHref("merge-pdfs"), pdfInput: true },
      { slug: "split-pdf", available: true, href: chainHref("split-pdf"), pdfInput: true },
      { slug: "compress-pdf", available: true, href: chainHref("compress-pdf"), pdfInput: true },
      { slug: "rotate-pages", available: true, href: chainHref("rotate-pages"), pdfInput: true },
      { slug: "reorder-pages", available: true, href: chainHref("reorder-pages"), pdfInput: true },
      { slug: "delete-pages", available: true, href: chainHref("delete-pages"), pdfInput: true },
      { slug: "extract-pages", available: true, href: chainHref("extract-pages"), pdfInput: true },
      { slug: "add-page-numbers", available: true, href: chainHref("add-page-numbers"), pdfInput: true },
      { slug: "add-watermark", available: true, href: chainHref("add-watermark"), pdfInput: true },
      { slug: "strip-metadata", available: true, href: chainHref("strip-metadata"), pdfInput: true },
    ],
  },
];

async function fetchOpfStatus(): Promise<boolean | null> {
  try {
    const r = await fetch(backendUrl("/api/health"), {
      next: { revalidate: 5 },
    });
    if (!r.ok) return null;
    const data = (await r.json()) as { opf?: boolean };
    return Boolean(data.opf);
  } catch {
    return null;
  }
}

export default async function ToolsCataloguePage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const tCat = await getTranslations("tools.catalogue");
  const tNames = await getTranslations("tools.names");

  const opfReady = await fetchOpfStatus();

  const translatedSections: CatalogueSection[] = SECTIONS.map((s) => ({
    key: s.key,
    tools: s.tools.map((t) => ({
      ...t,
      name: tNames(t.slug as Parameters<typeof tNames>[0]),
    })),
  }));

  return (
    <main id="main" className="mx-auto flex min-h-screen max-w-6xl flex-col gap-8 px-6 py-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{tCat("title")}</h1>
        <p className="text-muted-foreground mt-1">{tCat("subtitle")}</p>
      </header>

      <CatalogueGrid sections={translatedSections} opfReady={opfReady} />
    </main>
  );
}
