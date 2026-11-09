package com.dockin.student;

import android.app.PendingIntent;
import android.app.job.JobInfo;
import android.app.job.JobScheduler;
import android.content.ComponentName;
import android.content.Context;
import android.content.SharedPreferences;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

/**
 * Payment detection must never stop quietly. Some phones switch an app's
 * Accessibility service off after killing it, or after an update; this
 * notices — every 15 minutes, on boot, and whenever DockIn opens — and says
 * so with one tap to fix, instead of payments simply going missing.
 */
final class PayHealth {
    private PayHealth() {}

    private static final int JOB_ID = 4202;
    private static final int NOTE_ID = 7703;
    private static final long EVERY_MS = 15 * 60 * 1000L;
    private static final long NAG_GAP_MS = 2 * 60 * 60 * 1000L;

    static void check(Context c) {
        SharedPreferences p = c.getApplicationContext().getSharedPreferences("dockin-pay", Context.MODE_PRIVATE);
        boolean on = PayScreenService.enabled(c);
        if (on) {
            if (!p.getBoolean("screenWasOn", false)) p.edit().putBoolean("screenWasOn", true).apply();
            NotificationManagerCompat.from(c).cancel(NOTE_ID);
            return;
        }
        if (!p.getBoolean("screenWasOn", false)) return;
        long now = System.currentTimeMillis();
        if (now - p.getLong("nagAt", 0) < NAG_GAP_MS) return;
        p.edit().putLong("nagAt", now).apply();
        PayLog.add(c, "off", "", "Payment screens switched off by the phone", -1);

        NotificationManagerCompat nm = NotificationManagerCompat.from(c);
        if (!nm.areNotificationsEnabled()) return;
        PayNotifier.ensureChannel(c);
        PendingIntent fix = PendingIntent.getActivity(c, NOTE_ID, PayScreenService.settings(c),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        NotificationCompat.Builder b = new NotificationCompat.Builder(c, PayNotifier.CHANNEL)
                .setSmallIcon(R.drawable.ic_stat_dockin)
                .setColor(0xFFB3261E)
                .setContentTitle("Payment detection is off")
                .setContentText("Your phone switched it off. Tap, open DockIn payment screens, turn it on.")
                .setStyle(new NotificationCompat.BigTextStyle().bigText(
                        "Your phone switched off DockIn payment screens, so payments are not being caught. Tap, open “DockIn payment screens” and turn it on."))
                .setAutoCancel(true)
                .setContentIntent(fix)
                .setPriority(NotificationCompat.PRIORITY_HIGH);
        try {
            nm.notify(NOTE_ID, b.build());
        } catch (SecurityException ignored) {
            // notifications off
        }
    }

    /** The 15-minute check. Safe to call often. */
    static void schedule(Context c) {
        JobScheduler js = (JobScheduler) c.getSystemService(Context.JOB_SCHEDULER_SERVICE);
        if (js == null || js.getPendingJob(JOB_ID) != null) return;
        JobInfo job = new JobInfo.Builder(JOB_ID, new ComponentName(c, PayHealthJob.class))
                .setPeriodic(EVERY_MS)
                .setPersisted(true)
                .build();
        try {
            js.schedule(job);
        } catch (RuntimeException ignored) {
            // checked on every app open and boot anyway
        }
    }
}
