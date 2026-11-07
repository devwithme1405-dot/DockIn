package com.dockin.student;

import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;

import androidx.core.app.NotificationChannelCompat;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.IOException;
import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Date;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;

/**
 * One sync of everything college: Camu's attendance and timetable, and the
 * LMS's to-do list. Runs from the hourly background job and whenever the app
 * asks, keeps the result on the phone, and posts a notification only for news:
 * a new assignment, one due within a day, an absence Camu just recorded.
 *
 * Each source fails on its own. Camu being down never hides the LMS, and the
 * last good copy of either stays on screen until a newer one arrives.
 */
final class College {

    static final String CHANNEL = "college";
    private static final String K_STATE = "state";
    private static final String K_SEEN = "lms.seen";
    private static final String K_WARNED = "lms.warned";
    private static final String K_EXPIRED_TOLD = "camu.expiredTold";
    private static final long HISTORY_EVERY_MS = 6 * 3600 * 1000L;
    private static final Object LOCK = new Object();

    private College() {}

    /** What the phone knows right now, without going online. */
    static JSONObject state(Context c) {
        JSONObject st = load(c);
        try {
            JSONObject camu = obj(st, "camu");
            camu.put("connected", Camu.connected(c));
            JSONObject lms = obj(st, "lms");
            lms.put("connected", Lms.connected(c));
            lms.put("name", Camu.prefs(c).getString(Lms.K_NAME, ""));
        } catch (JSONException ignored) {
            // The stored copy is still returned as it is.
        }
        return st;
    }

    static JSONObject sync(Context c, boolean full) {
        synchronized (LOCK) {
            JSONObject st = load(c);
            try {
                if (Camu.connected(c)) syncCamu(c, obj(st, "camu"), full);
                if (Lms.connected(c)) syncLms(c, obj(st, "lms"));
                st.put("syncedAt", System.currentTimeMillis());
            } catch (JSONException ignored) {
                // Building our own JSON does not fail in practice.
            }
            save(c, st);
            JSONObject out = state(c);
            DockInPlugin.deliverCollege(out);
            return out;
        }
    }

    static void clear(Context c, String which) {
        synchronized (LOCK) {
            JSONObject st = load(c);
            st.remove(which);
            save(c, st);
            if ("lms".equals(which)) Camu.prefs(c).edit().remove(K_SEEN).remove(K_WARNED).apply();
        }
    }

    // -------------------------------------------------------------------------
    // Camu

    private static void syncCamu(Context c, JSONObject camu, boolean full) throws JSONException {
        long now = System.currentTimeMillis();
        try {
            JSONObject att = Camu.attendance(c);
            if (att == null) throw new IOException("No attendance from Camu");
            JSONArray before = camu.optJSONArray("subjects");
            JSONArray subjects = subjects(att);
            camu.put("overall", new JSONObject()
                    .put("pct", att.optDouble("OvrAllPrcntg", 0))
                    .put("present", att.optInt("OvrAllPCnt", 0))
                    .put("total", att.optInt("OvrAllCnt", 0)));
            camu.put("subjects", subjects);
            if (before != null) tellAbsences(c, before, subjects, camu.getJSONObject("overall"));

            // The timetable and the class-by-class history are extras: when Camu
            // will not give them (it answers 500 for a week it has not finalised),
            // the last copy stays and the attendance above still counts as fresh.
            try {
                JSONObject tt = Camu.timetable(c, day(-7), day(14));
                camu.put("periods", periods(tt.optJSONArray("periods")));
                camu.put("holidays", holidays(tt.optJSONArray("holidays")));
            } catch (IOException | JSONException e) {
                if (!camu.has("periods")) camu.put("periods", new JSONArray());
            }

            boolean subjectsChanged = before == null || !sameCounts(before, subjects);
            if (full || subjectsChanged || now - camu.optLong("historyAt", 0) > HISTORY_EVERY_MS) try {
                JSONObject history = new JSONObject();
                JSONArray types = new JSONArray();
                JSONArray attTypes = att.optJSONArray("AttenTy");
                if (attTypes != null) {
                    for (int i = 0; i < attTypes.length(); i++) {
                        JSONObject t = attTypes.optJSONObject(i);
                        if (t != null && "PerAtt".equals(t.optString("Code"))) types.put("PerAtt");
                    }
                }
                if (types.length() == 0) types.put("PerAtt");
                for (int i = 0; i < subjects.length(); i++) {
                    String id = subjects.getJSONObject(i).optString("id");
                    if (id.isEmpty()) continue;
                    history.put(id, classes(Camu.history(c, id, types)));
                }
                camu.put("history", history);
                camu.put("historyAt", now);
            } catch (IOException | JSONException e) {
                // Keep the old history; the next sync tries again.
            }
            camu.put("syncedAt", now);
            camu.put("expired", false);
            camu.remove("error");
            Camu.prefs(c).edit().remove(K_EXPIRED_TOLD).apply();
        } catch (Camu.Expired e) {
            camu.put("expired", true);
            camu.put("error", "Camu signed you out. Sign in again to keep attendance updating.");
            SharedPreferences p = Camu.prefs(c);
            if (!p.getBoolean(K_EXPIRED_TOLD, false)) {
                p.edit().putBoolean(K_EXPIRED_TOLD, true).apply();
                post(c, 5999, "Camu needs you to sign in again",
                        "Attendance stops updating until you do. One tap.", "/attendance?camu=reconnect");
            }
        } catch (IOException | JSONException | RuntimeException e) {
            camu.put("error", "Could not reach Camu just now. It will try again.");
        }
    }

    private static JSONArray subjects(JSONObject att) throws JSONException {
        JSONArray list = att.optJSONArray("aSubjectList");
        if (list == null) list = att.optJSONArray("subjectList");
        JSONArray out = new JSONArray();
        if (list == null) return out;
        for (int i = 0; i < list.length(); i++) {
            JSONObject s = list.optJSONObject(i);
            if (s == null) continue;
            out.put(new JSONObject()
                    .put("id", s.optString("SubjId"))
                    .put("code", s.optString("SubjCd"))
                    .put("name", s.optString("SubjNm"))
                    .put("present", s.optInt("pnt", s.optInt("prsentCnt", 0)))
                    .put("total", s.optInt("all", 0))
                    .put("absent", s.optInt("absentCnt", 0))
                    .put("leave", s.optInt("leaveCnt", 0) + s.optInt("medLeaveCnt", 0))
                    .put("duty", s.optInt("onDutyCnt", 0))
                    .put("pct", s.optDouble("p", s.optDouble("prsPercnt", 0))));
        }
        return out;
    }

    private static JSONArray periods(JSONArray raw) throws JSONException {
        JSONArray out = new JSONArray();
        if (raw == null) return out;
        for (int i = 0; i < raw.length(); i++) {
            JSONObject p = raw.optJSONObject(i);
            if (p == null) continue;
            String start = p.optString("start", "");
            String end = p.optString("end", "");
            if (start.length() < 16) continue;
            out.put(new JSONObject()
                    .put("date", start.substring(0, 10))
                    .put("from", p.optString("FrTime", start.substring(11, 16)))
                    .put("to", p.optString("ToTime", end.length() >= 16 ? end.substring(11, 16) : ""))
                    .put("name", p.optString("SubNa", p.optString("title", "")))
                    .put("code", p.optString("SubCd", ""))
                    .put("subId", p.optString("SubID", ""))
                    .put("room", p.optString("Location", p.optString("LocNm", "")))
                    .put("teacher", p.optString("StaffNm", ""))
                    .put("kind", p.optString("subTyp", ""))
                    .put("status", p.optString("StF1", "")));
        }
        return out;
    }

    private static JSONArray holidays(JSONArray raw) throws JSONException {
        JSONArray out = new JSONArray();
        if (raw == null) return out;
        for (int i = 0; i < raw.length(); i++) {
            JSONObject h = raw.optJSONObject(i);
            if (h == null) continue;
            String start = h.optString("start", "");
            String end = h.optString("end", start);
            if (start.length() < 10) continue;
            out.put(new JSONObject()
                    .put("title", h.optString("title", "Holiday"))
                    .put("start", start.substring(0, 10))
                    .put("end", end.length() >= 10 ? end.substring(0, 10) : start.substring(0, 10)));
        }
        return out;
    }

    private static JSONArray classes(JSONArray raw) throws JSONException {
        JSONArray out = new JSONArray();
        for (int i = 0; i < raw.length(); i++) {
            JSONObject a = raw.optJSONObject(i);
            if (a == null) continue;
            String date = a.optString("ForDate", "");
            if (date.length() < 10) continue;
            out.put(new JSONObject()
                    .put("date", date.substring(0, 10))
                    .put("from", a.optString("FrTime", ""))
                    .put("to", a.optString("ToTime", ""))
                    .put("present", a.optBoolean("present", false))
                    .put("leave", a.optString("LvTy", a.optString("LeaveSt", ""))));
        }
        return out;
    }

    /** "Marked absent in DBMS", once per new absence Camu records. */
    private static void tellAbsences(Context c, JSONArray before, JSONArray now, JSONObject overall) {
        for (int i = 0; i < now.length(); i++) {
            JSONObject s = now.optJSONObject(i);
            if (s == null) continue;
            JSONObject old = find(before, s.optString("id"));
            if (old == null) continue;
            int more = s.optInt("absent") - old.optInt("absent");
            if (more <= 0) continue;
            String name = shortName(s.optString("name"));
            String title = more == 1 ? "Marked absent in " + name : more + " absences marked in " + name;
            String text = name + " is at " + Math.round(s.optDouble("pct")) + "% now, overall "
                    + Math.round(overall.optDouble("pct")) + "%.";
            post(c, 5000 + Math.abs(s.optString("id").hashCode() % 900), title, text, "/attendance");
        }
    }

    // -------------------------------------------------------------------------
    // LMS

    private static void syncLms(Context c, JSONObject lms) throws JSONException {
        try {
            JSONArray items = Lms.todo(c);
            SharedPreferences p = Camu.prefs(c);
            boolean first = !p.contains(K_SEEN);
            Set<String> seen = new HashSet<>(p.getStringSet(K_SEEN, new HashSet<String>()));
            Set<String> warned = new HashSet<>(p.getStringSet(K_WARNED, new HashSet<String>()));
            long nowS = System.currentTimeMillis() / 1000;
            for (int i = 0; i < items.length(); i++) {
                JSONObject it = items.getJSONObject(i);
                String key = it.optString("module") + ":" + it.optLong("instance");
                long due = it.optLong("due");
                String name = it.optString("name");
                String course = shortName(it.optString("course"));
                if (!seen.contains(key)) {
                    seen.add(key);
                    if (!first && due > nowS) {
                        post(c, 6000 + (int) (it.optLong("instance") % 900), "New on the LMS: " + name,
                                course + " · due " + when(due), "/tasks");
                    }
                }
                if (due > nowS && due - nowS <= 24 * 3600 && !warned.contains(key)) {
                    warned.add(key);
                    if (!first) {
                        post(c, 7000 + (int) (it.optLong("instance") % 900), "Due " + when(due) + ": " + name,
                                course + " · not submitted yet", "/tasks");
                    }
                }
            }
            p.edit().putStringSet(K_SEEN, seen).putStringSet(K_WARNED, warned).apply();
            lms.put("items", items);
            lms.put("syncedAt", System.currentTimeMillis());
            lms.remove("error");
        } catch (Lms.Refused e) {
            lms.put("error", e.getMessage());
        } catch (IOException | JSONException | RuntimeException e) {
            lms.put("error", "Could not reach the LMS just now. It will try again.");
        }
    }

    // -------------------------------------------------------------------------

    static void post(Context c, int id, String title, String text, String path) {
        NotificationManagerCompat nm = NotificationManagerCompat.from(c);
        if (!nm.areNotificationsEnabled()) return;
        ensureChannel(c);
        Intent open = new Intent(c, MainActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP)
                .putExtra(MainActivity.EXTRA_OPEN, path);
        PendingIntent tap = PendingIntent.getActivity(
                c, id, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        NotificationCompat.Builder b = new NotificationCompat.Builder(c, CHANNEL)
                .setSmallIcon(R.drawable.ic_stat_dockin)
                .setColor(0xFF1F5FD6)
                .setContentTitle(title)
                .setContentText(text)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(text))
                .setAutoCancel(true)
                .setContentIntent(tap)
                .setPriority(NotificationCompat.PRIORITY_DEFAULT);
        try {
            nm.notify(id, b.build());
        } catch (SecurityException ignored) {
            // Notifications switched off between the check and now.
        }
    }

    static void ensureChannel(Context c) {
        NotificationManagerCompat.from(c).createNotificationChannel(
                new NotificationChannelCompat.Builder(CHANNEL, NotificationManagerCompat.IMPORTANCE_DEFAULT)
                        .setName(c.getString(R.string.channel_college))
                        .setDescription(c.getString(R.string.channel_college_about))
                        .build());
    }

    private static String when(long epochSeconds) {
        return new SimpleDateFormat("EEE d MMM, h:mm a", Locale.ENGLISH).format(new Date(epochSeconds * 1000));
    }

    private static String day(int offset) {
        Calendar cal = Calendar.getInstance();
        cal.add(Calendar.DAY_OF_MONTH, offset);
        return new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(cal.getTime());
    }

    /** "Database Management Systems (CSET200)" reads as "Database Management Systems". */
    static String shortName(String s) {
        if (s == null) return "";
        int cut = s.indexOf(" (");
        String out = (cut > 0 ? s.substring(0, cut) : s).trim();
        return out.length() > 42 ? out.substring(0, 42).trim() + "…" : out;
    }

    /** True when no subject gained a class or an absence, so the history cannot have changed. */
    private static boolean sameCounts(JSONArray before, JSONArray now) {
        if (before.length() != now.length()) return false;
        for (int i = 0; i < now.length(); i++) {
            JSONObject s = now.optJSONObject(i);
            if (s == null) continue;
            JSONObject old = find(before, s.optString("id"));
            if (old == null || old.optInt("total") != s.optInt("total") || old.optInt("present") != s.optInt("present")) {
                return false;
            }
        }
        return true;
    }

    private static JSONObject find(JSONArray list, String id) {
        for (int i = 0; i < list.length(); i++) {
            JSONObject o = list.optJSONObject(i);
            if (o != null && id.equals(o.optString("id"))) return o;
        }
        return null;
    }

    private static JSONObject obj(JSONObject parent, String key) throws JSONException {
        JSONObject o = parent.optJSONObject(key);
        if (o == null) {
            o = new JSONObject();
            parent.put(key, o);
        }
        return o;
    }

    private static JSONObject load(Context c) {
        try {
            return new JSONObject(Camu.prefs(c).getString(K_STATE, "{}"));
        } catch (JSONException e) {
            return new JSONObject();
        }
    }

    private static void save(Context c, JSONObject st) {
        Camu.prefs(c).edit().putString(K_STATE, st.toString()).apply();
    }
}
