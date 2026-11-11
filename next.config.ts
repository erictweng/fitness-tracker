import type { NextConfig } from "next";

// cacheComponents is off on purpose: every page here is per-user and
// request-time (session cookies), so there is no static shell worth caching yet.
const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
