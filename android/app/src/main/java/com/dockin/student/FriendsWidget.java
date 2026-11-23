package com.dockin.student;

import android.content.Context;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Friends: your latest chats with photo, last message, time and unread count
 * (tap one to open it), and which friends are free right now.
 */
public class FriendsWidget extends Widgets.Base {
    static final int[] ROWS = {R.id.w_r1, R.id.w_r2, R.id.w_r3};
    static final int[] AVATARS = {R.id.w_av1, R.id.w_av2, R.id.w_av3};
    static final int[] NAMES = {R.id.w_n1, R.id.w_n2, R.id.w_n3};
    static final int[] TIMES = {R.id.w_tm1, R.id.w_tm2, R.id.w_tm3};
    static final int[] MSGS = {R.id.w_m1, R.id.w_m2, R.id.w_m3};
    static final int[] UNREAD = {R.id.w_u1, R.id.w_u2, R.id.w_u3};

    @Override
    RemoteViews draw(Context c, JSONObject d, int heightDp) {
        RemoteViews v = new RemoteViews(c.getPackageName(), Widgets.layout(c, d, R.layout.widget_friends, R.layout.widget_friends_dark));
        v.setOnClickPendingIntent(R.id.w_root, Widgets.open(c, "/circle", 107));
        JSONObject f = d.optJSONObject("friends");
        JSONArray chats = f == null ? null : f.optJSONArray("chats");
        int ink = Widgets.ink(c, d);
        int muted = Widgets.muted(c, d);
        int fit = Math.max(1, Math.min(ROWS.length, (heightDp - 70) / 46));
        int n = 0;
        if (chats != null) {
            for (int i = 0; i < chats.length() && n < fit; i++) {
                JSONObject k = chats.optJSONObject(i);
                if (k == null) continue;
                int unread = k.optInt("unread");
                v.setViewVisibility(ROWS[n], View.VISIBLE);
                v.setImageViewBitmap(AVATARS[n], Widgets.avatar(c, k.optString("name"), k.optString("photo", null)));
                v.setTextViewText(NAMES[n], k.optString("emoji", "") + k.optString("name"));
                v.setTextViewText(TIMES[n], Widgets.ago(k.optLong("at")));
                v.setTextColor(TIMES[n], unread > 0 ? Widgets.ACCENT : muted);
                v.setTextViewText(MSGS[n], k.optString("last"));
                v.setTextColor(MSGS[n], unread > 0 ? ink : muted);
                if (unread > 0) {
                    v.setTextViewText(UNREAD[n], unread > 99 ? "99+" : String.valueOf(unread));
                    v.setViewVisibility(UNREAD[n], View.VISIBLE);
                } else {
                    v.setViewVisibility(UNREAD[n], View.GONE);
                }
                // Tap a chat to open it.
                v.setOnClickPendingIntent(ROWS[n], Widgets.open(c, "/circle?chat=" + android.net.Uri.encode(k.optString("thread")), 170 + n));
                n++;
            }
        }
        for (int i = n; i < ROWS.length; i++) v.setViewVisibility(ROWS[i], View.GONE);
        int unread = f == null ? 0 : f.optInt("unread");
        Widgets.chip(v, R.id.w_chip, unread > 0 ? unread + " unread" : null, "accent");
        Widgets.sub(v, unread > 0 ? "New messages waiting" : "Your chats and groups");
        Widgets.text(v, R.id.w_empty, n == 0 ? (f == null ? "Sign in to Friends in DockIn" : "No chats yet — say hi to a friend 👋") : null);
        String free = f == null ? "" : f.optString("free", "");
        boolean showFree = !free.isEmpty() && heightDp >= 170;
        v.setViewVisibility(R.id.w_freebox, showFree ? View.VISIBLE : View.GONE);
        if (showFree) v.setTextViewText(R.id.w_free, "🟢  " + free);
        return v;
    }
}
