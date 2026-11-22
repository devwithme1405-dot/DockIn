package com.dockin.student;

import android.content.Context;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

/** Today's classes, the ones already over greyed out. */
public class TodayWidget extends Widgets.Base {
    static final int[] ROWS = {R.id.w_r1, R.id.w_r2, R.id.w_r3, R.id.w_r4, R.id.w_r5, R.id.w_r6};
    static final int[] NAMES = {R.id.w_a1, R.id.w_a2, R.id.w_a3, R.id.w_a4, R.id.w_a5, R.id.w_a6};
    static final int[] TIMES = {R.id.w_b1, R.id.w_b2, R.id.w_b3, R.id.w_b4, R.id.w_b5, R.id.w_b6};

    @Override
    RemoteViews draw(Context c, JSONObject d) {
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_today);
        v.setOnClickPendingIntent(R.id.w_root, Widgets.open(c, "/timetable", 103));
        JSONArray all = d.optJSONArray("classes");
        String today = Widgets.today();
        String now = Widgets.nowHm();
        int n = 0;
        int total = 0;
        if (all != null) {
            for (int i = 0; i < all.length(); i++) {
                JSONObject k = all.optJSONObject(i);
                if (k == null || !today.equals(k.optString("date"))) continue;
                total++;
                if (n >= ROWS.length) continue;
                boolean over = k.optString("to").compareTo(now) <= 0;
                v.setViewVisibility(ROWS[n], View.VISIBLE);
                v.setTextViewText(NAMES[n], k.optString("name", "Class"));
                v.setTextViewText(TIMES[n], Widgets.clock(k.optString("from")));
                // Already over: greyed out.
                v.setTextColor(NAMES[n], over ? 0xFF9C8573 : c.getResources().getColor(R.color.widget_ink, null));
                v.setTextColor(TIMES[n], over ? 0xFF9C8573 : c.getResources().getColor(R.color.widget_muted, null));
                n++;
            }
        }
        for (int i = n; i < ROWS.length; i++) v.setViewVisibility(ROWS[i], View.GONE);
        if (total > 0) {
            v.setTextViewText(R.id.w_badge, String.valueOf(total));
            v.setViewVisibility(R.id.w_badge, View.VISIBLE);
        } else {
            v.setViewVisibility(R.id.w_badge, View.GONE);
        }
        Widgets.text(v, R.id.w_empty, total == 0 ? "No classes today 🎉" : null);
        return v;
    }
}
