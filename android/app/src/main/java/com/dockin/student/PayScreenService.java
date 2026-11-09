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
    private final Runnable scan = this::scanNow;

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

    /** When the screen being read started changing (wall clock), for the log's "how fast". */
    private long burstAt;
    private long lastEventAt;
    private long lastScanAt;
    private int retries;
    private static final long[] RETRY_MS = {120, 300, 700, 1500};

    @Override
    public void onAccessibilityEvent(AccessibilityEvent e) {
        if (e == null || e.getPackageName() == null) return;
        String pkg = e.getPackageName().toString();
        if (!PayScreen.watched(pkg)) return;
        long now = System.currentTimeMillis();
        if (now - lastEventAt > 2000 || !pkg.equals(pending)) burstAt = now;
        lastEventAt = now;
        pending = pkg;
        retries = 0;
        // Read now, not after a pause, and re-read a few times after it goes
        // quiet in case the amount or "successful" lands a frame late.
        main.removeCallbacks(scan);
        // A new screen (the success screen arriving) is read at once; redraws
        // within a screen at most every 250 ms, so a scrolling list is not slowed.
        long gap = e.getEventType() == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED ? 0 : 250;
        long since = now - lastScanAt;
        if (since >= gap) scanNow();
        else main.postDelayed(scan, gap - since);
    }

    private void scanNow() {
        String pkg = pending;
        if (pkg == null) return;
        lastScanAt = System.currentTimeMillis();
        boolean done = read(pkg);
        if (!done && retries < RETRY_MS.length) {
            main.postDelayed(scan, RETRY_MS[retries++]);
        }
    }

    /** True when this screen is finished with: a payment was caught, or it is not one. */
    private boolean read(String pkg) {
        AccessibilityNodeInfo root;
        try {
            root = getRootInActiveWindow();
        } catch (RuntimeException e) {
            return false;
        }
        if (root == null || root.getPackageName() == null || !pkg.equals(root.getPackageName().toString())) return false;
        List<String> texts = new ArrayList<>();
        collect(root, texts, 0);
        long now = System.currentTimeMillis();
        PayNotifier.Spend s = PayScreen.read(texts, now);
        if (s == null) {
            if (retries >= RETRY_MS.length && PayScreen.looksLikePayment(texts)) {
                PayLog.add(this, "missed", pkg, String.join(" | ", texts), -1);
            }
            return false;
        }

        // The same success screen stays up and redraws; ask once.
        String key = pkg + "|" + s.amount + "|" + s.merchant;
        SharedPreferences p = getSharedPreferences("dockin-pay", Context.MODE_PRIVATE);
        if (key.equals(p.getString("screenKey", null)) && now - p.getLong("screenAt", 0) < SAME_SCREEN_MS) return true;
        p.edit().putString("screenKey", key).putLong("screenAt", now).apply();

        // Into the same inbox as notifications, so the app files it even if
        // the notification is swiped away; a twin from the app's own
        // notification moments later is merged there.
        String body = "Payment successful " + PayNotifier.rupees(s.amount) + " paid"
                + (s.merchant != null ? " to " + s.merchant : "");
        org.json.JSONObject kept = PayInbox.add(this, pkg, "Payment successful", body, burstAt);
        if (kept != null) DockInPlugin.deliver(kept);
        PayNotifier.ask(this, s, burstAt, pkg);
        return true;
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
