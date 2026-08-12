/**
 * Cashiro parser benchmark — same 39 SMS cases as the Malana benchmark.
 * No production code changes; just measures what parseSms() currently extracts.
 */

import { describe, it } from 'vitest';
import { parseSms } from './factory.js';

interface Case {
  bank: string;
  sender: string;
  msg: string;
  amount: number;
  type: 'EXPENSE' | 'INCOME' | 'CREDIT';
  acctLast4?: string;
}

const CASES: Case[] = [
  // ── HDFC ─────────────────────────────────────────────────────────────────
  {
    bank: 'HDFC', sender: 'HDFCBK', amount: 500, type: 'EXPENSE', acctLast4: '1234',
    msg: 'Rs.500.00 debited from A/c XX1234 on 20-Oct-25 to merchant@upi (UPI Ref No 123456789012)',
  },
  {
    bank: 'HDFC', sender: 'HDFCBK', amount: 45, type: 'EXPENSE', acctLast4: '1234',
    msg: 'Sent Rs.45.00\nFrom HDFC Bank A/C *1234\nTo Sample Friend\nOn 23/05/26\nRef 123456789012\nNot You?\nContact bank support/SMS BLOCK UPI',
  },
  {
    bank: 'HDFC', sender: 'HDFCBK', amount: 70, type: 'EXPENSE', acctLast4: '1234',
    msg: 'Sent Rs.70.00\nFrom HDFC Bank A/C *1234\nTo 0000000000@bank\nOn 23/05/26\nRef 123456789013',
  },

  // ── SBI ──────────────────────────────────────────────────────────────────
  {
    bank: 'SBI', sender: 'SBIBNK', amount: 383, type: 'EXPENSE', acctLast4: '0000',
    msg: 'Dear Customer, transaction number 1234 for Rs.383.00 by SBI Debit Card 0000 done at merchant on 13Sep25 at 21:38:26. Your updated available balance is Rs.999999999. If not done by you, forward this SMS to 7400165218/ call 1800111109/9449112211 to block card.',
  },
  {
    bank: 'SBI', sender: 'SBIBNK', amount: 500, type: 'EXPENSE', acctLast4: '1234',
    msg: 'Rs.500 debited from A/c X1234 on 13Sep25. Avl Bal Rs.999999999',
  },
  {
    bank: 'SBI', sender: 'SBIBNK', amount: 230, type: 'EXPENSE', acctLast4: '1234',
    msg: 'Dear Customer, Your A/C XXXXX901234 has a debit by transfer of Rs 230.00 on 18/09/25. Avl Bal Rs 6,500.00.-SBI',
  },
  {
    bank: 'SBI', sender: 'SBIBNK', amount: 10700, type: 'INCOME', acctLast4: '4502',
    msg: 'Your A/C XXXXX314502 has credit for AOFS23546782123411BHPL of Rs 10,700.00 on 02/05/22. Avl Bal Rs 13,50,000.00.-SBI',
  },
  {
    bank: 'SBI', sender: 'SBIBNK', amount: 1207000, type: 'INCOME', acctLast4: '4567',
    msg: 'Dear Customer, Your A/C XXXXX314567 has a credit by Cheque of Rs 12,07,000.00 on 07/10/22. Avl Bal Rs 18,06,500.00.-SBI',
  },
  {
    bank: 'SBI', sender: 'SBIBNK', amount: 9000, type: 'INCOME', acctLast4: '4567',
    msg: 'Your AC XXXXX314567 Credited INR 9,000.00 on 22/05/22 -REVERSE ATM WDL. Avl Bal INR 13,08,900.00.-SBI',
  },
  {
    bank: 'SBI', sender: 'SBIBNK', amount: 500, type: 'EXPENSE', acctLast4: '5045',
    msg: "Dear Customer, Your a/c no. XXXXXXXX5045 is debited for Rs.500.00 on 31-03-26 and a/c XXXXXXX418 credited (IMPS Ref no ---------------). -SBI",
  },

  // ── ICICI ────────────────────────────────────────────────────────────────
  {
    bank: 'ICICI', sender: 'ICICIB', amount: 11.8, type: 'EXPENSE', acctLast4: '7004',
    msg: 'USD 11.80 spent using ICICI Bank Card XX7004 on 03-Sep-25 on 1xJetBrains AI . Avl Limit: INR 17,95,899.53. If not you, call 1800 2662/SMS BLOCK 7004 to 9215676766.',
  },
  {
    bank: 'ICICI', sender: 'ICICIB', amount: 649, type: 'EXPENSE', acctLast4: undefined,
    msg: 'Your account has been debited with Rs 649.00 towards Netflix Entertainment Ser for AutoPay MERCHANTMANDATE. RRN 421723106963. Avl Bal Rs 10,000.00-ICICI Bank',
  },
  {
    bank: 'ICICI', sender: 'ICICIB', amount: 500, type: 'EXPENSE', acctLast4: '123',
    msg: 'ICICI Bank Acct XX123 debited for Rs 500.00 on 01-Oct-25; merchant credited. UPI: 543210987654. Call 18002662 for dispute. Updated Bal: Rs 5,000.00',
  },
  {
    bank: 'ICICI', sender: 'ICICIB', amount: 18832, type: 'INCOME', acctLast4: '566',
    msg: 'ICICI Bank Account XX566 credited:Rs. 18,832.00 on 28-Feb-25. Info INF*000169831922*IQBO SAL FE. Available Balance is Rs. 28,076.14.',
  },
  {
    bank: 'ICICI', sender: 'ICICIB', amount: 180, type: 'EXPENSE', acctLast4: '051',
    msg: 'ICICI Bank Acct XX051 debited for Rs 180.00 on 10-Nov-25; DINDUGAL ORIGIN credited. UPI:568069174081. Call 18002662 for dispute. SMS BLOCK 051 to 9215676766. 06:33 PM',
  },

  // ── Axis ─────────────────────────────────────────────────────────────────
  {
    bank: 'Axis', sender: 'AXISBK', amount: 131, type: 'EXPENSE', acctLast4: '0818',
    msg: 'Spent INR 131\nAxis Bank Card no. XX0818\n05-10-25 09:43:27 IST\nSwiggy Limi\nAvl Limit: INR 217162.72\nNot you? SMS BLOCK 0818 to 919951860002',
  },
  {
    bank: 'Axis', sender: 'AXISBK', amount: 2000, type: 'EXPENSE', acctLast4: '9034',
    msg: 'INR 2000.00 debited from A/c no. XX589034 on AXIS BANK L 04-11-2025 16:06:39 IST. Avl bal: INR 98919.81. Not you? SMS BLOCKCARD XX0192 to +919951860002 - Axis Bank',
  },
  {
    bank: 'Axis', sender: 'AXISBK', amount: 500, type: 'EXPENSE', acctLast4: '2225',
    msg: 'INR 500.00 debited from A/c no. XX312225 on MERCHANT ABC 02-12-2025 20:38:23 IST. Avl bal: INR 10000.00. Not you? SMS BLOCKCARD XX0023 to +919951860002 - Axis Bank',
  },
  {
    bank: 'Axis', sender: 'AXISBK', amount: 174, type: 'EXPENSE', acctLast4: '7441',
    msg: 'Spent INR 174\nAxis Bank Card no. XX7441\n13-09-25 21:35:56 IST\nBlinkit\nAvl Limit: INR 6652.78\nNot you? SMS BLOCK 7441 to 919951860002',
  },

  // ── Kotak ────────────────────────────────────────────────────────────────
  {
    bank: 'Kotak', sender: 'KOTAKB', amount: 15, type: 'EXPENSE', acctLast4: '1234',
    msg: 'Sent Rs.15.00 from Kotak Bank AC X1234 to paytmqr288005050101t74afkchmxjd@paytm on 14-10-25.UPI Ref 1234567890. Not you, https://kotak.com/KBANKT/Fraud',
  },
  {
    bank: 'Kotak', sender: 'KOTAKB', amount: 250, type: 'INCOME', acctLast4: '3333',
    msg: 'Received Rs.250.00 in your Kotak Bank AC X3333 from john.doe@oksbi on 14-10-25.UPI Ref 2222222222. Not you, https://kotak.com/KBANKT/Fraud',
  },
  {
    bank: 'Kotak', sender: 'KOTAKB', amount: 1000, type: 'EXPENSE', acctLast4: '4444',
    msg: 'Rs.1000.00 debited from your Kotak Bank AC X4444 on 15-10-25. Avl Bal Rs.10000.00',
  },

  // ── PNB ──────────────────────────────────────────────────────────────────
  {
    bank: 'PNB', sender: 'PNBSMS', amount: 5000, type: 'EXPENSE', acctLast4: '1234',
    msg: 'Ac XX1234 Debited with Rs.5000.00, 20-02-2026 07:47:16. Aval Bal Rs.27000.00 CR. Helpline 18001800/18002021-PNB',
  },
  {
    bank: 'PNB', sender: 'PNBSMS', amount: 10000, type: 'EXPENSE', acctLast4: '1234',
    msg: 'Ac XXXXXXXX00341234 Debited with Rs.10000.00, 20-06-2025 08:18:35. Aval Bal Rs.27000.00 CR. Helpline 18001800/18002021-PNB',
  },
  {
    bank: 'PNB', sender: 'PNBSMS', amount: 2, type: 'EXPENSE', acctLast4: '4356',
    msg: 'Dear Customer, auto pay facility has been successfully activated on your Punjab National Bank Card XX4356 for Rs. 75000.00, from Google Clouds. An initial amount of Rs. 2.00 has been debited from your account.',
  },

  // ── Canara ───────────────────────────────────────────────────────────────
  {
    bank: 'Canara', sender: 'CANBNK', amount: 1000, type: 'EXPENSE', acctLast4: undefined,
    msg: 'Rs.1000.00 paid thru UPI to BMTC BUS, UPI Ref 123456789012. Total Avail.bal INR 9000.00',
  },
  {
    bank: 'Canara', sender: 'CANBNK', amount: 500, type: 'EXPENSE', acctLast4: '1234',
    msg: 'INR 500.00 has been DEBITED from A/C XX1234. Total Avail.bal INR 4500.00',
  },
  {
    bank: 'Canara', sender: 'CANBNK', amount: 2000, type: 'INCOME', acctLast4: undefined,
    msg: 'INR 2000.00 has been CREDITED. Total Avail.bal INR 12000.00',
  },

  // ── BOB ──────────────────────────────────────────────────────────────────
  {
    bank: 'BOB', sender: 'BOBSMS', amount: 1500, type: 'EXPENSE', acctLast4: '5678',
    msg: 'Your A/c no. XX5678 is debited with INR 1,500.00 on 10-Nov-25. Avl bal INR 8,500.00. -Bank of Baroda',
  },
  {
    bank: 'BOB', sender: 'BOBSMS', amount: 3000, type: 'INCOME', acctLast4: '5678',
    msg: 'Your A/c no. XX5678 is credited with INR 3,000.00 on 10-Nov-25. Avl bal INR 11,500.00. -Bank of Baroda',
  },

  // ── IDFC ─────────────────────────────────────────────────────────────────
  {
    bank: 'IDFC', sender: 'IDFCBK', amount: 799, type: 'EXPENSE', acctLast4: '9012',
    msg: 'INR 799.00 debited from your IDFC FIRST Bank A/c XX9012 on 05-Nov-25. Available balance: INR 4201.00',
  },
  {
    bank: 'IDFC', sender: 'IDFCBK', amount: 5000, type: 'INCOME', acctLast4: '9012',
    msg: 'INR 5,000.00 credited to your IDFC FIRST Bank A/c XX9012 on 05-Nov-25. Available balance: INR 9201.00',
  },

  // ── IndusInd ─────────────────────────────────────────────────────────────
  {
    bank: 'IndusInd', sender: 'INDBNK', amount: 500, type: 'EXPENSE', acctLast4: '1234',
    msg: 'Rs.500.00 debited from IndusInd Bank A/c no. XX1234 on 01/10/2025. Avail Bal: Rs.5000.00',
  },

  // ── YES Bank ─────────────────────────────────────────────────────────────
  {
    bank: 'YES', sender: 'YESBNK', amount: 2500, type: 'EXPENSE', acctLast4: '3456',
    msg: 'Rs.2,500.00 debited from YES Bank A/c XX3456 on 01-Nov-25. Avail Bal Rs.7,500.00',
  },

  // ── Union Bank ───────────────────────────────────────────────────────────
  {
    bank: 'Union', sender: 'UNIONB', amount: 1200, type: 'EXPENSE', acctLast4: undefined,
    msg: 'Your account is debited for Rs.1200.00 towards UPI on 05-Nov-25. Avl Bal Rs.8800.00 - Union Bank',
  },
  {
    bank: 'Union', sender: 'UNIONB', amount: 4500, type: 'INCOME', acctLast4: '7890',
    msg: 'INR 4,500.00 credited to A/c XX7890 on 06-Nov-25. Avl Bal INR 14,500.00 - Union Bank of India',
  },

  // ── IDBI ─────────────────────────────────────────────────────────────────
  {
    bank: 'IDBI', sender: 'IDBIBA', amount: 750, type: 'EXPENSE', acctLast4: '2345',
    msg: 'Rs.750.00 has been debited from your IDBI Bank A/c XX2345 on 08-Nov-25. Avl Bal Rs.9250.00',
  },

  // ── Bandhan ──────────────────────────────────────────────────────────────
  {
    bank: 'Bandhan', sender: 'BANDHAN', amount: 300, type: 'EXPENSE', acctLast4: '6789',
    msg: 'INR 300.00 debited from Bandhan Bank A/c XX6789 on 09-Nov-25. Available Bal INR 4700.00',
  },
  {
    bank: 'Bandhan', sender: 'BANDHAN', amount: 1500, type: 'INCOME', acctLast4: '6789',
    msg: 'INR 1,500.00 credited to Bandhan Bank A/c XX6789 on 09-Nov-25. Available Bal INR 6200.00',
  },

  // ── Equitas ──────────────────────────────────────────────────────────────
  {
    bank: 'Equitas', sender: 'EQUITA', amount: 450, type: 'EXPENSE', acctLast4: '4321',
    msg: 'Rs.450.00 debited from your Equitas Small Finance Bank A/c XX4321 on 10-Nov-25. Avl Bal Rs.5550.00',
  },
];

// ---------------------------------------------------------------------------

describe('Cashiro parseSms — empirical benchmark (same 39 cases as Malana)', () => {
  it('prints full benchmark report', () => {
    const ts = Date.now();
    let amtOk = 0, typeOk = 0, acctOk = 0, allOk = 0;
    const failures: string[] = [];

    for (const c of CASES) {
      const result = parseSms({ body: c.msg, sender: c.sender, timestamp: ts });

      const gotAmt = result?.amount ?? null;
      const wantAmt = c.amount;
      const amtMatch = gotAmt !== null && Math.abs(gotAmt - wantAmt) < 0.015;

      const gotType = result?.type ?? null;
      const typeMatch =
        (c.type === 'EXPENSE' && gotType === 'EXPENSE') ||
        (c.type === 'INCOME'  && (gotType === 'INCOME' || gotType === 'CREDIT')) ||
        (c.type === 'CREDIT'  && (gotType === 'INCOME' || gotType === 'CREDIT'));

      const gotAcct = result?.accountLast4 ?? '';
      const acctMatch = !c.acctLast4 || gotAcct === c.acctLast4 || gotAcct.endsWith(c.acctLast4);

      if (amtMatch) amtOk++;
      if (typeMatch) typeOk++;
      if (acctMatch) acctOk++;
      if (amtMatch && typeMatch && acctMatch) {
        allOk++;
      } else {
        const parts: string[] = [];
        parts.push(amtMatch  ? '✓amt'  : `✗amt(got ${gotAmt} want ${wantAmt})`);
        parts.push(typeMatch ? '✓type' : `✗type(got ${gotType} want ${c.type})`);
        parts.push(acctMatch ? '✓acct' : `✗acct(got ${gotAcct} want ${c.acctLast4})`);
        failures.push(`  [${c.bank.padEnd(8)}] ${parts.join(' ')}\n             "${c.msg.replace(/\n/g,' ').slice(0, 70)}"`);
      }
    }

    const n = CASES.length;
    const pct = (k: number) => `${k}/${n}  (${Math.round(k / n * 100)}%)`;

    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('  CASHIRO parseSms BENCHMARK  —  vs ground truth');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`  Cases: ${n}`);
    console.log(`  Amount correct:  ${pct(amtOk)}`);
    console.log(`  Type correct:    ${pct(typeOk)}`);
    console.log(`  Account correct: ${pct(acctOk)}`);
    console.log(`  ALL correct:     ${pct(allOk)}`);
    console.log('───────────────────────────────────────────────────────────────');
    if (failures.length === 0) {
      console.log('  ✓ All cases passed!');
    } else {
      console.log(`\n  FAILURES (${failures.length}):\n`);
      for (const f of failures) console.log(f);
    }
    console.log('═══════════════════════════════════════════════════════════════\n');
  });
});
