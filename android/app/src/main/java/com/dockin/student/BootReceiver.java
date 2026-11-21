package com.dockin.student;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * After a restart or an update: the hourly Camu/LMS check comes back, and the
 * class and deadline reminders are set again (Android drops every alarm on a
 * reboot) — all without opening DockIn.
 */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null) return;
        String a = intent.getAction();
        if (Intent.ACTION_BOOT_COMPLETED.equals(a)
                || Intent.ACTION_MY_PACKAGE_REPLACED.equals(a)
                || "android.intent.action.QUICKBOOT_POWERON".equals(a)) {
            CollegeJob.schedule(context);
            Reminders.restore(context);
        }
    }
}
