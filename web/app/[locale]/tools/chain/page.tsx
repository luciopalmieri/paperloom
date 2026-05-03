import { setRequestLocale } from "next-intl/server";

import { ChainBuilder } from "@/components/chain/builder";
import { isLandingMode } from "@/lib/landing";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ initial?: string; from?: string }>;
};

export default async function ChainPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  if (isLandingMode) return null;
  const { initial, from } = await searchParams;
  return <ChainBuilder initial={initial} fromFileId={from} />;
}
