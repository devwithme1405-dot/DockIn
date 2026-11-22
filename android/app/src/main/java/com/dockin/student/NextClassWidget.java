package com.dockin.student;

import android.content.Context;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

/** The next class (or the one on now), with the one after it. */
public class NextClassWidget extends Widgets.Base {
    @Override
    RemoteViews draw(Context c, JSONObject d) {
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_next_class);
        v.setOnClickPendingIntent(R.id.w_root, Widgets.open(c, "/timetable", 102));
        JSONArray next = Widgets.upcoming(d);
        if (next.length() == 0) {
            v.setTextViewText(R.id.w_name, "No classes coming up");
            Widgets.text(v, R.id.w_when, "Enjoy the free time");
            Widgets.text(v, R.id.w_room, null);
            Widgets.text(v, R.id.w_then, null);
            v.setViewVisibility(R.id.w_badge, View.GONE);
            return v;
        }
        JSONObject k = next.optJSONObject(0);
        String today = Widgets.today();
        String now = Widgets.nowHm();
        boolean on = today.equals(k.optString("date")) && k.optString("from").compareTo(now) <= 0;
        v.setTextViewText(R.id.w_label, on ? "On now" : "Next class");
        v.setTextViewText(R.id.w_name, k.optString("name", "Class"));
        String day = today.equals(k.optString("date")) ? "" : Widgets.tomorrow().equals(k.optString("date")) ? "Tomorrow · " : Widgets.due(k.optString("date"), null) + " · ";
        Widgets.text(v, R.id.w_when, day + Widgets.clock(k.optString("from")) + " – " + Widgets.clock(k.optString("to")));
        Widgets.text(v, R.id.w_room, k.optString("room"));
        if (!on && today.equals(k.optString("date"))) {
            int mins = minutes(k.optString("from")) - minutes(now);
            v.setTextViewText(R.id.w_badge, mins < 60 ? "in " + mins + " min" : "in " + (mins / 60) + "h " + (mins % 60) + "m");
            v.setViewVisibility(R.id.w_badge, View.VISIBLE);
        } else {
            v.setViewVisibility(R.id.w_badge, View.GONE);
        }
        JSONObject then = next.optJSONObject(1);
        Widgets.text(v, R.id.w_then, then != null && then.optString("date").equals(k.optString("date"))
                ? "Then " + then.optString("name") + " at " + Widgets.clock(then.optString("from")) : null);
        return v;
    }

    private static int minutes(String hm) {
        try {
            return Integer.parseInt(hm.substring(0, 2)) * 60 + Integer.parseInt(hm.substring(3, 5));
        } catch (RuntimeException e) {
            return 0;
        }
    }
}
