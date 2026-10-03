package com.dockin.app;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.regex.Pattern;

/**
 * The phone's half of payment detection.
 *
 * It holds three things it was handed once, through a link from the signed-in
 * web app: a device token, and the project address and public key to send it
 * to. Nothing about the account is built into this app, so moving project is a
 * deploy rather than a reinstall, and a phone that is unlinked on the server
 * simply stops being accepted.
 *
 * What it sends is the notification's text, with account and card numbers taken
 * out first. It deliberately does not try to understand the message: Indian
 * banks word these a dozen ways and keep changing them, and the reading is done
 * in the web app where a wrong rule is fixed by a deploy everyone already gets,
 * not by an APK everyone has to reinstall.
 */
public final class PayLink {

    private static final String PREFS = "dockin-pay";
    private static final String K_TOKEN = "token";
    private static final String K_URL = "url";
    private static final String K_KEY = "key";
    private static final String K_QUEUE = "queue";
    /** A phone with no signal for a week should not grow a queue forever. */
    private static final int MAX_QUEUED = 100;

    private static final ExecutorService IO = Executors.newSingleThreadExecutor();

    // Account and card numbers are of no use here and are not worth sending.
    private static final Pattern ACCOUNT = Pattern.compile(
            "(?i)\\b(?:a/c|acct?|account|card)\\s*(?:no\\.?|number)?\\s*[:#]?\\s*(?:[x*]{2,}\\s*)?[0-9]{3,}\\b");
    private static final Pattern MASKED = Pattern.compile("(?i)\\b[x*]{2,}[0-9]{3,}\\b");
    private static final Pattern LONG_DIGITS = Pattern.compile("\\b[0-9]{9,}\\b");

    private PayLink() {}

    private static SharedPreferences prefs(Context c) {
        return c.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /** Stores what the web app handed over when this phone was linked. */
    public static void save(Context c, String token, String url, String key) {
        prefs(c).edit().putString(K_TOKEN, token).putString(K_URL, url).putString(K_KEY, key).apply();
    }

    public static boolean linked(Context c) {
        SharedPreferences p = prefs(c);
        return p.getString(K_TOKEN, null) != null && p.getString(K_URL, null) != null;
    }

    public static void forget(Context c) {
        prefs(c).edit().clear().apply();
    }

    public static String redact(String text) {
        if (text == null) return "";
        String out = ACCOUNT.matcher(text).replaceAll("account");
        out = MASKED.matcher(out).replaceAll("account");
        out = LONG_DIGITS.matcher(out).replaceAll("number");
        return out.trim();
    }

    /**
     * Queues one notification and tries to send everything waiting.
     *
     * Queue first, send after: a payment noticed in a basement with no signal is
     * still a payment, and it goes up the next time anything else does.
     */
    public static void send(Context c, String app, String title, String body, long postedAt) {
        if (!linked(c)) return;
        try {
            JSONObject row = new JSONObject();
            row.put("app", app);
            row.put("title", clip(redact(title), 200));
            row.put("body", clip(redact(body), 400));
            row.put("posted_at", postedAt);
            synchronized (PayLink.class) {
                JSONArray queue = queue(c);
                queue.put(row);
                while (queue.length() > MAX_QUEUED) queue.remove(0);
                prefs(c).edit().putString(K_QUEUE, queue.toString()).apply();
            }
        } catch (Exception ignored) {
            return;
        }
        flush(c);
    }

    /** Sends whatever is waiting, oldest first, and keeps anything that fails. */
    public static void flush(final Context c) {
        final Context app = c.getApplicationContext();
        IO.execute(new Runnable() {
            @Override
            public void run() {
                if (!linked(app)) return;
                JSONArray queue;
                synchronized (PayLink.class) {
                    queue = queue(app);
                    prefs(app).edit().remove(K_QUEUE).apply();
                }
                JSONArray left = new JSONArray();
                for (int i = 0; i < queue.length(); i++) {
                    JSONObject row = queue.optJSONObject(i);
                    if (row == null) continue;
                    Result r = post(app, row);
                    if (r == Result.RETRY) left.put(row);
                    // DONE and DROP both mean stop carrying it: DROP is the
                    // server saying this phone is no longer linked, and
                    // retrying that forever helps nobody.
                    if (r == Result.DROP) {
                        forget(app);
                        return;
                    }
                }
                if (left.length() > 0) {
                    synchronized (PayLink.class) {
                        JSONArray now = queue(app);
                        for (int i = 0; i < now.length(); i++) left.put(now.opt(i));
                        prefs(app).edit().putString(K_QUEUE, left.toString()).apply();
                    }
                }
            }
        });
    }

    private enum Result { DONE, RETRY, DROP }

    private static Result post(Context c, JSONObject row) {
        SharedPreferences p = prefs(c);
        String base = p.getString(K_URL, null);
        String key = p.getString(K_KEY, "");
        String token = p.getString(K_TOKEN, null);
        if (base == null || token == null) return Result.DROP;

        HttpURLConnection conn = null;
        try {
            JSONObject payload = new JSONObject(row.toString());
            payload.put("token", token);

            conn = (HttpURLConnection) new URL(base + "/rest/v1/rpc/log_notice").openConnection();
            conn.setRequestMethod("POST");
            conn.setConnectTimeout(10000);
            conn.setReadTimeout(15000);
            conn.setDoOutput(true);
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setRequestProperty("apikey", key);
            conn.setRequestProperty("Authorization", "Bearer " + key);

            byte[] bytes = payload.toString().getBytes(StandardCharsets.UTF_8);
            OutputStream out = conn.getOutputStream();
            out.write(bytes);
            out.close();

            int code = conn.getResponseCode();
            if (code >= 200 && code < 300) return Result.DONE;
            // 400 here is the server's "unknown_device": the link was cut.
            if (code == 400 || code == 401 || code == 403) return Result.DROP;
            return Result.RETRY;
        } catch (Exception e) {
            return Result.RETRY;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    private static JSONArray queue(Context c) {
        try {
            return new JSONArray(prefs(c).getString(K_QUEUE, "[]"));
        } catch (Exception e) {
            return new JSONArray();
        }
    }

    private static String clip(String s, int max) {
        return s.length() <= max ? s : s.substring(0, max);
    }
}
