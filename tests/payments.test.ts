import { describe, expect, it } from "vitest";
import {
  dedupe,
  detectedFrom,
  merchantKey,
  parseNotice,
  redact,
  strayIds,
  type Notice,
} from "@/lib/payments";

const GPAY = "com.google.android.apps.nbu.paisa.user";
const PHONEPE = "com.phonepe.app";
const SMS = "com.google.android.apps.messaging";

const note = (app: string, title: string, text: string, at = 1_700_000_000_000): Notice => ({
  app,
  title,
  text,
  at,
});

describe("reading a payment out of a notification", () => {
  it("reads the apps people here actually pay with", () => {
    expect(parseNotice(note(GPAY, "You paid ₹60.00", "to 24/7 Kathi"))).toMatchObject({
      amount: 60,
      merchant: "24/7 Kathi",
      source: "Google Pay",
    });
    expect(parseNotice(note(PHONEPE, "Payment successful", "₹149 paid to Monginis"))).toMatchObject({
      amount: 149,
      merchant: "Monginis",
    });
    expect(
      parseNotice(note("net.one97.paytm", "Paytm", "Paid Rs.40 to Tuck Shop successfully")),
    ).toMatchObject({ dir: "out", amount: 40, merchant: "Tuck Shop" });
  });

  it("reads a bank message and keeps the amount exact", () => {
    const p = parseNotice(
      note(SMS, "HDFCBK", "Rs.1,250.50 debited from A/c XXXX4521 on 03-10-26 to VPA subway@okicici. Ref 553201"),
    );
    expect(p).toMatchObject({ amount: 1250.5, merchant: "Subway" });
  });

  it("turns a shouted UPI name into something readable", () => {
    expect(parseNotice(note(GPAY, "You paid ₹90", "to SOUTHERN STORIES"))?.merchant).toBe(
      "Southern Stories",
    );
    // a name that is already mixed case is left exactly as the payee wrote it
    expect(parseNotice(note(GPAY, "You paid ₹90", "to GreenOX"))?.merchant).toBe("GreenOX");
  });

  it("says nothing rather than guessing", () => {
    // a message that says money went both ways is not guessed at
    expect(
      parseNotice(note(SMS, "BANK", "Rs.500 credited and Rs.60 debited from account")),
    ).toBeNull();
    // an OTP mentions an amount but is not a payment
    expect(
      parseNotice(note(SMS, "HDFCBK", "OTP 452109 for a payment of Rs.60. Do not share.")),
    ).toBeNull();
    // so does a balance alert and an offer
    expect(parseNotice(note(SMS, "ICICI", "Avl Balance in A/c XX4521 is Rs.4,200"))).toBeNull();
    expect(parseNotice(note(PHONEPE, "Offer", "Get cashback up to ₹100 when you pay"))).toBeNull();
    // and a request for money, which is the dangerous one
    expect(parseNotice(note(GPAY, "Rahul is requesting ₹200", "Pay now"))).toBeNull();
    // a failed payment never happened
    expect(parseNotice(note(GPAY, "Payment failed", "₹60 to 24/7 Kathi could not be paid"))).toBeNull();
  });

  it("ignores every app that is not a payment app", () => {
    expect(parseNotice(note("com.instagram.android", "You paid ₹60", "to someone"))).toBeNull();
  });

  it("refuses a message with no amount, or an absurd one", () => {
    expect(parseNotice(note(GPAY, "You paid", "to 24/7 Kathi"))).toBeNull();
    expect(parseNotice(note(SMS, "BANK", "Rs.99999999 debited to VPA x@y"))).toBeNull();
  });

  it("keeps the payment even when the payee is not named", () => {
    const p = parseNotice(note(GPAY, "You paid ₹60.00", "Payment successful"));
    expect(p).toMatchObject({ dir: "out", amount: 60, merchant: null });
  });

  it("does not take a reference number for a name", () => {
    expect(parseNotice(note(SMS, "BANK", "Rs.60 debited to 553201"))?.merchant).toBeNull();
  });
});

describe("money coming in", () => {
  it("reads it as money in, with who sent it", () => {
    expect(parseNotice(note(GPAY, "₹250 received", "Rahul paid you ₹250"))).toMatchObject({
      dir: "in",
      amount: 250,
      merchant: "Rahul",
    });
    expect(parseNotice(note(GPAY, "Rahul Kumar sent you ₹500", "Received in your bank account"))).toMatchObject({
      dir: "in",
      amount: 500,
      merchant: "Rahul Kumar",
    });
    expect(
      parseNotice(note(SMS, "HDFCBK", "Rs.300 credited to A/c XX4521 by UPI from VPA priya.s@okicici on 03-10-26")),
    ).toMatchObject({ dir: "in", amount: 300, merchant: "Priya" });
    expect(parseNotice(note(PHONEPE, "Received", "You received ₹120 from AMAN GUPTA"))).toMatchObject({
      dir: "in",
      merchant: "Aman Gupta",
    });
  });

  it("keeps a credit even when the sender is not named", () => {
    expect(parseNotice(note(SMS, "SBIINB", "Rs.5000 credited to your account"))).toMatchObject({
      dir: "in",
      amount: 5000,
      merchant: null,
    });
  });

  it("calls a spend a spend", () => {
    expect(parseNotice(note(GPAY, "You paid ₹60.00", "to 24/7 Kathi"))?.dir).toBe("out");
  });

  it("never folds money in and money out of the same amount together", () => {
    const list = detectedFrom([
      { id: "a", app: GPAY, title: "You paid ₹100", body: "to Canteen", posted_at: 1000 },
      { id: "b", app: GPAY, title: "₹100 received", body: "Rahul paid you ₹100", posted_at: 2000 },
    ]);
    expect(list).toHaveLength(2);
  });
});

describe("what never leaves the phone", () => {
  it("strips account and card numbers", () => {
    expect(redact("debited from A/c XXXX4521 ref 9988776655")).toBe(
      "debited from account ref number",
    );
    expect(redact("card ending 4521")).toBe("card ending 4521"); // the last four are fine
  });

  it("keeps them out of the parsed payment too", () => {
    const p = parseNotice(note(SMS, "HDFC", "Rs.60 debited from A/c XXXX4521 to VPA hoc@ybl"));
    expect(JSON.stringify(p)).not.toContain("4521");
  });
});

describe("the same payment arriving twice", () => {
  it("counts a UPI app and the bank as one spend", () => {
    const both = dedupe([
      { dir: "out", amount: 60, merchant: null, source: "HDFC", at: 1000 },
      { dir: "out", amount: 60, merchant: "24/7 Kathi", source: "Google Pay", at: 4000 },
    ]);
    expect(both).toHaveLength(1);
    // and keeps the half that knows where the money went
    expect(both[0]).toMatchObject({ merchant: "24/7 Kathi", source: "Google Pay" });
  });

  it("keeps two real payments of the same amount far enough apart", () => {
    const two = dedupe([
      { dir: "out", amount: 60, merchant: "HOC", source: "Google Pay", at: 0 },
      { dir: "out", amount: 60, merchant: "HOC", source: "Google Pay", at: 600_000 },
    ]);
    expect(two).toHaveLength(2);
  });

  it("never merges different amounts", () => {
    expect(
      dedupe([
        { dir: "out", amount: 60, merchant: "HOC", source: "Google Pay", at: 0 },
        { dir: "out", amount: 61, merchant: "HOC", source: "Google Pay", at: 500 },
      ]),
    ).toHaveLength(2);
  });
});

describe("remembering a merchant", () => {
  it("matches however it was spelled", () => {
    expect(merchantKey("24/7 Kathi")).toBe(merchantKey("24-7 KATHI"));
    expect(merchantKey("Southern Stories")).toBe(merchantKey("southernstories"));
    expect(merchantKey("Subway")).not.toBe(merchantKey("Subway Noida"));
  });
});

describe("building the tray from the inbox", () => {
  const n = (id: string, app: string, title: string, body: string, posted_at: number) => ({
    id,
    app,
    title,
    body,
    posted_at,
  });

  it("folds the bank's copy and the UPI app's copy into one row to confirm", () => {
    const list = [
      n("a", SMS, "HDFCBK", "Rs.60 debited from A/c XXXX4521 to VPA kathi@okaxis", 1000),
      n("b", GPAY, "You paid ₹60.00", "to 24/7 Kathi", 3000),
      n("c", PHONEPE, "Offer", "Get cashback up to ₹100", 4000),
    ];
    const tray = detectedFrom(list);
    expect(tray).toHaveLength(1);
    expect(tray[0]).toMatchObject({ dir: "out", amount: 60, merchant: "24/7 Kathi" });
    // both notices clear together, so the same spend cannot come back tomorrow
    expect(tray[0].ids.sort()).toEqual(["a", "b"]);
    // and the advert is rubbish that should leave the inbox without being shown
    expect(strayIds(list)).toEqual(["c"]);
  });

  it("puts the newest payment first", () => {
    const tray = detectedFrom([
      n("a", GPAY, "You paid ₹10", "to HOC", 1000),
      n("b", GPAY, "You paid ₹20", "to Quench", 900_000),
    ]);
    expect(tray.map((t) => t.amount)).toEqual([20, 10]);
  });
});

describe("two names for the same payment", () => {
  it("keeps the payment app's name over the bank's UPI handle", () => {
    const one = dedupe([
      { dir: "out", amount: 60, merchant: "Kathi", source: "Messages", at: 1000 },
      { dir: "out", amount: 60, merchant: "24/7 Kathi", source: "Google Pay", at: 3000 },
    ]);
    expect(one).toHaveLength(1);
    expect(one[0]).toMatchObject({ merchant: "24/7 Kathi", source: "Google Pay" });
  });

  it("does not downgrade a good name to a worse one", () => {
    const one = dedupe([
      { dir: "out", amount: 60, merchant: "Southern Stories", source: "Google Pay", at: 1000 },
      { dir: "out", amount: 60, merchant: "Southern", source: "Messages", at: 3000 },
    ]);
    expect(one[0].merchant).toBe("Southern Stories");
  });
});

describe("payments from any app", () => {
  const at = Date.now();
  it("reads an app that is not on the list when it says money left", () => {
    const p = parseNotice({ app: "com.example.newwallet", title: "₹120 paid", text: "to Chai Point via UPI", at });
    expect(p?.amount).toBe(120);
    expect(p?.dir).toBe("out");
    expect(p?.source).toBe("Other app");
  });
  it("knows Slice by name", () => {
    expect(parseNotice({ app: "indwin.c3.shareapp", title: "Payment successful", text: "₹250 paid to Zomato", at })?.source).toBe("Slice");
  });
  it("never reads chats", () => {
    expect(parseNotice({ app: "com.whatsapp", title: "Yash", text: "bhai maine ₹200 paid kar diya", at })).toBeNull();
  });
});
