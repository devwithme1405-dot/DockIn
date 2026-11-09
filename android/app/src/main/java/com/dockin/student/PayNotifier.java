package com.dockin.student;

import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import androidx.core.app.NotificationChannelCompat;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * "Spent ₹250 at Zomato — what was it for?", right after the payment.
 *
 * The moment you pay is the only moment you remember what it was for; by the
 * evening a list of ₹60s is a guessing game. So the phone asks straight away,
 * and a tap opens the Money screen with the payment waiting at the top.
 *
 * The full reading still happens in the app (where a wrong rule is fixed by a
 * deploy). This only has to be right about one thing: that money left. When in
 * doubt it stays quiet — a missed prompt costs nothing, the payment is still in
 * the tray; a prompt for a refund or an OTP would teach you to ignore them.
 */
final class PayNotifier {

    /** A fresh channel id: an existing channel's importance cannot be raised later. */
    static final String CHANNEL = "payments-v2";

    /** Money leaving, said outright. "Rahul paid you" is not one of these; see TO_YOU. */
    private static final Pattern DEBIT = Pattern.compile(
            "(?i)\\b(paid|debited|debit|sent|spent|withdrawn|deducted)\\b");
    /** Words used both ways ("payment of ₹500 received"); they count as a spend only with nothing saying money came in. */
    private static final Pattern NEUTRAL = Pattern.compile("(?i)\\b(payment of|transferred)\\b");
    private static final Pattern CREDIT = Pattern.compile(
            "(?i)\\b(credited|received|refund(?:ed)?|reversed|reversal|cashback|added to|paid you|sent you)\\b");
    /** The payee's side of your own spend: "; KATHI credited", "credited to rahul@okaxis". */
    private static final Pattern PAYEE_CREDITED = Pattern.compile(
            "(?i)[;.]\\s*(?![0-9])([^;.\\n]{2,60}?)\\s+credited\\b(?!\\s+to\\s+(?:your|ur|a/c|acct?|account)\\b)");
    private static final Pattern CREDITED_TO_OTHER = Pattern.compile(
            "(?i)\\bcredited to\\s+(?:vpa\\s+|beneficiary\\s+)?(?!(?:your|ur|a/c|acct?|account)\\b)([^.,;\\n]{2,60})");
    private static final Pattern TO_YOU = Pattern.compile("(?i)\\b(?:paid|sent) you\\b");
    private static final Pattern NOISE = Pattern.compile(
            "(?i)\\b(otp|one[- ]time|code|balance is|avl bal|available balance|due|reminder|offer|cashback up to|win|request(?:ed|s)? (?:money|payment)|will be|failed|declined|requesting|pending|scheduled|upcoming)\\b");
    private static final Pattern AMOUNT = Pattern.compile(
            "(?i)(?:\u20B9|rs\\.?|inr)\\s*([0-9][0-9,]*(?:\\.[0-9]{1,2})?)|([0-9][0-9,]*(?:\\.[0-9]{1,2})?)\\s*(?:\u20B9|rupees)");
    /** "debited by 60.0": no rupee sign, so only a number right after a verb. */
    private static final Pattern VERB_AMOUNT = Pattern.compile(
            "(?i)\\b(?:debited|credited|withdrawn|deducted|spent)\\s+(?:by|for|with|of)\\s+([0-9][0-9,]*(?:\\.[0-9]{1,2})?)(?![0-9/-])");
    /** "UPI/P2M/<ref>/KATHI": the payee is the last part of the path. */
    private static final Pattern UPI_PATH = Pattern.compile(
            "(?i)\\bUPI/(?:P2[AMP]/)?(?:(?:number|[0-9]+)/)?([A-Za-z][A-Za-z0-9 &.'-]{1,40}?)(?=\\s+(?:not you|on|ref|info)\\b|[/.]|\\s*$)");
    private static final Pattern ATM = Pattern.compile("(?i)\\batm\\b");
    private static final Pattern WITHDRAW = Pattern.compile("(?i)\\bwithdraw");
    private static final Pattern TO = Pattern.compile(
            "(?i)\\b(?:to|towards|at|in favour of)\\s+(?:vpa\\s+|upi/|upi id\\s+)?([^.,;\\n]{2,60})");
    private static final Pattern FROM = Pattern.compile(
            "(?i)\\b(?:from|by)\\s+(?:vpa\\s+|upi/|upi id\\s+)?([^.,;\\n]{2,60})");
    private static final Pattern NAMED_PAYER = Pattern.compile(
            "((?:\\p{Lu}[\\p{L}.']*\\s?){1,3})\\s+(?:paid|sent) you\\b");
    private static final Pattern NOT_A_NAME = Pattern.compile(
            "(?i)^(?:upi|neft|imps|rtgs|ach|nach|account|your account|your a/c|bank|a/c|cash|cash deposit|atm|card|number)$");
    private static final Pattern CLEAN_TAIL = Pattern.compile(
            "(?i)\\s+(?:on|using|via|from|through|at|by|ref|refno|ref no|rrn|upi ref|txn|utr|a/c|account|bank|successfully|success|is successful|has been|dated|to|not you|if not|for)\\b.*$");

    /** The same payment from the UPI app and the bank, seconds apart, is one prompt. */
    private static final long TWIN_WINDOW_MS = 150_000;

    private PayNotifier() {}

    /** Money read out of one notification: a spend, or (with {@code in}) money that came in. */
    static final class Spend {
        final double amount;
        final String merchant;
        final boolean in;

        Spend(double amount, String merchant, boolean in) {
            this.amount = amount;
            this.merchant = merchant;
            this.in = in;
        }

        /** For money in, the merchant is the person who sent it. */
        String from() {
            return merchant;
        }
    }

    /** Money that left, or null for anything else: credits, OTPs, offers, failures. */
    static Spend read(String text) {
        Spend s = readAny(text);
        return s == null || s.in ? null : s;
    }

    /** Money that came in, or null. */
    static Spend readCredit(String text) {
        Spend s = readAny(text);
        return s == null || !s.in ? null : s;
    }

    /**
     * Which way the money went, decided only when the message is clear about
     * it. A message that says both ("₹500 credited, ₹60 debited") is neither.
     */
    static Spend readAny(String text) {
        if (text == null) return null;
        if (NOISE.matcher(text).find()) return null;
        String mine = TO_YOU.matcher(text).replaceAll(" ");
        // A spend that also says the payee was credited is still only a spend.
        String payee = null;
        String creditText = text;
        if (DEBIT.matcher(mine).find()) {
            Matcher side = CREDITED_TO_OTHER.matcher(text);
            boolean found = side.find();
            if (!found) {
                side = PAYEE_CREDITED.matcher(text);
                found = side.find();
            }
            if (found && !DEBIT.matcher(side.group(1)).find()) {
                String name = clean(CLEAN_TAIL.matcher(side.group(1)).replaceAll(""));
                if (name != null) {
                    payee = title(name);
                    creditText = text.substring(0, side.start()) + " " + text.substring(side.end());
                }
            }
        }
        boolean credit = CREDIT.matcher(creditText).find();
        boolean debit = DEBIT.matcher(mine).find() || (!credit && NEUTRAL.matcher(mine).find());
        if (credit == debit) return null;

        Matcher m = AMOUNT.matcher(text);
        String raw;
        if (m.find()) {
            raw = m.group(1) != null ? m.group(1) : m.group(2);
        } else {
            Matcher v = VERB_AMOUNT.matcher(text);
            if (!v.find()) return null;
            raw = v.group(1);
        }
        double amount;
        try {
            amount = Double.parseDouble(raw.replace(",", ""));
        } catch (NumberFormatException e) {
            return null;
        }
        if (amount <= 0 || amount > 1_000_000) return null;
        return new Spend(amount, credit ? payerOf(text) : (payee != null ? payee : merchantOf(text)), credit);
    }

    /** "Slice", "PhonePe", "Bank SMS" — where the payment was seen, in words. */
    static String sourceName(String app) {
        if (app == null) return null;
        switch (app) {
            case "com.google.android.apps.nbu.paisa.user": return "Google Pay";
            case "com.phonepe.app": return "PhonePe";
            case "net.one97.paytm": return "Paytm";
            case "in.org.npci.upiapp": return "BHIM";
            case "indwin.c3.shareapp": return "Slice";
            case "com.dreamplug.androidapp": return "CRED";
            case "com.mobikwik_new": return "MobiKwik";
            case "com.amazon.mShop.android.shopping":
            case "in.amazon.mShop.android.shopping": return "Amazon Pay";
            case "money.jupiter": return "Jupiter";
            case "com.epifi.paisa": return "Fi";
            case "com.naviapp": return "Navi";
            case "money.super.payments": return "super.money";
            case "com.fampay.in": return "FamPay";
            case "com.freecharge.android": return "Freecharge";
            default:
                return app.contains(".") ? "Bank SMS" : "Bank SMS";
        }
    }

    /** Reads one redacted notification and asks about it if money moved. */
    static void ask(Context c, String text, long at) {
        ask(c, text, at, null);
    }

    static void ask(Context c, String text, long at, String app) {
        ask(c, text, at, app, "note", null);
    }

    static void ask(Context c, String text, long at, String app, String via, String inboxId) {
        Spend s = readAny(text);
        if (s == null) return;
        ask(c, s, at, app, via, inboxId);
    }

    static void ask(Context c, Spend s, long at, String app) {
        ask(c, s, at, app, "screen", null);
    }

    /**
     * One payment, however it was found: the app's success screen or a
     * notification. The same payment seen by a second channel (PhonePe's screen,
     * then PhonePe's or the bank's notification) updates the alert already
     * showing. The same channel reporting the same amount again is a second
     * payment — two ₹50 chais back to back are two alerts.
     */
    static void ask(Context c, Spend s, long at, String app, String via, String inboxId) {
        double amount = s.amount;
        String merchant = s.merchant;
        String channel = (app == null ? "?" : app) + "|" + via;

        SharedPreferences p = c.getApplicationContext().getSharedPreferences("dockin-pay", Context.MODE_PRIVATE);
        JSONArray recent;
        try {
            recent = new JSONArray(p.getString("recentAsks", "[]"));
        } catch (JSONException e) {
            recent = new JSONArray();
        }
        long now = System.currentTimeMillis();
        JSONObject twinOf = null;
        for (int i = 0; i < recent.length(); i++) {
            JSONObject r = recent.optJSONObject(i);
            if (r == null) continue;
            if (r.optDouble("amount") != amount || r.optBoolean("in") != s.in) continue;
            if (Math.abs(at - r.optLong("at")) > TWIN_WINDOW_MS) continue;
            JSONArray ch = r.optJSONArray("channels");
            boolean seen = false;
            for (int k = 0; ch != null && k < ch.length(); k++) if (channel.equals(ch.optString(k))) seen = true;
            if (seen) continue;
            twinOf = r;
            break;
        }

        int id;
        boolean twin = twinOf != null;
        try {
            if (twin) {
                id = twinOf.optInt("id");
                merchant = richer(twinOf.optString("merchant", null), merchant);
                at = twinOf.optLong("at");
                twinOf.put("merchant", merchant == null ? JSONObject.NULL : merchant);
                twinOf.getJSONArray("channels").put(channel);
            } else {
                int next = p.getInt("nextId", 4000);
                id = next;
                p.edit().putInt("nextId", next >= 99_000 ? 4000 : next + 1).apply();
                JSONObject r = new JSONObject();
                r.put("id", id);
                r.put("amount", amount);
                r.put("in", s.in);
                r.put("at", at);
                r.put("merchant", merchant == null ? JSONObject.NULL : merchant);
                r.put("channels", new JSONArray().put(channel));
                recent.put(r);
            }
        } catch (JSONException e) {
            return;
        }
        // Only the last few minutes matter.
        JSONArray kept = new JSONArray();
        for (int i = 0; i < recent.length(); i++) {
            JSONObject r = recent.optJSONObject(i);
            if (r != null && now - r.optLong("at") <= 10 * 60_000L) kept.put(r);
        }
        p.edit().putString("recentAsks", kept.toString()).apply();
        PayInbox.tag(c, inboxId, id);

        if (s.in) {
            postIn(c, id, amount, merchant, at);
        } else {
            PayLog.add(c, twin ? "twin" : "caught", app, rupees(amount) + (merchant != null ? " → " + merchant : ""),
                    Math.max(0, now - at));
            // Already answered (say "For me" on the first copy): the twin stays quiet.
            if (twin && PayInbox.answered(c, id, amount, at)) return;
            post(c, id, amount, merchant, sourceName(app), at);
        }
    }

    /** "Spent ₹250 at Zomato", with a button for each answer that needs one more tap. */
    static void post(Context c, int id, double amount, String merchant, long at) {
        post(c, id, amount, merchant, null, at);
    }

    static void post(Context c, int id, double amount, String merchant, String source, long at) {
        NotificationManagerCompat nm = NotificationManagerCompat.from(c);
        if (!nm.areNotificationsEnabled()) return;
        ensureChannel(c);

        String money = rupees(amount);
        String title = merchant != null ? money + " paid to " + merchant : money + " paid";
        String via = source != null ? "via " + source + " · " : "";
        NotificationCompat.Builder b = new NotificationCompat.Builder(c, CHANNEL)
                .setSmallIcon(R.drawable.ic_stat_dockin)
                .setColor(0xFF6A3DE8)
                .setContentTitle(title)
                .setContentText(via + "Whose was it?")
                .setStyle(new NotificationCompat.BigTextStyle().bigText(
                        title + (source != null ? " via " + source : "") + ".\nWhose was it? For me saves it in one tap."))
                .setAutoCancel(true)
                .setOnlyAlertOnce(true)
                .setContentIntent(PayAskActivity.pending(c, id * 10, amount, merchant, source, at, id, null))
                .addAction(0, "For me", PayActionReceiver.forMe(c, id * 10 + 1, amount, merchant, at, id))
                .addAction(0, "Split / someone else", PayAskActivity.pending(c, id * 10 + 2, amount, merchant, source, at, id, "split"))
                .setCategory(NotificationCompat.CATEGORY_REMINDER)
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setDefaults(NotificationCompat.DEFAULT_ALL)
                .setWhen(at)
                .setShowWhen(true);
        try {
            nm.notify(id, b.build());
        } catch (SecurityException e) {
            // Notifications switched off between the check and now.
        }
    }

    /** "Got ₹250 from Rahul": often money someone owed, which DockIn can tick off. */
    static void postIn(Context c, int id, double amount, String from, long at) {
        NotificationManagerCompat nm = NotificationManagerCompat.from(c);
        if (!nm.areNotificationsEnabled()) return;
        ensureChannel(c);

        String money = rupees(amount);
        String title = from != null ? "Got " + money + " from " + from : "Got " + money;
        String place = "/money?got=" + amountParam(amount) + "&at=" + at;
        NotificationCompat.Builder b = new NotificationCompat.Builder(c, CHANNEL)
                .setSmallIcon(R.drawable.ic_stat_dockin)
                .setColor(0xFF6A3DE8)
                .setContentTitle(title)
                .setContentText("Money someone owed you? Tap to tick it off.")
                .setAutoCancel(true)
                .setContentIntent(open(c, id * 10, place))
                .setCategory(NotificationCompat.CATEGORY_REMINDER)
                .setPriority(NotificationCompat.PRIORITY_DEFAULT)
                .setWhen(at)
                .setShowWhen(true);
        try {
            nm.notify(id, b.build());
        } catch (SecurityException e) {
            // Notifications switched off between the check and now.
        }
    }

    private static PendingIntent open(Context c, int code, String path) {
        Intent i = new Intent(c, MainActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP)
                .putExtra(MainActivity.EXTRA_OPEN, path);
        return PendingIntent.getActivity(c, code, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static String amountParam(double amount) {
        if (amount == Math.rint(amount)) return String.valueOf((long) amount);
        return String.format(Locale.US, "%.2f", amount);
    }

    static void ensureChannel(Context c) {
        NotificationManagerCompat.from(c).createNotificationChannel(
                new NotificationChannelCompat.Builder(CHANNEL, NotificationManagerCompat.IMPORTANCE_HIGH)
                        .setName(c.getString(R.string.channel_payments))
                        .setDescription(c.getString(R.string.channel_payments_about))
                        .build());
    }

    static String rupees(double amount) {
        if (amount == Math.rint(amount)) return String.format(Locale.US, "\u20B9%,d", (long) amount);
        return String.format(Locale.US, "\u20B9%,.2f", amount);
    }

    /** "… to VPA kathi@okaxis on 03-10-26. Ref 1234" → "Kathi". */
    static String merchantOf(String text) {
        if (ATM.matcher(text).find() && WITHDRAW.matcher(text).find()) return "ATM withdrawal";
        Matcher path = UPI_PATH.matcher(text);
        if (path.find()) {
            String n = clean(path.group(1));
            if (n != null) return title(n);
        }
        Matcher to = TO.matcher(text);
        if (!to.find()) return null;
        String name = clean(CLEAN_TAIL.matcher(to.group(1)).replaceAll(""));
        return name == null ? null : title(name);
    }

    /** "Rahul paid you", "… from VPA rahul@okicici", "credited by Rahul Kumar" → the person. */
    static String payerOf(String text) {
        Matcher named = NAMED_PAYER.matcher(text);
        if (named.find()) {
            String n = clean(named.group(1));
            if (n != null) return title(n);
        }
        // "by UPI from rahul@okicici": the first "by" names no one, so keep looking
        // from just after it rather than after the whole (greedy) capture.
        Matcher from = FROM.matcher(text);
        int pos = 0;
        while (pos < text.length() && from.find(pos)) {
            String n = clean(CLEAN_TAIL.matcher(from.group(1)).replaceAll(""));
            if (n != null) return title(n);
            pos = from.start(1);
        }
        return null;
    }

    /** A usable name out of a raw capture, or null for a handle's plumbing, a bank word or a number. */
    static String clean(String raw) {
        String name = raw.trim();
        int at = name.indexOf('@');
        if (at > 0) name = name.substring(0, at);
        name = name.replaceAll("[^\\p{L}\\p{N}&'/ .-]+", " ").replaceAll("\\s{2,}", " ").trim();
        if (name.length() < 2 || !name.matches(".*\\p{L}.*")) return null;
        if (NOT_A_NAME.matcher(name).matches()) return null;
        if (name.length() > 40) name = name.substring(0, 40).trim();
        return name;
    }

    /** SHOUTED merchant names are the norm on UPI; nobody wants to read those. */
    private static final java.util.Set<String> SMALL_WORDS = new java.util.HashSet<>(java.util.Arrays.asList(
            "THE", "AND", "FOR", "OF", "BY", "AN", "IN", "AT", "ON", "TO", "A", "MR", "MRS", "MS", "DR"));

    static String title(String s) {
        if (!s.equals(s.toUpperCase(Locale.ROOT)) && !s.equals(s.toLowerCase(Locale.ROOT))) return s;
        StringBuilder out = new StringBuilder(s.length());
        for (String w : s.split("(?<=\\s)|(?=\\s)")) {
            boolean upper = w.equals(w.toUpperCase(Locale.ROOT));
            boolean initials = upper && (
                    (w.length() <= 5 && w.matches(".*\\p{N}.*") && w.matches(".*\\p{L}.*"))
                    || (w.length() <= 3 && w.matches("\\p{L}+") && !SMALL_WORDS.contains(w)));
            if (initials) {
                out.append(w);
                continue;
            }
            boolean start = true;
            for (char ch : w.toLowerCase(Locale.ROOT).toCharArray()) {
                out.append(start ? Character.toUpperCase(ch) : ch);
                start = !Character.isLetterOrDigit(ch) && ch != '\'';
            }
        }
        return out.toString();
    }

    /** Of two names for one payment, the one that says more. */
    private static String richer(String a, String b) {
        if (a == null) return b;
        if (b == null) return a;
        return score(b) > score(a) ? b : a;
    }

    private static int score(String s) {
        return s.trim().split("\\s+").length * 100 + s.length();
    }
}
