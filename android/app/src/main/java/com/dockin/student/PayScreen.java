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
            "\\b(payment|transaction|transfer|money sent|paid|sent)\\b[^|]{0,25}?\\b(successful(ly)?|success|completed?|done|confirmed)\\b"
                    + "|\\bsuccessfully (paid|sent|transferred)\\b|\\bpaid successfully\\b|\\bsent successfully\\b"
                    + "|\\byou(?:'ve| have)? (paid|sent)\\b|\\b(paid|sent)!",
            Pattern.CASE_INSENSITIVE);
    /** Not a finished spend of yours: failed, or still going. */
    private static final Pattern NOT = Pattern.compile(
            "\\b(failed|failure|unsuccessful|declined|cancell?ed|processing|in progress|awaiting|payment pending|transaction pending"
                    + "|requested|request money|collect request|recharge plans)\\b",
            Pattern.CASE_INSENSITIVE);
    /**
     * Money coming in. Refused only when nothing says outright that you paid:
     * a success screen may well add "Rahul received your payment".
     */
    private static final Pattern IN = Pattern.compile("\\b(received|credited|you got|got money)\\b(?! your payment)", Pattern.CASE_INSENSITIVE);
    /** Money in, said outright: never your spend. */
    private static final Pattern STRONG_IN = Pattern.compile(
            "\\b(received from|you received|money received|credited to your|added to your (?:account|wallet))\\b", Pattern.CASE_INSENSITIVE);
    /** On the way to paying: the amount, Pay, or PIN screen. */
    private static final Pattern PAYING = Pattern.compile(
            "\\b(enter (?:your )?(?:upi )?pin|upi pin|enter \\d[- ]digit|proceed to pay|pay now|paying|swipe to pay|slide to pay)\\b|^pay(?: \\u20B9.*)?$",
            Pattern.CASE_INSENSITIVE);
    /** The bank's reference: "UPI Ref No. 612345678901", "UTR: …", "Transaction ID T2311…". */
    private static final Pattern REF = Pattern.compile(
            "\\b(?:ref(?:erence)?|utr|rrn|txn|transaction)\\s*(?:no\\.?|id|number)?\\s*[:#.]?\\s*([A-Z0-9]{8,})", Pattern.CASE_INSENSITIVE);
    /** A line that by itself says the money went: "Paid to Rahul", "₹250 paid", "Money sent". */
    private static final Pattern PAID_LINE = Pattern.compile(
            "^(?:you )?(paid|sent|money sent|amount paid|payment done)!?( to\\b.*)?$|^(?:\u20B9|rs\\.?)\\s*[0-9][0-9,.]*\\s+(paid|sent)\\b|^(paid|sent)\\s+(?:\u20B9|rs\\.?)\\s*[0-9]",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern AMOUNT = Pattern.compile(
            "(?:₹|\\brs\\.?|\\binr)\\s*([0-9][0-9,]*(?:\\.[0-9]{1,2})?)", Pattern.CASE_INSENSITIVE);
    private static final Pattern BARE = Pattern.compile("^([0-9][0-9,]*(?:\\.[0-9]{1,2})?)$");
    private static final Pattern TO_LABEL = Pattern.compile(
            "^(?:paid|sent|payment|money sent|paid successfully|sent successfully|transferred)?\\s*to:?$", Pattern.CASE_INSENSITIVE);
    private static final Pattern TO_INLINE = Pattern.compile(
            "(?:paid|sent|transferred)(?: successfully)?(?:\\s+(?:\u20B9|rs\\.?)\\s*[0-9][0-9,.]*)? to:?\\s+(.+)$|^to:?\\s+(.+)$", Pattern.CASE_INSENSITIVE);
    private static final Pattern TIME = Pattern.compile("\\b(\\d{1,2}):(\\d{2})\\s*(am|pm)?\\b", Pattern.CASE_INSENSITIVE);
    private static final Pattern DATE = Pattern.compile(
            "\\b(\\d{1,2})(?:st|nd|rd|th)?[ -](jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\\b", Pattern.CASE_INSENSITIVE);
    private static final String MONTHS = "janfebmaraprmayjunjulaugsepoctnovdec";
    private static final Pattern JUNK_NAME = Pattern.compile(
            "(?i).*\\b(upi|transaction|ref|id|bank|account|a/c|xx|share|done|view|details|split|balance|cashback|reward|rewards|paid|payment|successful|debited|from)\\b.*");

    private static final Pattern PAYISH = Pattern.compile("\\b(success|successful|successfully|paid|sent|debited|completed)\\b", Pattern.CASE_INSENSITIVE);

    /** Worth a line in the log when not read: says paid/successful and shows a number. */
    static boolean looksLikePayment(List<String> texts) {
        String all = String.join(" | ", texts);
        return PAYISH.matcher(all).find() && all.matches("(?s).*\\d.*") && all.length() < 6000;
    }

    /** Still says paid/successful somewhere: the success screen, maybe mid-redraw. */
    static boolean successish(List<String> texts) {
        String all = String.join(" | ", texts);
        if (SUCCESS.matcher(all).find()) return true;
        for (String x : texts) if (x != null && PAID_LINE.matcher(x.trim()).find()) return true;
        return false;
    }

    /** An amount, Pay or PIN screen: whatever success screen comes next is a new payment. */
    static boolean paying(List<String> texts) {
        for (String x : texts) if (x != null && PAYING.matcher(x.trim()).find()) return true;
        return false;
    }

    /** The bank's reference on the screen, or null. */
    static String ref(List<String> texts) {
        Matcher m = REF.matcher(String.join(" | ", texts));
        while (m.find()) {
            String r = m.group(1);
            if (r.matches(".*\\d.*") && r.matches(".*\\d{4,}.*")) return r.toUpperCase(Locale.ROOT);
        }
        return null;
    }

    /** The spend on this screen, or null when it is not a fresh success screen. */
    static PayNotifier.Spend read(List<String> texts, long now) {
        List<String> t = new ArrayList<>();
        for (String s : texts) {
            if (s == null) continue;
            String x = s.replace(' ', ' ').replaceAll("\\s+", " ").trim();
            if (!x.isEmpty() && x.length() <= 200) t.add(x);
        }
        String all = String.join(" | ", t);
        if (NOT.matcher(all).find()) return null;
        boolean said = SUCCESS.matcher(all).find();
        if (STRONG_IN.matcher(all).find() || (!said && IN.matcher(all).find())) return null;
        if (!said) {
            // GPay and others: no "successful", just a line saying it was paid.
            for (String x : t) if (PAID_LINE.matcher(x).find()) { said = true; break; }
        }
        if (!said) return null;
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

    /** Words for people, not an app's own code: no snake_case, camelCase or "…clicked". */
    private static final Pattern CODE = Pattern.compile(
            "(?i).*(_|\\b(clicked|click|tap|tapped|button|btn|icon|img|image|logo|cross|close|field|toggle|v\\d+|null|undefined)\\b).*");
    private static final Pattern CAMEL = Pattern.compile(".*[a-z][A-Z][a-z].*");

    static boolean human(String s) {
        if (s == null || s.trim().isEmpty()) return false;
        String x = s.trim();
        return !CODE.matcher(x).matches() && !(CAMEL.matcher(x).matches() && !x.contains(" "));
    }

    private static String name(String raw) {
        if (raw == null || !human(raw) || AMOUNT.matcher(raw).find() || BARE.matcher(raw).matches()) return null;
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
