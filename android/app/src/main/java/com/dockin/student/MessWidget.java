package com.dockin.student;

import android.content.Context;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

/** The meal being served now, or the next one. */
public class MessWidget extends Widgets.Base {
    @Override
    RemoteViews draw(Context c, JSONObject d) {
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_mess);
        v.setOnClickPendingIntent(R.id.w_root, Widgets.open(c, "/cafeteria", 105));
        JSONObject mess = d.optJSONObject("mess");
        JSONArray meals = mess == null || !Widgets.today().equals(mess.optString("date")) ? null : mess.optJSONArray("meals");
        if (meals == null || meals.length() == 0) {
            v.setTextViewText(R.id.w_meal, "Today's menu");
            v.setTextViewText(R.id.w_items, "Open Cafeteria in DockIn to load it");
            v.setViewVisibility(R.id.w_badge, View.GONE);
            return v;
        }
        String now = Widgets.nowHm();
        JSONObject pick = null;
        boolean serving = false;
        for (int i = 0; i < meals.length(); i++) {
            JSONObject m = meals.optJSONObject(i);
            if (m == null) continue;
            String to = m.optString("to", "23:59");
            if (to.compareTo(now) <= 0) continue; // over
            pick = m;
            serving = m.optString("from", "00:00").compareTo(now) <= 0;
            break;
        }
        if (pick == null) {
            v.setTextViewText(R.id.w_meal, "Mess is closed for today");
            v.setTextViewText(R.id.w_items, "");
            v.setViewVisibility(R.id.w_badge, View.GONE);
            return v;
        }
        v.setTextViewText(R.id.w_meal, pick.optString("meal", "Meal"));
        v.setTextViewText(R.id.w_items, pick.optString("items"));
        String from = pick.optString("from", "");
        v.setTextViewText(R.id.w_badge, serving ? "Serving now" : from.isEmpty() ? "Next" : "From " + Widgets.clock(from));
        v.setViewVisibility(R.id.w_badge, View.VISIBLE);
        return v;
    }
}
