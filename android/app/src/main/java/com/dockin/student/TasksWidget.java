package com.dockin.student;

import android.content.Context;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

/** What's due next — overdue first — each with a coloured urgency bar. */
public class TasksWidget extends Widgets.Base {
    static final int[] ROWS = {R.id.w_r1, R.id.w_r2, R.id.w_r3, R.id.w_r4, R.id.w_r5};
    static final int[] BARS = {R.id.w_k1, R.id.w_k2, R.id.w_k3, R.id.w_k4, R.id.w_k5};
    static final int[] KINDS = {R.id.w_e1, R.id.w_e2, R.id.w_e3, R.id.w_e4, R.id.w_e5};
    static final int[] TITLES = {R.id.w_a1, R.id.w_a2, R.id.w_a3, R.id.w_a4, R.id.w_a5};
    static final int[] DUES = {R.id.w_b1, R.id.w_b2, R.id.w_b3, R.id.w_b4, R.id.w_b5};

    static String emoji(String kind) {
        if ("exam".equals(kind)) return "📖";
        if ("quiz".equals(kind)) return "🧪";
        if ("project".equals(kind)) return "🚀";
        if ("personal".equals(kind)) return "📝";
        return "📚";
    }

    @Override
    RemoteViews draw(Context c, JSONObject d, int heightDp) {
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_tasks);
        v.setOnClickPendingIntent(R.id.w_root, Widgets.open(c, "/tasks", 104));
        JSONObject t = d.optJSONObject("tasks");
        JSONArray list = t == null ? null : t.optJSONArray("list");
        int fit = Math.max(2, Math.min(ROWS.length, (heightDp - 60) / 31));
        int n = 0, overdue = 0;
        if (list != null) {
            for (int i = 0; i < list.length(); i++) {
                JSONObject k = list.optJSONObject(i);
                if (k == null) continue;
                String due = Widgets.due(k.optString("date", null), k.optString("time", null));
                boolean late = due.startsWith("Overdue");
                boolean soon = due.startsWith("Today") || due.startsWith("Tomorrow");
                if (late) overdue++;
                if (n >= fit) continue;
                v.setViewVisibility(ROWS[n], View.VISIBLE);
                v.setImageViewResource(BARS[n], late ? R.drawable.bar_danger : soon ? R.drawable.bar_warn : R.drawable.bar_safe);
                v.setTextViewText(KINDS[n], emoji(k.optString("kind")));
                v.setTextViewText(TITLES[n], k.optString("title"));
                v.setTextViewText(DUES[n], late ? due.replace("Overdue by ", "") + " late" : due);
                v.setTextColor(DUES[n], late ? Widgets.DANGER : soon ? Widgets.WARN : Widgets.NEUTRAL);
                n++;
            }
        }
        for (int i = n; i < ROWS.length; i++) v.setViewVisibility(ROWS[i], View.GONE);
        int pending = t == null ? 0 : t.optInt("pending");
        Widgets.chip(v, R.id.w_chip, pending > 0 ? pending + " pending" : null, "accent");
        Widgets.chip(v, R.id.w_chip2, overdue > 0 ? overdue + " overdue" : null, "danger");
        Widgets.text(v, R.id.w_empty, n == 0 ? "All clear — nothing pending ✨" : null);
        return v;
    }
}
