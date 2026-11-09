package com.dockin.student;

import android.app.Notification;
import android.content.ComponentName;
import android.os.Build;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;

import org.json.JSONObject;

import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Watches the notifications payment apps and banks post.
 *
 * Only the apps on this list are ever looked at, and only their text is taken.
 * Nothing leaves the phone: a payment goes into {@link PayInbox}, the app reads
 * it from there, and a notification asks where the money went. Whether this
 * runs at all is decided in Android's own notification-access screen.
 */
public class PayWatchService extends NotificationListenerService {

    /**
     * The apps money usually moves through. Their notifications are read with a
     * loose test. Any other app (Slice, a bank's own app, a new wallet) is read
     * too, but only when it says outright that money left or arrived — so no
     * payment slips past just because its app was not on a list.
     */
    static final Set<String> WATCHED = new HashSet<>(Arrays.asList(
            "com.google.android.apps.nbu.paisa.user", // Google Pay
            "com.phonepe.app",
            "net.one97.paytm",
            "in.org.npci.upiapp",                     // BHIM
            "com.amazon.mShop.android.shopping",
            "com.dreamplug.androidapp",               // CRED
            "com.mobikwik_new",                       // MobiKwik
            "com.google.android.apps.messaging",      // bank SMS
            "com.samsung.android.messaging",
            "com.android.mms",
            "indwin.c3.shareapp",                     // Slice
            "money.jupiter",                          // Jupiter
            "com.epifi.paisa",                        // Fi
            "com.naviapp",                            // Navi
            "money.super.payments",                   // super.money
            "com.truecaller",                         // SMS inbox
            "com.oneplus.mms",
            "com.xiaomi.mms"
    ));

    /** Chats and social apps: a friend writing "I paid ₹60" is not your money moving. */
    static final Set<String> NEVER = new HashSet<>(Arrays.asList(
            "com.whatsapp",
            "com.whatsapp.w4b",
            "org.telegram.messenger",
            "com.instagram.android",
            "com.snapchat.android",
            "com.discord",
            "com.facebook.orca",
            "com.facebook.katana",
            "com.twitter.android",
            "com.google.android.gm",                  // mail repeats the bank SMS
            "com.google.android.youtube"
    ));

    /** For an app not on the list: money said outright to have left or arrived. */
    private static final Pattern SAYS_MONEY_MOVED = Pattern.compile(
            "(?i)\\b(paid|debited|spent|sent|withdrawn|deducted|credited|received)\\b");

    /**
     * A message has to look like money moving before it is kept: an amount and
     * a word about paying. Deliberately loose — the app does the real reading,
     * so this only has to keep ordinary chats out.
     */
    private static final Pattern LOOKS_LIKE_MONEY =
            Pattern.compile("(?i)(?:\u20B9|\\brs\\.?|\\binr\\b)\\s*[0-9]|[0-9]\\s*(?:\u20B9|rupees)|\\b(?:debited|credited|withdrawn|deducted|spent)\\s+(?:by|for|with|of)\\s+[0-9]");
    private static final Pattern LOOKS_LIKE_PAYING = Pattern.compile(
            "(?i)\\b(paid|pay|payment|debited|debit|spent|sent|txn|transaction|credited|received|refund|upi|withdrawn)\\b");

    /**
     * Android (and MIUI/ColorOS more eagerly) sometimes unbinds a listener to
     * save power. Ask to be bound again straight away, so payments keep being
     * caught with DockIn closed.
     */
    @Override
    public void onListenerDisconnected() {
        if (Build.VERSION.SDK_INT >= 24) {
            try {
                requestRebind(new ComponentName(this, PayWatchService.class));
            } catch (RuntimeException ignored) {
            }
        }
    }

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        try {
            handle(sbn);
        } catch (RuntimeException e) {
            // Whatever an app puts in its notification, it must never take the
            // listener down with it.
        }
    }

    private void handle(StatusBarNotification sbn) {
        if (sbn == null || sbn.getPackageName() == null) return;
        String app = sbn.getPackageName();
        if (NEVER.contains(app) || app.equals(getPackageName())) return;
        boolean known = WATCHED.contains(app);

        Notification n = sbn.getNotification();
        if (n == null) return;
        // An ongoing notification is a progress bar or a running service, never
        // a payment that has happened.
        if ((n.flags & Notification.FLAG_ONGOING_EVENT) != 0) return;
        // A group summary repeats its children; the children are what count.
        if ((n.flags & Notification.FLAG_GROUP_SUMMARY) != 0) return;

        Bundle extras = n.extras;
        if (extras == null) return;

        String title = text(extras.getCharSequence(Notification.EXTRA_TITLE));
        String body = text(extras.getCharSequence(Notification.EXTRA_BIG_TEXT));
        if (body.isEmpty()) body = text(extras.getCharSequence(Notification.EXTRA_TEXT));
        if (title.isEmpty() && body.isEmpty()) return;

        String whole = title + " " + body;
        // A known payment app is read loosely; anything else (a bank, a new
        // wallet) only when it says outright that money moved.
        if (!looksLikePayment(whole, !known)) return;

        JSONObject kept = PayInbox.add(this, sbn.getPackageName(), title, body, sbn.getPostTime());
        if (kept == null) return;

        DockInPlugin.deliver(kept);
        PayNotifier.ask(this, PayInbox.redact(whole), sbn.getPostTime());
    }

    /**
     * Does this text look like a payment? An amount and a word about paying,
     * always; and, when {@code requireMoved}, a word that says the money has
     * actually left or arrived (so an OTP or a balance does not count). Shared
     * with {@link SmsReceiver}, which reads bank SMS the same way.
     */
    static boolean looksLikePayment(String whole, boolean requireMoved) {
        if (!LOOKS_LIKE_MONEY.matcher(whole).find()) return false;
        if (!LOOKS_LIKE_PAYING.matcher(whole).find()) return false;
        if (requireMoved && !SAYS_MONEY_MOVED.matcher(whole).find()) return false;
        return true;
    }

    private static String text(CharSequence cs) {
        return cs == null ? "" : cs.toString().trim();
    }
}
