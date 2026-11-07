package com.dockin.student;
/**
 * The phone's copy of the debit rules, checked against the same messages the
 * web app's tests use. If the two ever disagree, the prompt after a payment
 * would ask about a refund or stay quiet about a real spend.
 */
public class PayChecks {
  static int fails = 0;
  static void expect(String text, Double amount, String merchant) {
    PayNotifier.Spend s = PayNotifier.read(PayInbox.redact(text));
    String got = s == null ? "null" : s.amount + "|" + s.merchant;
    String want = amount == null ? "null" : amount + "|" + merchant;
    boolean ok = got.equals(want);
    if (!ok) fails++;
    if (!ok) System.out.println("FAIL " + text + "  ->  " + got + "   want " + want);
  }
  static void expectIn(String text, Double amount, String from) {
    PayNotifier.Spend s = PayNotifier.readCredit(PayInbox.redact(text));
    String got = s == null ? "null" : s.amount + "|" + s.from();
    String want = amount == null ? "null" : amount + "|" + from;
    boolean ok = got.equals(want);
    if (!ok) fails++;
    if (!ok) System.out.println("FAIL in " + text + "  ->  " + got + "   want " + want);
  }
  public static void main(String[] a) {
    expect("You paid \u20B960.00 to 24/7 Kathi", 60.0, "24/7 Kathi");
    expect("Payment successful \u20B9149 paid to Monginis", 149.0, "Monginis");
    expect("Paytm Paid Rs.40 to Tuck Shop successfully", 40.0, "Tuck Shop");
    expect("HDFCBK Rs.1,250.50 debited from A/c XXXX4521 on 03-10-26 to VPA subway@okicici. Ref 553201", 1250.5, "Subway");
    expect("You paid \u20B990 to SOUTHERN STORIES", 90.0, "Southern Stories");
    expect("You paid \u20B990 to GreenOX", 90.0, "GreenOX");
    expect("SBIINB Rs.5000 credited to your account", null, null);
    expect("BANK Rs.500 credited and Rs.60 debited from account", null, null);
    // money coming in: the same messages the web app's tests read
    expectIn("\u20B9250 received Rahul paid you \u20B9250", 250.0, "Rahul");
    expectIn("Rahul Kumar sent you \u20B9500 Received in your bank account", 500.0, "Rahul Kumar");
    expectIn("HDFCBK Rs.300 credited to A/c XX4521 by UPI from VPA priya.s@okicici on 03-10-26", 300.0, "Priya");
    expectIn("Received You received \u20B9120 from AMAN GUPTA", 120.0, "Aman Gupta");
    expectIn("SBIINB Rs.5000 credited to your account", 5000.0, null);
    expectIn("BANK Rs.500 credited and Rs.60 debited from account", null, null);
    expectIn("You paid \u20B960.00 to 24/7 Kathi", null, null);
    expect("HDFCBK OTP 452109 for a payment of Rs.60. Do not share.", null, null);
    expect("ICICI Avl Balance in A/c XX4521 is Rs.4,200", null, null);
    expect("Offer Get cashback up to \u20B9100 when you pay", null, null);
    expect("Rahul is requesting \u20B9200 Pay now", null, null);
    expect("Payment failed \u20B960 to 24/7 Kathi could not be paid", null, null);
    expect("You paid to 24/7 Kathi", null, null);
    expect("BANK Rs.99999999 debited to VPA x@y", null, null);
    expect("You paid \u20B960.00 Payment successful", 60.0, null);
    expect("BANK Rs.60 debited to 553201", 60.0, null);
    expect("Rahul sent you \u20B9500 Received in your bank account", null, null);
    if (!PayNotifier.rupees(1250).equals("\u20B91,250") || !PayNotifier.rupees(60.5).equals("\u20B960.50")) { System.out.println("FAIL rupees"); fails++; }
    System.exit(fails == 0 ? 0 : 1);
  }
}
