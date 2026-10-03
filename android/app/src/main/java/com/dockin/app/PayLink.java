package com.dockin.app;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.regex.Pattern;

/**
 * The phone's half of payment detection.
 *
 * It knows one thing: a secret it made for itself the first time the app ran.
 * That secret rides along on the address the app opens the site with, and the
 * signed-in site tells the server to trust it — so there is nothing to set up
 * and nothing for the person to understand.
 *
 * It sends what it sees to DockIn's own address rather than to the database
 * directly. That keeps every key and every detail of the backend out of the
 * APK: the app only knows its own site, which it was already built around.
 *
 * What it sends is the notification's text with account and card numbers taken
 * out. It deliberately does not try to understand the message — Indian banks
 * word these a dozen ways and keep changing them, and the reading is done on
 * the site, where a wrong rule is fixed by a deploy everybody already has.
 */
public final class PayLink {

    /** Where the site lives. The same address the app itself opens. */
    private static final String ENDPOINT = "https://dock-in.vercel.app/api/notice";

    private static final String PREFS = "dockin-pay";
    private static final String K_SECRET = "secret";
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

    /** This phone's secret, made once and kept until the app is uninstalled. */
    public static synchronized String secret(Context c) {
        SharedPreferences p = prefs(c);
        String s = p.getString(K_SECRET, null);
        if (s == null) {
            s = UUID.randomUUID().toString().replace("-", "")
                    + UUID.randomUUID().toString().replace("-", "");
            p.edit().putString(K_SECRET, s).apply();
        }
        return s;
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
        try {
            JSONObject row = new JSONObject();
            row.put("app", app);
            row.put("title", clip(redact(title), 200));
            row.put("body", clip(redact(body), 400));
            row.put("at", postedAt);
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

    /**
     * Tells the site this phone is here, without sending anything about it.
     *
     * It is the one call that separates "the phone cannot reach us" from "the
     * phone is here but nothing is being heard", which used to be the same
     * silence.
     */
    public static void ping(final Context c) {
        final Context app = c.getApplicationContext();
        IO.execute(new Runnable() {
            @Override
            public void run() {
                try {
                    JSONObject payload = new JSONObject();
                    payload.put("secret", secret(app));
                    payload.put("ping", true);
                    post(payload);
                } catch (Exception ignored) {
                    /* the queue below carries anything that matters */
                }
            }
        });
        flush(c);
    }

    /** Sends whatever is waiting, oldest first, and keeps anything that fails. */
    public static void flush(final Context c) {
        final Context app = c.getApplicationContext();
        IO.execute(new Runnable() {
            @Override
            public void run() {
                JSONArray queue;
                synchronized (PayLink.class) {
                    queue = queue(app);
                    prefs(app).edit().remove(K_QUEUE).apply();
                }
                JSONArray left = new JSONArray();
                for (int i = 0; i < queue.length(); i++) {
                    JSONObject row = queue.optJSONObject(i);
                    if (row == null) continue;
                    // RETRY keeps it for later; anything else means stop carrying
                    // it, since a phone the site does not know will never be
                    // accepted by repeating the attempt.
                    if (post(app, row) == Result.RETRY) left.put(row);
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
        try {
            JSONObject payload = new JSONObject(row.toString());
            payload.put("secret", secret(c));
            return post(payload);
        } catch (Exception e) {
            return Result.RETRY;
        }
    }

    private static Result post(JSONObject payload) {
        HttpURLConnection conn = null;
        try {
            conn = (HttpURLConnection) new URL(ENDPOINT).openConnection();
            conn.setRequestMethod("POST");
            conn.setConnectTimeout(10000);
            conn.setReadTimeout(15000);
            conn.setDoOutput(true);
            conn.setRequestProperty("Content-Type", "application/json");

            byte[] bytes = payload.toString().getBytes(StandardCharsets.UTF_8);
            OutputStream out = conn.getOutputStream();
            out.write(bytes);
            out.close();

            int code = conn.getResponseCode();
            if (code >= 200 && code < 300) return Result.DONE;
            // 4xx is the site saying it does not know this phone — usually
            // because nobody has signed in on it yet. Keeping the payment is
            // the point of the queue, so it waits.
            if (code == 404 || code == 403) return Result.RETRY;
            if (code >= 400 && code < 500) return Result.DROP;
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
