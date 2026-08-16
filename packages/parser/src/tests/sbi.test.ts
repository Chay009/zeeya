import { describe, it, expect } from "vitest";
import { SBIBankParser } from "../banks/sbi.js";

const parser = new SBIBankParser();

describe("SBIBankParser", () => {
  it("returns correct bank name", () => {
    expect(parser.getBankName()).toBe("State Bank of India");
  });

  it("returns INR currency", () => {
    expect(parser.getCurrency()).toBe("INR");
  });

  describe("canHandle", () => {
    it("handles SBI senders", () => {
      expect(parser.canHandle("ATMSBI")).toBe(true);
      expect(parser.canHandle("SBICRD")).toBe(true);
      expect(parser.canHandle("SBIBK")).toBe(true);
    });

    it("rejects unrelated senders", () => {
      expect(parser.canHandle("UNKNOWN")).toBe(false);
    });
  });

  it("parses debit card transaction", () => {
    const r = parser.parse(
      "Dear Customer, transaction number 1234 for Rs.383.00 by SBI Debit Card 0000 done at merchant on 13Sep25 at 21:38:26. Your updated available balance is Rs.999999999. If not done by you, forward this SMS to 7400165218/ call 1800111109/9449112211 to block card. GOI helpline for cyber fraud 1930.",
      "ATMSBI",
      0,
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(383);
    expect(r!.currency).toBe("INR");
    expect(r!.type).toBe("EXPENSE");
    expect(r!.accountLast4).toBe("0000");
  });

  it("parses standard debit message", () => {
    const r = parser.parse(
      "Rs.500 debited from A/c X1234 on 13Sep25. Avl Bal Rs.999999999",
      "ATMSBI",
      0,
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(500);
    expect(r!.currency).toBe("INR");
    expect(r!.type).toBe("EXPENSE");
    expect(r!.accountLast4).toBe("1234");
  });

  it("parses debit by transfer message", () => {
    const r = parser.parse(
      "Dear Customer, Your A/C XXXXX901234 has a debit by transfer of Rs 230.00 on 18/09/25. Avl Bal Rs 6,500.00.-SBI",
      "AD-CBSSBI-S",
      0,
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(230);
    expect(r!.currency).toBe("INR");
    expect(r!.type).toBe("EXPENSE");
    expect(r!.accountLast4).toBe("1234");
    expect(r!.balance).toBe(6500);
  });

  it("parses credit for merchant", () => {
    const r = parser.parse(
      "Your A/C XXXXX314502 has credit for AOFS23546782123411BHPL of Rs 10,700.00 on 02/05/22. Avl Bal Rs 13,50,000.00.-SBI",
      "JD-CBSSBI",
      0,
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(10700);
    expect(r!.currency).toBe("INR");
    expect(r!.type).toBe("INCOME");
    expect(r!.accountLast4).toBe("4502");
    expect(r!.balance).toBe(1350000);
    expect(r!.merchant).toBe("AOFS23546782123411BHPL");
  });

  it("parses credit by Cheque", () => {
    const r = parser.parse(
      "Dear Customer, Your A/C XXXXX314567 has a credit by Cheque of Rs 12,07,000.00 on 07/10/22. Avl Bal Rs 18,06,500.00.-SBI",
      "AD-CBSSBI",
      0,
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(1207000);
    expect(r!.currency).toBe("INR");
    expect(r!.type).toBe("INCOME");
    expect(r!.accountLast4).toBe("4567");
    expect(r!.balance).toBe(1806500);
    expect(r!.merchant).toBe("Cheque");
  });

  it("parses credited INR with reverse ATM suffix", () => {
    const r = parser.parse(
      "Your AC XXXXX314567 Credited INR 9,000.00 on 22/05/22 -REVERSE ATM WDL. Avl Bal INR 13,08,900.00.-SBI",
      "AD-CBSSBI",
      0,
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(9000);
    expect(r!.currency).toBe("INR");
    expect(r!.type).toBe("INCOME");
    expect(r!.accountLast4).toBe("4567");
    expect(r!.balance).toBe(1308900);
    expect(r!.merchant).toBe("REVERSE ATM WDL");
  });

  it("issue #35: debit with credited destination should be EXPENSE", () => {
    const r = parser.parse(
      "Dear Customer, Your a/c no. XXXXXXXX5045 is debited for Rs.500.00 on 31-03-26 and a/c XXXXXXX418 credited (IMPS Ref no ---------------). -SBI",
      "VA-SBIPSG-T",
      0,
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(500);
    expect(r!.currency).toBe("INR");
    expect(r!.type).toBe("EXPENSE");
    expect(r!.accountLast4).toBe("5045");
  });
});
