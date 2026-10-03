package com.dockin.app;

import android.app.Notification;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;

import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Watches the notifications payment apps and banks post.
 *
 * Only the apps on this list are ever looked at, and only their text is taken —
 * never anything else on the phone. Whether this service runs at all is the
 * person's decision, made in Android's own notification-access screen and
 * revocable there at any time.
 */
public class PayWatchService extends NotificationListenerService {

    /**
     * The apps money actually moves through here. Keeping this short is the
     * point: a listener that reads everything would be reading a person's whole
     * phone to catch a ₹60 samosa.
     */
    private static final Set<String> WATCHED = new HashSet<>(Arrays.asList(
            "com.google.android.apps.nbu.paisa.user", // Google Pay
            "com.phonepe.app",
            "net.one97.paytm",
            "in.org.npci.upiapp",                     // BHIM
            "com.amazon.mShop.android.shopping",
            "com.dreamplug.androidapp",               // CRED
            "com.google.android.apps.messaging",      // bank SMS
            "com.samsung.android.messaging",
            "com.android.mms"
    ));

    /**
     * A message has to look like money moving before it leaves the phone.
     *
     * The real reading happens in the web app, but the apps above also carry
     * ordinary messages, and uploading somebody's chats to catch a ₹60 samosa
     * would be indefensible. This gate is deliberately loose — an amount and a
     * word about paying — so nothing real is lost, and everything else stays on
     * the phone.
     */
    private static final Pattern LOOKS_LIKE_MONEY =
            Pattern.compile("(?i)(?:₹|\\brs\\.?\\b|\\binr\\b)[^\\n]{0,24}?[0-9]");
    private static final Pattern LOOKS_LIKE_PAYING = Pattern.compile(
            "(?i)\\b(paid|pay|payment|debited|debit|spent|sent|txn|transaction|credited|upi)\\b");

    @Override
    public void onListenerConnected() {
        // Anything that could not be sent while the service was off goes now.
        PayLink.flush(this);
    }

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        if (sbn == null || sbn.getPackageName() == null) return;
        if (!WATCHED.contains(sbn.getPackageName())) return;

        Notification n = sbn.getNotification();
        if (n == null) return;
        // An ongoing notification is a progress bar or a running service, never
        // a payment that has happened.
        if ((n.flags & Notification.FLAG_ONGOING_EVENT) != 0) return;

        Bundle extras = n.extras;
        if (extras == null) return;

        String title = text(extras.getCharSequence(Notification.EXTRA_TITLE));
        String body = text(extras.getCharSequence(Notification.EXTRA_BIG_TEXT));
        if (body.isEmpty()) body = text(extras.getCharSequence(Notification.EXTRA_TEXT));
        if (title.isEmpty() && body.isEmpty()) return;

        String whole = title + " " + body;
        if (!LOOKS_LIKE_MONEY.matcher(whole).find()) return;
        if (!LOOKS_LIKE_PAYING.matcher(whole).find()) return;

        PayLink.send(this, sbn.getPackageName(), title, body, sbn.getPostTime());
    }

    private static String text(CharSequence cs) {
        return cs == null ? "" : cs.toString().trim();
    }
}
