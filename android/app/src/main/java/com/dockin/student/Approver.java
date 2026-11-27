package com.dockin.student;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.IOException;
import java.util.HashMap;
import java.util.Map;
import java.util.regex.Matcher;
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
    /** Every change-y request the approval page sent, kept as a setup helper. */
    static final String K_WRITES = "approver.writes";
    /** The approval login's own id (loggedInId), learned from one approve by hand. */
    static final String K_LOGIN = "approver.loginId";
    /** The username the student typed, kept to pre-fill the sign-in next time. */
    static final String K_TYPED = "approver.typedUser";
    /** The password the student typed, kept (encrypted) to pre-fill the sign-in. */
    static final String V_PASS = "approver.typedPass";
    /** The approver session cookie (Vault). */
    static final String V_COOKIE = "approver.cookie";
    /** The sign-in request the approver page sent, replayed to renew the session (Vault; holds the password). */
    static final String V_LOGIN = "approver.login";

    /** MyCamu's own "Approve" button sends this (captured 28 Nov 2026). */
    static final String APPROVE_API = "/api/gatepasses/change-gatepasses-status";

    private static final Pattern OBJECT_ID = Pattern.compile("[a-f0-9]{24}");
    private static final Pattern LOGGED_IN = Pattern.compile("\"loggedInId\"\\s*:\\s*\"([a-f0-9]{24})\"");
    /** The logged-in user's own id in a sign-in response — the approval login's id. */
    private static final Pattern USER_ID = Pattern.compile("\"(?:loggedInId|userId|UserId|usrId|UsrId|user_id|_id)\"\\s*:\\s*\"([a-f0-9]{24})\"");
    /** What the sign-in request looks like among the page's requests. */
    private static final Pattern LOGIN_URL = Pattern.compile("(?i)login|signin|sign-in|authenticate|/token|/auth\\b|validateuser|verifyuser|checkuser");

    static final class Expired extends Exception {}
    static final class NeedsTeaching extends Exception {}

    private Approver() {}

    static SharedPreferences prefs(Context c) {
        return c.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /** The student has connected a self-approval login (even if the session has since ended). */
    static boolean saved(Context c) {
        return prefs(c).getString(K_IDS, null) != null || Vault.get(c, V_COOKIE) != null;
    }

    /** DockIn knows the approval login's id, so it can approve on its own. */
    static boolean taught(Context c) {
        return saved(c) && !prefs(c).getString(K_LOGIN, "").isEmpty();
    }

    static String user(Context c) {
        String name = prefs(c).getString(K_USER, "");
        return name.isEmpty() ? prefs(c).getString(K_TYPED, "") : name;
    }

    /** The student has typed a username and password to pre-fill the sign-in. */
    static boolean hasCreds(Context c) {
        return !prefs(c).getString(K_TYPED, "").isEmpty();
    }

    static String typedUser(Context c) {
        return prefs(c).getString(K_TYPED, "");
    }

    static String typedPass(Context c) {
        String p = Vault.get(c, V_PASS);
        return p == null ? "" : p;
    }

    /** Saves the username and password the student typed (password encrypted). */
    static void saveCreds(Context c, String user, String pass) {
        prefs(c).edit().putString(K_TYPED, user == null ? "" : user.trim()).apply();
        Vault.put(c, V_PASS, pass == null ? "" : pass);
    }

    /** DockIn can sign in again on its own (so the session never just "ends"). */
    static boolean canRenew(Context c) {
        return Vault.get(c, V_LOGIN) != null;
    }

    static void forget(Context c) {
        Vault.remove(c, V_COOKIE, V_LOGIN, V_PASS);
        prefs(c).edit().remove(K_USER).remove(K_IDS).remove(K_UA).remove(K_LOGIN).remove(K_WRITES).remove(K_TYPED).apply();
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
     * Learns from one request MyCamu's approval page sent. The one approve the
     * student does by hand carries {@code loggedInId} — the approval login's own
     * id — which is all DockIn needs to approve on its own after that.
     */
    static void learn(Context c, String capturedJson) {
        JSONObject r;
        try {
            r = new JSONObject(capturedJson);
        } catch (JSONException e) {
            return;
        }
        String url = r.optString("url", "");
        String body = r.optString("body", "");
        if (url.isEmpty() || CamuLoginActivity.ANALYTICS.matcher(url).find()) return;

        // The approval login's own id. A real approve sends it as loggedInId and is
        // the ground truth — always keep that. So the student never has to approve
        // one by hand first, also read it from the sign-in response (the logged-in
        // user's id) at connect, as long as nothing truer is known yet.
        Matcher m = LOGGED_IN.matcher(body);
        if (m.find()) prefs(c).edit().putString(K_LOGIN, m.group(1)).apply();

        String method = r.optString("method", "").toUpperCase();
        String low = body.toLowerCase();
        boolean isLogin = "POST".equals(method)
                && (LOGIN_URL.matcher(url).find() || LOGIN_URL.matcher(low).find())
                && (low.contains("pass") || low.contains("pwd"))
                && (low.contains("user") || low.contains("email") || low.contains("login"));
        if (isLogin) {
            // The sign-in request — kept (encrypted) so DockIn renews the session itself.
            Vault.put(c, V_LOGIN, r.toString());
            // The logged-in user's id from the response, so approval needs no "teach".
            if (prefs(c).getString(K_LOGIN, "").isEmpty()) {
                Matcher um = USER_ID.matcher(r.optString("answer", ""));
                if (um.find()) prefs(c).edit().putString(K_LOGIN, um.group(1)).apply();
            }
        }

        // Keep the change-y pass requests raw too, as a setup helper / for tweaks.
        boolean changey = !"GET".equals(method) || url.toLowerCase().contains("status");
        if (changey && Pattern.compile("(?i)leave|gate|pass").matcher(url).find() && OBJECT_ID.matcher(url + " " + body).find()) {
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

    /**
     * Approves one pass the way MyCamu's own "Approve" button does (captured
     * 28 Nov 2026):
     *
     *   POST /api/gatepasses/change-gatepasses-status
     *   {"id":<pass>,"roll":"parent","action":"Approve","PerId":<student>,"loggedInId":<approver>}
     *   → {"output":{"data":{"code":"STATUS_UPDTD_SUCC"}}}
     *
     * PerId is the student whose pass it is — this phone's own MyCamu id, so the
     * student stays signed in for it. loggedInId is the approval login's own id,
     * learned from the one approve done by hand at setup. Throws {@link Expired}
     * when the approval session has ended (reconnect), {@link NeedsTeaching}
     * before the id is known.
     */
    static String approve(Context c, String passId) throws IOException, Expired, NeedsTeaching {
        if (passId == null || !OBJECT_ID.matcher(passId).matches())
            throw new IllegalArgumentException("That pass can't be approved from here.");
        String loggedInId = prefs(c).getString(K_LOGIN, "");
        JSONObject stu = Camu.ids(c);
        String perId = stu == null ? "" : stu.optString("StuID", "");
        if (loggedInId.isEmpty() || perId.isEmpty()) throw new NeedsTeaching();
        if (Vault.get(c, V_COOKIE) == null) relogin(c); // session gone — sign in again, quietly
        String body;
        try {
            body = new JSONObject()
                    .put("id", passId)
                    .put("roll", "parent")
                    .put("action", "Approve")
                    .put("PerId", perId)
                    .put("loggedInId", loggedInId)
                    .toString();
        } catch (JSONException e) {
            throw new IOException("Couldn't build the approval.");
        }
        Net.Res res = Net.postJson(Camu.BASE + APPROVE_API, body, headers(c));
        // Session ended mid-use: sign in again on our own and try once more, so the
        // student never sees an "expired" — the session renews itself.
        if (res.code == 401 || res.code == 403 || res.redirect()) {
            relogin(c);
            res = Net.postJson(Camu.BASE + APPROVE_API, body, headers(c));
        }
        if (res.code == 401 || res.code == 403 || res.redirect()) throw new Expired();
        if (!res.ok()) throw new IOException("MyCamu answered " + res.code);
        return codeOf(res.body);
    }

    /**
     * Signs the approver in again from the captured sign-in request, so the
     * session renews itself without the student doing anything. Throws
     * {@link Expired} only when there's nothing to renew from or it's refused.
     */
    private static void relogin(Context c) throws IOException, Expired {
        String raw = Vault.get(c, V_LOGIN);
        if (raw == null) throw new Expired();
        try {
            JSONObject req = new JSONObject(raw);
            String url = req.optString("url", "");
            if (!url.startsWith("http")) url = Camu.BASE + (url.startsWith("/") ? url : "/" + url);
            String body = req.optString("body", "");
            Map<String, String> h = headers(c);
            h.remove("Cookie"); // a sign-in starts a fresh session
            Net.Res res = body.trim().startsWith("{") || body.trim().startsWith("[")
                    ? Net.postJson(url, body, h)
                    : Net.postForm(url, formOf(body), h);
            String cookie = cookieFrom(res);
            if (cookie == null || cookie.isEmpty() || !res.ok()) throw new Expired();
            Vault.put(c, V_COOKIE, cookie);
        } catch (JSONException e) {
            throw new Expired();
        }
    }

    /** The one Cookie header built from a response's Set-Cookie values. */
    private static String cookieFrom(Net.Res res) {
        java.util.List<String> set = res.all("Set-Cookie");
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

    /** MyCamu's answer code ("STATUS_UPDTD_SUCC" on success), else "approved". */
    private static String codeOf(String responseBody) {
        if (responseBody == null || responseBody.isEmpty()) return "approved";
        try {
            JSONObject out = new JSONObject(responseBody).optJSONObject("output");
            JSONObject data = out == null ? null : out.optJSONObject("data");
            String code = data == null ? "" : data.optString("code", "");
            return code.isEmpty() ? "approved" : code;
        } catch (JSONException e) {
            return "approved";
        }
    }
}
