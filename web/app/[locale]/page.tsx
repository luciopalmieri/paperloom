import { useTranslations } from "next-intl";
import { setRequestLocale } from "next-intl/server";

import { HealthPill } from "@/components/home/health-pill";
import { LocaleSwitch } from "@/components/i18n/locale-switch";
import { ThemeToggle } from "@/components/theme/theme-toggle";

type Props = { params: Promise<{ locale: string }> };

export default async function HomePage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <Home />;
}

function Home() {
  const t = useTranslations("home");

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-8 px-6 py-12">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{t("heading")}</h1>
          <p className="text-muted-foreground mt-1">{t("subheading")}</p>
        </div>
        <div className="flex items-center gap-2">
          <LocaleSwitch />
          <ThemeToggle />
        </div>
      </header>

      <HealthPill />

      <section className="flex flex-col gap-3 sm:flex-row">
        <a
          className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-10 items-center justify-center rounded-md px-4 text-sm font-medium"
          href="#"
          aria-disabled
        >
          {t("ocr-cta")}
        </a>
        <a
          className="border-input bg-background hover:bg-accent hover:text-accent-foreground inline-flex h-10 items-center justify-center rounded-md border px-4 text-sm font-medium"
          href="#"
          aria-disabled
        >
          {t("tools-cta")}
        </a>
      </section>
    </main>
  );
}
