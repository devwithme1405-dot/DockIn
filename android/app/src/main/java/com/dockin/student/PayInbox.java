package com.dockin.student;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * Payment notifications the phone has seen and the app has not dealt with yet.
 *
 * This lives on the phone and nowhere else. The listener writes here whether or
 * not DockIn is open; the app reads it the next time it is, and removes a
 * notice only once it has been added or dismissed — so a crash between the two
 * can lose nothing, it can only show the same payment again.
 */
final class PayInbox {

    private static final String PREFS = "dockin-pay";
    private static final String K_INBOX = "inbox";
    /** A month of payments nobody looked at is plenty; past that, oldest go first. */
    private static final int MAX = 200;
    /** Apps re-post the same notification when they update it. That is one payment. */
    private static final long SAME_WINDOW_MS = 10 * 60 * 1000;

    // Account and card numbers are of no use here and are not kept.
    private static final Pattern ACCOUNT = Pattern.compile(
            "(?i)\\b(?:a/c|acct?|account|card)\\s*(?:no\\.?|number)?\\s*[:#]?\\s*(?:[x*]{2,}\\s*)?[0-9]{3,}\\b");
    private static final Pattern MASKED = Pattern.compile("(?i)\\b[x*]{2,}[0-9]{3,}\\b");
    private static final Pattern LONG_DIGITS = Pattern.compile("\\b[0-9]{9,}\\b");

    private PayInbox() {}

    static String redact(String text) {
        if (text == null) return "";
        String out = ACCOUNT.matcher(text).replaceAll("account");
        out = MASKED.matcher(out).replaceAll("account");
        out = LONG_DIGITS.matcher(out).replaceAll("number");
        return out.trim();
    }

    private static SharedPreferences prefs(Context c) {
        return c.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private static JSONArray read(Context c) {
        String raw = prefs(c).getString(K_INBOX, "[]");
        try {
            return new JSONArray(raw);
        } catch (JSONException e) {
            return new JSONArray();
        }
    }

    private static void write(Context c, JSONArray list) {
        prefs(c).edit().putString(K_INBOX, list.toString()).apply();
    }

    /**
     * Keeps one notice. Returns it, or null when it is a re-post of one already
     * kept (same app, same words, a few minutes apart).
     */
    static synchronized JSONObject add(Context c, String app, String title, String body, long at) {
        String t = redact(title);
        String b = redact(body);
        JSONArray list = read(c);
        for (int i = 0; i < list.length(); i++) {
            JSONObject o = list.optJSONObject(i);
            if (o == null) continue;
            if (app.equals(o.optString("app"))
                    && t.equals(o.optString("title"))
                    && b.equals(o.optString("body"))
                    && Math.abs(at - o.optLong("at")) < SAME_WINDOW_MS) {
                return null;
            }
        }
        JSONObject n = new JSONObject();
        try {
            n.put("id", UUID.randomUUID().toString());
            n.put("app", app);
            n.put("title", t);
            n.put("body", b);
            n.put("at", at);
        } catch (JSONException e) {
            return null;
        }
        list.put(n);
        if (list.length() > MAX) {
            JSONArray trimmed = new JSONArray();
            for (int i = list.length() - MAX; i < list.length(); i++) trimmed.put(list.opt(i));
            list = trimmed;
        }
        write(c, list);
        return n;
    }

    static synchronized JSONArray list(Context c) {
        return read(c);
    }

    static synchronized int size(Context c) {
        return read(c).length();
    }

    /** Added or dismissed in the app: either way it is done with. */
    static synchronized void ack(Context c, Set<String> ids) {
        if (ids.isEmpty()) return;
        JSONArray list = read(c);
        JSONArray kept = new JSONArray();
        for (int i = 0; i < list.length(); i++) {
            JSONObject o = list.optJSONObject(i);
            if (o == null || ids.contains(o.optString("id"))) continue;
            kept.put(o);
        }
        write(c, kept);
    }
}
