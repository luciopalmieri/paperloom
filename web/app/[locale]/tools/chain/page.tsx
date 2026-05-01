import { setRequestLocale } from "next-intl/server";

import { ChainBuilder } from "@/components/chain/builder";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ initial?: string; from?: string }>;
};

export default async function ChainPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { initial, from } = await searchParams;
  return <ChainBuilder initial={initial} fromFileId={from} />;
}
