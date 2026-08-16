/**
 * Ground-truth comparison: Java Yuga FSA  vs  TypeScript port
 *
 * Spawns the compiled YugaRunner JAR, feeds the same corpus through both sides,
 * and asserts that type + value match for every token position.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { spawnSync } from "child_process";
import { existsSync } from "fs";
import { regexTokenize } from "./regex-tokenizer.js";

// ── Java runner ───────────────────────────────────────────────────────────────
//
// This proof only exists where the compiled Yuga JAR happens to be checked out
// (a sibling messai-engineering repo, not part of this project) — it's a one-time
// ground-truth verification, not something every dev/CI environment can run.
// Without the existsSync guard below, a missing JAR made spawnSync return empty
// stdout, and JSON.parse('') threw a confusing crash instead of a clear skip.

const JAR = "/workspace/messai-engineering/yuga/target/yuga-1.0.71.jar";
const MAIN = "com.twelfthmile.yuga.YugaRunner";
const JAR_AVAILABLE = existsSync(JAR);

interface JavaToken {
  type: string;
  value: string;
  raw: string;
}

function javaTokenize(messages: string[]): JavaToken[][] {
  const input = messages.join("\n") + "\n";
  const result = spawnSync("java", ["-cp", JAR, MAIN], {
    input,
    encoding: "utf8",
    timeout: 15_000,
  });
  if (result.error) throw result.error;
  const lines = result.stdout.trim().split("\n");
  return lines.map((l) => JSON.parse(l) as JavaToken[]);
}

// ── Corpus ────────────────────────────────────────────────────────────────────
// Covers every FSA path that matters: amounts (plain, comma-formatted, lakh/k),
// dates (dd-MM-yy, dd Mon yyyy, ISO), times, accounts, UPI VPAs, phone numbers,
// percentages, currency prefixes, mixed real-world SMS snippets.

const CORPUS: string[] = [
  // ── Amounts with currency prefix ──────────────────────────────────────────
  "Rs.500 debited",
  "INR 1000 credited",
  "₹250.00 paid",
  "Rs.1,500.00 debited from your account",
  "INR 5,000.00 debited from account XX1234",
  "Rs. 2,500.00 credited to your account",
  "INR 1,00,000.00 NEFT transfer", // lakh-formatted
  "Rs.50k transfer done", // multiplier k
  "Rs.2.5 lac withdrawn", // multiplier lac
  "USD 11.80 spent on 1xBrains",
  // ── Plain numbers / amounts ───────────────────────────────────────────────
  "500 debit",
  "12345678",
  "1,234.56",
  "0.99",
  // ── Dates ─────────────────────────────────────────────────────────────────
  "09-08-2026 transaction",
  "09/08/26 withdrawal",
  "09 Aug 2026 credit",
  "August 9, 2026",
  "09-Aug-26",
  "2026-08-09T10:30:00", // ISO with time
  "on 03-Sep-25 at Swiggy",
  // ── Times ─────────────────────────────────────────────────────────────────
  "10:30 AM",
  "22:45:30",
  "09:43:27 IST",
  // ── Account / instrument numbers ─────────────────────────────────────────
  "account XX1234 balance",
  "A/c no. XXXX5678",
  "card ending ****9012",
  "Acct: X...X3456",
  // ── UPI VPAs ──────────────────────────────────────────────────────────────
  "paid to user@paytm via UPI",
  "merchant@ybl transferred",
  "abc123@okicici payment",
  // ── Phone numbers ─────────────────────────────────────────────────────────
  "9876543210 missed call",
  "+919876543210 OTP",
  // ── Percentages ───────────────────────────────────────────────────────────
  "18% GST applied",
  "2.5% interest",
  // ── USSD ──────────────────────────────────────────────────────────────────
  "*99# balance check",
  "*123*1# recharge",
  // ── Mixed real-world SMS snippets ─────────────────────────────────────────
  "INR 5,000.00 debited from account XX1234 on 09-08-2026. Avail Bal: INR 12,500.00",
  "Your a/c XXXX4321 is credited with INR 10,000.00 on 09-Aug-2026 by NEFT. Ref No 12345678901234",
  "UPI: Rs.250.00 paid to AMAZON via UPI ref 123456789012345",
  "Dear Customer, an amount of Rs.1,500.00 has been debited from your account XX7890. Avail Bal: Rs.23,450.00",
  "Rs. 2,500.00 has been debited from your YES BANK Account No. XXXX7890 on 09-Aug-2026",
  "Spent INR 131 Axis Bank Card no. XX0818 05-10-25 09:43:27 IST Swiggy",
  "Txn of INR 383.00 done via SBI Debit Card ending 0000 at IRCTC on 09-08-26",
  "Your OTP is 456789. Valid for 10 minutes.",
  "Your order #OD987654 from Flipkart is out for delivery today.",
];

// ── TS tokenizer wrapper ──────────────────────────────────────────────────────

interface TSToken {
  type: string;
  value: string;
  raw: string;
}

function tsTokenize(message: string): TSToken[] {
  return regexTokenize(message).map((t) => ({ type: t.type, value: t.text, raw: t.raw }));
}

// ── Intentional differences ────────────────────────────────────────────────────
// 1. Date value format: Java normalises to "yyyy-MM-dd HH:mm:ss" via Date.toString();
//    TS returns the raw substring from the input.  Type and raw both agree, so grammar
//    matching is unaffected — this is a deliberate display difference.
// 2. DATETIME vs DATE: TS distinguishes date+time tokens (DATETIME) from pure dates
//    (DATE) to give callers richer information.  Java always emits DATE.
//    The TS extension is safe because grammar rules match on base-type (digits stripped).

const DATE_TYPES = new Set(["DATE", "DATETIME"]);

function normaliseType(t: string): string {
  // DATETIME is a TS-only extension — treat as DATE for comparison purposes
  return t === "DATETIME" ? "DATE" : t;
}

function isDateToken(type: string): boolean {
  return DATE_TYPES.has(type);
}

// ── Test ──────────────────────────────────────────────────────────────────────

describe.skipIf(!JAR_AVAILABLE)("Yuga FSA — Java vs TypeScript port", () => {
  if (!JAR_AVAILABLE) {
    console.warn(`Skipping Yuga FSA ground-truth comparison — JAR not found at ${JAR}`);
  }

  let javaResults: JavaToken[][];

  beforeAll(() => {
    javaResults = javaTokenize(CORPUS);
  });

  const diffs: string[] = [];

  it("token sequences match for every corpus message", () => {
    for (let idx = 0; idx < CORPUS.length; idx++) {
      const msg = CORPUS[idx]!;
      const java = javaResults[idx]!;
      const ts = tsTokenize(msg);

      if (java.length !== ts.length) {
        diffs.push(
          `[${idx}] token count  java=${java.length} ts=${ts.length}\n` +
            `  msg : ${msg}\n` +
            `  java: ${JSON.stringify(java)}\n` +
            `  ts  : ${JSON.stringify(ts)}`,
        );
        continue;
      }

      for (let t = 0; t < java.length; t++) {
        const jt = java[t]!;
        const tt = ts[t]!;
        const typeMatch = normaliseType(jt.type) === normaliseType(tt.type);
        // Date values intentionally differ: Java formats to "yyyy-MM-dd HH:mm:ss",
        // TS returns the raw substring.  Skip value comparison for date tokens.
        const valueMatch =
          isDateToken(jt.type) || isDateToken(tt.type) ? true : jt.value === tt.value;

        if (!typeMatch || !valueMatch) {
          diffs.push(
            `[${idx}] token[${t}]  type:${typeMatch ? "✓" : "✗"} value:${valueMatch ? "✓" : "✗"}\n` +
              `  msg  : ${msg}\n` +
              `  java : type="${jt.type}" value="${jt.value}" raw="${jt.raw}"\n` +
              `  ts   : type="${tt.type}" value="${tt.value}" raw="${tt.raw}"`,
          );
        }
      }
    }

    if (diffs.length > 0) {
      console.log("\n══ DIFFS ══\n" + diffs.join("\n\n"));
    }

    const total = CORPUS.reduce(
      (n, _, i) => n + Math.max(javaResults[i]!.length, tsTokenize(CORPUS[i]!).length),
      0,
    );
    const failed = diffs.length;
    const passed = total - failed;
    console.log(
      `\nTokens: ${passed}/${total} match  (${diffs.length} diffs across ${CORPUS.length} messages)`,
    );

    expect(diffs.length).toBe(0);
  });

  it("prints a per-message diff table", () => {
    console.log("\n" + "═".repeat(72));
    console.log("  JAVA vs TS — per message");
    console.log("═".repeat(72));
    for (let idx = 0; idx < CORPUS.length; idx++) {
      const msg = CORPUS[idx]!.substring(0, 60).padEnd(60);
      const java = javaResults[idx]!;
      const ts = tsTokenize(CORPUS[idx]!);
      const match =
        java.length === ts.length &&
        java.every((jt, k) => {
          const tt = ts[k]!;
          const typeOk = normaliseType(jt.type) === normaliseType(tt.type);
          const valOk = isDateToken(jt.type) || isDateToken(tt.type) || jt.value === tt.value;
          return typeOk && valOk;
        });
      console.log(`  ${match ? "✓" : "✗"}  ${msg}`);
      if (!match) {
        console.log(`       java: ${java.map((t) => t.type + "=" + t.value).join("  ")}`);
        console.log(`       ts  : ${ts.map((t) => t.type + "=" + t.value).join("  ")}`);
      }
    }
    console.log("═".repeat(72));
    expect(true).toBe(true); // visual-only test
  });
});
