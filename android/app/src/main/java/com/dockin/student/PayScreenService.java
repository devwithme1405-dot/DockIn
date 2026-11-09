package com.dockin.student;

import android.accessibilityservice.AccessibilityService;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;

import java.util.ArrayList;
import java.util.List;

/**
 * Sees PhonePe's / Paytm's / Slice's "Payment successful" screen and asks
 * about the payment right there, before any SMS. Android only sends this
 * service the payment apps listed in res/xml/pay_screen.xml, and nothing it
 * reads leaves the phone: only the amount and payee go to PayNotifier.
 *
 * Android keeps an accessibility service bound, and restarts its process when
 * something kills it, which is also what keeps payment watching alive when
 * DockIn is swiped away.
 */
public class PayScreenService extends AccessibilityService {
    private static final long SAME_SCREEN_MS = 30 * 60_000L;
    private static final int MAX_NODES = 600;

    static volatile boolean connected = false;

    private final Handler main = new Handler(Looper.getMainLooper());
    private String pending;
    private final Runnable scan = new Runnable() {
        @Override
        public void run() {
            scanNow();
        }
    };

    static boolean enabled(Context c) {
        try {
            String on = Settings.Secure.getString(c.getContentResolver(), "enabled_accessibility_services");
            if (on == null) return false;
            String me = new ComponentName(c, PayScreenService.class).flattenToString();
            String shortMe = c.getPackageName() + "/.PayScreenService";
            for (String s : on.split(":")) if (s.equalsIgnoreCase(me) || s.equalsIgnoreCase(shortMe)) return true;
        } catch (RuntimeException ignored) {
            // settings unreadable
        }
        return false;
    }

    @Override
    protected void onServiceConnected() {
        connected = true;
        PayGuardService.start(this);
    }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent e) {
        if (e == null || e.getPackageName() == null) return;
        String pkg = e.getPackageName().toString();
        if (!PayScreen.watched(pkg)) return;
        pending = pkg;
        // The success screen animates in over many events; read it once it settles.
        main.removeCallbacks(scan);
        main.postDelayed(scan, 450);
    }

    private void scanNow() {
        String pkg = pending;
        if (pkg == null) return;
        AccessibilityNodeInfo root;
        try {
            root = getRootInActiveWindow();
        } catch (RuntimeException e) {
            return;
        }
        if (root == null || root.getPackageName() == null || !pkg.equals(root.getPackageName().toString())) return;
        List<String> texts = new ArrayList<>();
        collect(root, texts, 0);
        long now = System.currentTimeMillis();
        PayNotifier.Spend s = PayScreen.read(texts, now);
        if (s == null) return;

        // The same success screen stays up and redraws; ask once.
        String key = pkg + "|" + s.amount + "|" + s.merchant;
        SharedPreferences p = getSharedPreferences("dockin-pay", Context.MODE_PRIVATE);
        if (key.equals(p.getString("screenKey", null)) && now - p.getLong("screenAt", 0) < SAME_SCREEN_MS) return;
        p.edit().putString("screenKey", key).putLong("screenAt", now).apply();
        // Into the same inbox as notifications and SMS, so the app files it even
        // if the popup is ignored; its twin from an SMS later is merged there.
        String body = "Payment successful " + PayNotifier.rupees(s.amount) + " paid"
                + (s.merchant != null ? " to " + s.merchant : "");
        org.json.JSONObject kept = PayInbox.add(this, pkg, "Payment successful", body, now);
        if (kept != null) DockInPlugin.deliver(kept);
        PayNotifier.ask(this, s, now, pkg);
    }

    private static void collect(AccessibilityNodeInfo n, List<String> out, int depth) {
        if (n == null || out.size() >= MAX_NODES || depth > 40) return;
        CharSequence t = n.getText();
        if (t != null && t.length() > 0) out.add(t.toString());
        else {
            CharSequence d = n.getContentDescription();
            if (d != null && d.length() > 0) out.add(d.toString());
        }
        for (int i = 0; i < n.getChildCount(); i++) collect(n.getChild(i), out, depth + 1);
    }

    @Override
    public void onInterrupt() {
    }

    @Override
    public boolean onUnbind(Intent intent) {
        connected = false;
        return super.onUnbind(intent);
    }

    /** Android's Accessibility screen, with DockIn's row picked out where the phone supports it. */
    static Intent settings(Context c) {
        Intent i = new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS);
        String me = new ComponentName(c, PayScreenService.class).flattenToString();
        i.putExtra(":settings:fragment_args_key", me);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        return i;
    }
}
