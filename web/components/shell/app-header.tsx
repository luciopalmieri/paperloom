import { useTranslations } from "next-intl";

import { LocaleSwitch } from "@/components/i18n/locale-switch";
import { Breadcrumbs } from "@/components/shell/breadcrumbs";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Link } from "@/i18n/navigation";

export function AppHeader() {
  const t = useTranslations("app");
  return (
    <header className="bg-background/80 sticky top-0 z-40 border-b backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-6 py-3">
        <Link
          href="/"
          className="text-foreground hover:text-foreground/80 text-sm font-semibold tracking-tight"
        >
          {t("title")}
        </Link>
        <span className="text-muted-foreground/50" aria-hidden>
          /
        </span>
        <Breadcrumbs />
        <div className="ml-auto flex items-center gap-2">
          <LocaleSwitch />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
