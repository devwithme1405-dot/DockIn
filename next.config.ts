import type { NextConfig } from "next";

/**
 * A stamp that changes with every deploy.
 *
 * The service worker is registered at /sw.js?v=<this>, so a new deploy is a new
 * worker, and installing it throws away the shell the last deploy cached. Without
 * that, a phone can pair yesterday's cached page with today's script names, and
 * what the person sees is an app that draws but does not respond.
 */
const BUILD =
  process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 8) ??
  process.env.NEXT_PUBLIC_BUILD ??
  String(Date.now());

const nextConfig: NextConfig = {
  env: { NEXT_PUBLIC_BUILD: BUILD },
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
