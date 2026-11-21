package com.dockin.student;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInstaller;
import android.os.Build;

/**
 * Android's answer about an update DockIn handed to its installer.
 *
 * - Needs a tap: show Android's "Update DockIn?" screen — straight away when
 *   DockIn is on screen, otherwise as a notification so it is never lost.
 * - Failed: tell the open app why (and, if it is closed, a notification).
 * - Done: Android replaces the app; {@link BootReceiver} says "updated".
 */
public class InstallReceiver extends BroadcastReceiver {
    static final String ACTION = "com.dockin.student.INSTALL_STATUS";

    @Override
    @SuppressWarnings("deprecation")
    public void onReceive(Context c, Intent intent) {
        if (intent == null) return;
        int status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE);
        if (status == PackageInstaller.STATUS_PENDING_USER_ACTION) {
            Intent confirm = Build.VERSION.SDK_INT >= 33
                    ? intent.getParcelableExtra(Intent.EXTRA_INTENT, Intent.class)
                    : (Intent) intent.getParcelableExtra(Intent.EXTRA_INTENT);
            if (confirm == null) {
                fail(c, PackageInstaller.STATUS_FAILURE);
                return;
            }
            confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            DockInPlugin.updateState("confirm", null);
            if (MainActivity.inFront) {
                try {
                    c.startActivity(confirm);
                    return;
                } catch (Exception ignored) {
                    // Blocked from here: the notification below does it.
                }
            }
            Updater.notifyConfirm(c, confirm);
            return;
        }
        if (status == PackageInstaller.STATUS_SUCCESS) {
            DockInPlugin.updateState("done", null);
            return;
        }
        fail(c, status);
    }

    private static void fail(Context c, int status) {
        String why = Updater.failureText(status);
        Updater.prefs(c).edit().remove("installing_at").apply();
        if (status == PackageInstaller.STATUS_FAILURE_INVALID) Updater.cleanUp(c);
        DockInPlugin.updateState("failed", why);
        if (!MainActivity.inFront && status != PackageInstaller.STATUS_FAILURE_ABORTED) Updater.notifyFailed(c, why);
    }
}
