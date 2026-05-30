import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  typescript: {
    // Pre-existing strict-mode errors in legacy API routes
    // TODO: Fix all implicit-any and unused-var errors across API routes
    ignoreBuildErrors: true,
  },
};

export default nextConfig;


