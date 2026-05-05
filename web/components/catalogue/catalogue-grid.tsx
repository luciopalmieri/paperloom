"use client";

import { Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { ToolTile } from "@/components/catalogue/tile";
import { Input } from "@/components/ui/input";

export type SectionKey = "ai" | "conversion" | "manipulation";
export type CatalogueEntry = {
  slug: string;
  name: string;
  ai?: boolean;
  available: boolean;
  href?: string;
  pdfInput?: boolean;
  imageInput?: boolean;
};
export type CatalogueSection = { key: SectionKey; tools: CatalogueEntry[] };
type CategoryFilter = "all" | SectionKey;
type InputFilter = "any" | "pdf" | "image";

type Props = {
  sections: CatalogueSection[];
  opfReady: boolean | null;
};

const sectionLabelKey: Record<SectionKey, "section-ai" | "section-conversion" | "section-manipulation"> = {
  ai: "section-ai",
  conversion: "section-conversion",
  manipulation: "section-manipulation",
};

export function CatalogueGrid({ sections, opfReady }: Props) {
  const tCat = useTranslations("tools.catalogue");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [inputType, setInputType] = useState<InputFilter>("any");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sections
      .filter((s) => category === "all" || s.key === category)
      .map((s) => ({
        ...s,
        tools: s.tools.filter((t) => {
          if (q && !t.name.toLowerCase().includes(q) && !t.slug.includes(q)) return false;
          if (inputType === "pdf" && !t.pdfInput) return false;
          if (inputType === "image" && !t.imageInput) return false;
          return true;
        }),
      }))
      .filter((s) => s.tools.length > 0);
  }, [sections, query, category, inputType]);

  const totalShown = filtered.reduce((acc, s) => acc + s.tools.length, 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <div className="relative">
          <Search
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
            aria-hidden
          />
          <Input
            type="search"
            placeholder={tCat("search-placeholder")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
            aria-label={tCat("search-placeholder")}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <FilterGroup
            label={tCat("filter-category-label")}
            value={category}
            onChange={(v) => setCategory(v as CategoryFilter)}
            options={[
              { value: "all", label: tCat("filter-all") },
              { value: "ai", label: tCat("filter-ai") },
              { value: "conversion", label: tCat("filter-conversion") },
              { value: "manipulation", label: tCat("filter-manipulation") },
            ]}
          />
          <span className="bg-border h-5 w-px" aria-hidden />
          <FilterGroup
            label={tCat("filter-input-label")}
            value={inputType}
            onChange={(v) => setInputType(v as InputFilter)}
            options={[
              { value: "any", label: tCat("filter-any") },
              { value: "pdf", label: tCat("filter-pdf") },
              { value: "image", label: tCat("filter-image") },
            ]}
          />
        </div>
      </div>

      {totalShown === 0 ? (
        <p className="text-muted-foreground text-sm">{tCat("no-results")}</p>
      ) : (
        filtered.map((section) => (
          <section key={section.key} className="flex flex-col gap-3">
            <h2 className="text-base font-semibold tracking-tight">
              {tCat(sectionLabelKey[section.key])}
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {section.tools.map((tool) => {
                const opfStatus =
                  tool.slug === "anonymize" && opfReady !== null
                    ? opfReady
                      ? { label: tCat("opf-ready"), tone: "ready" as const }
                      : { label: tCat("opf-needed"), tone: "needed" as const }
                    : null;
                return (
                  <ToolTile
                    key={tool.slug}
                    slug={tool.slug}
                    name={tool.name}
                    ai={tool.ai}
                    available={tool.available}
                    href={tool.href}
                    comingLabel={tCat("coming-soon")}
                    opfStatus={opfStatus}
                  />
                );
              })}
            </div>
          </section>
        ))
      )}
    </div>
  );
}

function FilterGroup<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (next: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            className={
              "focus-visible:ring-ring/50 inline-flex h-7 items-center rounded-full border px-3 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none " +
              (active
                ? "bg-foreground text-background border-foreground"
                : "border-input bg-background text-muted-foreground hover:bg-muted hover:text-foreground")
            }
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
