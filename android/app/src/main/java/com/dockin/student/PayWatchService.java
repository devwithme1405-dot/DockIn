package com.dockin.student;

import android.app.Notification;
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
     * The apps money actually moves through. Keeping this short is the point: a
     * listener that read everything would be reading a whole phone to catch a
     * ₹60 samosa.
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
            "com.android.mms"
    ));

    /**
     * A message has to look like money moving before it is kept: an amount and
     * a word about paying. Deliberately loose — the app does the real reading,
     * so this only has to keep ordinary chats out.
     */
    private static final Pattern LOOKS_LIKE_MONEY =
            Pattern.compile("(?i)(?:\u20B9|\\brs\\.?|\\binr\\b)\\s*[0-9]|[0-9]\\s*(?:\u20B9|rupees)");
    private static final Pattern LOOKS_LIKE_PAYING = Pattern.compile(
            "(?i)\\b(paid|pay|payment|debited|debit|spent|sent|txn|transaction|credited|received|refund|upi|withdrawn)\\b");

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
        if (!WATCHED.contains(sbn.getPackageName())) return;

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
        if (!LOOKS_LIKE_MONEY.matcher(whole).find()) return;
        if (!LOOKS_LIKE_PAYING.matcher(whole).find()) return;

        JSONObject kept = PayInbox.add(this, sbn.getPackageName(), title, body, sbn.getPostTime());
        if (kept == null) return;

        DockInPlugin.deliver(kept);
        PayNotifier.ask(this, PayInbox.redact(whole), sbn.getPostTime());
    }

    private static String text(CharSequence cs) {
        return cs == null ? "" : cs.toString().trim();
    }
}
