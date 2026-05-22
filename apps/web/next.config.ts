import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  transpilePackages: ["@ai-arcade/shared", "@ai-arcade/qr-code"],
};

export default nextConfig;
