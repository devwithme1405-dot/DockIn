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

    static synchronized JSONObject add(Context c, String app, String title, String body, long at) {
        return add(c, app, title, body, at, "note", null);
    }

    /**
     * Keeps one notice. Returns it, or null when it is a re-post of one already
     * kept: the same notification (same key) updated, or the same text seen
     * by a second app. Two real payments with identical words — ₹50 to the
     * same shop twice in a row — come as two notifications and are both kept.
     *
     * @param via "note" for a notification, "screen" for a success screen
     * @param key the notification's own key, or anything unique per screen
     */
    static synchronized JSONObject add(Context c, String app, String title, String body, long at, String via, String key) {
        String t = redact(title);
        String b = redact(body);
        JSONArray list = read(c);
        for (int i = 0; i < list.length(); i++) {
            JSONObject o = list.optJSONObject(i);
            if (o == null) continue;
            boolean near = Math.abs(at - o.optLong("at")) < SAME_WINDOW_MS;
            if (!near) continue;
            boolean sameApp = app.equals(o.optString("app")) && via.equals(o.optString("via", "note"));
            if (sameApp && key != null && key.equals(o.optString("key", null))
                    && t.equals(o.optString("title")) && b.equals(o.optString("body"))) {
                return null;
            }
            if (sameApp && key == null && t.equals(o.optString("title")) && b.equals(o.optString("body"))) {
                return null;
            }
            // The same text from a different app — a bank SMS shown by two
            // messaging apps. The body carries the reference, so this only ever
            // folds one event back into one.
            if (!sameApp && !b.isEmpty() && b.equals(o.optString("body"))) {
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
            n.put("via", via);
            if (key != null) n.put("key", key);
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

    /** Marks a kept notice as belonging to one payment (its notification id). */
    static synchronized void tag(Context c, String id, int nid) {
        if (id == null) return;
        JSONArray list = read(c);
        for (int i = 0; i < list.length(); i++) {
            JSONObject o = list.optJSONObject(i);
            if (o != null && id.equals(o.optString("id"))) {
                try {
                    o.put("nid", nid);
                } catch (JSONException ignored) {
                }
                write(c, list);
                return;
            }
        }
    }

    static synchronized JSONArray list(Context c) {
        return read(c);
    }

    static synchronized int size(Context c) {
        return read(c).length();
    }

    private static final String K_CHOICES = "choices";

    /** Does this notice describe this spend (same amount, within the twin window)? */
    private static boolean matches(JSONObject o, double amount, long at) {
        if (Math.abs(at - o.optLong("at")) > 150_000L) return false;
        PayNotifier.Spend s = PayNotifier.readAny(redact(o.optString("title") + " " + o.optString("body")));
        return s != null && !s.in && s.amount == amount;
    }

    /**
     * The answer given on the alert, kept on every copy of that one payment
     * (the screen's and the app's notification): those tagged with its
     * notification id. Older untagged copies fall back to amount and time.
     */
    static synchronized int answer(Context c, int nid, double amount, long at, JSONObject answer) {
        JSONArray list = read(c);
        int n = 0;
        boolean tagged = false;
        for (int i = 0; i < list.length(); i++) {
            JSONObject o = list.optJSONObject(i);
            if (o != null && nid != 0 && o.optInt("nid", 0) == nid) tagged = true;
        }
        for (int i = 0; i < list.length(); i++) {
            JSONObject o = list.optJSONObject(i);
            if (o == null || o.has("answer")) continue;
            boolean mine = tagged ? o.optInt("nid", 0) == nid : (!o.has("nid") && matches(o, amount, at));
            if (!mine) continue;
            try {
                o.put("answer", answer);
                n++;
            } catch (JSONException ignored) {
            }
        }
        if (n > 0) write(c, list);
        return n;
    }

    /** Already answered — the sheet for it need not open again. */
    static synchronized boolean answered(Context c, int nid, double amount, long at) {
        JSONArray list = read(c);
        for (int i = 0; i < list.length(); i++) {
            JSONObject o = list.optJSONObject(i);
            if (o == null || !o.has("answer")) continue;
            if (nid != 0 && o.optInt("nid", 0) == nid) return true;
            if (nid == 0 && matches(o, amount, at)) return true;
        }
        return false;
    }

    /** Categories and people the app last handed over, for the popup's buttons. */
    static synchronized void setChoices(Context c, String json) {
        prefs(c).edit().putString(K_CHOICES, json == null ? "{}" : json).apply();
    }

    static synchronized JSONObject choices(Context c) {
        try {
            return new JSONObject(prefs(c).getString(K_CHOICES, "{}"));
        } catch (JSONException e) {
            return new JSONObject();
        }
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
