import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const isLanding = process.env.LANDING_MODE === "1";
const basePath = process.env.LANDING_BASE_PATH ?? "";

const nextConfig: NextConfig = isLanding
  ? {
      output: "export",
      trailingSlash: true,
      images: { unoptimized: true },
      basePath: basePath || undefined,
      assetPrefix: basePath || undefined,
      env: {
        NEXT_PUBLIC_LANDING_MODE: "1",
        NEXT_PUBLIC_LANDING_BASE_PATH: basePath,
      },
    }
  : {};

export default withNextIntl(nextConfig);
