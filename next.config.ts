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
};

export default nextConfig;
