package com.dockin.student;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.IOException;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * Self-approval, the second MyCamu login the college gives a student to approve
 * their own gate pass.
 *
 * It is the same site as {@link Camu} ({@code student.bennetterp.camu.in}) but a
 * different account, signed in with a username and password (not Microsoft). So
 * its session is a separate cookie, kept apart from the student's: the student's
 * stays in {@link Vault} under Camu's key and is used for attendance and for
 * making passes; this one is used only to approve.
 *
 * Nothing here is guessed. The sign-in request and the approve request are both
 * learned once, from what MyCamu's own page sends while the student does it by
 * hand inside DockIn (see {@link CamuLoginActivity}'s capture). After that:
 *
 *   • re-signing in is that same sign-in request sent again — it still carries
 *     the password the student typed, so it needs nothing more;
 *   • approving a pass is the learned approve request sent again, with the pass's
 *     id swapped in.
 *
 * The learned sign-in request holds the password, so it lives encrypted in
 * {@link Vault}. The approve request holds no secret and lives in prefs. If a
 * replay is refused (the session ended, or MyCamu changed its form), the caller
 * falls back to opening MyCamu so the student taps once and DockIn relearns.
 */
final class Approver {

    static final String PREFS = "dockin-approver";
    /** Display name of the approver login, so Profile can say who is connected. */
    static final String K_USER = "approver.user";
    static final String K_IDS = "approver.ids";
    static final String K_UA = "approver.ua";
    /** The learned approve request (url, method, body) — no secret. */
    static final String K_APPROVE = "approver.approveReq";
    /** Every change-y request the approver page sent, kept so the real approve can be read out. */
    static final String K_WRITES = "approver.writes";
    /** The approver session cookie (Vault). */
    static final String V_COOKIE = "approver.cookie";
    /** The learned sign-in request, which carries the password (Vault). */
    static final String V_LOGIN = "approver.loginReq";

    private static final Pattern OBJECT_ID = Pattern.compile("[a-f0-9]{24}");
    /** What the sign-in request looks like among the page's requests. */
    private static final Pattern LOGIN_URL = Pattern.compile("(?i)login|signin|sign-in|authenticate|token|auth");
    /** What an approve (not a cancel, not a read) looks like. */
    private static final Pattern APPROVE_HINT = Pattern.compile("(?i)appr|accept|prntap|parentap|sanction|grant");
    private static final Pattern REJECT_HINT = Pattern.compile("(?i)rej|decline|deny|cancel|cncl|withdraw");

    static final class Expired extends Exception {}
    static final class NeedsTeaching extends Exception {}

    private Approver() {}

    static SharedPreferences prefs(Context c) {
        return c.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /** The student has connected a self-approval login (even if the session ended). */
    static boolean saved(Context c) {
        return Vault.get(c, V_LOGIN) != null;
    }

    /** DockIn has learned how to approve, so it can do it on its own. */
    static boolean taught(Context c) {
        return saved(c) && prefs(c).getString(K_APPROVE, null) != null;
    }

    static String user(Context c) {
        return prefs(c).getString(K_USER, "");
    }

    static void forget(Context c) {
        Vault.remove(c, V_COOKIE, V_LOGIN);
        prefs(c).edit().remove(K_USER).remove(K_IDS).remove(K_UA).remove(K_APPROVE).remove(K_WRITES).apply();
    }

    /** Saves the session the approver sign-in just set (cookie + the login's ids). */
    static void saveSession(Context c, String cookie, JSONObject ids, String ua) {
        Vault.put(c, V_COOKIE, cookie);
        SharedPreferences.Editor e = prefs(c).edit();
        if (ids != null) {
            e.putString(K_IDS, ids.toString());
            String name = ids.optString("name", "");
            if (!name.isEmpty()) e.putString(K_USER, name);
        }
        if (ua != null) e.putString(K_UA, ua);
        e.apply();
    }

    static JSONObject ids(Context c) {
        try {
            String raw = prefs(c).getString(K_IDS, null);
            return raw == null ? null : new JSONObject(raw);
        } catch (JSONException e) {
            return null;
        }
    }

    /**
     * Looks at one request MyCamu's page sent and keeps it if it is the sign-in
     * or an approve. Called for every captured request while the approver screen
     * is open; most are ignored.
     */
    static void learn(Context c, String capturedJson) {
        JSONObject r;
        try {
            r = new JSONObject(capturedJson);
        } catch (JSONException e) {
            return;
        }
        String method = r.optString("method", "").toUpperCase();
        String url = r.optString("url", "");
        String body = r.optString("body", "");
        if (url.isEmpty()) return;
        if (CamuLoginActivity.ANALYTICS.matcher(url).find()) return;

        // The sign-in: a POST whose url or body talks about logging in. Kept
        // encrypted, because the body carries the password.
        if ("POST".equals(method) && (LOGIN_URL.matcher(url).find() || LOGIN_URL.matcher(body).find())
                && (body.toLowerCase().contains("pass") || body.toLowerCase().contains("pwd") || body.toLowerCase().contains("user"))) {
            Vault.put(c, V_LOGIN, r.toString());
            return;
        }

        // An approve: a change (not a plain read) that mentions approving and a
        // pass, and is not a reject or a cancel.
        boolean changey = !"GET".equals(method) || url.toLowerCase().contains("cancel") || url.toLowerCase().contains("appr");
        boolean aboutPass = Pattern.compile("(?i)leave|gate|pass|lvapp|lvreq").matcher(url + " " + body).find();
        boolean looksApprove = APPROVE_HINT.matcher(url + " " + body).find();
        boolean looksReject = REJECT_HINT.matcher(url).find() && !APPROVE_HINT.matcher(url).find();
        boolean hasId = OBJECT_ID.matcher(url + " " + body).find();
        if (changey && aboutPass && looksApprove && !looksReject && hasId) {
            prefs(c).edit().putString(K_APPROVE, r.toString()).apply();
        }
        // Keep every change-y pass request raw, whatever our guess, so the real
        // approve can be read out and pinned down once (approverCaptured()).
        if (changey && aboutPass && hasId && !looksReject) {
            keepWrite(c, r.toString());
        }
    }

    /** Appends one request to the capped raw-writes list. */
    private static void keepWrite(Context c, String json) {
        SharedPreferences p = prefs(c);
        org.json.JSONArray had;
        try {
            had = new org.json.JSONArray(p.getString(K_WRITES, "[]"));
        } catch (JSONException e) {
            had = new org.json.JSONArray();
        }
        try {
            had.put(new JSONObject(json));
        } catch (JSONException e) {
            return;
        }
        org.json.JSONArray keep = new org.json.JSONArray();
        for (int i = Math.max(0, had.length() - 15); i < had.length(); i++) keep.put(had.opt(i));
        p.edit().putString(K_WRITES, keep.toString()).apply();
    }

    /** The raw change-y requests the approver page sent (for pinning down the real approve). */
    static String captured(Context c) {
        return prefs(c).getString(K_WRITES, "[]");
    }

    private static Map<String, String> headers(Context c) {
        Map<String, String> h = new HashMap<>();
        h.put("Cookie", Vault.get(c, V_COOKIE));
        h.put("Origin", Camu.BASE);
        h.put("Referer", Camu.BASE + "/v2/");
        String ua = prefs(c).getString(K_UA, null);
        if (ua != null) h.put("User-Agent", ua);
        return h;
    }

    /** Signs in again with the learned request (it still holds the password). */
    private static void relogin(Context c) throws IOException, Expired {
        String raw = Vault.get(c, V_LOGIN);
        if (raw == null) throw new Expired();
        try {
            JSONObject req = new JSONObject(raw);
            String url = absolute(req.optString("url", ""));
            String body = req.optString("body", "");
            Map<String, String> h = headers(c);
            h.remove("Cookie"); // a sign-in starts a fresh session
            Net.Res res = body.trim().startsWith("{")
                    ? Net.postJson(url, body, h)
                    : Net.postForm(url, formOf(body), h);
            String cookie = cookieFrom(res);
            if (cookie == null || cookie.isEmpty()) throw new Expired();
            Vault.put(c, V_COOKIE, cookie);
        } catch (JSONException e) {
            throw new Expired();
        }
    }

    /**
     * Approves the pass with this id, the way the approver did it by hand. Signs
     * in again once if the session has ended. Returns MyCamu's status text.
     */
    static String approve(Context c, String passId) throws IOException, Expired, NeedsTeaching {
        if (passId == null || !OBJECT_ID.matcher(passId).matches())
            throw new IllegalArgumentException("That pass can't be approved from here.");
        String raw = prefs(c).getString(K_APPROVE, null);
        if (raw == null || !saved(c)) throw new NeedsTeaching();
        if (Vault.get(c, V_COOKIE) == null) relogin(c);
        try {
            Net.Res res = sendApprove(c, new JSONObject(raw), passId);
            if (res.code == 401 || res.code == 403 || res.redirect()) {
                relogin(c);
                res = sendApprove(c, new JSONObject(raw), passId);
            }
            if (res.code == 401 || res.code == 403 || res.redirect()) throw new Expired();
            if (!res.ok()) throw new IOException("MyCamu answered " + res.code);
            return statusOf(res.body);
        } catch (JSONException e) {
            throw new NeedsTeaching();
        }
    }

    private static Net.Res sendApprove(Context c, JSONObject req, String passId) throws IOException, JSONException {
        String method = req.optString("method", "POST").toUpperCase();
        String url = swapId(absolute(req.optString("url", "")), passId);
        String body = swapId(req.optString("body", ""), passId);
        Map<String, String> h = headers(c);
        if ("GET".equals(method)) return Net.get(url, h);
        if (body.trim().startsWith("{") || body.trim().startsWith("[")) return Net.postJson(url, body, h);
        if (!body.isEmpty()) return Net.postForm(url, formOf(body), h);
        return Net.postJson(url, "{}", h);
    }

    /** Replaces the pass id the request was learned with by the one we want approved. */
    private static String swapId(String s, String passId) {
        if (s == null || s.isEmpty()) return s;
        return OBJECT_ID.matcher(s).replaceAll(passId);
    }

    private static String absolute(String url) {
        if (url.startsWith("http")) return url;
        if (url.startsWith("/")) return Camu.BASE + url;
        return Camu.BASE + "/" + url;
    }

    /** Joins the Set-Cookie values of a response into one Cookie header. */
    private static String cookieFrom(Net.Res res) {
        List<String> set = res.all("Set-Cookie");
        if (set.isEmpty()) return null;
        StringBuilder b = new StringBuilder();
        for (String s : set) {
            if (s == null) continue;
            int semi = s.indexOf(';');
            String pair = (semi >= 0 ? s.substring(0, semi) : s).trim();
            if (pair.isEmpty() || pair.indexOf('=') <= 0) continue;
            if (b.length() > 0) b.append("; ");
            b.append(pair);
        }
        return b.length() == 0 ? null : b.toString();
    }

    private static Map<String, String> formOf(String body) {
        Map<String, String> m = new HashMap<>();
        for (String part : body.split("&")) {
            int eq = part.indexOf('=');
            if (eq <= 0) continue;
            try {
                m.put(java.net.URLDecoder.decode(part.substring(0, eq), "UTF-8"),
                        java.net.URLDecoder.decode(part.substring(eq + 1), "UTF-8"));
            } catch (Exception e) {
                // skip a part that won't decode
            }
        }
        return m;
    }

    /** MyCamu's answer in a word, for the toast ("approved", or its own code). */
    private static String statusOf(String body) {
        if (body == null || body.isEmpty()) return "approved";
        try {
            JSONObject j = new JSONObject(body);
            JSONObject out = j.optJSONObject("output");
            JSONObject data = out == null ? null : out.optJSONObject("data");
            String code = data == null ? "" : data.optString("code", "");
            if (!code.isEmpty()) return code;
            if (APPROVE_HINT.matcher(body).find()) return "approved";
        } catch (JSONException e) {
            // not json — fall through
        }
        return "approved";
    }
}
