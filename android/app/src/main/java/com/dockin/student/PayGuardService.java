package com.dockin.student;

import android.Manifest;
import android.app.AlarmManager;
import android.app.Notification;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.os.SystemClock;

import androidx.core.app.NotificationChannelCompat;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

/**
 * Keeps DockIn's payment reading alive with the app closed.
 *
 * Android — and MIUI, ColorOS and friends far more eagerly — kill a closed
 * app's process. Once it is gone the payment-notification listener and the
 * bank-SMS receiver go with it, and payments are silently missed until the app
 * is opened again. A foreground service (one quiet, low notification) is the
 * sanctioned way to say "this app is doing something for you right now", and
 * the system leaves the process alone while it runs. It does no work of its
 * own: it only keeps the process that does the reading alive.
 */
public class PayGuardService extends Service {

    static final String CHANNEL = "guard";
    private static final int ID = 7701;
    static volatile boolean running = false;

    /** Worth running: payment reading is switched on in some form. */
    static boolean wanted(Context c) {
        if (DockInPlugin.listening(c) || PayScreenService.enabled(c)) return true;
        return Build.VERSION.SDK_INT >= 23
                && c.checkSelfPermission(Manifest.permission.RECEIVE_SMS) == PackageManager.PERMISSION_GRANTED;
    }

    /** Starts it when payment reading is on. Safe to call often, from anywhere. */
    static void start(Context c) {
        if (!wanted(c)) return;
        Intent i = new Intent(c, PayGuardService.class);
        try {
            if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(i);
            else c.startService(i);
        } catch (RuntimeException e) {
            // Android refused a start from the background; the next app open,
            // boot or listener connection starts it instead.
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        Notification n = notification(this);
        try {
            if (Build.VERSION.SDK_INT >= 34) {
                startForeground(ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
            } else {
                startForeground(ID, n);
            }
            running = true;
        } catch (RuntimeException e) {
            stopSelf();
            return START_NOT_STICKY;
        }
        return START_STICKY;
    }

    /**
     * Swiping DockIn out of Recents ends the task, and on many phones the
     * process with it. Ask to be woken a moment later and start again.
     */
    @Override
    public void onTaskRemoved(Intent rootIntent) {
        try {
            AlarmManager am = (AlarmManager) getSystemService(Context.ALARM_SERVICE);
            Intent wake = new Intent(this, BootReceiver.class).setAction(BootReceiver.REVIVE);
            PendingIntent pi = PendingIntent.getBroadcast(this, 7702, wake,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            if (am != null) am.setAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, SystemClock.elapsedRealtime() + 1500, pi);
        } catch (RuntimeException ignored) {
            // the alarm is a backstop; START_STICKY and the screen reader still bring it back
        }
        super.onTaskRemoved(rootIntent);
    }

    @Override
    public void onDestroy() {
        running = false;
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private static Notification notification(Context c) {
        NotificationManagerCompat.from(c).createNotificationChannel(
                new NotificationChannelCompat.Builder(CHANNEL, NotificationManagerCompat.IMPORTANCE_MIN)
                        .setName("Payment watch")
                        .setDescription("Keeps DockIn catching payments while it is closed. Silent.")
                        .build());
        Intent open = new Intent(c, MainActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP)
                .putExtra(MainActivity.EXTRA_OPEN, "/money");
        return new NotificationCompat.Builder(c, CHANNEL)
                .setSmallIcon(R.drawable.ic_stat_dockin)
                .setColor(0xFF6A3DE8)
                .setContentTitle("Watching for payments")
                .setContentText("DockIn asks what each payment was for, the moment you pay.")
                .setOngoing(true)
                .setShowWhen(false)
                .setPriority(NotificationCompat.PRIORITY_MIN)
                .setContentIntent(PendingIntent.getActivity(c, 7701, open,
                        PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE))
                .build();
    }
}
