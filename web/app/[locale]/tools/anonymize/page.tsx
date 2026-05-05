import { setRequestLocale } from "next-intl/server";

import { AnonymizeTool } from "@/components/anonymize/anonymize-tool";
import { isLandingMode } from "@/lib/landing";

type Props = { params: Promise<{ locale: string }> };

export default async function AnonymizePage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  if (isLandingMode) return null;
  return <AnonymizeTool />;
}
