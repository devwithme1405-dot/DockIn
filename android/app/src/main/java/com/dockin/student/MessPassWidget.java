package com.dockin.student;

import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONObject;

/**
 * The cafeteria pass as a ticket on the home screen. A tap opens it full
 * screen and bright (PassActivity) — straight away, no app start, no network.
 */
public class MessPassWidget extends Widgets.Base {
    @Override
    RemoteViews draw(Context c, JSONObject d, int heightDp) {
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_mess_pass);
        Intent open = new Intent(c, PassActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        v.setOnClickPendingIntent(R.id.w_root, PendingIntent.getActivity(c, 106, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        String who = d.optString("passName", "");
        Widgets.sub(v, who.isEmpty() ? "Cafeteria" : who);
        Bitmap qr = Widgets.image(d.optString("pass", null));
        if (qr == null) {
            v.setViewVisibility(R.id.w_qr, View.GONE);
            v.setViewVisibility(R.id.w_caption, View.GONE);
            Widgets.text(v, R.id.w_empty, "Open Cafeteria in DockIn once to add your pass");
            return v;
        }
        // Small enough for the home screen to accept; a QR stays sharp scaled without smoothing.
        int side = Math.round(150 * Widgets.density(c));
        v.setImageViewBitmap(R.id.w_qr, Bitmap.createScaledBitmap(qr, side, side, false));
        v.setViewVisibility(R.id.w_qr, View.VISIBLE);
        v.setViewVisibility(R.id.w_caption, heightDp >= 150 ? View.VISIBLE : View.GONE);
        Widgets.text(v, R.id.w_empty, null);
        return v;
    }
}
