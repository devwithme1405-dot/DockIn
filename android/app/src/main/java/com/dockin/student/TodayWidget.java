package com.dockin.student;

import android.content.Context;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;


/** Today's classes as a timeline: done ones faded, the one on now highlighted. */
public class TodayWidget extends Widgets.Base {
    static final int[] ROWS = {R.id.w_r1, R.id.w_r2, R.id.w_r3, R.id.w_r4, R.id.w_r5, R.id.w_r6};
    static final int[] TIMES = {R.id.w_t1, R.id.w_t2, R.id.w_t3, R.id.w_t4, R.id.w_t5, R.id.w_t6};
    static final int[] DOTS = {R.id.w_d1, R.id.w_d2, R.id.w_d3, R.id.w_d4, R.id.w_d5, R.id.w_d6};
    static final int[] NAMES = {R.id.w_a1, R.id.w_a2, R.id.w_a3, R.id.w_a4, R.id.w_a5, R.id.w_a6};
    static final int[] ROOMS = {R.id.w_b1, R.id.w_b2, R.id.w_b3, R.id.w_b4, R.id.w_b5, R.id.w_b6};

    @Override
    RemoteViews draw(Context c, JSONObject d, int heightDp) {
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_today);
        v.setOnClickPendingIntent(R.id.w_root, Widgets.open(c, "/timetable", 103));
        JSONArray all = d.optJSONArray("classes");
        String today = Widgets.today();
        String now = Widgets.nowHm();
        int ink = c.getResources().getColor(R.color.widget_ink, null);
        int muted = c.getResources().getColor(R.color.widget_muted, null);
        // As many rows as fit.
        int fit = Math.max(2, Math.min(ROWS.length, (heightDp - 62) / 30));
        int n = 0, total = 0, left = 0;
        if (all != null) {
            for (int i = 0; i < all.length(); i++) {
                JSONObject k = all.optJSONObject(i);
                if (k == null || !today.equals(k.optString("date"))) continue;
                total++;
                boolean over = k.optString("to").compareTo(now) <= 0;
                boolean on = !over && k.optString("from").compareTo(now) <= 0;
                if (!over) left++;
                if (n >= fit) continue;
                v.setViewVisibility(ROWS[n], View.VISIBLE);
                v.setTextViewText(TIMES[n], Widgets.clock(k.optString("from")));
                v.setTextViewText(NAMES[n], k.optString("name", "Class"));
                Widgets.text(v, ROOMS[n], k.optString("room"));
                v.setImageViewResource(DOTS[n], over ? R.drawable.dot_past : on ? R.drawable.dot_accent : R.drawable.dot_info);
                v.setTextColor(NAMES[n], over ? muted : ink);
                v.setTextColor(TIMES[n], on ? Widgets.ACCENT : muted);
                v.setInt(ROWS[n], "setBackgroundResource", on ? R.drawable.widget_row_now : 0);
                n++;
            }
        }
        for (int i = n; i < ROWS.length; i++) v.setViewVisibility(ROWS[i], View.GONE);
        Widgets.sub(v, Widgets.todayLabel());
        if (total == 0) {
            Widgets.chip(v, R.id.w_chip, null, null);
            Widgets.text(v, R.id.w_empty, "No classes today 🎉  Enjoy!");
        } else {
            Widgets.chip(v, R.id.w_chip, left == 0 ? "All done ✓" : left + " of " + total + " left", left == 0 ? "safe" : "accent");
            Widgets.text(v, R.id.w_empty, null);
        }
        return v;
    }
}
