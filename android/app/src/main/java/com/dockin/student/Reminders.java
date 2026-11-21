package com.dockin.student;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.HashSet;
import java.util.Set;

/**
 * Scheduled reminders — a class about to start, the next class after one ends,
 * a task due, attendance slipping.
 *
 * The app (where the timetable, the tasks and the numbers live) works out what
 * to say and when; this only sets the alarms. They are EXACT and allowed while
 * the phone is idle, so "class in 10 minutes" arrives on the minute even when
 * the phone has been asleep in a pocket (Doze would hold an inexact alarm back
 * for a long time). If Android ever withholds exact alarms, they fall back to
 * "allow while idle" ones, which still fire during Doze, a little less sharp.
 *
 * The set is replaced each time: the app hands over the whole upcoming list,
 * the old alarms are cancelled and the new ones set. The list is also kept, so
 * a restart or an app update puts the alarms straight back (Android clears
 * every alarm when the phone reboots).
 */
final class Reminders {

    private static final String PREFS = "dockin-reminders";
    private static final String KEY_IDS = "ids";
    private static final String KEY_ITEMS = "items";

    private Reminders() {}

    static void schedule(Context c, JSONArray items) {
        SharedPreferences p = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        p.edit().putString(KEY_ITEMS, items.toString()).apply();
        set(c, items);
    }

    /** After a reboot or an update: the last list handed over, minus what has passed. */
    static void restore(Context c) {
        String saved = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_ITEMS, null);
        if (saved == null) return;
        try {
            set(c, new JSONArray(saved));
        } catch (Exception ignored) {
        }
    }

    private static void set(Context c, JSONArray items) {
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

        boolean exact = Build.VERSION.SDK_INT < 31 || canExact(am);
        Set<String> live = new HashSet<String>();
        long now = System.currentTimeMillis();
        for (int i = 0; i < items.length(); i++) {
            JSONObject o = items.optJSONObject(i);
            if (o == null) continue;
            int id = o.optInt("id");
            long at = o.optLong("at");
            // Nothing in the past, and not so soon it fires before the app closes.
            if (at <= now + 20_000L) continue;
            PendingIntent pi = pending(c, id, o.optString("title"), o.optString("body"), o.optString("path", "/"));
            try {
                if (exact) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
                else am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
                live.add(String.valueOf(id));
            } catch (SecurityException e) {
                // Exact alarms were taken away between the check and now.
                try {
                    am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
                    live.add(String.valueOf(id));
                } catch (RuntimeException ignored) {
                }
            } catch (RuntimeException ignored) {
            }
        }
        p.edit().putStringSet(KEY_IDS, live).apply();
    }

    private static boolean canExact(AlarmManager am) {
        try {
            return am.canScheduleExactAlarms();
        } catch (RuntimeException e) {
            return false;
        }
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
