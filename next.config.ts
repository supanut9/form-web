import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  transpilePackages: ["form-renderer"],
  turbopack: {
    root: path.resolve(__dirname, ".."),
  },

  async headers() {
    return [
      {
        // Allow embedding from any origin for iframe-embed mode.
        source: "/embed/:path*",
        headers: [
          // Drop the default SAMEORIGIN restriction Next.js sets.
          {
            key: "X-Frame-Options",
            value: "ALLOWALL",
          },
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors *",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
