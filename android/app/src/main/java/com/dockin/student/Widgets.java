package com.dockin.student;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.res.Configuration;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.BitmapShader;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.RectF;
import android.graphics.Shader;
import android.graphics.Typeface;
import android.os.Bundle;
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
            TasksWidget.class, MessWidget.class, MessPassWidget.class, FriendsWidget.class
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

    /**
     * "in 20 min", "On now", "Serving now" move with the clock: redraw every ten
     * minutes in the day (hourly at night). Not exact, so it costs no battery to
     * speak of; Android batches it with other work.
     */
    static void scheduleTick(Context c) {
        try {
            android.app.AlarmManager am = (android.app.AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
            if (am == null) return;
            Calendar k = Calendar.getInstance();
            int h = k.get(Calendar.HOUR_OF_DAY);
            long gap = (h >= 23 || h < 7) ? 60 * 60_000L : 10 * 60_000L;
            Intent i = new Intent(c, WidgetTick.class).setAction("com.dockin.student.WIDGET_TICK");
            PendingIntent pi = PendingIntent.getBroadcast(c, 4242, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            am.set(android.app.AlarmManager.RTC, System.currentTimeMillis() + gap, pi);
        } catch (RuntimeException ignored) {
            // The 30-minute system refresh still runs.
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

    static final int SAFE = 0xFF2F9E6B, WARN = 0xFFD9952B, DANGER = 0xFFD64545, ACCENT = 0xFFC0662A, NEUTRAL = 0xFF8A6A52;

    static void text(RemoteViews v, int id, String s) {
        v.setTextViewText(id, s == null ? "" : s);
        v.setViewVisibility(id, s == null || s.isEmpty() ? View.GONE : View.VISIBLE);
    }

    static int tone(Context c, String t) {
        if ("danger".equals(t)) return DANGER;
        if ("warn".equals(t)) return WARN;
        if ("safe".equals(t)) return SAFE;
        return NEUTRAL;
    }

    /** A pill on the leather plate: "Safe", "in 20 min", "3 unread". Null hides it. */
    static void chip(RemoteViews v, int id, String label, String tone) {
        if (label == null || label.isEmpty()) {
            v.setViewVisibility(id, View.GONE);
            return;
        }
        int bg = R.drawable.chip_neutral;
        if ("safe".equals(tone)) bg = R.drawable.chip_safe;
        else if ("warn".equals(tone)) bg = R.drawable.chip_warn;
        else if ("danger".equals(tone)) bg = R.drawable.chip_danger;
        else if ("accent".equals(tone)) bg = R.drawable.chip_accent;
        else if ("info".equals(tone)) bg = R.drawable.chip_info;
        v.setInt(id, "setBackgroundResource", bg);
        v.setTextColor(id, bg == R.drawable.chip_neutral ? 0xFFFFF1DD : 0xFFFFFFFF);
        v.setTextViewText(id, label);
        v.setViewVisibility(id, View.VISIBLE);
    }

    /** The small line under the title on the leather plate. */
    static void sub(RemoteViews v, String s) {
        text(v, R.id.w_hsub, s);
    }

    static final String[] DAYS = {"Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"};

    /** "Mon 23 Nov". */
    static String todayLabel() {
        Calendar k = Calendar.getInstance();
        return DAYS[k.get(Calendar.DAY_OF_WEEK) - 1] + " " + k.get(Calendar.DAY_OF_MONTH) + " " + MONTHS[k.get(Calendar.MONTH)];
    }

    static boolean dark(Context c) {
        return (c.getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
    }

    static float density(Context c) {
        return c.getResources().getDisplayMetrics().density;
    }

    /** How tall the widget is on the home screen right now (dp), to show more when there's room. */
    static int heightDp(AppWidgetManager m, int id) {
        try {
            Bundle o = m.getAppWidgetOptions(id);
            int h = o == null ? 0 : o.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 0);
            return h > 0 ? h : 180;
        } catch (RuntimeException e) {
            return 180;
        }
    }

    /**
     * The attendance ring: the track, the coloured arc, a tick at the target,
     * the percentage in the middle and "of N" under it.
     */
    static Bitmap ring(Context c, double pct, int target, int color, String under) {
        float d = density(c);
        int size = Math.round(78 * d * 2) / 2 * 2;
        Bitmap b = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
        Canvas k = new Canvas(b);
        boolean night = dark(c);
        float stroke = 8 * d;
        RectF box = new RectF(stroke / 2 + d, stroke / 2 + d, size - stroke / 2 - d, size - stroke / 2 - d);
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        p.setStyle(Paint.Style.STROKE);
        p.setStrokeWidth(stroke);
        p.setStrokeCap(Paint.Cap.ROUND);
        p.setColor(night ? 0xFF4D3626 : 0xFFEADAC2);
        k.drawArc(box, 0, 360, false, p);
        float sweep = (float) Math.max(0, Math.min(100, pct)) * 3.6f;
        p.setColor(color);
        if (sweep > 0) k.drawArc(box, -90, sweep, false, p);
        // The target, as a small notch on the ring.
        double a = Math.toRadians(-90 + target * 3.6);
        float cx = size / 2f, cy = size / 2f, r = box.width() / 2f;
        Paint t = new Paint(Paint.ANTI_ALIAS_FLAG);
        t.setStrokeWidth(2.2f * d);
        t.setStrokeCap(Paint.Cap.ROUND);
        t.setColor(night ? 0xFFF6E7D2 : 0xFF3B2416);
        k.drawLine((float) (cx + (r - stroke * 0.75) * Math.cos(a)), (float) (cy + (r - stroke * 0.75) * Math.sin(a)),
                (float) (cx + (r + stroke * 0.75) * Math.cos(a)), (float) (cy + (r + stroke * 0.75) * Math.sin(a)), t);
        Paint txt = new Paint(Paint.ANTI_ALIAS_FLAG);
        txt.setTextAlign(Paint.Align.CENTER);
        txt.setTypeface(Typeface.create(Typeface.DEFAULT, Typeface.BOLD));
        txt.setColor(night ? 0xFFF6E7D2 : 0xFF3B2416);
        txt.setTextSize(21 * d);
        k.drawText(Math.round(pct) + "%", cx, cy + 4 * d, txt);
        if (under != null) {
            txt.setTypeface(Typeface.DEFAULT);
            txt.setTextSize(9.5f * d);
            txt.setColor(night ? 0xFFBFA48C : 0xFF8A6A52);
            k.drawText(under, cx, cy + 17 * d, txt);
        }
        return b;
    }

    static final int[] AVATAR_COLORS = {0xFFC0662A, 0xFF2F9E6B, 0xFF3D7BD9, 0xFF9B4DCA, 0xFFD64545, 0xFFD9952B, 0xFF00897B};

    /** A round avatar: their photo when there is one, else their initials on a colour of their own. */
    static Bitmap avatar(Context c, String name, String photo) {
        float d = density(c);
        int size = Math.round(36 * d);
        Bitmap out = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
        Canvas k = new Canvas(out);
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        Bitmap pic = image(photo);
        if (pic != null) {
            float scale = Math.max(size / (float) pic.getWidth(), size / (float) pic.getHeight());
            Bitmap scaled = Bitmap.createScaledBitmap(pic, Math.max(1, Math.round(pic.getWidth() * scale)), Math.max(1, Math.round(pic.getHeight() * scale)), true);
            BitmapShader sh = new BitmapShader(scaled, Shader.TileMode.CLAMP, Shader.TileMode.CLAMP);
            android.graphics.Matrix m = new android.graphics.Matrix();
            m.setTranslate((size - scaled.getWidth()) / 2f, (size - scaled.getHeight()) / 2f);
            sh.setLocalMatrix(m);
            p.setShader(sh);
            k.drawCircle(size / 2f, size / 2f, size / 2f, p);
            return out;
        }
        String n = name == null ? "?" : name.trim();
        p.setColor(AVATAR_COLORS[Math.abs(n.hashCode()) % AVATAR_COLORS.length]);
        k.drawCircle(size / 2f, size / 2f, size / 2f, p);
        String[] parts = n.split("\\s+");
        String ini = parts.length == 0 || parts[0].isEmpty() ? "?" : parts[0].substring(0, 1).toUpperCase(Locale.ROOT)
                + (parts.length > 1 && !parts[1].isEmpty() ? parts[1].substring(0, 1).toUpperCase(Locale.ROOT) : "");
        Paint t = new Paint(Paint.ANTI_ALIAS_FLAG);
        t.setColor(0xFFFFFFFF);
        t.setTextAlign(Paint.Align.CENTER);
        t.setTypeface(Typeface.create(Typeface.DEFAULT, Typeface.BOLD));
        t.setTextSize(14 * d);
        Paint.FontMetrics fm = t.getFontMetrics();
        k.drawText(ini, size / 2f, size / 2f - (fm.ascent + fm.descent) / 2f, t);
        return out;
    }

    static Bitmap image(String dataUrl) {
        if (dataUrl == null || dataUrl.isEmpty()) return null;
        int comma = dataUrl.indexOf(',');
        try {
            byte[] b = Base64.decode(comma >= 0 ? dataUrl.substring(comma + 1) : dataUrl, Base64.DEFAULT);
            return BitmapFactory.decodeByteArray(b, 0, b.length);
        } catch (RuntimeException e) {
            return null;
        }
    }

    /** "2:05 pm" today, "Yesterday", or "23 Nov". */
    static String ago(long at) {
        if (at <= 0) return "";
        Calendar k = Calendar.getInstance();
        k.setTimeInMillis(at);
        String day = String.format(Locale.US, "%04d-%02d-%02d", k.get(Calendar.YEAR), k.get(Calendar.MONTH) + 1, k.get(Calendar.DAY_OF_MONTH));
        int diff = daysBetween(day, today());
        if (diff == 0) return clock(String.format(Locale.US, "%02d:%02d", k.get(Calendar.HOUR_OF_DAY), k.get(Calendar.MINUTE)));
        if (diff == 1) return "Yesterday";
        return k.get(Calendar.DAY_OF_MONTH) + " " + MONTHS[k.get(Calendar.MONTH)];
    }

    static int minutes(String hm) {
        try {
            return Integer.parseInt(hm.substring(0, 2)) * 60 + Integer.parseInt(hm.substring(3, 5));
        } catch (RuntimeException e) {
            return 0;
        }
    }

    /** "45 min", "1h 20m". */
    static String span(int mins) {
        if (mins < 60) return mins + " min";
        return (mins / 60) + "h" + (mins % 60 == 0 ? "" : " " + (mins % 60) + "m");
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

    /** Base: each widget draws itself from the summary, at its current size. */
    abstract static class Base extends AppWidgetProvider {
        abstract RemoteViews draw(Context c, JSONObject d, int heightDp);

        @Override
        public void onUpdate(Context c, AppWidgetManager m, int[] ids) {
            JSONObject d = data(c);
            for (int id : ids) redraw(c, m, id, d);
            scheduleTick(c);
        }

        /** Resized on the home screen: show more (or less). */
        @Override
        public void onAppWidgetOptionsChanged(Context c, AppWidgetManager m, int id, Bundle options) {
            redraw(c, m, id, data(c));
        }

        private void redraw(Context c, AppWidgetManager m, int id, JSONObject d) {
            try {
                m.updateAppWidget(id, draw(c, d, heightDp(m, id)));
            } catch (RuntimeException ignored) {
                // A widget that can't draw keeps its last picture.
            }
        }
    }
}
