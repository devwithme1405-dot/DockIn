package com.dockin.student;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.provider.Telephony;
import android.telephony.SmsMessage;

import org.json.JSONObject;

/**
 * Reads payment SMS straight from the inbox, the moment they arrive.
 *
 * Banks still say "debited" and "credited" over SMS more than anywhere else, and
 * a phone does not always raise a notification the messaging app would show — so
 * watching notifications alone misses them. This reads the SMS itself, with the
 * same test {@link PayWatchService} uses, and drops it into the same inbox. A
 * message that is not about money leaving or arriving is ignored, so OTPs,
 * balances and offers never reach the app.
 *
 * It only runs once the person allows SMS access; until then Android never sends
 * it anything. Nothing leaves the phone.
 */
public class SmsReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        try {
            handle(context, intent);
        } catch (RuntimeException e) {
            // A malformed SMS must never crash the phone's broadcast.
        }
    }

    private void handle(Context context, Intent intent) {
        if (intent == null || !Telephony.Sms.Intents.SMS_RECEIVED_ACTION.equals(intent.getAction())) return;
        SmsMessage[] parts = Telephony.Sms.Intents.getMessagesFromIntent(intent);
        if (parts == null || parts.length == 0) return;

        String sender = parts[0].getDisplayOriginatingAddress();
        if (sender == null) sender = parts[0].getOriginatingAddress();
        if (sender == null) sender = "SMS";

        StringBuilder sb = new StringBuilder();
        long at = parts[0].getTimestampMillis();
        for (SmsMessage m : parts) {
            if (m == null) continue;
            String body = m.getMessageBody();
            if (body != null) sb.append(body);
        }
        String body = sb.toString().trim();
        if (body.isEmpty()) return;
        if (at <= 0) at = System.currentTimeMillis();

        String whole = sender + " " + body;
        // An SMS is like an app not on the watch list: kept only when it says
        // outright that money moved.
        if (!PayWatchService.looksLikePayment(whole, true)) return;

        JSONObject kept = PayInbox.add(context, "sms", sender, body, at);
        if (kept == null) return;

        DockInPlugin.deliver(kept);
        PayNotifier.ask(context, PayInbox.redact(whole), at, "sms");
        PayGuardService.start(context);
    }
}
