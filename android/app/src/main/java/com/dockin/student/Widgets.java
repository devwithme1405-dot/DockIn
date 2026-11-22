package com.dockin.student;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.util.Base64;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Calendar;
import java.util.Locale;

/**
 * Home-screen widgets. The web app hands over a small summary (attendance,
 * the coming classes, tasks, the mess menu and pass) whenever it changes; the
 * widgets draw from that, working out "next class" and "serving now" against
 * the clock themselves, so they stay right with DockIn closed.
 */
final class Widgets {

    private Widgets() {}

    private static final String PREFS = "dockin-widgets";

    /** Every kind of widget, so a new summary redraws them all. */
    static final Class<?>[] ALL = {
            AttendanceWidget.class, NextClassWidget.class, TodayWidget.class,
            TasksWidget.class, MessWidget.class, MessPassWidget.class
    };

    static void save(Context c, String json) {
        SharedPreferences p = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        if (json.equals(p.getString("data", null))) return;
        p.edit().putString("data", json).apply();
        refreshAll(c);
    }

    static JSONObject data(Context c) {
        try {
            String s = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("data", null);
            return s == null ? new JSONObject() : new JSONObject(s);
        } catch (Exception e) {
            return new JSONObject();
        }
    }

    static void refreshAll(Context c) {
        AppWidgetManager m = AppWidgetManager.getInstance(c);
        for (Class<?> k : ALL) {
            int[] ids = m.getAppWidgetIds(new ComponentName(c, k));
            if (ids == null || ids.length == 0) continue;
            Intent i = new Intent(c, k).setAction(AppWidgetManager.ACTION_APPWIDGET_UPDATE);
            i.putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids);
            c.sendBroadcast(i);
        }
    }

    /** Tapping a widget opens DockIn on its screen. */
    static PendingIntent open(Context c, String path, int code) {
        Intent i = new Intent(c, MainActivity.class)
                .setAction("com.dockin.student.WIDGET." + code)
                .putExtra(MainActivity.EXTRA_OPEN, path)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(c, code, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    // ---------------------------------------------------------------- time

    static String today() {
        Calendar k = Calendar.getInstance();
        return String.format(Locale.US, "%04d-%02d-%02d", k.get(Calendar.YEAR), k.get(Calendar.MONTH) + 1, k.get(Calendar.DAY_OF_MONTH));
    }

    static String tomorrow() {
        Calendar k = Calendar.getInstance();
        k.add(Calendar.DAY_OF_MONTH, 1);
        return String.format(Locale.US, "%04d-%02d-%02d", k.get(Calendar.YEAR), k.get(Calendar.MONTH) + 1, k.get(Calendar.DAY_OF_MONTH));
    }

    static String nowHm() {
        Calendar k = Calendar.getInstance();
        return String.format(Locale.US, "%02d:%02d", k.get(Calendar.HOUR_OF_DAY), k.get(Calendar.MINUTE));
    }

    /** "09:25" → "9:25 am". */
    static String clock(String hm) {
        if (hm == null || hm.length() < 4) return "";
        try {
            int h = Integer.parseInt(hm.substring(0, hm.indexOf(':')));
            String m = hm.substring(hm.indexOf(':') + 1, Math.min(hm.length(), hm.indexOf(':') + 3));
            String ap = h >= 12 ? "pm" : "am";
            int h12 = h % 12 == 0 ? 12 : h % 12;
            return h12 + ":" + m + " " + ap;
        } catch (RuntimeException e) {
            return hm;
        }
    }

    /** Days from a to b, both "YYYY-MM-DD". */
    static int daysBetween(String a, String b) {
        try {
            Calendar x = Calendar.getInstance();
            x.clear();
            x.set(Integer.parseInt(a.substring(0, 4)), Integer.parseInt(a.substring(5, 7)) - 1, Integer.parseInt(a.substring(8, 10)));
            Calendar y = Calendar.getInstance();
            y.clear();
            y.set(Integer.parseInt(b.substring(0, 4)), Integer.parseInt(b.substring(5, 7)) - 1, Integer.parseInt(b.substring(8, 10)));
            return (int) Math.round((y.getTimeInMillis() - x.getTimeInMillis()) / 86400000.0);
        } catch (RuntimeException e) {
            return 0;
        }
    }

    static final String[] MONTHS = {"Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"};

    /** "Today · 11:59 pm", "Tomorrow", "Overdue by 2 days", "Fri 27 Nov". */
    static String due(String date, String time) {
        if (date == null || date.isEmpty()) return "No deadline";
        int d = daysBetween(today(), date);
        String t = time == null || time.isEmpty() ? "" : " · " + clock(time);
        if (d < 0) return "Overdue by " + (-d) + (d == -1 ? " day" : " days");
        if (d == 0) return "Today" + t;
        if (d == 1) return "Tomorrow" + t;
        try {
            return Integer.parseInt(date.substring(8, 10)) + " " + MONTHS[Integer.parseInt(date.substring(5, 7)) - 1] + t;
        } catch (RuntimeException e) {
            return date;
        }
    }

    // ---------------------------------------------------------------- drawing helpers

    static void text(RemoteViews v, int id, String s) {
        v.setTextViewText(id, s == null ? "" : s);
        v.setViewVisibility(id, s == null || s.isEmpty() ? View.GONE : View.VISIBLE);
    }

    static int tone(Context c, String t) {
        if ("danger".equals(t)) return 0xFFD64545;
        if ("warn".equals(t)) return 0xFFD9952B;
        if ("safe".equals(t)) return 0xFF2F9E6B;
        return 0xFF8A6A52;
    }

    static Bitmap image(String dataUrl) {
        if (dataUrl == null) return null;
        int comma = dataUrl.indexOf(',');
        try {
            byte[] b = Base64.decode(comma >= 0 ? dataUrl.substring(comma + 1) : dataUrl, Base64.DEFAULT);
            return BitmapFactory.decodeByteArray(b, 0, b.length);
        } catch (RuntimeException e) {
            return null;
        }
    }

    /** The classes from now on (today's not yet over, then the next days'). */
    static JSONArray upcoming(JSONObject d) {
        JSONArray all = d.optJSONArray("classes");
        JSONArray out = new JSONArray();
        if (all == null) return out;
        String today = today();
        String now = nowHm();
        for (int i = 0; i < all.length(); i++) {
            JSONObject k = all.optJSONObject(i);
            if (k == null) continue;
            String date = k.optString("date");
            if (date.compareTo(today) < 0) continue;
            if (date.equals(today) && k.optString("to").compareTo(now) <= 0) continue;
            out.put(k);
        }
        return out;
    }

    /** Base: each widget draws itself from the summary. */
    abstract static class Base extends AppWidgetProvider {
        abstract RemoteViews draw(Context c, JSONObject d);

        @Override
        public void onUpdate(Context c, AppWidgetManager m, int[] ids) {
            JSONObject d = data(c);
            for (int id : ids) {
                try {
                    m.updateAppWidget(id, draw(c, d));
                } catch (RuntimeException ignored) {
                    // A widget that can't draw keeps its last picture.
                }
            }
        }
    }
}
