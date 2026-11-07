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
};

export default config;
