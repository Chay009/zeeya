import { createMalanaEngine } from "@zeeya/parser/malana";
import { describe, expect, it } from "vitest";

import type { ParsedSms } from "@/lib/sms";
import { buildSpendingSeries, primaryExpenseCurrency } from "./insights-data";

const engine = createMalanaEngine();

function expense(id: string, body: string, date: number): ParsedSms {
  return { id, sender: "VM-HDFCBK", body, date, result: engine.parse(body, "VM-HDFCBK") };
}

describe("insights data", () => {
  it("chooses a currency by financial-message frequency without mixing values", () => {
    const messages = [
      expense("1", "INR 10 debited from account XX1234", 1),
      expense("2", "INR 20 debited from account XX1234", 2),
      expense("3", "$5 debited from account XX1234", 3),
    ];
    expect(primaryExpenseCurrency(messages)).toBe("INR");
  });

  it("aggregates same-day expenses and excludes other currencies", () => {
    const now = new Date(2026, 7, 25, 12);
    const day = new Date(2026, 7, 25, 9).getTime();
    const messages = [
      expense("1", "INR 10 debited from account XX1234", day),
      expense("2", "INR 20 debited from account XX1234", day + 1),
      expense("3", "$5 debited from account XX1234", day + 2),
    ];
    const series = buildSpendingSeries(messages, "INR", now, 2);
    expect(series).toHaveLength(2);
    expect(series[1]!.value).toBe(30);
  });
});
