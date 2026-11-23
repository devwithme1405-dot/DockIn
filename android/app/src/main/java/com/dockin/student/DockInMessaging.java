package com.dockin.student;

import androidx.annotation.NonNull;

import com.capacitorjs.plugins.pushnotifications.MessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.util.Map;

/**
 * Every push for this phone lands here (it replaces Capacitor's own service and
 * still hands everything on to it). A DockIn "note" push carries the
 * notification itself as data, so it is shown even with the app closed, and
 * the sender gets their grey ✓✓ the moment it reaches this phone — the way
 * WhatsApp's "delivered" works.
 */
public class DockInMessaging extends MessagingService {

    @Override
    public void onMessageReceived(@NonNull RemoteMessage message) {
        // The open app still hears about it (Capacitor's listeners).
        try {
            super.onMessageReceived(message);
        } catch (RuntimeException ignored) {
            // The web side is optional here; the notification below is not.
        }
        Map<String, String> d = message.getData();
        if (d == null || !"note".equals(d.get("kind"))) return;
        Notes.show(this, d);
        Notes.acknowledge(this, d);
    }
}
