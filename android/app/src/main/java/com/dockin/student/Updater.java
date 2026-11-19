package com.dockin.student;

import android.content.Context;

import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * In-app updates for the APK, straight from the GitHub release.
 *
 * CI publishes DockIn.apk and a small version.json next to it. The app reads
 * version.json, compares its versionCode with its own, and — when there is a
 * newer one — downloads the APK into its cache and hands it to Android's
 * installer. The person taps "Update" once; Android asks them to confirm.
 */
final class Updater {
    static final String BASE = "https://github.com/devwithme1405-dot/DockIn/releases/download/apk-latest/";

    interface Progress {
        void at(int percent);
    }

    private Updater() {}

    /** Follows GitHub's redirect to its file storage. */
    private static HttpURLConnection open(String url) throws IOException {
        String at = url;
        for (int hop = 0; hop < 6; hop++) {
            HttpURLConnection c = (HttpURLConnection) new URL(at).openConnection();
            c.setInstanceFollowRedirects(false);
            c.setConnectTimeout(15_000);
            c.setReadTimeout(30_000);
            c.setRequestProperty("Accept", "*/*");
            int code = c.getResponseCode();
            if (code >= 300 && code < 400) {
                String next = c.getHeaderField("Location");
                c.disconnect();
                if (next == null) throw new IOException("Redirect without a place to go");
                at = new URL(new URL(at), next).toString();
                continue;
            }
            if (code != 200) {
                c.disconnect();
                throw new IOException("GitHub answered " + code);
            }
            return c;
        }
        throw new IOException("Too many redirects");
    }

    /** {versionCode, versionName} of the newest published APK. */
    static JSONObject latest() throws Exception {
        HttpURLConnection c = open(BASE + "version.json?t=" + System.currentTimeMillis());
        try (InputStream in = c.getInputStream()) {
            byte[] buf = new byte[8192];
            StringBuilder sb = new StringBuilder();
            int n;
            while ((n = in.read(buf)) != -1) sb.append(new String(buf, 0, n, StandardCharsets.UTF_8));
            return new JSONObject(sb.toString());
        } finally {
            c.disconnect();
        }
    }

    /** Downloads the APK into the cache and returns the file. */
    static File download(Context ctx, Progress progress) throws IOException {
        File dir = new File(ctx.getCacheDir(), "updates");
        dir.mkdirs();
        File out = new File(dir, "DockIn.apk");
        HttpURLConnection c = open(BASE + "DockIn.apk");
        long total = c.getContentLength();
        try (InputStream in = c.getInputStream(); OutputStream o = new FileOutputStream(out)) {
            byte[] buf = new byte[64 * 1024];
            long done = 0;
            int last = -1;
            int n;
            while ((n = in.read(buf)) != -1) {
                o.write(buf, 0, n);
                done += n;
                if (total > 0) {
                    int pct = (int) (done * 100 / total);
                    if (pct != last) {
                        last = pct;
                        progress.at(pct);
                    }
                }
            }
        } finally {
            c.disconnect();
        }
        return out;
    }
}
