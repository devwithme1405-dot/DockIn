package com.dockin.student;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** After a restart or an update, payment reading comes back without opening DockIn. */
public class BootReceiver extends BroadcastReceiver {
    /** Sent by PayGuardService a moment after DockIn is swiped out of Recents. */
    static final String REVIVE = "com.dockin.student.REVIVE";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null) return;
        String a = intent.getAction();
        if (Intent.ACTION_BOOT_COMPLETED.equals(a)
                || Intent.ACTION_MY_PACKAGE_REPLACED.equals(a)
                || "android.intent.action.QUICKBOOT_POWERON".equals(a)
                || REVIVE.equals(a)) {
            PayGuardService.start(context);
        }
    }
}
