import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "6mb",
    },
  },
  outputFileTracingIncludes: {
    "/api/v1/hospital/reporting/export": ["./docs/Dashboard App Demi.xlsx"],
    // Readiness compares the shipped migration directories with _prisma_migrations.
    "/api/health": ["./prisma/migrations/**/migration.sql"],
  },
  async headers() {
    const selfRegistrationHeaders = [
      { key: "Cache-Control", value: "no-store, max-age=0" },
      { key: "Pragma", value: "no-cache" },
      { key: "Expires", value: "0" },
      { key: "X-Robots-Tag", value: "noindex, nofollow" },
      { key: "Referrer-Policy", value: "no-referrer" },
    ];
    return [
      { source: "/register", headers: selfRegistrationHeaders },
      { source: "/api/v1/self-registration/:path*", headers: selfRegistrationHeaders },
    ];
  },
};

export default nextConfig;
