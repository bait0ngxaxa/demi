import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "6mb",
    },
  },
  outputFileTracingIncludes: {
    "/api/v1/hospital/reporting/export": ["./docs/Dashboard App Demi.xlsx"],
  },
};

export default nextConfig;
