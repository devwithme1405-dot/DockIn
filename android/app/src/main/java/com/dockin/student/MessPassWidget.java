package com.dockin.student;

import android.content.Context;
import android.graphics.Bitmap;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONObject;

/** The cafeteria QR, right on the home screen. */
public class MessPassWidget extends Widgets.Base {
    @Override
    RemoteViews draw(Context c, JSONObject d) {
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_mess_pass);
        v.setOnClickPendingIntent(R.id.w_root, Widgets.open(c, "/cafeteria?pass=1", 106));
        Bitmap qr = Widgets.image(d.optString("pass", null));
        if (qr == null) {
            v.setViewVisibility(R.id.w_qr, View.GONE);
            Widgets.text(v, R.id.w_empty, "Open Cafeteria in DockIn once to add your pass");
            return v;
        }
        v.setImageViewBitmap(R.id.w_qr, qr);
        v.setViewVisibility(R.id.w_qr, View.VISIBLE);
        Widgets.text(v, R.id.w_empty, null);
        return v;
    }
}
