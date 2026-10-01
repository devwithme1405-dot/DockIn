import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Hides the round "N" dev badge that overlaps the tab bar while developing.
  devIndicators: false,
  poweredByHeader: false,
  // Tree-shake icon imports instead of shipping the whole icon set.
  experimental: { optimizePackageImports: ["lucide-react"] },
  async headers() {
    return [
      {
        // The service worker must always be re-checked, or users get stuck on an old app.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
