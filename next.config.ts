import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  experimental: {
    // The compiler API is more reliable than the spawned CLI in containerized builds.
    useTypeScriptCli: false,
  },
};

export default nextConfig;
