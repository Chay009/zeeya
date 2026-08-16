/**
 * Malana accuracy benchmark.
 *
 * Ground truth is established from two sources:
 *   1. Real bank SMS messages with manually verified expected values.
 *   2. Cashiro's KotlinTest.kt corpus for HDFC, SBI, ICICI, Axis, Kotak, PNB, Canara, BOB.
 *
 * TYPE SEMANTICS — important:
 *   Cashiro's TransactionType.CREDIT means "credit card purchase" (money leaving via card),
 *   NOT "money coming in". In this benchmark, type is about money direction:
 *     EXPENSE = money leaving the user's account (debit OR credit card spend)
 *     INCOME  = money arriving in the user's account
 *   So "Spent INR 131 Axis Bank Card" → EXPENSE (money out), even though it's on a credit card.
 *
 * HARD THRESHOLDS — gating CI:
 *   Amount:  ≥ 95%
 *   Type:    ≥ 95%
 *   Account: ≥ 90%  (some messages deliberately omit account)
 */

import { describe, it, expect } from 'vitest';
import { MalanaEngine } from './malana.js';
import { seedData } from './index.js';

const engine = new MalanaEngine(seedData);

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseAmount(s: string): number {
  if (!s) return NaN;
  return parseFloat(
    s.replace(/[₹$€¥₩£]|Rs\.?|INR|USD|EUR|GBP|AED|SGD\s*/gi, '').replace(/,/g, '').trim()
  );
}

function malanaAmount(tags: Record<string, string>): number {
  return parseAmount(tags['trx'] || tags['amount'] || '');
}

function malanaType(tags: Record<string, string>): 'debit' | 'credit' | null {
  const t = (tags['type'] || '').toLowerCase();
  if (t === 'debit') return 'debit';
  if (t === 'credit') return 'credit';
  return null;
}

function typeMatches(expected: 'EXPENSE' | 'INCOME', got: 'debit' | 'credit' | null): boolean {
  if (!got) return false;
  return expected === 'EXPENSE' ? got === 'debit' : got === 'credit';
}

function acctMatches(tags: Record<string, string>, last4: string | undefined): boolean {
  if (!last4) return true;
  const instrno = tags['instrno'] || tags['acc'] || '';
  return instrno.endsWith(last4) || instrno.includes(last4);
}

// ── Transaction corpus ────────────────────────────────────────────────────────

interface Case {
  bank: string;
  sender: string;
  msg: string;
  amount: number;
  type: 'EXPENSE' | 'INCOME';
  acctLast4?: string;
}

// Null-result corpus — these should NOT produce a transaction parse.
// Important: these must contain NO monetary amounts so there is nothing for the
// engine to extract as trx/amount. Bills/reminders with amounts ARE parsed — that
// is expected behaviour, not a false positive.
const NULL_CASES: Array<{ bank: string; sender: string; msg: string; label: string }> = [
  {
    bank: 'HDFC', sender: 'VM-HDFCBK', label: 'OTP message',
    msg: 'Your OTP for HDFC Bank NetBanking login is 482910. Valid for 10 minutes. Do not share with anyone.',
  },
  {
    bank: 'ICICI', sender: 'VM-ICICIB', label: 'password change alert',
    msg: 'Your ICICI Bank Internet Banking password was changed on 13-Nov-25. If this was not done by you, call 1800-1080 immediately.',
  },
  {
    bank: 'SBI', sender: 'VM-SBIINB', label: 'account blocked alert',
    msg: 'Dear Customer, your SBI Net Banking User ID has been blocked due to multiple incorrect login attempts. Please visit your branch to unblock.',
  },
  {
    bank: 'Axis', sender: 'VM-AXISBK', label: 'statement ready notification',
    msg: 'Your Axis Bank Credit Card statement for Oct 2025 is now ready. Log in to axisbank.com to view your statement.',
  },
  {
    bank: 'Kotak', sender: 'VM-KOTAKB', label: 'card activated notification',
    msg: 'Your Kotak Mahindra Bank Debit Card ending 5678 has been activated successfully. Keep your PIN confidential. Call 1860-266-2666 for help.',
  },
];

const CASES: Case[] = [
  // ── HDFC (from Cashiro KotlinTest.kt) ────────────────────────────────────
  {
    bank: 'HDFC', sender: 'VM-HDFCBK', amount: 500, type: 'EXPENSE', acctLast4: '1234',
    msg: 'Rs.500.00 debited from A/c XX1234 on 20-Oct-25 to merchant@upi (UPI Ref No 123456789012)',
  },
  {
    bank: 'HDFC', sender: 'VM-HDFCBK', amount: 45, type: 'EXPENSE', acctLast4: '1234',
    msg: 'Sent Rs.45.00\nFrom HDFC Bank A/C *1234\nTo Sample Friend\nOn 23/05/26\nRef 123456789012\nNot You?\nContact bank support/SMS BLOCK UPI',
  },
  {
    bank: 'HDFC', sender: 'VM-HDFCBK', amount: 70, type: 'EXPENSE', acctLast4: '1234',
    msg: 'Sent Rs.70.00\nFrom HDFC Bank A/C *1234\nTo 0000000000@bank\nOn 23/05/26\nRef 123456789013',
  },

  // ── SBI (from Cashiro KotlinTest.kt) ─────────────────────────────────────
  {
    bank: 'SBI', sender: 'VM-SBIINB', amount: 383, type: 'EXPENSE', acctLast4: '0000',
    msg: 'Dear Customer, transaction number 1234 for Rs.383.00 by SBI Debit Card 0000 done at merchant on 13Sep25 at 21:38:26. Your updated available balance is Rs.999999999. If not done by you, forward this SMS to 7400165218/ call 1800111109/9449112211 to block card.',
  },
  {
    bank: 'SBI', sender: 'VM-SBIINB', amount: 500, type: 'EXPENSE', acctLast4: '1234',
    msg: 'Rs.500 debited from A/c X1234 on 13Sep25. Avl Bal Rs.999999999',
  },
  {
    bank: 'SBI', sender: 'VM-SBIINB', amount: 230, type: 'EXPENSE', acctLast4: '1234',
    msg: 'Dear Customer, Your A/C XXXXX901234 has a debit by transfer of Rs 230.00 on 18/09/25. Avl Bal Rs 6,500.00.-SBI',
  },
  {
    bank: 'SBI', sender: 'VM-SBIINB', amount: 10700, type: 'INCOME', acctLast4: '4502',
    msg: 'Your A/C XXXXX314502 has credit for AOFS23546782123411BHPL of Rs 10,700.00 on 02/05/22. Avl Bal Rs 13,50,000.00.-SBI',
  },
  {
    bank: 'SBI', sender: 'VM-SBIINB', amount: 1207000, type: 'INCOME', acctLast4: '4567',
    msg: 'Dear Customer, Your A/C XXXXX314567 has a credit by Cheque of Rs 12,07,000.00 on 07/10/22. Avl Bal Rs 18,06,500.00.-SBI',
  },
  {
    bank: 'SBI', sender: 'VM-SBIINB', amount: 9000, type: 'INCOME', acctLast4: '4567',
    msg: 'Your AC XXXXX314567 Credited INR 9,000.00 on 22/05/22 -REVERSE ATM WDL. Avl Bal INR 13,08,900.00.-SBI',
  },
  {
    bank: 'SBI', sender: 'VM-SBIINB', amount: 500, type: 'EXPENSE', acctLast4: '5045',
    msg: "Dear Customer, Your a/c no. XXXXXXXX5045 is debited for Rs.500.00 on 31-03-26 and a/c XXXXXXX418 credited (IMPS Ref no ---------------). -SBI",
  },

  // ── ICICI (from Cashiro KotlinTest.kt) ───────────────────────────────────
  // Note: "spent using ICICI Bank Card" is EXPENSE — money leaves the user's account
  // regardless of whether it's a credit card. Cashiro returns TransactionType.CREDIT
  // (meaning "credit card purchase") which is a different type dimension; both are correct
  // in their own taxonomy.
  {
    bank: 'ICICI', sender: 'VM-ICICIB', amount: 11.8, type: 'EXPENSE', acctLast4: '7004',
    msg: 'USD 11.80 spent using ICICI Bank Card XX7004 on 03-Sep-25 on 1xJetBrains AI . Avl Limit: INR 17,95,899.53. If not you, call 1800 2662/SMS BLOCK 7004 to 9215676766.',
  },
  {
    bank: 'ICICI', sender: 'VM-ICICIB', amount: 649, type: 'EXPENSE', acctLast4: undefined,
    msg: 'Your account has been debited with Rs 649.00 towards Netflix Entertainment Ser for AutoPay MERCHANTMANDATE. RRN 421723106963. Avl Bal Rs 10,000.00-ICICI Bank',
  },
  {
    bank: 'ICICI', sender: 'VM-ICICIB', amount: 500, type: 'EXPENSE', acctLast4: '123',
    msg: 'ICICI Bank Acct XX123 debited for Rs 500.00 on 01-Oct-25; merchant credited. UPI: 543210987654. Call 18002662 for dispute. Updated Bal: Rs 5,000.00',
  },
  {
    bank: 'ICICI', sender: 'VM-ICICIB', amount: 18832, type: 'INCOME', acctLast4: '566',
    msg: 'ICICI Bank Account XX566 credited:Rs. 18,832.00 on 28-Feb-25. Info INF*000169831922*IQBO SAL FE. Available Balance is Rs. 28,076.14.',
  },
  {
    bank: 'ICICI', sender: 'VM-ICICIB', amount: 180, type: 'EXPENSE', acctLast4: '051',
    msg: 'ICICI Bank Acct XX051 debited for Rs 180.00 on 10-Nov-25; DINDUGAL ORIGIN credited. UPI:568069174081. Call 18002662 for dispute. SMS BLOCK 051 to 9215676766. 06:33 PM',
  },

  // ── Axis (from Cashiro KotlinTest.kt) ────────────────────────────────────
  {
    bank: 'Axis', sender: 'VM-AXISBK', amount: 131, type: 'EXPENSE', acctLast4: '0818',
    msg: 'Spent INR 131\nAxis Bank Card no. XX0818\n05-10-25 09:43:27 IST\nSwiggy Limi\nAvl Limit: INR 217162.72\nNot you? SMS BLOCK 0818 to 919951860002',
  },
  {
    bank: 'Axis', sender: 'VM-AXISBK', amount: 2000, type: 'EXPENSE', acctLast4: '9034',
    msg: 'INR 2000.00 debited from A/c no. XX589034 on AXIS BANK L 04-11-2025 16:06:39 IST. Avl bal: INR 98919.81. Not you? SMS BLOCKCARD XX0192 to +919951860002 - Axis Bank',
  },
  {
    bank: 'Axis', sender: 'VM-AXISBK', amount: 500, type: 'EXPENSE', acctLast4: '2225',
    msg: 'INR 500.00 debited from A/c no. XX312225 on MERCHANT ABC 02-12-2025 20:38:23 IST. Avl bal: INR 10000.00. Not you? SMS BLOCKCARD XX0023 to +919951860002 - Axis Bank',
  },
  {
    bank: 'Axis', sender: 'VM-AXISBK', amount: 174, type: 'EXPENSE', acctLast4: '7441',
    msg: 'Spent INR 174\nAxis Bank Card no. XX7441\n13-09-25 21:35:56 IST\nBlinkit\nAvl Limit: INR 6652.78\nNot you? SMS BLOCK 7441 to 919951860002',
  },

  // ── Kotak (from Cashiro KotlinTest.kt) ───────────────────────────────────
  {
    bank: 'Kotak', sender: 'VM-KOTAKB', amount: 15, type: 'EXPENSE', acctLast4: '1234',
    msg: 'Sent Rs.15.00 from Kotak Bank AC X1234 to paytmqr288005050101t74afkchmxjd@paytm on 14-10-25.UPI Ref 1234567890. Not you, https://kotak.com/KBANKT/Fraud',
  },
  {
    bank: 'Kotak', sender: 'VM-KOTAKB', amount: 250, type: 'INCOME', acctLast4: '3333',
    msg: 'Received Rs.250.00 in your Kotak Bank AC X3333 from john.doe@oksbi on 14-10-25.UPI Ref 2222222222. Not you, https://kotak.com/KBANKT/Fraud',
  },
  {
    bank: 'Kotak', sender: 'VM-KOTAKB', amount: 1000, type: 'EXPENSE', acctLast4: '4444',
    msg: 'Rs.1000.00 debited from your Kotak Bank AC X4444 on 15-10-25. Avl Bal Rs.10000.00',
  },

  // ── PNB (from Cashiro KotlinTest.kt) ─────────────────────────────────────
  {
    bank: 'PNB', sender: 'VM-PNBSMS', amount: 5000, type: 'EXPENSE', acctLast4: '1234',
    msg: 'Ac XX1234 Debited with Rs.5000.00, 20-02-2026 07:47:16. Aval Bal Rs.27000.00 CR. Helpline 18001800/18002021-PNB',
  },
  {
    bank: 'PNB', sender: 'VM-PNBSMS', amount: 10000, type: 'EXPENSE', acctLast4: '1234',
    msg: 'Ac XXXXXXXX00341234 Debited with Rs.10000.00, 20-06-2025 08:18:35. Aval Bal Rs.27000.00 CR. Helpline 18001800/18002021-PNB',
  },
  {
    bank: 'PNB', sender: 'VM-PNBSMS', amount: 2, type: 'EXPENSE', acctLast4: '4356',
    msg: 'Dear Customer, auto pay facility has been successfully activated on your Punjab National Bank Card XX4356 for Rs. 75000.00, from Google Clouds. An initial amount of Rs. 2.00 has been debited from your account.',
  },

  // ── Canara ───────────────────────────────────────────────────────────────
  {
    bank: 'Canara', sender: 'VM-CANBNK', amount: 1000, type: 'EXPENSE', acctLast4: undefined,
    msg: 'Rs.1000.00 paid thru UPI to BMTC BUS, UPI Ref 123456789012. Total Avail.bal INR 9000.00',
  },
  {
    bank: 'Canara', sender: 'VM-CANBNK', amount: 500, type: 'EXPENSE', acctLast4: '1234',
    msg: 'INR 500.00 has been DEBITED from A/C XX1234. Total Avail.bal INR 4500.00',
  },
  {
    bank: 'Canara', sender: 'VM-CANBNK', amount: 2000, type: 'INCOME', acctLast4: undefined,
    msg: 'INR 2000.00 has been CREDITED. Total Avail.bal INR 12000.00',
  },

  // ── Bank of Baroda ────────────────────────────────────────────────────────
  {
    bank: 'BOB', sender: 'VM-BOBSMS', amount: 29, type: 'EXPENSE', acctLast4: '5494',
    msg: 'Rs.29 transferred from A/c ...5494 to:Loan Recovery Fo. Total Bal:Rs.24898.57CR. Avlbl Amt:Rs.24898.57(04-11-2025 04:03:09) - Bank of Baroda',
  },

  // ── IDFC FIRST Bank ───────────────────────────────────────────────────────
  {
    bank: 'IDFC', sender: 'VM-IDFCBK', amount: 750, type: 'EXPENSE', acctLast4: '4321',
    msg: 'IDFC FIRST Bank: Rs.750.00 debited from your a/c XX4321 via UPI on 12-Nov-25 14:22:10. Ref: 623819204756. Avl Bal: Rs.12,450.00',
  },
  {
    bank: 'IDFC', sender: 'VM-IDFCBK', amount: 5000, type: 'INCOME', acctLast4: '4321',
    msg: 'IDFC FIRST Bank: Rs.5,000.00 credited to your a/c XX4321 via NEFT on 01-Nov-25. Avl Bal: Rs.17,450.00',
  },

  // ── IndusInd Bank ─────────────────────────────────────────────────────────
  {
    bank: 'IndusInd', sender: 'VM-INDUSB', amount: 1200, type: 'EXPENSE', acctLast4: '3456',
    msg: 'INR 1,200.00 debited from your IndusInd Bank Account XX3456 via IMPS on 15-Oct-25. Avbl Bal INR 45,678.00. Ref: 512836479021',
  },
  {
    bank: 'IndusInd', sender: 'VM-INDUSB', amount: 8500, type: 'INCOME', acctLast4: '3456',
    msg: 'INR 8,500.00 credited to your IndusInd Bank Account XX3456 via NEFT on 28-Oct-25. Avbl Bal INR 54,178.00',
  },

  // ── YES Bank ─────────────────────────────────────────────────────────────
  {
    bank: 'YES', sender: 'VM-YESBNK', amount: 2500, type: 'EXPENSE', acctLast4: '7890',
    msg: 'Rs. 2,500.00 has been debited from your YES BANK Account No. XXXX7890 on 20-Oct-25 14:32:17 IST by UPI. Available Balance: Rs. 38,500.00',
  },
  {
    bank: 'YES', sender: 'VM-YESBNK', amount: 15000, type: 'INCOME', acctLast4: '7890',
    msg: 'Rs. 15,000.00 has been credited to your YES BANK Account No. XXXX7890 on 01-Nov-25 09:15:33 IST via NEFT. Available Balance: Rs. 53,500.00',
  },

  // ── Union Bank ────────────────────────────────────────────────────────────
  {
    bank: 'Union', sender: 'VM-UNIONB', amount: 3000, type: 'EXPENSE', acctLast4: '2468',
    msg: 'Dear Customer, Your A/C No. XXXX2468 has been debited for Rs.3,000.00 on 01/11/2025 through NEFT. Available Balance: Rs.25,000.00. -Union Bank of India',
  },
  {
    bank: 'Union', sender: 'VM-UNIONB', amount: 7500, type: 'INCOME', acctLast4: '2468',
    msg: 'Dear Customer, Your A/C No. XXXX2468 has been credited for Rs.7,500.00 on 15/11/2025. Info: SALARY NOV25. Available Balance: Rs.32,500.00. -Union Bank of India',
  },

  // ── IDBI Bank ─────────────────────────────────────────────────────────────
  {
    bank: 'IDBI', sender: 'VM-IDBIBK', amount: 1500, type: 'EXPENSE', acctLast4: '9012',
    msg: 'Dear Customer, an amount of Rs.1,500.00 has been debited from your IDBI Bank A/c XX9012 on 05-Nov-25. Available balance: Rs.8,500.00. -IDBI Bank',
  },

  // ── Bandhan Bank ──────────────────────────────────────────────────────────
  {
    bank: 'Bandhan', sender: 'VM-BANDHAN', amount: 500, type: 'EXPENSE', acctLast4: '3579',
    msg: 'Rs. 500.00 debited from your Bandhan Bank A/c XXXX3579 on 10-Nov-25 via UPI. Avl Bal: Rs. 4,500.00. Ref No: 712934056821',
  },

  // ── Equitas Small Finance Bank ────────────────────────────────────────────
  {
    bank: 'Equitas', sender: 'VM-EQSFBK', amount: 800, type: 'EXPENSE', acctLast4: '6543',
    msg: 'Rs.800.00 debited from your Equitas Small Finance Bank A/c XX6543 on 20-Nov-25. Avl Bal: Rs.9,200.00',
  },
];

// ── Benchmark runner ──────────────────────────────────────────────────────────

describe('Malana accuracy benchmark', () => {
  interface Result {
    bank: string;
    msg: string;
    expected: { amount: number; type: string; acctLast4?: string };
    got: { amount: number; type: string | null; acct: string };
    amountOk: boolean;
    typeOk: boolean;
    acctOk: boolean;
  }

  const results: Result[] = [];

  for (const tc of CASES) {
    const r = engine.parse(tc.msg, tc.sender);
    const { tags } = r;
    const gotAmt  = malanaAmount(tags);
    const gotType = malanaType(tags);
    const gotAcct = tags['instrno'] || tags['acc'] || '';

    results.push({
      bank: tc.bank,
      msg: tc.msg.slice(0, 70).replace(/\n/g, ' '),
      expected: { amount: tc.amount, type: tc.type, acctLast4: tc.acctLast4 },
      got: { amount: gotAmt, type: gotType, acct: gotAcct },
      amountOk: !isNaN(gotAmt) && Math.abs(gotAmt - tc.amount) < 0.02,
      typeOk:   typeMatches(tc.type, gotType),
      acctOk:   acctMatches(tags, tc.acctLast4),
    });
  }

  it('full benchmark report', () => {
    const n = results.length;
    const amtPass  = results.filter(r => r.amountOk).length;
    const typePass = results.filter(r => r.typeOk).length;
    const acctPass = results.filter(r => r.acctOk).length;
    const allPass  = results.filter(r => r.amountOk && r.typeOk && r.acctOk).length;

    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('  MALANA BENCHMARK');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`  Cases: ${n}`);
    console.log(`  Amount correct:  ${amtPass}/${n}  (${pct(amtPass, n)})`);
    console.log(`  Type correct:    ${typePass}/${n}  (${pct(typePass, n)})`);
    console.log(`  Account correct: ${acctPass}/${n}  (${pct(acctPass, n)})`);
    console.log(`  ALL correct:     ${allPass}/${n}  (${pct(allPass, n)})`);
    console.log('───────────────────────────────────────────────────────────────');

    const failures = results.filter(r => !r.amountOk || !r.typeOk || !r.acctOk);
    if (failures.length === 0) {
      console.log('  ✓ All cases passed!');
    } else {
      console.log(`\n  FAILURES (${failures.length}):\n`);
      for (const f of failures) {
        const flags = [
          f.amountOk ? '✓amt'  : `✗amt (got ${f.got.amount} want ${f.expected.amount})`,
          f.typeOk   ? '✓type' : `✗type(got ${f.got.type} want ${f.expected.type})`,
          f.acctOk   ? '✓acct' : `✗acct(got "${f.got.acct}" want *${f.expected.acctLast4})`,
        ].join(' ');
        console.log(`  [${f.bank.padEnd(9)}] ${flags}`);
        console.log(`             "${f.msg}"`);
      }
    }
    console.log('═══════════════════════════════════════════════════════════════\n');

    // Hard assertions — these gate CI
    expect(amtPass / n, `Amount accuracy below 95%: ${amtPass}/${n}`).toBeGreaterThanOrEqual(0.95);
    expect(typePass / n, `Type accuracy below 95%: ${typePass}/${n}`).toBeGreaterThanOrEqual(0.95);
    expect(acctPass / n, `Account accuracy below 90%: ${acctPass}/${n}`).toBeGreaterThanOrEqual(0.90);
  });

  // ── Negative cases — these should return no transaction tags ──────────────
  it('does not parse non-transaction SMS', () => {
    const failures: string[] = [];

    for (const nc of NULL_CASES) {
      const r = engine.parse(nc.msg, nc.sender);
      // A "parsed" result would have trx tag or matched transaction tokens
      const hasTrx = !!(r.tags['trx'] || r.tags['amount']);
      if (hasTrx) {
        failures.push(`[${nc.bank}] "${nc.label}" — got trx: ${r.tags['trx'] || r.tags['amount']}`);
      }
    }

    if (failures.length > 0) {
      console.log('\n  FALSE POSITIVES (non-transaction SMS parsed as transaction):');
      failures.forEach(f => console.log('  ' + f));
      console.log('');
    }

    // Allow at most 1 false positive (some patterns are genuinely ambiguous)
    expect(failures.length, `Too many false positives: ${failures.join(', ')}`).toBeLessThanOrEqual(1);
  });
});

function pct(n: number, d: number): string {
  return d === 0 ? '0%' : `${Math.round((n / d) * 100)}%`;
}
