package com.dockin.student;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.HashSet;
import java.util.Set;

/**
 * Scheduled reminders — a class about to start, a task due, attendance slipping.
 *
 * The app (where the timetable, the tasks and the numbers live) works out what
 * to say and when; this only sets the alarms. They are inexact (a two-minute
 * window) so no exact-alarm permission is needed, which is plenty for "your
 * class starts soon". The set is replaced each time: the app hands over the
 * whole upcoming list, the old alarms are cancelled and the new ones set.
 */
final class Reminders {

    private static final String PREFS = "dockin-reminders";
    private static final String KEY_IDS = "ids";

    private Reminders() {}

    static void schedule(Context c, JSONArray items) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        SharedPreferences p = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);

        // Cancel everything set last time.
        for (String s : p.getStringSet(KEY_IDS, new HashSet<String>())) {
            try {
                am.cancel(pending(c, Integer.parseInt(s), null, null, null));
            } catch (RuntimeException ignored) {
            }
        }

        Set<String> live = new HashSet<String>();
        long now = System.currentTimeMillis();
        for (int i = 0; i < items.length(); i++) {
            JSONObject o = items.optJSONObject(i);
            if (o == null) continue;
            int id = o.optInt("id");
            long at = o.optLong("at");
            // Nothing in the past, and not so soon it fires before the app closes.
            if (at <= now + 20_000L) continue;
            try {
                am.setWindow(
                        AlarmManager.RTC_WAKEUP,
                        at,
                        120_000L,
                        pending(c, id, o.optString("title"), o.optString("body"), o.optString("path", "/")));
                live.add(String.valueOf(id));
            } catch (RuntimeException ignored) {
            }
        }
        p.edit().putStringSet(KEY_IDS, live).apply();
    }

    private static PendingIntent pending(Context c, int id, String title, String body, String path) {
        Intent i = new Intent(c, ReminderReceiver.class)
                .setAction("com.dockin.student.REMIND." + id)
                .putExtra("id", id);
        if (title != null) {
            i.putExtra("title", title).putExtra("body", body).putExtra("path", path);
        }
        return PendingIntent.getBroadcast(
                c, id, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
}
