package com.dockin.student;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * What payment detection saw, kept on the phone: each payment caught (and how
 * fast), and each payment-app screen that looked like a payment but was not
 * read as one. Settings shows it, and "Copy" hands it over when something is
 * missed — so a miss is fixed from what the phone saw, not from a guess.
 * Long numbers (accounts, references, phone numbers) are masked first.
 */
final class PayLog {
    private PayLog() {}

    private static final String PREFS = "dockin-paylog";
    private static final int MAX = 40;

    static synchronized void add(Context c, String kind, String app, String text, long ms) {
        SharedPreferences p = c.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        JSONArray list;
        try {
            list = new JSONArray(p.getString("log", "[]"));
        } catch (JSONException e) {
            list = new JSONArray();
        }
        String t = mask(text);
        if (t.length() > 700) t = t.substring(0, 700) + "…";
        // The same miss redrawn again and again is one line.
        JSONObject last = list.length() > 0 ? list.optJSONObject(list.length() - 1) : null;
        if (last != null && kind.equals(last.optString("kind")) && t.equals(last.optString("text"))) return;
        JSONObject o = new JSONObject();
        try {
            o.put("at", System.currentTimeMillis());
            o.put("kind", kind);
            o.put("app", app == null ? "" : app);
            o.put("text", t);
            if (ms >= 0) o.put("ms", ms);
        } catch (JSONException ignored) {
            return;
        }
        list.put(o);
        JSONArray kept = new JSONArray();
        for (int i = Math.max(0, list.length() - MAX); i < list.length(); i++) kept.put(list.opt(i));
        p.edit().putString("log", kept.toString()).apply();
    }

    static synchronized JSONArray all(Context c) {
        try {
            return new JSONArray(c.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("log", "[]"));
        } catch (JSONException e) {
            return new JSONArray();
        }
    }

    static synchronized void clear(Context c) {
        c.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().remove("log").apply();
    }

    /** 6+ digit runs (accounts, UPI refs, phones) become ••••; amounts stay. */
    static String mask(String s) {
        if (s == null) return "";
        return s.replaceAll("\\d{6,}", "••••").replaceAll("[\\w.-]+@[\\w.-]+", "•@•");
    }
}
