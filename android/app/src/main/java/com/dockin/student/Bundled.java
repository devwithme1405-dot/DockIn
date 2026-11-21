package com.dockin.student;

import android.content.Context;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;

/**
 * A complete copy of DockIn's screens, shipped inside the APK.
 *
 * The app shows the live site, but the very first open on a phone (and any
 * open with no working service worker) used to need ~25 files over the
 * network before anything appeared — one stalled request on a campus network
 * meant a brown screen, a failed one meant "No internet". The APK now carries
 * the same build's pages and scripts (CI puts them in assets/web), and this
 * answers those requests from the APK instantly:
 *
 * - /_next/static/* — content-hashed, so a bundled copy is always byte-for-byte
 *   the right file. Served from the APK whenever it has it.
 * - The app's own screens (/, /attendance, …) when the page asks for them with
 *   no service worker in charge — i.e. the first open, or after a reset. The
 *   site's service worker then downloads the live version in the background and
 *   takes over from the next open (it is never handed a bundled page).
 *
 * Same address as the live site, so the phone's data (IndexedDB, sign-in) is
 * shared — nothing is split between "bundled" and "live".
 */
final class Bundled {
    private static final String HOST = "dock-in.vercel.app";
    private static final String[] SCREENS = {
        "/", "/attendance", "/timetable", "/cafeteria", "/tasks", "/circle", "/settings", "/onboarding", "/setup", "/privacy", "/app",
    };
    private static final Map<String, String> TYPES = new HashMap<>();

    static {
        TYPES.put("js", "text/javascript");
        TYPES.put("css", "text/css");
        TYPES.put("html", "text/html");
        TYPES.put("json", "application/json");
        TYPES.put("woff2", "font/woff2");
        TYPES.put("woff", "font/woff");
        TYPES.put("png", "image/png");
        TYPES.put("webp", "image/webp");
        TYPES.put("svg", "image/svg+xml");
        TYPES.put("ico", "image/x-icon");
    }

    private Bundled() {}

    private static final String PREFS = "dockin_bundle";

    /**
     * Set by the web once the live site's service worker has a complete copy and
     * is in charge; from then on screens come from it (live updates). Cleared by
     * the web's self-heal, which puts the bundled screens back in charge.
     */
    static void setLive(Context c, boolean on) {
        c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean("live", on).apply();
    }

    private static boolean live(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean("live", false);
    }

    /**
     * @param page true for requests from the page itself (WebViewClient), false
     *             for requests the service worker makes (it must only ever get
     *             immutable scripts from here, never a screen).
     */
    static WebResourceResponse intercept(Context c, WebResourceRequest req, boolean page) {
        try {
            if (req == null || req.getUrl() == null) return null;
            if (!"GET".equalsIgnoreCase(req.getMethod())) return null;
            if (!HOST.equals(req.getUrl().getHost())) return null;
            String path = req.getUrl().getPath();
            if (path == null || path.isEmpty()) path = "/";

            if (path.startsWith("/_next/static/")) return asset(c, path.substring(1), true);

            if (page && req.isForMainFrame()) {
                if (live(c)) return null;
                for (String s : SCREENS) {
                    if (s.equals(path)) {
                        String file = "/".equals(s) ? "index.html" : s.substring(1) + ".html";
                        return asset(c, file, false);
                    }
                }
                return null;
            }

            // Icons and pictures from /public.
            if (page && path.indexOf('/', 1) < 0 && path.matches("/[\\w.-]+\\.(png|webp|svg|ico)")) {
                return asset(c, path.substring(1), true);
            }
        } catch (Exception ignored) {
            // Anything odd: let the network have it, exactly as before.
        }
        return null;
    }

    /**
     * The APK's own copy of a screen, as text — for when a screen can't load at
     * all (no network, nothing usable cached). The app boots from it and draws
     * the screen the address asks for, offline, instead of an error page. Null
     * when this APK carries no copy (a local debug build).
     */
    static String screenHtml(Context c, String path) {
        String file = "index.html";
        if (path != null) {
            for (String s : SCREENS) {
                if (s.equals(path)) {
                    file = "/".equals(s) ? "index.html" : s.substring(1) + ".html";
                    break;
                }
            }
        }
        try (InputStream in = c.getAssets().open("web/" + file)) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[16384];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            return out.toString("UTF-8");
        } catch (Exception e) {
            return null;
        }
    }

    private static WebResourceResponse asset(Context c, String file, boolean immutable) {
        InputStream in;
        try {
            in = c.getAssets().open("web/" + file);
        } catch (IOException e) {
            return null;
        }
        int dot = file.lastIndexOf('.');
        String ext = dot < 0 ? "" : file.substring(dot + 1).toLowerCase();
        String type = TYPES.containsKey(ext) ? TYPES.get(ext) : "application/octet-stream";
        Map<String, String> headers = new HashMap<>();
        headers.put("Cache-Control", immutable ? "public, max-age=31536000, immutable" : "no-cache");
        headers.put("Access-Control-Allow-Origin", "*");
        headers.put("X-DockIn-Bundled", "1");
        return new WebResourceResponse(type, "utf-8", 200, "OK", headers, in);
    }
}
