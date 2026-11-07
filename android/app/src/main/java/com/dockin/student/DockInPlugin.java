package com.dockin.student;

import android.Manifest;
import android.content.ActivityNotFoundException;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.app.NotificationManagerCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import org.json.JSONException;
import org.json.JSONObject;

import java.lang.ref.WeakReference;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * Everything the web app can ask of the phone, as `DockIn` in JavaScript.
 *
 * Kept deliberately small: whether payment detection is on, the switches to
 * turn it on, and the payments waiting to be placed. Each method answers in
 * plain values the web side can show as they are.
 */
@CapacitorPlugin(
        name = "DockIn",
        permissions = {
                @Permission(alias = "notifications", strings = {Manifest.permission.POST_NOTIFICATIONS})
        }
)
public class DockInPlugin extends Plugin {

    /** The running copy, so the listener can hand over a payment the moment it sees one. */
    private static WeakReference<DockInPlugin> live = new WeakReference<>(null);

    @Override
    public void load() {
        live = new WeakReference<>(this);
    }

    /** Called by the listener. Does nothing when the app is closed; the inbox has it. */
    static void deliver(JSONObject notice) {
        DockInPlugin p = live.get();
        if (p == null) return;
        try {
            p.notifyListeners("notice", JSObject.fromJSONObject(notice));
        } catch (JSONException ignored) {
            // The app will still find it in the inbox.
        }
    }

    // -------------------------------------------------------------------------
    // State

    @PluginMethod
    public void status(PluginCall call) {
        Context c = getContext();
        JSObject r = new JSObject();
        r.put("listening", listening(c));
        r.put("notifications", notificationState());
        r.put("pending", PayInbox.size(c));
        r.put("sdk", Build.VERSION.SDK_INT);
        r.put("maker", Build.MANUFACTURER == null ? "" : Build.MANUFACTURER);
        try {
            PackageInfo info = c.getPackageManager().getPackageInfo(c.getPackageName(), 0);
            r.put("version", info.versionName == null ? "" : info.versionName);
            r.put("build", Build.VERSION.SDK_INT >= 28 ? info.getLongVersionCode() : (long) info.versionCode);
        } catch (PackageManager.NameNotFoundException e) {
            r.put("version", "");
            r.put("build", 0);
        }
        call.resolve(r);
    }

    static boolean listening(Context c) {
        return NotificationManagerCompat.getEnabledListenerPackages(c).contains(c.getPackageName());
    }

    private String notificationState() {
        if (NotificationManagerCompat.from(getContext()).areNotificationsEnabled()) return "granted";
        if (Build.VERSION.SDK_INT >= 33) {
            PermissionState s = getPermissionState("notifications");
            if (s == PermissionState.PROMPT || s == PermissionState.PROMPT_WITH_RATIONALE) return "prompt";
        }
        return "denied";
    }

    // -------------------------------------------------------------------------
    // Switches

    /** Straight to DockIn's own switch where Android allows it, the list otherwise. */
    @PluginMethod
    public void openListenerSettings(PluginCall call) {
        Context c = getContext();
        Intent exact = null;
        if (Build.VERSION.SDK_INT >= 30) {
            exact = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_DETAIL_SETTINGS)
                    .putExtra(Settings.EXTRA_NOTIFICATION_LISTENER_COMPONENT_NAME,
                            new ComponentName(c, PayWatchService.class).flattenToString());
        }
        Intent list = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS);
        launch(call, exact, list);
    }

    /**
     * App info. On Android 13 and later a sideloaded app has to be allowed
     * "restricted settings" from here (the ⋮ menu) before notification access
     * can be switched on for it.
     */
    @PluginMethod
    public void openAppSettings(PluginCall call) {
        Intent i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                Uri.fromParts("package", getContext().getPackageName(), null));
        launch(call, i, null);
    }

    @PluginMethod
    public void openNotificationSettings(PluginCall call) {
        Intent i = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                .putExtra(Settings.EXTRA_APP_PACKAGE, getContext().getPackageName());
        Intent fallback = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                Uri.fromParts("package", getContext().getPackageName(), null));
        launch(call, i, fallback);
    }

    private void launch(PluginCall call, Intent first, Intent fallback) {
        try {
            if (first != null) {
                getActivity().startActivity(first);
                call.resolve();
                return;
            }
        } catch (ActivityNotFoundException | SecurityException e) {
            // Some phones rename or hide these screens; the fallback is the general one.
        }
        if (fallback == null) {
            call.reject("This phone does not have that settings screen.");
            return;
        }
        try {
            getActivity().startActivity(fallback);
            call.resolve();
        } catch (ActivityNotFoundException | SecurityException e) {
            call.reject("This phone does not have that settings screen.");
        }
    }

    /** Android 13+ asks; older phones have notifications on unless switched off. */
    @PluginMethod
    public void requestNotifications(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 33 && getPermissionState("notifications") != PermissionState.GRANTED) {
            requestPermissionForAlias("notifications", call, "notificationsAnswered");
            return;
        }
        notificationsAnswered(call);
    }

    @PermissionCallback
    private void notificationsAnswered(PluginCall call) {
        if (NotificationManagerCompat.from(getContext()).areNotificationsEnabled()) {
            PayNotifier.ensureChannel(getContext());
        }
        JSObject r = new JSObject();
        r.put("notifications", notificationState());
        call.resolve(r);
    }

    /** Shows what a payment prompt looks like, so the whole path can be checked without paying. */
    @PluginMethod
    public void testPrompt(PluginCall call) {
        PayNotifier.post(getContext(), 3999, 1, "DockIn test", System.currentTimeMillis());
        JSObject r = new JSObject();
        r.put("notifications", notificationState());
        call.resolve(r);
    }

    // -------------------------------------------------------------------------
    // Payments waiting

    @PluginMethod
    public void pending(PluginCall call) {
        JSObject r = new JSObject();
        try {
            r.put("notices", new JSArray(PayInbox.list(getContext()).toString()));
        } catch (JSONException e) {
            r.put("notices", new JSArray());
        }
        call.resolve(r);
    }

    @PluginMethod
    public void ack(PluginCall call) {
        JSArray ids = call.getArray("ids");
        Set<String> set = new HashSet<>();
        if (ids != null) {
            try {
                List<Object> raw = ids.toList();
                for (Object o : raw) if (o != null) set.add(o.toString());
            } catch (JSONException e) {
                call.reject("ids must be a list of strings");
                return;
            }
        }
        PayInbox.ack(getContext(), set);
        call.resolve();
    }

    // -------------------------------------------------------------------------
    // Lifecycle

    /** A tap on one of DockIn's own notifications says which screen to open. */
    @Override
    protected void handleOnNewIntent(Intent intent) {
        if (intent == null) return;
        String path = intent.getStringExtra(MainActivity.EXTRA_OPEN);
        if (path == null || !path.startsWith("/")) return;
        // Taken, so reopening the app from recents does not jump there again.
        intent.removeExtra(MainActivity.EXTRA_OPEN);
        JSObject d = new JSObject();
        d.put("path", path);
        notifyListeners("open", d, true);
    }

    /** Back from Settings: the web side re-reads the switches. */
    @Override
    protected void handleOnResume() {
        notifyListeners("resume", new JSObject());
    }
}
