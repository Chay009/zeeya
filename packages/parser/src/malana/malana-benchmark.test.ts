/**
 * Malana vs Cashiro benchmark.
 * Runs every Cashiro test-case SMS through the Malana engine and measures
 * how well Malana matches the ground-truth extracted by Cashiro.
 *
 * Metrics checked per case:
 *   - Amount: parsed number within ±0.01 tolerance
 *   - Type:   debit → EXPENSE, credit → INCOME/CREDIT
 *   - AccLast4: last-4 of instrno/acc tag contains accountLast4
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { MalanaEngine } from './malana.js';

const seed = JSON.parse(readFileSync('/tmp/seeddata.json', 'utf8'));
const engine = new MalanaEngine(seed);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parse a rupee/currency string like "Rs.5,000.00" or "INR 1,30,000.00" to a number */
function parseAmount(s: string): number {
  if (!s) return NaN;
  const cleaned = s.replace(/[₹$€¥₩£]|Rs\.?|INR|USD|EUR|GBP|AED|SGD\s*/gi, '')
                   .replace(/,/g, '')
                   .trim();
  return parseFloat(cleaned);
}

/** Extract the best amount from Malana tags */
function malanaAmount(tags: Record<string, string>): number {
  // priority: trx > amount > bal (bal could be balance, not transaction)
  const raw = tags['trx'] || tags['amount'] || '';
  return parseAmount(raw);
}

/** Extract the best type indicator from Malana tags */
function malanaType(tags: Record<string, string>): 'debit' | 'credit' | null {
  const t = (tags['type'] || '').toLowerCase();
  if (t === 'debit') return 'debit';
  if (t === 'credit') return 'credit';
  return null;
}

/** Check if a Cashiro-style type (EXPENSE/INCOME/CREDIT) matches Malana's debit/credit */
function typeMatches(cashiroType: string, malType: 'debit' | 'credit' | null): boolean {
  if (!malType) return false;
  if (cashiroType === 'EXPENSE') return malType === 'debit';
  if (cashiroType === 'INCOME' || cashiroType === 'CREDIT') return malType === 'credit';
  return false;
}

/** Check if Malana's instrno/acc contains the expected last-4 */
function acctMatches(tags: Record<string, string>, last4: string | undefined): boolean {
  if (!last4) return true; // no expectation
  const instrno = tags['instrno'] || tags['acc'] || '';
  return instrno.endsWith(last4) || instrno.includes(last4);
}

// ---------------------------------------------------------------------------
// Test corpus — one entry per Cashiro test case (transaction, not null cases)
// ---------------------------------------------------------------------------

interface Case {
  bank: string;
  msg: string;
  amount: number;
  type: 'EXPENSE' | 'INCOME' | 'CREDIT';
  acctLast4?: string;
}

const CASES: Case[] = [
  // ── HDFC ─────────────────────────────────────────────────────────────────
  {
    bank: 'HDFC', amount: 500, type: 'EXPENSE', acctLast4: '1234',
    msg: 'Rs.500.00 debited from A/c XX1234 on 20-Oct-25 to merchant@upi (UPI Ref No 123456789012)',
  },
  {
    bank: 'HDFC', amount: 45, type: 'EXPENSE', acctLast4: '1234',
    msg: 'Sent Rs.45.00\nFrom HDFC Bank A/C *1234\nTo Sample Friend\nOn 23/05/26\nRef 123456789012\nNot You?\nContact bank support/SMS BLOCK UPI',
  },
  {
    bank: 'HDFC', amount: 70, type: 'EXPENSE', acctLast4: '1234',
    msg: 'Sent Rs.70.00\nFrom HDFC Bank A/C *1234\nTo 0000000000@bank\nOn 23/05/26\nRef 123456789013',
  },

  // ── SBI ──────────────────────────────────────────────────────────────────
  {
    bank: 'SBI', amount: 383, type: 'EXPENSE', acctLast4: '0000',
    msg: 'Dear Customer, transaction number 1234 for Rs.383.00 by SBI Debit Card 0000 done at merchant on 13Sep25 at 21:38:26. Your updated available balance is Rs.999999999. If not done by you, forward this SMS to 7400165218/ call 1800111109/9449112211 to block card.',
  },
  {
    bank: 'SBI', amount: 500, type: 'EXPENSE', acctLast4: '1234',
    msg: 'Rs.500 debited from A/c X1234 on 13Sep25. Avl Bal Rs.999999999',
  },
  {
    bank: 'SBI', amount: 230, type: 'EXPENSE', acctLast4: '1234',
    msg: 'Dear Customer, Your A/C XXXXX901234 has a debit by transfer of Rs 230.00 on 18/09/25. Avl Bal Rs 6,500.00.-SBI',
  },
  {
    bank: 'SBI', amount: 10700, type: 'INCOME', acctLast4: '4502',
    msg: 'Your A/C XXXXX314502 has credit for AOFS23546782123411BHPL of Rs 10,700.00 on 02/05/22. Avl Bal Rs 13,50,000.00.-SBI',
  },
  {
    bank: 'SBI', amount: 1207000, type: 'INCOME', acctLast4: '4567',
    msg: 'Dear Customer, Your A/C XXXXX314567 has a credit by Cheque of Rs 12,07,000.00 on 07/10/22. Avl Bal Rs 18,06,500.00.-SBI',
  },
  {
    bank: 'SBI', amount: 9000, type: 'INCOME', acctLast4: '4567',
    msg: 'Your AC XXXXX314567 Credited INR 9,000.00 on 22/05/22 -REVERSE ATM WDL. Avl Bal INR 13,08,900.00.-SBI',
  },
  {
    bank: 'SBI', amount: 500, type: 'EXPENSE', acctLast4: '5045',
    msg: "Dear Customer, Your a/c no. XXXXXXXX5045 is debited for Rs.500.00 on 31-03-26 and a/c XXXXXXX418 credited (IMPS Ref no ---------------). -SBI",
  },

  // ── ICICI ────────────────────────────────────────────────────────────────
  {
    bank: 'ICICI', amount: 11.8, type: 'EXPENSE', acctLast4: '7004',
    msg: 'USD 11.80 spent using ICICI Bank Card XX7004 on 03-Sep-25 on 1xJetBrains AI . Avl Limit: INR 17,95,899.53. If not you, call 1800 2662/SMS BLOCK 7004 to 9215676766.',
  },
  {
    bank: 'ICICI', amount: 649, type: 'EXPENSE', acctLast4: undefined,
    msg: 'Your account has been debited with Rs 649.00 towards Netflix Entertainment Ser for AutoPay MERCHANTMANDATE. RRN 421723106963. Avl Bal Rs 10,000.00-ICICI Bank',
  },
  {
    bank: 'ICICI', amount: 500, type: 'EXPENSE', acctLast4: '123',
    msg: 'ICICI Bank Acct XX123 debited for Rs 500.00 on 01-Oct-25; merchant credited. UPI: 543210987654. Call 18002662 for dispute. Updated Bal: Rs 5,000.00',
  },
  {
    bank: 'ICICI', amount: 18832, type: 'INCOME', acctLast4: '566',
    msg: 'ICICI Bank Account XX566 credited:Rs. 18,832.00 on 28-Feb-25. Info INF*000169831922*IQBO SAL FE. Available Balance is Rs. 28,076.14.',
  },
  {
    bank: 'ICICI', amount: 180, type: 'EXPENSE', acctLast4: '051',
    msg: 'ICICI Bank Acct XX051 debited for Rs 180.00 on 10-Nov-25; DINDUGAL ORIGIN credited. UPI:568069174081. Call 18002662 for dispute. SMS BLOCK 051 to 9215676766. 06:33 PM',
  },

  // ── Axis ─────────────────────────────────────────────────────────────────
  {
    bank: 'Axis', amount: 131, type: 'EXPENSE', acctLast4: '0818',
    msg: 'Spent INR 131\nAxis Bank Card no. XX0818\n05-10-25 09:43:27 IST\nSwiggy Limi\nAvl Limit: INR 217162.72\nNot you? SMS BLOCK 0818 to 919951860002',
  },
  {
    bank: 'Axis', amount: 2000, type: 'EXPENSE', acctLast4: '9034',
    msg: 'INR 2000.00 debited from A/c no. XX589034 on AXIS BANK L 04-11-2025 16:06:39 IST. Avl bal: INR 98919.81. Not you? SMS BLOCKCARD XX0192 to +919951860002 - Axis Bank',
  },
  {
    bank: 'Axis', amount: 500, type: 'EXPENSE', acctLast4: '2225',
    msg: 'INR 500.00 debited from A/c no. XX312225 on MERCHANT ABC 02-12-2025 20:38:23 IST. Avl bal: INR 10000.00. Not you? SMS BLOCKCARD XX0023 to +919951860002 - Axis Bank',
  },
  {
    bank: 'Axis', amount: 174, type: 'EXPENSE', acctLast4: '7441',
    msg: 'Spent INR 174\nAxis Bank Card no. XX7441\n13-09-25 21:35:56 IST\nBlinkit\nAvl Limit: INR 6652.78\nNot you? SMS BLOCK 7441 to 919951860002',
  },

  // ── Kotak ────────────────────────────────────────────────────────────────
  {
    bank: 'Kotak', amount: 15, type: 'EXPENSE', acctLast4: '1234',
    msg: 'Sent Rs.15.00 from Kotak Bank AC X1234 to paytmqr288005050101t74afkchmxjd@paytm on 14-10-25.UPI Ref 1234567890. Not you, https://kotak.com/KBANKT/Fraud',
  },
  {
    bank: 'Kotak', amount: 250, type: 'INCOME', acctLast4: '3333',
    msg: 'Received Rs.250.00 in your Kotak Bank AC X3333 from john.doe@oksbi on 14-10-25.UPI Ref 2222222222. Not you, https://kotak.com/KBANKT/Fraud',
  },
  {
    bank: 'Kotak', amount: 1000, type: 'EXPENSE', acctLast4: '4444',
    msg: 'Rs.1000.00 debited from your Kotak Bank AC X4444 on 15-10-25. Avl Bal Rs.10000.00',
  },

  // ── PNB ──────────────────────────────────────────────────────────────────
  {
    bank: 'PNB', amount: 5000, type: 'EXPENSE', acctLast4: '1234',
    msg: 'Ac XX1234 Debited with Rs.5000.00, 20-02-2026 07:47:16. Aval Bal Rs.27000.00 CR. Helpline 18001800/18002021-PNB',
  },
  {
    bank: 'PNB', amount: 10000, type: 'EXPENSE', acctLast4: '1234',
    msg: 'Ac XXXXXXXX00341234 Debited with Rs.10000.00, 20-06-2025 08:18:35. Aval Bal Rs.27000.00 CR. Helpline 18001800/18002021-PNB',
  },
  {
    bank: 'PNB', amount: 2, type: 'EXPENSE', acctLast4: '4356',
    msg: 'Dear Customer, auto pay facility has been successfully activated on your Punjab National Bank Card XX4356 for Rs. 75000.00, from Google Clouds. An initial amount of Rs. 2.00 has been debited from your account.',
  },

  // ── Canara ───────────────────────────────────────────────────────────────
  {
    bank: 'Canara', amount: 1000, type: 'EXPENSE', acctLast4: undefined,
    msg: 'Rs.1000.00 paid thru UPI to BMTC BUS, UPI Ref 123456789012. Total Avail.bal INR 9000.00',
  },
  {
    bank: 'Canara', amount: 500, type: 'EXPENSE', acctLast4: '1234',
    msg: 'INR 500.00 has been DEBITED from A/C XX1234. Total Avail.bal INR 4500.00',
  },
  {
    bank: 'Canara', amount: 2000, type: 'INCOME', acctLast4: undefined,
    msg: 'INR 2000.00 has been CREDITED. Total Avail.bal INR 12000.00',
  },

  // ── BOB ──────────────────────────────────────────────────────────────────
  {
    bank: 'BOB', amount: 29, type: 'EXPENSE', acctLast4: '5494',
    msg: 'Rs.29 transferred from A/c ...5494 to:Loan Recovery Fo. Total Bal:Rs.24898.57CR. Avlbl Amt:Rs.24898.57(04-11-2025 04:03:09) - Bank of Baroda',
  },

  // ── IDFC ─────────────────────────────────────────────────────────────────
  {
    bank: 'IDFC', amount: 500, type: 'EXPENSE', acctLast4: '1234',
    msg: 'IDFC FIRST Bank: Rs.500.00 debited from A/c XX1234 on 01-Oct-25. Avail Bal Rs.5000.00',
  },
  {
    bank: 'IDFC', amount: 1000, type: 'INCOME', acctLast4: '5678',
    msg: 'IDFC FIRST Bank: Rs.1000.00 credited to A/c XX5678 on 01-Oct-25. Avail Bal Rs.15000.00',
  },

  // ── IndusInd ─────────────────────────────────────────────────────────────
  {
    bank: 'IndusInd', amount: 500, type: 'EXPENSE', acctLast4: '1234',
    msg: 'Rs.500.00 debited from IndusInd Bank A/c no. XX1234 on 01/10/2025. Avail Bal: Rs.5000.00',
  },

  // ── YES Bank ─────────────────────────────────────────────────────────────
  {
    bank: 'YES', amount: 1000, type: 'EXPENSE', acctLast4: '1234',
    msg: 'Rs 1,000.00 debited from A/c XX1234 on 01-Oct-25. Avl Bal Rs 9,000.00 - YES BANK',
  },
  {
    bank: 'YES', amount: 5000, type: 'INCOME', acctLast4: '1234',
    msg: 'Rs 5,000.00 credited to A/c XX1234 on 01-Oct-25. Avl Bal Rs 14,000.00 - YES BANK',
  },

  // ── Union Bank ───────────────────────────────────────────────────────────
  {
    bank: 'Union', amount: 2000, type: 'EXPENSE', acctLast4: '1234',
    msg: 'Your A/c no XX1234 has been debited by Rs.2000.00 on 01/10/2025. Available balance Rs.10000.00',
  },
  {
    bank: 'Union', amount: 3000, type: 'INCOME', acctLast4: '1234',
    msg: 'Your A/c no XX1234 has been credited by Rs.3000.00 on 01/10/2025. Available balance Rs.13000.00',
  },

  // ── IDBI ─────────────────────────────────────────────────────────────────
  {
    bank: 'IDBI', amount: 500, type: 'EXPENSE', acctLast4: '1234',
    msg: 'Dear Customer, Rs.500.00 has been debited from your A/c XX1234 on 01-Oct-2025. Available balance Rs.4500.00 - IDBI Bank',
  },

  // ── Bandhan ──────────────────────────────────────────────────────────────
  {
    bank: 'Bandhan', amount: 200, type: 'EXPENSE', acctLast4: '1234',
    msg: 'Rs.200.00 debited from your Bandhan Bank a/c XX1234 on 01-Oct-25. Avl Bal Rs.1800.00',
  },

  // ── Equitas ──────────────────────────────────────────────────────────────
  {
    bank: 'Equitas', amount: 100, type: 'EXPENSE', acctLast4: '1234',
    msg: 'Rs.100.00 debited from Equitas Bank A/c XX1234 on 01-Oct-2025. Avl bal Rs.5000.00',
  },
];

// ---------------------------------------------------------------------------
// Benchmark runner
// ---------------------------------------------------------------------------

describe('Malana vs Cashiro — empirical benchmark', () => {
  const results: Array<{
    bank: string;
    msg: string;
    expected: { amount: number; type: string; acctLast4?: string };
    got: { amount: number; type: string | null; acct: string };
    amountOk: boolean;
    typeOk: boolean;
    acctOk: boolean;
    hasTransaction: boolean;
  }> = [];

  for (const tc of CASES) {
    const r = engine.parse(tc.msg);
    const { tags } = r;

    const gotAmt = malanaAmount(tags);
    const gotType = malanaType(tags);
    const gotAcct = tags['instrno'] || tags['acc'] || '';
    const hasTrx = !!(tags['trx'] || r.tokens.some(t => t.matched));

    const amountOk = !isNaN(gotAmt) && Math.abs(gotAmt - tc.amount) < 0.02;
    const typeOk = typeMatches(tc.type, gotType);
    const acctOk = acctMatches(tags, tc.acctLast4);

    results.push({
      bank: tc.bank,
      msg: tc.msg.slice(0, 70).replace(/\n/g, ' '),
      expected: { amount: tc.amount, type: tc.type, acctLast4: tc.acctLast4 },
      got: { amount: gotAmt, type: gotType, acct: gotAcct },
      amountOk, typeOk, acctOk, hasTransaction: hasTrx,
    });
  }

  it('prints full benchmark report', () => {
    const n = results.length;
    const amtPass = results.filter(r => r.amountOk).length;
    const typePass = results.filter(r => r.typeOk).length;
    const acctPass = results.filter(r => r.acctOk).length;
    const allPass = results.filter(r => r.amountOk && r.typeOk && r.acctOk).length;

    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('  MALANA BENCHMARK  —  vs Cashiro ground truth');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`  Cases: ${n}`);
    console.log(`  Amount correct:  ${amtPass}/${n}  (${pct(amtPass, n)})`);
    console.log(`  Type correct:    ${typePass}/${n}  (${pct(typePass, n)})`);
    console.log(`  Account correct: ${acctPass}/${n}  (${pct(acctPass, n)})`);
    console.log(`  ALL correct:     ${allPass}/${n}  (${pct(allPass, n)})`);
    console.log('───────────────────────────────────────────────────────────────');

    // Group failures by bank
    const failures = results.filter(r => !r.amountOk || !r.typeOk || !r.acctOk);
    if (failures.length === 0) {
      console.log('  ✓ All cases passed!');
    } else {
      console.log(`\n  FAILURES (${failures.length}):\n`);
      for (const f of failures) {
        const flags = [
          f.amountOk ? '✓amt' : `✗amt(got ${f.got.amount} want ${f.expected.amount})`,
          f.typeOk   ? '✓type' : `✗type(got ${f.got.type} want ${f.expected.type})`,
          f.acctOk   ? '✓acct' : `✗acct(got "${f.got.acct}" want *${f.expected.acctLast4})`,
        ].join(' ');
        console.log(`  [${f.bank.padEnd(9)}] ${flags}`);
        console.log(`             "${f.msg.slice(0, 80)}"`);
      }
    }
    console.log('═══════════════════════════════════════════════════════════════\n');

    // Don't fail the test — we want the report even if accuracy is low
    expect(n).toBeGreaterThan(0);
  });

  // Per-metric assertions with descriptive names so failures are clear
  it('detects transaction amount in ≥60% of cases', () => {
    const pass = results.filter(r => r.amountOk).length;
    expect(pass / results.length).toBeGreaterThanOrEqual(0.6);
  });

  it('detects debit/credit direction in ≥60% of cases', () => {
    const pass = results.filter(r => r.typeOk).length;
    expect(pass / results.length).toBeGreaterThanOrEqual(0.6);
  });
});

function pct(n: number, d: number): string {
  return d === 0 ? '0%' : `${Math.round((n / d) * 100)}%`;
}
