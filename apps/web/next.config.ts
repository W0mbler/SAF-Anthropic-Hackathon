import type { NextConfig } from "next";
const staticDemo = process.env.NEXT_PUBLIC_STATIC_DEMO === "true";
const nextConfig: NextConfig = {
  output: staticDemo ? "export" : "standalone",
  ...(staticDemo
    ? {
        basePath: process.env.NEXT_PUBLIC_BASE_PATH || "",
        trailingSlash: true,
        images: { unoptimized: true },
      }
    : {}),
  experimental: { cpus: 2 },
  ...(!staticDemo
    ? {
        async rewrites() {
          return [
            {
              source: "/api/v1/:path*",
              destination: `${process.env.API_INTERNAL_URL || "http://127.0.0.1:8000"}/api/v1/:path*`,
            },
          ];
        },
      }
    : {}),
};
export default nextConfig;
