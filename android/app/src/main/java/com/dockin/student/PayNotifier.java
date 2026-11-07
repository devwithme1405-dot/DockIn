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

    private static final Pattern DEBIT = Pattern.compile(
            "(?i)\\b(paid|debited|debit|sent|spent|withdrawn|deducted|payment of|transferred)\\b");
    private static final Pattern CREDIT = Pattern.compile(
            "(?i)\\b(credited|received|refund(?:ed)?|cashback|added to)\\b");
    private static final Pattern NOISE = Pattern.compile(
            "(?i)\\b(otp|one[- ]time|code|balance is|avl bal|available balance|due|reminder|offer|cashback up to|win|request(?:ed|s)? (?:money|payment)|will be|failed|declined|requesting)\\b");
    private static final Pattern AMOUNT = Pattern.compile(
            "(?i)(?:\u20B9|rs\\.?|inr)\\s*([0-9][0-9,]*(?:\\.[0-9]{1,2})?)|([0-9][0-9,]*(?:\\.[0-9]{1,2})?)\\s*(?:\u20B9|rupees)");
    private static final Pattern TO = Pattern.compile(
            "(?i)\\b(?:to|towards|at|in favour of)\\s+(?:vpa\\s+|upi/|upi id\\s+)?([^.,;\\n]{2,60})");
    private static final Pattern CLEAN_TAIL = Pattern.compile(
            "(?i)\\s+(?:on|using|via|from|through|at|by|ref|upi ref|txn|utr|a/c|account|bank|successfully|success|is successful|has been|dated)\\b.*$");

    /** The same payment from the UPI app and the bank, seconds apart, is one prompt. */
    private static final long TWIN_WINDOW_MS = 150_000;

    private PayNotifier() {}

    /** A spend read out of one notification. */
    static final class Spend {
        final double amount;
        final String merchant;

        Spend(double amount, String merchant) {
            this.amount = amount;
            this.merchant = merchant;
        }
    }

    /** Money that left, or null for anything else: credits, OTPs, offers, failures. */
    static Spend read(String text) {
        if (text == null) return null;
        if (NOISE.matcher(text).find()) return null;
        if (!DEBIT.matcher(text).find()) return null;
        if (CREDIT.matcher(text).find()) return null;

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
        return new Spend(amount, merchantOf(text));
    }

    /** Reads one redacted notification and asks about it if it is a spend. */
    static void ask(Context c, String text, long at) {
        Spend s = read(text);
        if (s == null) return;
        double amount = s.amount;
        String merchant = s.merchant;

        SharedPreferences p = c.getApplicationContext().getSharedPreferences("dockin-pay", Context.MODE_PRIVATE);
        double lastAmount = Double.longBitsToDouble(p.getLong("askAmount", 0));
        long lastAt = p.getLong("askAt", 0);
        int lastId = p.getInt("askId", 0);
        String lastMerchant = p.getString("askMerchant", null);

        int id;
        if (lastId != 0 && lastAmount == amount && Math.abs(at - lastAt) <= TWIN_WINDOW_MS) {
            // The twin: update the prompt already showing rather than add a second.
            id = lastId;
            merchant = richer(lastMerchant, merchant);
        } else {
            id = 4000 + (int) ((at / 1000) % 100_000);
        }
        p.edit()
                .putLong("askAmount", Double.doubleToLongBits(amount))
                .putLong("askAt", at)
                .putInt("askId", id)
                .putString("askMerchant", merchant)
                .apply();

        post(c, id, amount, merchant, at);
    }

    static void post(Context c, int id, double amount, String merchant, long at) {
        NotificationManagerCompat nm = NotificationManagerCompat.from(c);
        if (!nm.areNotificationsEnabled()) return;
        ensureChannel(c);

        String money = rupees(amount);
        String title = merchant != null ? "Spent " + money + " at " + merchant : "Spent " + money;

        Intent open = new Intent(c, MainActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP)
                .putExtra(MainActivity.EXTRA_OPEN, "/money");
        PendingIntent tap = PendingIntent.getActivity(
                c, id, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        NotificationCompat.Builder b = new NotificationCompat.Builder(c, CHANNEL)
                .setSmallIcon(R.drawable.ic_stat_dockin)
                .setColor(0xFF1F5FD6)
                .setContentTitle(title)
                .setContentText("What was it for? Tap to place it.")
                .setAutoCancel(true)
                .setContentIntent(tap)
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
        String name = CLEAN_TAIL.matcher(to.group(1)).replaceAll("").trim();
        int at = name.indexOf('@');
        if (at > 0) name = name.substring(0, at);
        name = name.replaceAll("[^\\p{L}\\p{N}&'/ .-]+", " ").replaceAll("\\s{2,}", " ").trim();
        if (name.length() < 2 || !name.matches(".*\\p{L}.*")) return null;
        if (name.length() > 40) name = name.substring(0, 40).trim();
        return title(name);
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
