package com.dockin.student;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.IOException;
import java.util.HashMap;
import java.util.Map;

/**
 * Reading Sachin's own attendance and timetable from MyCamu, read-only.
 *
 * There is no public API, so this calls the same endpoints Camu's own web app
 * calls, with the session Camu gave him when he signed in inside DockIn (see
 * {@link CamuLoginActivity}). Nothing is ever written to Camu.
 *
 * The session is a cookie, kept encrypted in {@link Vault}. When Camu ends it,
 * every call answers 401 and the person is asked to sign in again — DockIn
 * never sees or stores the Microsoft password.
 */
final class Camu {

    static final String BASE = "https://student.bennetterp.camu.in";
    static final String PREFS = "dockin-college";
    static final String K_IDS = "camu.ids";
    static final String K_UA = "camu.ua";
    /** MyCamu's own id for the signed-in login (sent as `loggedInId` with a pass). */
    static final String K_LOGIN = "camu.loginId";
    static final String V_COOKIE = "camu.cookie";

    /** Camu ended the session; signing in again is the only fix. */
    static final class Expired extends Exception {
        Expired() {
            super("Camu signed you out");
        }
    }

    private Camu() {}

    static SharedPreferences prefs(Context c) {
        return c.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static boolean connected(Context c) {
        return prefs(c).getString(K_IDS, null) != null && Vault.get(c, V_COOKIE) != null;
    }

    /** Called once the in-app sign-in has the session and the student's ids. */
    static void save(Context c, String cookie, JSONObject ids, String userAgent) {
        Vault.put(c, V_COOKIE, cookie);
        prefs(c).edit().putString(K_IDS, ids.toString()).putString(K_UA, userAgent).apply();
    }

    static void forget(Context c) {
        Vault.remove(c, V_COOKIE);
        prefs(c).edit().remove(K_IDS).apply();
    }

    static JSONObject ids(Context c) {
        try {
            String raw = prefs(c).getString(K_IDS, null);
            return raw == null ? null : new JSONObject(raw);
        } catch (JSONException e) {
            return null;
        }
    }

    // -------------------------------------------------------------------------

    /** Overall and per-subject attendance, exactly as Camu's attendance page shows it. */
    static JSONObject attendance(Context c) throws IOException, Expired, JSONException {
        JSONObject id = need(c);
        JSONObject body = new JSONObject()
                .put("InId", id.optString("InId"))
                .put("PrID", id.optString("PrID"))
                .put("CrID", id.optString("CrID"))
                .put("DeptID", id.optString("DeptID"))
                .put("SemID", id.optString("SemID"))
                .put("AcYr", id.optString("AcYr"))
                .put("CmProgID", id.optString("CmProgID"))
                .put("StuID", id.optString("StuID"))
                .put("isFE", id.optBoolean("isFE"))
                .put("isForWeb", true)
                .put("isFrAbLg", true);
        return data(c, "/api/Attendance/getDtaForStupage", body).optJSONObject("data");
    }

    /** Every class of one subject this semester, present or not. */
    static JSONArray history(Context c, String subjectId, JSONArray attTypes) throws IOException, Expired, JSONException {
        JSONObject id = need(c);
        JSONObject body = new JSONObject()
                .put("CmProgID", id.optString("CmProgID"))
                .put("isFE", id.optBoolean("isFE"))
                .put("AttenTy", attTypes == null ? new JSONArray().put("PerAtt") : attTypes)
                .put("SubID", subjectId);
        JSONArray out = data(c, "/api/getAttendanceByAttTypAndSubj", body).optJSONArray("data");
        return out == null ? new JSONArray() : out;
    }

    /**
     * Today's mess menu and the student's reusable cafeteria pass, from the same
     * cafeteria page MyCamu shows. Both endpoints take no body — the session
     * cookie identifies the student — so this needs none of the ids attendance does.
     */
    static JSONObject cafeteria(Context c) throws IOException, Expired, JSONException {
        need(c);
        JSONObject out = new JSONObject();

        JSONObject menu = data(c, "/api/mess-management/get-student-menu-list", new JSONObject()).optJSONObject("data");
        if (menu != null) {
            out.put("facility", menu.optString("facNme", ""));
            out.put("date", menu.optString("curntDte", ""));
            JSONArray meals = new JSONArray();
            JSONArray list = menu.optJSONArray("oMealList");
            for (int i = 0; list != null && i < list.length(); i++) {
                JSONObject m = list.optJSONObject(i);
                if (m == null) continue;
                String code = m.optString("msCde", "");
                int paren = code.indexOf('(');
                String meal = paren > 0 ? code.substring(0, paren).trim() : code;
                meals.put(new JSONObject()
                        .put("meal", meal)
                        .put("label", m.optString("mealTm", meal))
                        .put("items", m.optString("msNme", ""))
                        .put("color", m.optString("mealClr", "")));
            }
            out.put("meals", meals);
        }

        // The pass is a second call; if it misbehaves the menu is still worth showing.
        try {
            JSONObject qr = data(c, "/api/mess-management/generate-permanent-qr-code", new JSONObject()).optJSONObject("data");
            if (qr != null) out.put("qr", qr.optString("prQrCd", ""));
        } catch (Expired e) {
            throw e;
        } catch (Exception ignored) {
        }
        return out;
    }

    /**
     * The timetable between two dates ("YYYY-MM-DD"), with holidays.
     * Camu answers [periods, ?, holidays, semester]; only the first and third matter.
     */
    static JSONObject timetable(Context c, String from, String to) throws IOException, Expired, JSONException {
        JSONObject id = need(c);
        JSONObject body = new JSONObject()
                .put("PrID", id.optString("PrID"))
                .put("CrID", id.optString("CrID"))
                .put("AcYr", id.optString("AcYr"))
                .put("DeptID", id.optString("DeptID"))
                .put("SemID", id.optString("SemID"))
                .put("start", from)
                .put("end", to)
                .put("schdlTyp", "showCurWeek")
                .put("isShowCancelledPeriod", true)
                .put("isFromTt", true);
        JSONObject out = new JSONObject();
        Object raw = data(c, "/api/Timetable/get", body).opt("data");
        JSONArray periods = new JSONArray();
        JSONArray holidays = new JSONArray();
        if (raw instanceof JSONArray) {
            JSONArray arr = (JSONArray) raw;
            Object first = arr.opt(0);
            if (first instanceof JSONArray) periods = (JSONArray) first;
            else if (first instanceof JSONObject) {
                JSONArray p = ((JSONObject) first).optJSONArray("Periods");
                if (p != null) periods = p;
                JSONArray h = ((JSONObject) first).optJSONArray("Holiday");
                if (h != null) holidays = h;
            }
            Object third = arr.opt(2);
            if (third instanceof JSONArray) holidays = (JSONArray) third;
        }
        out.put("periods", periods);
        out.put("holidays", holidays);
        return out;
    }

    // ------------------------------------------------------------- outpass

    /** No login id yet: the student has to make one pass in MyCamu through DockIn first. */
    static final class NeedsTeaching extends Exception {}

    /**
     * MyCamu sends the login's id with every pass, and it is not among the ids
     * DockIn reads at sign-in. It is learned from a pass the student made in
     * MyCamu inside DockIn (see CamuLoginActivity.Capture) — only when that
     * pass is this same student's.
     */
    static void learnLoginId(Context c, String noteJson) {
        try {
            String body = new JSONObject(noteJson).optString("body", "");
            if (!body.contains("loggedInId")) return;
            JSONObject b = new JSONObject(body);
            String login = b.optString("loggedInId", "");
            JSONObject id = ids(c);
            if (login.isEmpty() || id == null || !b.optString("PerId", "").equals(id.optString("StuID", ""))) return;
            prefs(c).edit().putString(K_LOGIN, login).apply();
        } catch (JSONException e) {
            // not a pass
        }
    }

    static boolean canMakePass(Context c) {
        if (!connected(c)) return false;
        if (prefs(c).getString(K_LOGIN, "").isEmpty()) learnFromNotes(c);
        return !prefs(c).getString(K_LOGIN, "").isEmpty();
    }

    /** Has the login id been learned (whether or not Camu is signed in now)? */
    static boolean taught(Context c) {
        if (prefs(c).getString(K_LOGIN, "").isEmpty() && ids(c) != null) learnFromNotes(c);
        return !prefs(c).getString(K_LOGIN, "").isEmpty();
    }

    /** Passes noted before this build knew to look (they stay on the phone). */
    private static void learnFromNotes(Context c) {
        SharedPreferences p = c.getApplicationContext()
                .getSharedPreferences(CamuLoginActivity.PREFS_CAPTURE, Context.MODE_PRIVATE);
        for (String key : new String[] {"writes", "picked", "items"}) {
            try {
                JSONArray a = new JSONArray(p.getString(key, "[]"));
                for (int i = a.length() - 1; i >= 0; i--) {
                    Object o = a.opt(i);
                    if (o != null) learnLoginId(c, o.toString());
                    if (!prefs(c).getString(K_LOGIN, "").isEmpty()) return;
                }
            } catch (JSONException e) {
                // nothing usable
            }
        }
    }

    private static final java.util.regex.Pattern DAY = java.util.regex.Pattern.compile("\\d{4}-\\d{2}-\\d{2}");
    private static final java.util.regex.Pattern TIME = java.util.regex.Pattern.compile("([01]\\d|2[0-3]):[0-5]\\d");

    /**
     * The body MyCamu's own form sends for a Day Out Pass (captured from it):
     * one day, the times as Indian wall-clock written with a Z.
     */
    static JSONObject dayOutBody(JSONObject id, String login, String day, String from, String to, String reason) throws JSONException {
        if (!DAY.matcher(day).matches() || !TIME.matcher(from).matches() || !TIME.matcher(to).matches())
            throw new IllegalArgumentException("Pick a date and both times.");
        if (from.compareTo("06:00") < 0 || to.compareTo("19:00") > 0 || from.compareTo(to) >= 0)
            throw new IllegalArgumentException("A day out runs between 6:00 am and 7:00 pm.");
        String why = reason == null ? "" : reason.trim();
        if (why.isEmpty() || why.length() > 200) throw new IllegalArgumentException("Give a reason.");
        String midnight = day + "T00:00:00.000Z";
        return new JSONObject()
                .put("PerTy", "Student")
                .put("PerId", id.optString("StuID"))
                .put("PerNm", id.optString("name"))
                .put("InId", id.optString("InId"))
                .put("HstleReq", "true")
                .put("LvTy", "Leave")
                .put("Rson", why)
                .put("PtAb", "")
                .put("Sson", "")
                .put("ToDt", midnight)
                .put("FrDt", midnight)
                .put("periods", new JSONArray())
                .put("Attachments", new JSONArray())
                .put("GateOutPass", true)
                .put("passTy", "DOP")
                .put("loggedInId", login)
                .put("frdt", day + "T" + from + ":00Z")
                .put("todt", day + "T" + to + ":00Z")
                .put("rson", why)
                .put("atcmnt", new JSONArray())
                .put("timezoneOffSet", 330);
    }

    /** Sends a Day Out Pass the way MyCamu's form does; returns MyCamu's `output`. */
    static JSONObject makeDayOut(Context c, String day, String from, String to, String reason)
            throws IOException, Expired, JSONException, NeedsTeaching {
        JSONObject id = need(c);
        if (!canMakePass(c)) throw new NeedsTeaching();
        String login = prefs(c).getString(K_LOGIN, "");
        return data(c, "/api/Leave/crtLv", dayOutBody(id, login, day, from, to, reason));
    }

    /** The student's passes and leaves, as MyCamu's leave page lists them. */
    static JSONArray passes(Context c) throws IOException, Expired, JSONException {
        JSONObject id = need(c);
        JSONObject body = new JSONObject().put("StuID", id.optString("StuID")).put("isFrmReact", true);
        JSONArray a = data(c, "/api/Leave/getAllleave/", body).optJSONArray("data");
        return a == null ? new JSONArray() : a;
    }

    // -------------------------------------------------------------------------

    private static JSONObject need(Context c) throws Expired {
        JSONObject id = ids(c);
        if (id == null || Vault.get(c, V_COOKIE) == null) throw new Expired();
        return id;
    }

    /** Posts to Camu and returns its `output` object, or throws when the session is over. */
    private static JSONObject data(Context c, String path, JSONObject body) throws IOException, Expired, JSONException {
        Map<String, String> h = new HashMap<>();
        h.put("Cookie", Vault.get(c, V_COOKIE));
        h.put("Origin", BASE);
        h.put("Referer", BASE + "/v2/");
        String ua = prefs(c).getString(K_UA, null);
        if (ua != null) h.put("User-Agent", ua);
        Net.Res r = Net.postJson(BASE + path, body.toString(), h);
        if (r.code == 401 || r.code == 403 || (r.code >= 300 && r.code < 400)) throw new Expired();
        if (!r.ok()) throw new IOException("Camu answered " + r.code);
        JSONObject j;
        try {
            j = new JSONObject(r.body);
        } catch (JSONException e) {
            // An HTML login page instead of data is a session that ended.
            if (r.body.trim().startsWith("<")) throw new Expired();
            throw e;
        }
        JSONObject output = j.optJSONObject("output");
        if (output == null) throw new IOException("Camu sent something unexpected");
        return output;
    }
}
