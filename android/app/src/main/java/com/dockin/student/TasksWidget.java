package com.dockin.student;

import android.content.Context;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

/** What's due next — overdue first — and how many are pending. */
public class TasksWidget extends Widgets.Base {
    static final int[] ROWS = {R.id.w_r1, R.id.w_r2, R.id.w_r3, R.id.w_r4, R.id.w_r5};
    static final int[] TITLES = {R.id.w_a1, R.id.w_a2, R.id.w_a3, R.id.w_a4, R.id.w_a5};
    static final int[] DUES = {R.id.w_b1, R.id.w_b2, R.id.w_b3, R.id.w_b4, R.id.w_b5};

    @Override
    RemoteViews draw(Context c, JSONObject d) {
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_tasks);
        v.setOnClickPendingIntent(R.id.w_root, Widgets.open(c, "/tasks", 104));
        JSONObject t = d.optJSONObject("tasks");
        JSONArray list = t == null ? null : t.optJSONArray("list");
        int n = 0;
        if (list != null) {
            for (int i = 0; i < list.length() && n < ROWS.length; i++) {
                JSONObject k = list.optJSONObject(i);
                if (k == null) continue;
                String due = Widgets.due(k.optString("date", null), k.optString("time", null));
                v.setViewVisibility(ROWS[n], View.VISIBLE);
                v.setTextViewText(TITLES[n], k.optString("title"));
                v.setTextViewText(DUES[n], due);
                v.setTextColor(DUES[n], due.startsWith("Overdue") ? 0xFFD64545 : due.startsWith("Today") ? 0xFFD9952B : 0xFF8A6A52);
                n++;
            }
        }
        for (int i = n; i < ROWS.length; i++) v.setViewVisibility(ROWS[i], View.GONE);
        int pending = t == null ? 0 : t.optInt("pending");
        if (pending > 0) {
            v.setTextViewText(R.id.w_badge, pending + " pending");
            v.setViewVisibility(R.id.w_badge, View.VISIBLE);
        } else {
            v.setViewVisibility(R.id.w_badge, View.GONE);
        }
        Widgets.text(v, R.id.w_empty, n == 0 ? "All clear — nothing pending ✓" : null);
        return v;
    }
}
