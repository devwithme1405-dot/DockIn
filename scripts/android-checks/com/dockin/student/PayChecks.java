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
  static long NOW;
  static void screen(String label, Double amount, String payee, String... texts) {
    PayNotifier.Spend s = PayScreen.read(java.util.Arrays.asList(texts), NOW);
    String got = s == null ? "null" : s.amount + "|" + s.merchant;
    String want = amount == null ? "null" : amount + "|" + payee;
    if (!got.equals(want)) { fails++; System.out.println("FAIL screen " + label + "  ->  " + got + "   want " + want); }
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
    // bank formats in the wild — same as the web app's tests
    expect("SBIUPI Dear UPI user A/C X1234 debited by 60.0 on date 09Nov26 trf to KATHI Refno 612345678901. If not u? call 1800111109. -SBI", 60.0, "Kathi");
    expect("ICICIB ICICI Bank Acct XX123 debited for Rs 60.00 on 09-Nov-26; KATHI credited. UPI:612345678901. Call 18002662 for dispute. SMS BLOCK 123 to 9215676766.", 60.0, "Kathi");
    expect("AXISBK INR 60.00 debited A/c no. XX1234 09-11-26 10:21:33 UPI/P2M/612345678901/KATHI Not you? SMS BLOCKUPI Cust ID to 919951860002 Axis Bank", 60.0, "Kathi");
    expect("KOTAKB Sent Rs.60.00 from Kotak Bank AC X1234 to kathi@okaxis on 09-11-26.UPI Ref 612345678901. Not you, https://kotak.com/KBANKT/Fraud", 60.0, "Kathi");
    expect("HDFCBK Spent Rs.450 On HDFC Bank Card 1234 At DOMINOS PIZZA On 2026-11-09:13:42:10 Not You? Call 18002586161", 450.0, "Dominos Pizza");
    expect("VM-SLICEIT Successfully paid Rs.250 from slice credit card XX1284 to B2B on 07-Nov-26 via UPI AutoPay. UMN - 01a1b3fb54e07c829d54258268dd31c5@slc - slice", 250.0, "B2B");
    expect("BANK Rs.500 debited from A/c XX1234 and credited to rahul@okaxis via IMPS on 09-11-26", 500.0, "Rahul");
    expect("SBIINB Rs.2000 withdrawn at ATM S1AW000123 from A/c XX1234 on 09Nov26", 2000.0, "ATM withdrawal");
    expect("BANK Your payment of Rs.60 to Kathi is pending", null, null);
    expect("BANK Rs.500 credited to your account and Rs.60 debited from account", null, null);
    expectIn("BANK Rs.60 reversed to your account for UPI txn ref 1234", 60.0, null);
    if (!PayWatchService.looksLikePayment("SBIUPI A/C X1234 debited by 60.0 trf to KATHI", true)) { System.out.println("FAIL looksLikePayment SBI"); fails++; }
    if (!PayNotifier.rupees(1250).equals("\u20B91,250") || !PayNotifier.rupees(60.5).equals("\u20B960.50")) { System.out.println("FAIL rupees"); fails++; }
    java.util.Calendar cal = java.util.Calendar.getInstance();
    cal.set(2026, 10, 9, 13, 40, 0);
    NOW = cal.getTimeInMillis();
    // payment apps' success screens, as the accessibility tree hands them over
    screen("phonepe", 250.0, "B2B Store", "Transaction Successful", "09 Nov 2026, 1:39 pm", "Paid to", "B2B STORE", "b2bstore@ybl", "\u20B9", "250", "Banking Name : B2B STORE", "Done", "Share");
    screen("phonepe-inline", 60.0, "24/7 Kathi", "Payment Successful", "\u20B960", "Paid to 24/7 Kathi", "UPI Ref No. 612345678901");
    screen("paytm", 40.0, "Tuck Shop", "Paid Successfully to", "TUCK SHOP", "\u20B9 40", "13:39, 09 Nov 2026", "UPI Ref No: 612345678901", "Check Balance");
    screen("gpay-bare", 149.0, "Monginis", "Payment successful", "149", "Paid to Monginis", "9 Nov 2026 1:40 PM");
    screen("bhim", 500.0, "Rahul Kumar", "Transaction Successful", "Rs. 500.00", "To:", "Rahul Kumar", "rahul@okaxis", "Transaction ID 612345678901");
    screen("slice", 250.0, "B2B", "Payment successful", "\u20B9250", "to B2B", "via slice UPI");
    screen("no-payee", 99.0, null, "Payment successful", "\u20B999");
    screen("failed", null, null, "Payment Failed", "\u20B9250", "Paid to B2B STORE", "Money will be refunded");
    screen("pending", null, null, "Payment Pending", "\u20B9250", "Processing your payment");
    screen("received", null, null, "Payment Successful", "Received from Rahul", "\u20B9500");
    screen("enter-amount", null, null, "Paying B2B STORE", "\u20B9", "250", "Pay");
    screen("history", null, null, "Payment successful", "Paid to A", "\u20B910", "Paid to B", "\u20B920", "Paid to C", "\u20B930", "Paid to D", "\u20B940");
    screen("old-day", null, null, "Transaction Successful", "02 Nov 2026, 1:39 pm", "Paid to", "B2B STORE", "\u20B9250");
    screen("old-time", null, null, "Transaction Successful", "09 Nov 2026, 9:05 am", "Paid to", "B2B STORE", "\u20B9250");
    if (!PayScreen.watched("com.phonepe.app") || PayScreen.watched("com.whatsapp")) { System.out.println("FAIL watched"); fails++; }
    System.exit(fails == 0 ? 0 : 1);
  }
}
