import type { NextConfig } from "next";
import { FRIENDS } from "./src/lib/features";

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

  // Standard hardening for every response. No script rules here (Next's own
  // inline scripts would need nonces); these block the attacks that need none:
  // framing the app (clickjacking), MIME sniffing, a hijacked <base>, and
  // browser features DockIn never uses.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'" },
        ],
      },
    ];
  },

  async redirects() {
    return [
      // The Android app, straight from the release CI publishes. A redirect
      // and not a proxy: the file is bigger than a serverless response may be,
      // and Chrome downloads a direct GitHub file link without any detour.
      {
        source: "/DockIn.apk",
        destination: "https://github.com/devwithme1405-dot/DockIn/releases/latest/download/DockIn.apk",
        permanent: false,
      },
      // Friends are switched off: an old bookmark lands on Today instead of a
      // screen that no longer leads anywhere.
      ...(FRIENDS
        ? []
        : [
            { source: "/circle", destination: "/", permanent: false },
            { source: "/groups/:id", destination: "/", permanent: false },
          ]),
    ];
  },
};

export default nextConfig;
