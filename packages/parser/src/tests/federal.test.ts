import { describe, it, expect } from "vitest";
import { FederalBankParser } from "../banks/federal.js";

const parser = new FederalBankParser();

describe("FederalBankParser", () => {
  it("handles known senders", () => {
    expect(parser.canHandle("AD-FEDBNK")).toBe(true);
    expect(parser.canHandle("JM-FEDBNK")).toBe(true);
    expect(parser.canHandle("AX-FEDBNK-S")).toBe(true);
    expect(parser.canHandle("ADCBAlert")).toBe(false);
    expect(parser.canHandle("SBI")).toBe(false);
    expect(parser.canHandle("")).toBe(false);
  });

  // UPI Debit Transactions

  it("parses UPI debit to individual VPA", () => {
    const r = parser.parse(
      "Rs 150.00 debited via UPI on 15-08-2024 10:30:25 to VPA john.doe123@okbank.Ref No 987654321098.Small txns?Use UPI Lite!-Federal Bank",
      "AD-FEDBNK",
      0,
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(150.0);
    expect(r!.currency).toBe("INR");
    expect(r!.type).toBe("EXPENSE");
    expect(r!.merchant).toBe("john.doe123@okbank");
    expect(r!.reference).toBe("987654321098");
    expect(r!.isFromCard).toBe(false);
  });

  it("parses UPI debit to merchant VPA (Swiggy)", () => {
    const r = parser.parse(
      "Rs 450.75 debited via UPI on 16-08-2024 14:22:10 to VPA swiggy.food@paytm.Ref No 876543210987.Small txns?Use UPI Lite!-Federal Bank",
      "AD-FEDBNK",
      0,
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(450.75);
    expect(r!.currency).toBe("INR");
    expect(r!.type).toBe("EXPENSE");
    expect(r!.merchant).toBe("Swiggy");
    expect(r!.reference).toBe("876543210987");
    expect(r!.isFromCard).toBe(false);
  });

  it("parses UPI payment to Indigo via Paytm", () => {
    const r = parser.parse(
      "Rs 3500.00 debited via UPI on 20-08-2024 12:30:45 to VPA indigo.paytm@hdfcbank.Ref No 987654321099.Small txns?Use UPI Lite!-Federal Bank",
      "AD-FEDBNK",
      0,
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(3500.0);
    expect(r!.currency).toBe("INR");
    expect(r!.type).toBe("EXPENSE");
    expect(r!.merchant).toBe("Indigo");
    expect(r!.reference).toBe("987654321099");
    expect(r!.isFromCard).toBe(false);
  });

  it("parses UPI debit with complex VPA", () => {
    const r = parser.parse(
      "Rs 1250.00 debited via UPI on 17-08-2024 09:15:45 to VPA merchant.store.98765@hdfcbank.Ref No 765432109876.Small txns?Use UPI Lite!-Federal Bank",
      "AD-FEDBNK",
      0,
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(1250.0);
    expect(r!.currency).toBe("INR");
    expect(r!.type).toBe("EXPENSE");
    expect(r!.merchant).toBe("merchant.store.98765@hdfcbank");
    expect(r!.reference).toBe("765432109876");
    expect(r!.isFromCard).toBe(false);
  });

  // IMPS Credit Transactions

  it("parses IMPS credit to account", () => {
    const r = parser.parse(
      "Rs 3500.50 credited to your A/c XX4567 via IMPS on 18AUG2024 11:45:30 IMPS Ref no 654321098765 Bal:Rs 25000.75 -Federal Bank",
      "AD-FEDBNK",
      0,
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(3500.5);
    expect(r!.currency).toBe("INR");
    expect(r!.type).toBe("INCOME");
    expect(r!.merchant).toBe("IMPS Credit");
    expect(r!.accountLast4).toBe("4567");
    expect(r!.balance).toBe(25000.75);
    expect(r!.reference).toBe("654321098765");
    expect(r!.isFromCard).toBe(false);
  });

  // "You've Received" Credit Transactions

  it("parses you've received from individual", () => {
    const r = parser.parse(
      "John, you've received INR 10,509.09 in your Account XXXXXXXX1896. Woohoo! It was sent by TESTUSER on March 19, 2025. -Federal Bank",
      "AD-FEDBNK",
      0,
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(10509.09);
    expect(r!.currency).toBe("INR");
    expect(r!.type).toBe("INCOME");
    expect(r!.merchant).toBe("TESTUSER");
    expect(r!.accountLast4).toBe("1896");
    expect(r!.isFromCard).toBe(false);
  });

  it("parses you've received from person", () => {
    const r = parser.parse(
      "Jane, you've received INR 50,000.00 in your Account XXXXXXXX1896. Woohoo! It was sent by SAMPLE PERSON on July 24, 2024. -Federal Bank",
      "AD-FEDBNK",
      0,
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(50000.0);
    expect(r!.currency).toBe("INR");
    expect(r!.type).toBe("INCOME");
    expect(r!.merchant).toBe("SAMPLE PERSON");
    expect(r!.accountLast4).toBe("1896");
    expect(r!.isFromCard).toBe(false);
  });

  it("parses you've received from 0000 as Bank Transfer", () => {
    const r = parser.parse(
      "John, you've received INR 17,179.95 in your Account XXXXXXXX1896. Woohoo! It was sent by 0000 on July 25, 2024. -Federal Bank",
      "AD-FEDBNK",
      0,
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(17179.95);
    expect(r!.currency).toBe("INR");
    expect(r!.type).toBe("INCOME");
    expect(r!.merchant).toBe("Bank Transfer");
    expect(r!.accountLast4).toBe("1896");
    expect(r!.isFromCard).toBe(false);
  });

  it("parses IMPS credit large amount", () => {
    const r = parser.parse(
      "Rs 15000.00 credited to your A/c XX7890 via IMPS on 19AUG2024 16:20:15 IMPS Ref no 543210987654 Bal:Rs 42500.80 -Federal Bank",
      "AD-FEDBNK",
      0,
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(15000.0);
    expect(r!.currency).toBe("INR");
    expect(r!.type).toBe("INCOME");
    expect(r!.merchant).toBe("IMPS Credit");
    expect(r!.accountLast4).toBe("7890");
    expect(r!.balance).toBe(42500.8);
    expect(r!.reference).toBe("543210987654");
    expect(r!.isFromCard).toBe(false);
  });

  // Successful E-mandate Payments

  it("parses successful e-mandate payment for Netflix", () => {
    const r = parser.parse(
      "Hi, payment of INR 199.00 for Netflix via e-mandate ID: NX789XYZABC on Federal Bank Debit Card 3456 is processed successfully. To manage, visit: https://www.sihub.in/managesi/federal T&CA - Federal Bank",
      "AD-FEDBNK",
      0,
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(199.0);
    expect(r!.currency).toBe("INR");
    expect(r!.type).toBe("EXPENSE");
    expect(r!.merchant).toBe("Netflix via e-mandate ID: NX789XYZABC");
    expect(r!.accountLast4).toBe("3456");
    expect(r!.isFromCard).toBe(true);
  });

  it("parses successful e-mandate payment for Spotify", () => {
    const r = parser.parse(
      "Hi, payment of INR 119.00 for Spotify via e-mandate ID: SP456DEF123 on Federal Bank Debit Card 7890 is processed successfully. To manage, visit: https://www.sihub.in/managesi/federal T&CA - Federal Bank",
      "AD-FEDBNK",
      0,
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(119.0);
    expect(r!.currency).toBe("INR");
    expect(r!.type).toBe("EXPENSE");
    expect(r!.merchant).toBe("Spotify via e-mandate ID: SP456DEF123");
    expect(r!.accountLast4).toBe("7890");
    expect(r!.isFromCard).toBe(true);
  });

  it("parses successful e-mandate payment for LifeInsurance", () => {
    const r = parser.parse(
      "Hi, payment of INR 2500.00 for LifeInsurance via e-mandate ID: LI789GHI456 on Federal Bank Debit Card 1234 is processed successfully. To manage, visit: https://www.sihub.in/managesi/federal T&CA - Federal Bank",
      "AD-FEDBNK",
      0,
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(2500.0);
    expect(r!.currency).toBe("INR");
    expect(r!.type).toBe("EXPENSE");
    expect(r!.merchant).toBe("LifeInsurance via e-mandate ID: LI789GHI456");
    expect(r!.accountLast4).toBe("1234");
    expect(r!.isFromCard).toBe(true);
  });

  // Card Transactions

  it("parses credit card transaction at Amazon", () => {
    const r = parser.parse(
      "INR 1200.00 spent on your credit card ending with 5678 at AMAZON on 09-05-2025 15:30:15. Available limit Rs.38000.00 -Federal Bank",
      "AD-FEDBNK",
      0,
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(1200.0);
    expect(r!.currency).toBe("INR");
    expect(r!.type).toBe("CREDIT");
    expect(r!.merchant).toBe("AMAZON");
    expect(r!.accountLast4).toBe("5678");
    expect(r!.creditLimit).toBe(38000.0);
    expect(r!.isFromCard).toBe(true);
  });

  it("parses Scapia Federal credit card transaction", () => {
    const r = parser.parse(
      "Hi! Your txn of ₹882.00 at Carnatic Cafe Gurgaon In on your Scapia Federal Visa credit card was successful. And you've earned 10% rewards on this spend! Not you? Go to Scapia support on the app or call 18002961199. -Federal Bank",
      "VM-FEDSCP-S",
      0,
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(882.0);
    expect(r!.currency).toBe("INR");
    expect(r!.type).toBe("CREDIT");
    expect(r!.merchant).toBe("Carnatic Cafe Gurgaon In");
    expect(r!.isFromCard).toBe(true);
  });

  it("parses debit card transaction with masked card number", () => {
    const r = parser.parse(
      "Rs 1500.00 debited via card XX**3456 at MERCHANT on 14-05-2025 15:30:45. Current Bal: Rs.250.75 -Federal Bank",
      "AD-FEDBNK",
      0,
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(1500.0);
    expect(r!.currency).toBe("INR");
    expect(r!.type).toBe("EXPENSE");
    expect(r!.merchant).toBe("MERCHANT");
    expect(r!.accountLast4).toBe("3456");
    expect(r!.balance).toBe(250.75);
    expect(r!.isFromCard).toBe(true);
  });

  // Messages that should not parse

  it("does not parse failed transaction", () => {
    const r = parser.parse(
      "Hi, txn of Rs. 1500.00 using card XX**3456 failed due to insufficient funds. Current Bal: Rs.250.75. Call 18004251199 if txn not initiated by you -Federal Bank",
      "AD-FEDBNK",
      0,
    );
    expect(r).toBeNull();
  });

  it("does not parse declined e-mandate", () => {
    const r = parser.parse(
      "Hi, payment of INR 199.00 via e-mandate declined for ID: NX789XYZABC on Federal Bank Debit Card 3456. To manage, visit: https://www.sihub.in/managesi/federal T&CA - Federal Bank",
      "AD-FEDBNK",
      0,
    );
    expect(r).toBeNull();
  });

  it("does not parse account notification", () => {
    const r = parser.parse(
      "Hi, your Federal Bank Savings Account is currently debit frozen due to incomplete Video KYC. Please complete the VKYC by 30/09/2024 to avoid account closure.",
      "AD-FEDBNK",
      0,
    );
    expect(r).toBeNull();
  });

  it("does not parse OTP message", () => {
    const r = parser.parse(
      "Dear Customer, your FedMobile registration has been initiated. If not initiated by you, please call 18004201199. Please do not share your card details/OTP/CVV to anyone -Federal Bank",
      "AD-FEDBNK",
      0,
    );
    expect(r).toBeNull();
  });

  // Mandate parsing tests

  it("does not parse mandate creation as a regular transaction", () => {
    const r = parser.parse(
      "Dear Customer, You have successfully created a mandate on Netflix India for a MONTHLY frequency starting from 05-09-2024 for a maximum amount of Rs 199.00 Mandate Ref No- abc123def456@fifederal - Federal Bank",
      "AX-FEDBNK-S",
      Date.now(),
    );
    expect(r).toBeNull();
  });

  it("does not parse payment due message as a regular transaction", () => {
    const r = parser.parse(
      "Hi, payment due for Netflix,INR 199.00 on 05/09/2024 will be processed using Federal Bank Debit Card 3456. To cancel, visit https://www.sihub.in/managesi/federal T&CA - Federal Bank",
      "AX-FEDBNK-S",
      Date.now(),
    );
    expect(r).toBeNull();
  });

  // Mandate API tests

  it("parses e-mandate subscription via API", () => {
    const mandateResult = parser.parseEMandateSubscription(
      "Dear Customer, You have successfully created a mandate on Netflix India for a MONTHLY frequency starting from 05-09-2024 for a maximum amount of Rs 199.00 Mandate Ref No- abc123def456@fifederal - Federal Bank",
    );
    expect(mandateResult).not.toBeNull();
    expect(mandateResult!.amount).toBe(199.0);
    expect(mandateResult!.nextDeductionDate).toBe("05-09-2024");
    expect(mandateResult!.merchant).toBe("Netflix India");
    expect(mandateResult!.umn).toBe("abc123def456@fifederal");
  });

  it("parses future debit (payment due) via API", () => {
    const paymentDueResult = parser.parseFutureDebit(
      "Hi, payment due for Netflix,INR 199.00 on 05/09/2024 will be processed using Federal Bank Debit Card 3456. To cancel, visit https://www.sihub.in/managesi/federal T&CA - Federal Bank",
    );
    expect(paymentDueResult).not.toBeNull();
    expect(paymentDueResult!.amount).toBe(199.0);
    expect(paymentDueResult!.nextDeductionDate).toBe("05/09/24");
    expect(paymentDueResult!.merchant).toBe("Netflix");
    expect(paymentDueResult!.umn).toBeNull();
  });
});
