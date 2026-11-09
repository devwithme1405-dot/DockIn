package com.dockin.student;

import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

import org.json.JSONException;
import org.json.JSONObject;

/** "For me" on the payment notification: saved in one tap, nothing opens. */
public class PayActionReceiver extends BroadcastReceiver {
    private static final String ACTION = "com.dockin.student.PAY_FOR_ME";

    static PendingIntent forMe(Context c, int code, double amount, String merchant, long at, int nid) {
        Intent i = new Intent(c, PayActionReceiver.class)
                .setAction(ACTION)
                .putExtra("amount", amount)
                .putExtra("at", at)
                .putExtra("nid", nid);
        if (merchant != null) i.putExtra("merchant", merchant);
        return PendingIntent.getBroadcast(c, code, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    @Override
    public void onReceive(Context c, Intent i) {
        if (i == null || !ACTION.equals(i.getAction())) return;
        double amount = i.getDoubleExtra("amount", 0);
        long at = i.getLongExtra("at", 0);
        int nid = i.getIntExtra("nid", 0);
        if (amount <= 0) return;
        JSONObject a = new JSONObject();
        try {
            a.put("who", "me");
            a.put("answeredAt", System.currentTimeMillis());
        } catch (JSONException ignored) {
            // plain keys
        }
        PayInbox.answer(c, amount, at, a);

        // Swap the question for a quiet "saved", gone in a few seconds.
        NotificationManagerCompat nm = NotificationManagerCompat.from(c);
        String merchant = i.getStringExtra("merchant");
        NotificationCompat.Builder b = new NotificationCompat.Builder(c, PayNotifier.CHANNEL)
                .setSmallIcon(R.drawable.ic_stat_dockin)
                .setColor(0xFF2E7D32)
                .setContentTitle("✓ " + PayNotifier.rupees(amount) + (merchant != null ? " at " + merchant : "") + " saved as yours")
                .setContentText("It shows up in Money next time you open DockIn.")
                .setOnlyAlertOnce(true)
                .setSilent(true)
                .setAutoCancel(true)
                .setTimeoutAfter(4000);
        try {
            nm.notify(nid, b.build());
        } catch (SecurityException ignored) {
            // notifications switched off meanwhile
        }
    }
}
