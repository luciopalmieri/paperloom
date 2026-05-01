import { ChevronLeft } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { Link } from "@/i18n/navigation";

export default function ToolsLayout({ children }: { children: ReactNode }) {
  const t = useTranslations("nav");
  return (
    <>
      <nav className="border-b">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-6 py-3 text-sm">
          <Link
            href="/"
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          >
            <ChevronLeft className="size-4" aria-hidden />
            {t("back-home")}
          </Link>
          <span className="text-muted-foreground">/</span>
          <Link href="/tools" className="hover:text-foreground">
            {t("tools")}
          </Link>
        </div>
      </nav>
      {children}
    </>
  );
}
