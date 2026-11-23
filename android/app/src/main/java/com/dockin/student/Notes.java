package com.dockin.student;

import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;

import androidx.core.app.NotificationChannelCompat;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Map;

/**
 * DockIn's own chat notifications: one per chat, the latest few lines stacked
 * like WhatsApp; never twice for the same message; quiet for the chat that is
 * open on screen. And the "delivered" receipt back to the server.
 */
final class Notes {

    private Notes() {}

    static final String CHANNEL = "social";
    private static final String PREFS = "dockin-notes";
    private static final String DELIVERED_URL = "https://dock-in.vercel.app/api/delivered";

    /** The chat open on screen right now (set by the web app), so it isn't notified. */
    static volatile String openChat = null;

    static void ensureChannel(Context c) {
        // Same channel the web side creates; making it again is harmless.
        NotificationManagerCompat.from(c).createNotificationChannel(
                new NotificationChannelCompat.Builder(CHANNEL, NotificationManagerCompat.IMPORTANCE_HIGH)
                        .setName("Friends & groups")
                        .setDescription("Messages, shared tasks and friend requests")
                        .setVibrationEnabled(true)
                        .setShowBadge(true)
                        .build());
    }

    static synchronized void show(Context c, Map<String, String> d) {
        String tag = val(d.get("tag"), "dockin");
        String id = val(d.get("nid"), tag + ":" + d.get("body"));
        if (MainActivity.inFront && tag.equals(openChat)) return; // reading that chat right now
        SharedPreferences p = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        try {
            // The same message twice (a retry) is shown once.
            JSONArray seen = new JSONArray(p.getString("seen", "[]"));
            for (int i = 0; i < seen.length(); i++) if (id.equals(seen.optString(i))) return;
            JSONArray nextSeen = new JSONArray();
            for (int i = Math.max(0, seen.length() - 199); i < seen.length(); i++) nextSeen.put(seen.optString(i));
            nextSeen.put(id);

            // This chat's lines so far (cleared when it is opened).
            JSONObject all = new JSONObject(p.getString("lines", "{}"));
            JSONArray lines = all.optJSONArray(tag);
            if (lines == null) lines = new JSONArray();
            lines.put(val(d.get("body"), ""));
            JSONArray keep = new JSONArray();
            for (int i = Math.max(0, lines.length() - 6); i < lines.length(); i++) keep.put(lines.optString(i));
            all.put(tag, keep);
            p.edit().putString("seen", nextSeen.toString()).putString("lines", all.toString()).apply();

            ensureChannel(c);
            String title = val(d.get("title"), "DockIn");
            NotificationCompat.InboxStyle style = new NotificationCompat.InboxStyle().setBigContentTitle(title);
            for (int i = 0; i < keep.length(); i++) style.addLine(keep.optString(i));
            int count = lines.length();
            if (count > 1) style.setSummaryText(count + " new messages");

            Intent open = new Intent(c, MainActivity.class)
                    .setAction("com.dockin.student.NOTE." + tag)
                    .putExtra(MainActivity.EXTRA_OPEN, val(d.get("path"), "/circle"))
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            PendingIntent tap = PendingIntent.getActivity(c, tag.hashCode(), open,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

            NotificationCompat.Builder b = new NotificationCompat.Builder(c, CHANNEL)
                    .setSmallIcon(R.drawable.ic_stat_dockin)
                    .setColor(0xFF7C3D1B)
                    .setContentTitle(title)
                    .setContentText(val(d.get("body"), ""))
                    .setStyle(style)
                    .setNumber(count)
                    .setAutoCancel(true)
                    .setPriority(NotificationCompat.PRIORITY_HIGH)
                    .setCategory(NotificationCompat.CATEGORY_MESSAGE)
                    .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
                    .setDefaults(NotificationCompat.DEFAULT_ALL)
                    .setGroup("dockin-chats")
                    .setContentIntent(tap);
            NotificationManagerCompat.from(c).notify(tag, 1, b.build());
        } catch (SecurityException e) {
            // Notifications switched off: nothing to show.
        } catch (Exception ignored) {
            // A malformed push is dropped, never a crash.
        }
    }

    /** The chat was opened: its notification and stacked lines go. */
    static synchronized void clear(Context c, String tag) {
        if (tag == null) return;
        try {
            SharedPreferences p = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            JSONObject all = new JSONObject(p.getString("lines", "{}"));
            all.remove(tag);
            p.edit().putString("lines", all.toString()).apply();
            NotificationManagerCompat.from(c).cancel(tag, 1);
        } catch (Exception ignored) {
            // Nothing stacked.
        }
    }

    // ---------------------------------------------------------------- delivered

    /** Tell the server this phone has the message (grey ✓✓ for the sender). Retried later if offline. */
    static void acknowledge(Context c, Map<String, String> d) {
        String sig = d.get("sig");
        if (sig == null) return;
        try {
            JSONObject ack = new JSONObject();
            ack.put("uid", d.get("uid"));
            ack.put("thread", d.get("thread"));
            ack.put("at", d.get("at"));
            ack.put("sig", sig);
            SharedPreferences p = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            JSONArray queue = new JSONArray(p.getString("acks", "[]"));
            queue.put(ack);
            p.edit().putString("acks", queue.toString()).apply();
        } catch (Exception ignored) {
            return;
        }
        flushAcks(c);
    }

    /** Sends every waiting receipt; keeps the ones the network refused. */
    static synchronized void flushAcks(Context c) {
        SharedPreferences p = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        JSONArray queue;
        try {
            queue = new JSONArray(p.getString("acks", "[]"));
        } catch (Exception e) {
            return;
        }
        if (queue.length() == 0) return;
        JSONArray left = new JSONArray();
        for (int i = 0; i < queue.length(); i++) {
            JSONObject a = queue.optJSONObject(i);
            if (a == null) continue;
            try {
                Net.Res r = Net.postJson(DELIVERED_URL, a.toString(), null);
                // 4xx: a bad or stale receipt — nothing to retry.
                if (r.code >= 500) left.put(a);
            } catch (Exception e) {
                left.put(a);
            }
        }
        // Keep at most the latest 50 waiting.
        JSONArray trimmed = new JSONArray();
        for (int i = Math.max(0, left.length() - 50); i < left.length(); i++) trimmed.put(left.opt(i));
        p.edit().putString("acks", trimmed.toString()).apply();
    }

    private static String val(String s, String d) {
        return s == null || s.isEmpty() ? d : s;
    }
}
