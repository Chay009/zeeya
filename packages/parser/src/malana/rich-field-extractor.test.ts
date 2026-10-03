import { describe, expect, it } from "vitest";

import { MalanaEngine } from "./malana.js";
import { seedData } from "./index.js";

const engine = new MalanaEngine(seedData);
const parse = (body: string, sender: string) => engine.parse(body, sender);

describe("rich fields", () => {
  it("a card statement is a bill due, not a spend", () => {
    const r = parse(
      "Your HDFC Bank Credit Card XX5678 statement is generated. Total Amt Due Rs 12,345.00, Min Amt Due Rs 620.00. Payment Due Date 15-Oct-2026.",
      "VM-HDFCBK",
    );
    expect(r.trxTypeRich).toBeNull();
    expect(r.trx).toBeNull();
    expect(r.billAmount).toBe("12345.00");
    expect(r.dueDate).toBe("15-Oct-2026");
  });

  it("an EMI reminder carries its amount and due date", () => {
    const r = parse(
      "Dear Customer, EMI of Rs 4,250 for your loan A/c 998877 is due on 10/10/2026. Please keep sufficient balance.",
      "AD-BAJAJF",
    );
    expect(r.emiAmount).toBe("4250");
    expect(r.dueDate).toBe("10/10/2026");
  });

  it("an insurance premium carries amount, policy and due date", () => {
    const r = parse(
      "Premium of Rs 6,100 for policy no 123456789 is due on 20-10-2026. Pay online at licindia.in",
      "VM-LICIND",
    );
    expect(r.billAmount).toBe("6100");
    expect(r.policyNo).toBe("123456789");
    expect(r.dueDate).toBe("20-10-2026");
  });

  it("a card spend keeps the spend and reads the available limit", () => {
    const r = parse(
      "Rs.1,299.00 spent on HDFC Bank Credit Card XX5678 at AMAZON on 2026-10-02. Avl Lmt: Rs.85,400.00",
      "VM-HDFCBK",
    );
    expect(r.trxTypeRich).toBe("EXPENSE");
    expect(r.trx).toBe("1299.00");
    expect(r.creditLimit).toBe("85400.00");
    expect(r.isFromCard).toBe(true);
  });

  it("cashback is cashback, not a bill amount", () => {
    const r = parse(
      "Congratulations! Cashback of Rs 50 has been credited to your Paytm wallet for your recharge.",
      "VM-PAYTMB",
    );
    expect(r.cashback).toBe("50");
    expect(r.billAmount).toBeNull();
  });

  it("a flight keeps its full PNR, flight number, route and gate", () => {
    const r = parse(
      "Your IndiGo flight 6E 2341 PNR ABC123 from Bengaluru to Delhi departs 05 Oct 06:15. Gate 12.",
      "VM-INDIGO",
    );
    expect(r.pnr).toBe("ABC123");
    expect(r.flight).toBe("6E 2341");
    // airport.json codes are lowercase; screens upper-case them.
    expect(r.departureCode).toBe("blr");
    expect(r.arrivalCode).toBe("del");
    expect(r.departure).toBe("05 Oct 06:15");
    expect(r.boardingGate).toBe("12");
  });

  it("a delivery keeps its item, full tracking id and status", () => {
    const r = parse(
      "Your Amazon order 402-1234567 for boAt Airdopes has been shipped. Track with tracking ID TBA123456789.",
      "VM-AMAZON",
    );
    expect(r.item).toBe("boAt Airdopes");
    expect(r.trackingId).toBe("TBA123456789");
    expect(r.deliveryStatus).toBe("shipped");
  });

  it("a fund NAV message carries the NAV and folio", () => {
    const r = parse(
      "NAV of HDFC Flexi Cap Fund for folio 1234567/89 is Rs 1,845.32 as on 02-Oct-2026.",
      "VM-CAMSMF",
    );
    expect(r.navValue).toBe("1845.32");
    expect(r.folio).toBe("1234567/89");
  });

  it("a data-left alert carries what's left", () => {
    const r = parse(
      "You have used 90% of your daily data. Data left: 150 MB. Pack valid till 05-Oct-2026.",
      "JIO",
    );
    expect(r.dataLeft).toBe("150 MB");
  });
});
