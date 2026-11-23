package com.dockin.student;

import android.content.Context;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

/** What the mess is serving now (or next), the menu as a list, and the meal after. */
public class MessWidget extends Widgets.Base {
    static String emoji(String meal) {
        String m = meal == null ? "" : meal.toLowerCase(java.util.Locale.ROOT);
        if (m.startsWith("break")) return "☕";
        if (m.startsWith("lunch")) return "🍛";
        if (m.startsWith("snack")) return "🍪";
        if (m.startsWith("dinner")) return "🍲";
        return "🍽️";
    }

    @Override
    RemoteViews draw(Context c, JSONObject d, int heightDp) {
        RemoteViews v = new RemoteViews(c.getPackageName(), Widgets.layout(c, d, R.layout.widget_mess, R.layout.widget_mess_dark));
        v.setOnClickPendingIntent(R.id.w_root, Widgets.open(c, "/cafeteria", 105));
        JSONObject mess = d.optJSONObject("mess");
        JSONArray meals = mess == null || !Widgets.today().equals(mess.optString("date")) ? null : mess.optJSONArray("meals");
        if (meals == null || meals.length() == 0) {
            v.setTextViewText(R.id.w_icon, "🍽️");
            v.setTextViewText(R.id.w_label, "Mess menu");
            v.setTextViewText(R.id.w_items, "Open Cafeteria in DockIn to load today's menu");
            Widgets.chip(v, R.id.w_chip, null, null);
            v.setViewVisibility(R.id.w_nextbox, View.GONE);
            return v;
        }
        String now = Widgets.nowHm();
        int at = -1;
        for (int i = 0; i < meals.length(); i++) {
            JSONObject m = meals.optJSONObject(i);
            if (m != null && m.optString("to", "23:59").compareTo(now) > 0) {
                at = i;
                break;
            }
        }
        if (at < 0) {
            v.setTextViewText(R.id.w_icon, "🌙");
            v.setTextViewText(R.id.w_label, "Mess is closed");
            v.setTextViewText(R.id.w_items, "That's it for today — see you at breakfast");
            Widgets.chip(v, R.id.w_chip, null, null);
            v.setViewVisibility(R.id.w_nextbox, View.GONE);
            return v;
        }
        JSONObject pick = meals.optJSONObject(at);
        String meal = pick.optString("meal", "Meal");
        String from = pick.optString("from", "");
        String to = pick.optString("to", "");
        boolean serving = from.isEmpty() || from.compareTo(now) <= 0;
        v.setTextViewText(R.id.w_icon, emoji(meal));
        v.setTextViewText(R.id.w_label, meal);
        Widgets.sub(v, (serving ? "Serving now" : "Next up") + " · " + Widgets.todayLabel());
        Widgets.chip(v, R.id.w_chip, serving ? (to.isEmpty() ? "Now" : "Till " + Widgets.clock(to)) : "From " + Widgets.clock(from), serving ? "safe" : "info");
        StringBuilder items = new StringBuilder();
        int max = Math.max(2, (heightDp - 80) / 20);
        int lines = 0;
        for (String line : pick.optString("items").split("\n")) {
            String l = line.replaceAll("^[\"']|[\"']$", "").trim();
            if (l.isEmpty()) continue;
            if (lines == max) {
                items.append("\n…");
                break;
            }
            if (items.length() > 0) items.append('\n');
            items.append("•  ").append(l);
            lines++;
        }
        v.setTextViewText(R.id.w_items, items.toString());
        JSONObject after = meals.optJSONObject(at + 1);
        boolean showNext = after != null && heightDp >= 150;
        v.setViewVisibility(R.id.w_nextbox, showNext ? View.VISIBLE : View.GONE);
        if (showNext) v.setTextViewText(R.id.w_next, "Next  " + emoji(after.optString("meal")) + " " + after.optString("meal")
                + (after.optString("from").isEmpty() ? "" : " · " + Widgets.clock(after.optString("from"))));
        return v;
    }
}
