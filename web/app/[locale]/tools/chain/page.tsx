import { setRequestLocale } from "next-intl/server";

import { ChainBuilder } from "@/components/chain/builder";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ initial?: string }>;
};

export default async function ChainPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { initial } = await searchParams;
  return <ChainBuilder initial={initial} />;
}
