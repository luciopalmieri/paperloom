import { setRequestLocale } from "next-intl/server";

import { OcrTool } from "@/components/ocr/ocr-tool";
import { isLandingMode } from "@/lib/landing";

type Props = { params: Promise<{ locale: string }> };

export default async function Page({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  if (isLandingMode) return null;
  return <OcrTool />;
}
