import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@ai-arcade/shared", "@ai-arcade/qr-code"],
};

export default nextConfig;
