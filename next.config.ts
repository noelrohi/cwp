import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  transpilePackages: ["shiki"],
  experimental: {
    browserDebugInfoInTerminal: true,
  },
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
