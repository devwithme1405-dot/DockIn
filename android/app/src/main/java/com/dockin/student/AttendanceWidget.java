package com.dockin.student;

import android.content.Context;
import android.widget.RemoteViews;

import org.json.JSONObject;

/** Overall attendance, coloured safe / close / below target, with what you can miss. */
public class AttendanceWidget extends Widgets.Base {
    @Override
    RemoteViews draw(Context c, JSONObject d) {
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_attendance);
        v.setOnClickPendingIntent(R.id.w_root, Widgets.open(c, "/attendance", 101));
        JSONObject a = d.optJSONObject("att");
        if (a == null || a.isNull("pct")) {
            v.setTextViewText(R.id.w_pct, "--");
            Widgets.text(v, R.id.w_line, "Open DockIn to set up attendance");
            Widgets.text(v, R.id.w_foot, null);
            return v;
        }
        v.setTextViewText(R.id.w_pct, Math.round(a.optDouble("pct")) + "%");
        v.setTextColor(R.id.w_pct, Widgets.tone(c, a.optString("tone")));
        Widgets.text(v, R.id.w_line, a.optString("line"));
        Widgets.text(v, R.id.w_foot, a.optInt("present") + "/" + a.optInt("total") + " classes · target " + a.optInt("target", 75) + "%");
        return v;
    }
}
