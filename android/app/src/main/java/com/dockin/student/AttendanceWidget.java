package com.dockin.student;

import android.content.Context;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Attendance: a ring with the overall %, a notch at the target, what you can
 * miss (or must attend), and — when the widget is tall enough — the subjects
 * closest to the line, each with its own bar.
 */
public class AttendanceWidget extends Widgets.Base {
    static final int[] ROWS = {R.id.w_s1, R.id.w_s2, R.id.w_s3};
    static final int[] CODES = {R.id.w_sc1, R.id.w_sc2, R.id.w_sc3};
    static final int[] PCTS = {R.id.w_sp1, R.id.w_sp2, R.id.w_sp3};
    static final int[][] BARS = {
            {R.id.w_sb1_safe, R.id.w_sb1_warn, R.id.w_sb1_danger},
            {R.id.w_sb2_safe, R.id.w_sb2_warn, R.id.w_sb2_danger},
            {R.id.w_sb3_safe, R.id.w_sb3_warn, R.id.w_sb3_danger},
    };

    @Override
    RemoteViews draw(Context c, JSONObject d, int heightDp) {
        RemoteViews v = new RemoteViews(c.getPackageName(), Widgets.layout(c, d, R.layout.widget_attendance, R.layout.widget_attendance_dark));
        v.setOnClickPendingIntent(R.id.w_root, Widgets.open(c, "/attendance", 101));
        JSONObject a = d.optJSONObject("att");
        if (a == null || a.isNull("pct")) {
            v.setImageViewBitmap(R.id.w_ring, Widgets.ring(c, Widgets.dark(c, d), 0, 75, Widgets.NEUTRAL, null));
            v.setTextViewText(R.id.w_big, "No classes yet");
            Widgets.text(v, R.id.w_sub, "Open DockIn to set up attendance");
            Widgets.chip(v, R.id.w_chip, null, null);
            Widgets.sub(v, null);
            v.setViewVisibility(R.id.w_subjects, View.GONE);
            return v;
        }
        String tone = a.optString("tone");
        int target = a.optInt("target", 75);
        v.setImageViewBitmap(R.id.w_ring, Widgets.ring(c, Widgets.dark(c, d), a.optDouble("pct"), target, Widgets.tone(c, tone),
                a.optInt("present") + "/" + a.optInt("total")));
        Widgets.chip(v, R.id.w_chip, "danger".equals(tone) ? "Below " + target + "%" : "warn".equals(tone) ? "Close call" : "Safe", tone);
        v.setTextViewText(R.id.w_big, a.optString("line"));
        Widgets.sub(v, "Target " + target + "%");
        Widgets.text(v, R.id.w_sub, a.optInt("present") + " of " + a.optInt("total") + " classes attended");

        // The subjects nearest the line, when there's room.
        JSONArray subs = a.optJSONArray("subjects");
        int rows = heightDp >= 200 ? 3 : heightDp >= 165 ? 2 : heightDp >= 140 ? 1 : 0;
        int n = 0;
        if (subs != null) {
            for (int i = 0; i < subs.length() && n < rows; i++) {
                JSONObject s = subs.optJSONObject(i);
                if (s == null) continue;
                String t = s.optString("tone");
                int ti = "danger".equals(t) ? 2 : "warn".equals(t) ? 1 : 0;
                v.setViewVisibility(ROWS[n], View.VISIBLE);
                v.setTextViewText(CODES[n], s.optString("name"));
                v.setTextViewText(PCTS[n], Math.round(s.optDouble("pct")) + "%");
                v.setTextColor(PCTS[n], Widgets.tone(c, t));
                for (int k = 0; k < 3; k++) v.setViewVisibility(BARS[n][k], k == ti ? View.VISIBLE : View.GONE);
                v.setProgressBar(BARS[n][ti], 100, (int) Math.round(Math.max(0, Math.min(100, s.optDouble("pct")))), false);
                n++;
            }
        }
        for (int i = n; i < ROWS.length; i++) v.setViewVisibility(ROWS[i], View.GONE);
        v.setViewVisibility(R.id.w_subjects, n > 0 ? View.VISIBLE : View.GONE);
        return v;
    }
}
