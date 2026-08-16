import { describe, it, expect } from "vitest";
import { PunjabSindBankParser } from "../banks/punjab-sind.js";

const parser = new PunjabSindBankParser();

describe("PunjabSindBankParser", () => {
  it("returns correct bank name", () => {
    expect(parser.getBankName()).toBe("Punjab & Sind Bank");
  });

  it("returns INR currency", () => {
    expect(parser.getCurrency()).toBe("INR");
  });

  describe("canHandle", () => {
    it("handles senders containing PSB", () => {
      expect(parser.canHandle("PSBALRT")).toBe(true);
      expect(parser.canHandle("PSB")).toBe(true);
      expect(parser.canHandle("AD-PSBALRT")).toBe(true);
      expect(parser.canHandle("psb")).toBe(true);
    });

    it("handles sender containing PUNJAB SIND", () => {
      expect(parser.canHandle("PUNJAB SIND BANK")).toBe(true);
      expect(parser.canHandle("PUNJAB SIND")).toBe(true);
    });

    it("rejects unrelated senders", () => {
      expect(parser.canHandle("HDFCBK")).toBe(false);
      expect(parser.canHandle("SBIINB")).toBe(false);
      expect(parser.canHandle("PNBBNK")).toBe(false);
      expect(parser.canHandle("")).toBe(false);
    });
  });

  it("parses PSB debit transaction", () => {
    const r = parser.parse(
      "INR 1200.00 debited from your PSB account. Avl Bal INR 8800.00",
      "PSBALRT",
      0,
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(1200);
    expect(r!.type).toBe("EXPENSE");
    expect(r!.currency).toBe("INR");
    expect(r!.bankName).toBe("Punjab & Sind Bank");
  });

  it("parses PSB credit transaction", () => {
    const r = parser.parse(
      "INR 3000.00 credited to your PSB account. Avl Bal INR 11800.00",
      "PSBALRT",
      0,
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(3000);
    expect(r!.type).toBe("INCOME");
    expect(r!.currency).toBe("INR");
    expect(r!.bankName).toBe("Punjab & Sind Bank");
  });
});
