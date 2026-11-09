package com.dockin.student;

import java.util.ArrayList;
import java.util.Calendar;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Reads a payment app's "Payment successful" screen, the moment it shows.
 *
 * PhonePe and Paytm often post no notification for your own payment, and the
 * bank SMS can be late or missing; the success screen is the one thing every
 * app shows. Only the texts on that screen come in, and only an amount and a
 * name go out. Pure Java, so PayChecks can test it without a phone.
 */
final class PayScreen {
    private PayScreen() {}

    /** The apps whose screens are read; the same list is in res/xml/pay_screen.xml. */
    static final String[] APPS = {
            "com.phonepe.app", "net.one97.paytm", "com.google.android.apps.nbu.paisa.user",
            "in.org.npci.upiapp", "indwin.c3.shareapp", "com.dreamplug.androidapp",
            "com.mobikwik_new", "in.amazon.mShop.android.shopping", "com.amazon.mShop.android.shopping",
            "money.jupiter", "com.epifi.paisa", "com.naviapp", "money.super.payments",
            "com.fampay.in", "com.freecharge.android", "com.myairtelapp",
            "com.sbi.lotusintouch", "com.csam.icici.bank.imobile", "com.axis.mobile",
            "com.msf.kbank.mobile", "com.enstage.wibmo.hdfc", "com.snapwork.hdfc",
    };

    static boolean watched(String pkg) {
        if (pkg == null) return false;
        for (String a : APPS) if (a.equals(pkg)) return true;
        return false;
    }

    private static final Pattern SUCCESS = Pattern.compile(
            "\\b(payment|transaction|transfer|money sent|paid|sent)\\b[^|]{0,25}?\\b(successful(ly)?|success|completed?)\\b"
                    + "|\\bsuccessfully (paid|sent|transferred)\\b|\\bpaid successfully\\b|\\bsent successfully\\b",
            Pattern.CASE_INSENSITIVE);
    /** Not a finished spend of yours: failed, still going, or money coming in. */
    private static final Pattern NOT = Pattern.compile(
            "\\b(failed|failure|unsuccessful|declined|cancell?ed|processing|in progress|awaiting|payment pending|transaction pending"
                    + "|received from|you received|money received|requested|request money|collect request|recharge plans)\\b",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern AMOUNT = Pattern.compile(
            "(?:₹|\\brs\\.?|\\binr)\\s*([0-9][0-9,]*(?:\\.[0-9]{1,2})?)", Pattern.CASE_INSENSITIVE);
    private static final Pattern BARE = Pattern.compile("^([0-9][0-9,]*(?:\\.[0-9]{1,2})?)$");
    private static final Pattern TO_LABEL = Pattern.compile(
            "^(?:paid|sent|payment|money sent|paid successfully|sent successfully|transferred)?\\s*to:?$", Pattern.CASE_INSENSITIVE);
    private static final Pattern TO_INLINE = Pattern.compile(
            "(?:paid|sent|transferred)(?: successfully)? to:?\\s+(.+)$|^to:?\\s+(.+)$", Pattern.CASE_INSENSITIVE);
    private static final Pattern TIME = Pattern.compile("\\b(\\d{1,2}):(\\d{2})\\s*(am|pm)?\\b", Pattern.CASE_INSENSITIVE);
    private static final Pattern DATE = Pattern.compile(
            "\\b(\\d{1,2})(?:st|nd|rd|th)?[ -](jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\\b", Pattern.CASE_INSENSITIVE);
    private static final String MONTHS = "janfebmaraprmayjunjulaugsepoctnovdec";
    private static final Pattern JUNK_NAME = Pattern.compile(
            "(?i).*\\b(upi|transaction|ref|id|bank|account|a/c|xx|share|done|view|details|split|balance|cashback|reward|rewards|paid|payment|successful|debited|from)\\b.*");

    /** The spend on this screen, or null when it is not a fresh success screen. */
    static PayNotifier.Spend read(List<String> texts, long now) {
        List<String> t = new ArrayList<>();
        for (String s : texts) {
            if (s == null) continue;
            String x = s.replace(' ', ' ').replaceAll("\\s+", " ").trim();
            if (!x.isEmpty() && x.length() <= 200) t.add(x);
        }
        String all = String.join(" | ", t);
        if (!SUCCESS.matcher(all).find() || NOT.matcher(all).find()) return null;
        if (!recent(all, now)) return null;

        // Amounts: "₹250", "Rs. 250", or "₹" and "250" as two texts.
        List<Double> amounts = new ArrayList<>();
        for (int i = 0; i < t.size(); i++) {
            Matcher m = AMOUNT.matcher(t.get(i));
            while (m.find()) add(amounts, m.group(1));
            if ((t.get(i).equals("₹") || t.get(i).equalsIgnoreCase("rs")) && i + 1 < t.size()) {
                Matcher b = BARE.matcher(t.get(i + 1));
                if (b.matches()) add(amounts, b.group(1));
            }
        }
        if (amounts.isEmpty()) {
            // GPay draws the big amount without a symbol.
            for (String x : t) {
                Matcher b = BARE.matcher(x);
                if (b.matches()) { add(amounts, b.group(1)); break; }
            }
        }
        // A history list has many amounts; a success screen has one (plus maybe a reward).
        List<Double> distinct = new ArrayList<>();
        for (Double a : amounts) if (!distinct.contains(a)) distinct.add(a);
        if (distinct.isEmpty() || distinct.size() > 3) return null;
        double amount = distinct.get(0);
        if (amount <= 0 || amount > 500_000) return null;

        return new PayNotifier.Spend(amount, payee(t), false);
    }

    private static void add(List<Double> out, String raw) {
        try {
            out.add(Double.parseDouble(raw.replace(",", "")));
        } catch (NumberFormatException ignored) {
            // not a number after all
        }
    }

    private static String payee(List<String> t) {
        for (int i = 0; i < t.size(); i++) {
            String x = t.get(i);
            if (TO_LABEL.matcher(x).matches()) {
                for (int j = i + 1; j < Math.min(t.size(), i + 4); j++) {
                    String n = name(t.get(j));
                    if (n != null) return n;
                }
            }
            Matcher m = TO_INLINE.matcher(x);
            if (m.find()) {
                String n = name(m.group(1) != null ? m.group(1) : m.group(2));
                if (n != null) return n;
            }
        }
        return null;
    }

    private static String name(String raw) {
        if (raw == null || AMOUNT.matcher(raw).find() || BARE.matcher(raw).matches()) return null;
        String n = PayNotifier.clean(raw);
        if (n == null || JUNK_NAME.matcher(n).matches()) return null;
        return PayNotifier.title(n);
    }

    /** An old payment opened from history says another day or a time long gone. */
    private static boolean recent(String all, long now) {
        Calendar c = Calendar.getInstance();
        c.setTimeInMillis(now);
        Matcher d = DATE.matcher(all);
        while (d.find()) {
            int day = Integer.parseInt(d.group(1));
            int month = MONTHS.indexOf(d.group(2).toLowerCase(Locale.ROOT)) / 3;
            if (day != c.get(Calendar.DAY_OF_MONTH) || month != c.get(Calendar.MONTH)) return false;
        }
        Matcher m = TIME.matcher(all);
        boolean anyTime = false, near = false;
        int nowMin = c.get(Calendar.HOUR_OF_DAY) * 60 + c.get(Calendar.MINUTE);
        while (m.find()) {
            int h = Integer.parseInt(m.group(1)), min = Integer.parseInt(m.group(2));
            if (h > 23 || min > 59) continue;
            anyTime = true;
            String ap = m.group(3);
            int[] tries = ap == null ? new int[]{h, (h % 12) + 12} : new int[]{(h % 12) + (ap.equalsIgnoreCase("pm") ? 12 : 0)};
            for (int hh : tries) if (Math.abs(hh * 60 + min - nowMin) <= 15) near = true;
        }
        return !anyTime || near;
    }
}
