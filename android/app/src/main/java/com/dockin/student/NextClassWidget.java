package com.dockin.student;

import android.content.Context;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

/** The class on now (with how far through it is) or the next one, and the one after. */
public class NextClassWidget extends Widgets.Base {
    @Override
    RemoteViews draw(Context c, JSONObject d, int heightDp) {
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_next_class);
        v.setOnClickPendingIntent(R.id.w_root, Widgets.open(c, "/timetable", 102));
        JSONArray next = Widgets.upcoming(d);
        if (next.length() == 0) {
            v.setTextViewText(R.id.w_label, "Next class");
            v.setTextViewText(R.id.w_name, "No classes coming up 🎉");
            Widgets.text(v, R.id.w_when, "Enjoy the free time");
            Widgets.text(v, R.id.w_room, null);
            Widgets.chip(v, R.id.w_chip, null, null);
            v.setViewVisibility(R.id.w_prog, View.GONE);
            v.setViewVisibility(R.id.w_thenbox, View.GONE);
            return v;
        }
        JSONObject k = next.optJSONObject(0);
        String today = Widgets.today();
        String now = Widgets.nowHm();
        String date = k.optString("date");
        boolean isToday = today.equals(date);
        boolean on = isToday && k.optString("from").compareTo(now) <= 0;
        v.setTextViewText(R.id.w_label, on ? "On now" : "Next class");
        v.setTextViewText(R.id.w_name, k.optString("name", "Class"));
        String day = isToday ? "" : Widgets.tomorrow().equals(date) ? "Tomorrow · " : Widgets.due(date, null) + " · ";
        Widgets.text(v, R.id.w_when, "⏰ " + day + Widgets.clock(k.optString("from")) + " – " + Widgets.clock(k.optString("to")));
        String room = k.optString("room");
        Widgets.text(v, R.id.w_room, room.isEmpty() ? null : "📍 " + room);

        int from = Widgets.minutes(k.optString("from")), to = Widgets.minutes(k.optString("to")), nowM = Widgets.minutes(now);
        if (on) {
            Widgets.chip(v, R.id.w_chip, Widgets.span(Math.max(1, to - nowM)) + " left", "accent");
            v.setViewVisibility(R.id.w_prog, View.VISIBLE);
            v.setProgressBar(R.id.w_prog, 100, to > from ? Math.round(100f * (nowM - from) / (to - from)) : 0, false);
        } else {
            v.setViewVisibility(R.id.w_prog, View.GONE);
            if (isToday) {
                int mins = from - nowM;
                Widgets.chip(v, R.id.w_chip, "in " + Widgets.span(mins), mins <= 15 ? "danger" : mins <= 45 ? "warn" : "info");
            } else {
                Widgets.chip(v, R.id.w_chip, Widgets.tomorrow().equals(date) ? "Tomorrow" : null, "neutral");
            }
        }
        JSONObject then = next.optJSONObject(1);
        boolean showThen = heightDp >= 150 && then != null && then.optString("date").equals(date);
        v.setViewVisibility(R.id.w_thenbox, showThen ? View.VISIBLE : View.GONE);
        if (showThen) v.setTextViewText(R.id.w_then, "Then  " + then.optString("name") + " · " + Widgets.clock(then.optString("from")));
        return v;
    }
}
