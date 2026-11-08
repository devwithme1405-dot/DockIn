package com.dockin.student;

import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;

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

    static final String CHANNEL = "payments";

    /** Money leaving, said outright. "Rahul paid you" is not one of these; see TO_YOU. */
    private static final Pattern DEBIT = Pattern.compile(
            "(?i)\\b(paid|debited|debit|sent|spent|withdrawn|deducted)\\b");
    /** Words used both ways ("payment of ₹500 received"); they count as a spend only with nothing saying money came in. */
    private static final Pattern NEUTRAL = Pattern.compile("(?i)\\b(payment of|transferred)\\b");
    private static final Pattern CREDIT = Pattern.compile(
            "(?i)\\b(credited|received|refund(?:ed)?|cashback|added to|paid you|sent you)\\b");
    private static final Pattern TO_YOU = Pattern.compile("(?i)\\b(?:paid|sent) you\\b");
    private static final Pattern NOISE = Pattern.compile(
            "(?i)\\b(otp|one[- ]time|code|balance is|avl bal|available balance|due|reminder|offer|cashback up to|win|request(?:ed|s)? (?:money|payment)|will be|failed|declined|requesting)\\b");
    private static final Pattern AMOUNT = Pattern.compile(
            "(?i)(?:\u20B9|rs\\.?|inr)\\s*([0-9][0-9,]*(?:\\.[0-9]{1,2})?)|([0-9][0-9,]*(?:\\.[0-9]{1,2})?)\\s*(?:\u20B9|rupees)");
    private static final Pattern TO = Pattern.compile(
            "(?i)\\b(?:to|towards|at|in favour of)\\s+(?:vpa\\s+|upi/|upi id\\s+)?([^.,;\\n]{2,60})");
    private static final Pattern FROM = Pattern.compile(
            "(?i)\\b(?:from|by)\\s+(?:vpa\\s+|upi/|upi id\\s+)?([^.,;\\n]{2,60})");
    private static final Pattern NAMED_PAYER = Pattern.compile(
            "((?:\\p{Lu}[\\p{L}.']*\\s?){1,3})\\s+(?:paid|sent) you\\b");
    private static final Pattern NOT_A_NAME = Pattern.compile(
            "(?i)^(?:upi|neft|imps|rtgs|ach|nach|account|your account|your a/c|bank|a/c|cash|cash deposit|atm|card|number)$");
    private static final Pattern CLEAN_TAIL = Pattern.compile(
            "(?i)\\s+(?:on|using|via|from|through|at|by|ref|upi ref|txn|utr|a/c|account|bank|successfully|success|is successful|has been|dated|to)\\b.*$");

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
        boolean credit = CREDIT.matcher(text).find();
        boolean debit = DEBIT.matcher(mine).find() || (!credit && NEUTRAL.matcher(mine).find());
        if (credit == debit) return null;

        Matcher m = AMOUNT.matcher(text);
        if (!m.find()) return null;
        String raw = m.group(1) != null ? m.group(1) : m.group(2);
        double amount;
        try {
            amount = Double.parseDouble(raw.replace(",", ""));
        } catch (NumberFormatException e) {
            return null;
        }
        if (amount <= 0 || amount > 1_000_000) return null;
        return new Spend(amount, credit ? payerOf(text) : merchantOf(text), credit);
    }

    /** Reads one redacted notification and asks about it if money moved. */
    static void ask(Context c, String text, long at) {
        Spend s = readAny(text);
        if (s == null) return;
        double amount = s.amount;
        String merchant = s.merchant;

        SharedPreferences p = c.getApplicationContext().getSharedPreferences("dockin-pay", Context.MODE_PRIVATE);
        double lastAmount = Double.longBitsToDouble(p.getLong("askAmount", 0));
        long lastAt = p.getLong("askAt", 0);
        int lastId = p.getInt("askId", 0);
        boolean lastIn = p.getBoolean("askIn", false);
        String lastMerchant = p.getString("askMerchant", null);

        int id;
        if (lastId != 0 && lastAmount == amount && lastIn == s.in && Math.abs(at - lastAt) <= TWIN_WINDOW_MS) {
            // The twin: update the prompt already showing rather than add a second.
            id = lastId;
            merchant = richer(lastMerchant, merchant);
            at = lastAt;
        } else {
            id = 4000 + (int) ((at / 1000) % 100_000);
        }
        p.edit()
                .putLong("askAmount", Double.doubleToLongBits(amount))
                .putLong("askAt", at)
                .putInt("askId", id)
                .putBoolean("askIn", s.in)
                .putString("askMerchant", merchant)
                .apply();

        if (s.in) postIn(c, id, amount, merchant, at);
        else post(c, id, amount, merchant, at);
    }

    /** "Spent ₹250 at Zomato", with a button for each answer that needs one more tap. */
    static void post(Context c, int id, double amount, String merchant, long at) {
        NotificationManagerCompat nm = NotificationManagerCompat.from(c);
        if (!nm.areNotificationsEnabled()) return;
        ensureChannel(c);

        String money = rupees(amount);
        String title = merchant != null ? "Spent " + money + " at " + merchant : "Spent " + money;
        String place = "/money?pay=" + amountParam(amount) + "&at=" + at;

        NotificationCompat.Builder b = new NotificationCompat.Builder(c, CHANNEL)
                .setSmallIcon(R.drawable.ic_stat_dockin)
                .setColor(0xFF6A3DE8)
                .setContentTitle(title)
                .setContentText("What was it for? Tap to place it.")
                .setAutoCancel(true)
                .setContentIntent(open(c, id * 10, place))
                .addAction(0, "For me", open(c, id * 10 + 1, place + "&who=me"))
                .addAction(0, "For someone", open(c, id * 10 + 2, place + "&who=other"))
                .setCategory(NotificationCompat.CATEGORY_REMINDER)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
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
    private static String clean(String raw) {
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
    private static String title(String s) {
        if (!s.equals(s.toUpperCase(Locale.ROOT)) && !s.equals(s.toLowerCase(Locale.ROOT))) return s;
        StringBuilder out = new StringBuilder(s.length());
        boolean start = true;
        for (char ch : s.toLowerCase(Locale.ROOT).toCharArray()) {
            out.append(start ? Character.toUpperCase(ch) : ch);
            start = !Character.isLetterOrDigit(ch);
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
