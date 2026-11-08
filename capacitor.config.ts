import type { CapacitorConfig } from "@capacitor/cli";

/**
 * The Android app.
 *
 * It opens the live site, the same one Vercel deploys on every push, so a fix
 * to any screen reaches the phone without a new APK. What the APK adds is
 * everything a website cannot do: reading payment notifications, posting
 * notifications of its own, and (next) talking to Camu and the LMS without the
 * browser's cross-site rules in the way.
 *
 * The site's own service worker keeps a copy of every screen, so after the
 * first launch the app opens instantly even with no signal. `offline.html` is
 * only for the very first launch on a phone that has never been online.
 */
const config: CapacitorConfig = {
  appId: "com.dockin.student",
  appName: "DockIn",
  webDir: "capacitor/www",
  server: {
    url: "https://dock-in.vercel.app",
    errorPath: "offline.html",
  },
  android: {
    // What shows in the instant between Android's animated splash and the
    // site's first paint: the same leather, so the opening reads as one motion.
    backgroundColor: "#864220",
  },
  plugins: {
    // Android 15+ forces every app edge-to-edge (we target SDK 36). Capacitor
    // works out the webview's `viewport-fit` on its own, but during that first
    // detection the layout jumps — and the very first screen it paints is the
    // welcome page, so that page came up cut off at the bottom. Telling it up
    // front that we use `cover` removes the jump, and keeping the default "css"
    // handling also hands us real `--safe-area-inset-*` values to pad with.
    SystemBars: {
      insetsHandling: "css",
      initialViewportFitValueHint: "cover",
    },
  },
};

export default config;
