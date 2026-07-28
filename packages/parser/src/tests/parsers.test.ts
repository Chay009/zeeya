import { describe, it, expect } from 'vitest';
import { HDFCBankParser } from '../banks/hdfc.js';
import { HDFCMutualFundParser } from '../banks/hdfc-mutual-fund.js';
import { SBIBankParser } from '../banks/sbi.js';
import { ICICIBankParser } from '../banks/icici.js';
import { AxisBankParser } from '../banks/axis.js';
import { PNBBankParser } from '../banks/pnb.js';
import { CanaraBankParser } from '../banks/canara.js';
import { BankOfBarodaParser } from '../banks/bob.js';
import { KotakBankParser } from '../banks/kotak.js';
import { IDFCFirstBankParser } from '../banks/idfc.js';
import { UnionBankParser } from '../banks/union.js';
import { IndusIndBankParser } from '../banks/indusind.js';
import { YesBankParser } from '../banks/yes.js';

// ─── HDFC ────────────────────────────────────────────────────────────────────
// Source: HDFCBankParserTest.kt

describe('HDFCBankParser', () => {
  const p = new HDFCBankParser();

  it('handles known senders', () => {
    expect(p.canHandle('CP-HDFCBK-S')).toBe(true);
    expect(p.canHandle('AX-HDFCBK-S')).toBe(true);
    expect(p.canHandle('JM-HDFCBK-S')).toBe(true);
    expect(p.canHandle('HDFCBANK')).toBe(true);
    expect(p.canHandle('SBI')).toBe(false);
    expect(p.canHandle('')).toBe(false);
  });

  it('does not parse bill alert notification', () => {
    const msg = `New Bill Alert:\nYour AUBA00000NAT3Q Bill 8078064625 of Rs.3953.72 is due on 05-Nov-2025. To pay, login to HDFC Bank Net/Mobile Banking>BillPay\nT&C. Ignore if paid`;
    expect(p.parse(msg, 'CP-HDFCBK-S', 0)).toBeNull();
  });

  it('parses UPI debit transaction', () => {
    const r = p.parse(
      'Rs.500.00 debited from A/c XX1234 on 20-Oct-25 to merchant@upi (UPI Ref No 123456789012)',
      'CP-HDFCBK-S', 0
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(500);
    expect(r!.type).toBe('EXPENSE');
    expect(r!.accountLast4).toBe('1234');
    expect(r!.reference).toBe('123456789012');
    expect(r!.currency).toBe('INR');
  });

  it('parses sent UPI transaction to named payee', () => {
    const msg = `Sent Rs.45.00\nFrom HDFC Bank A/C *1234\nTo Sample Friend\nOn 23/05/26\nRef 123456789012\nNot You?\nContact bank support/SMS BLOCK UPI`;
    const r = p.parse(msg, 'JD-HDFCBK-S', 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(45);
    expect(r!.type).toBe('EXPENSE');
    expect(r!.merchant).toBe('Sample Friend');
    expect(r!.accountLast4).toBe('1234');
    expect(r!.reference).toBe('123456789012');
  });

  it('parses sent UPI transaction to numeric VPA as UPI Payee', () => {
    const msg = `Sent Rs.70.00\nFrom HDFC Bank A/C *1234\nTo 0000000000@bank\nOn 23/05/26\nRef 123456789013\nNot You?\nContact bank support/SMS BLOCK UPI`;
    const r = p.parse(msg, 'AD-HDFCBK-S', 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(70);
    expect(r!.type).toBe('EXPENSE');
    expect(r!.merchant).toBe('UPI Payee');
    expect(r!.accountLast4).toBe('1234');
    expect(r!.reference).toBe('123456789013');
  });
});

// ─── SBI ─────────────────────────────────────────────────────────────────────
// Source: SBIBankParserTest.kt

describe('SBIBankParser', () => {
  const p = new SBIBankParser();

  it('handles known senders', () => {
    expect(p.canHandle('ATMSBI')).toBe(true);
    expect(p.canHandle('SBICRD')).toBe(true);
    expect(p.canHandle('SBIBK')).toBe(true);
    expect(p.canHandle('AD-CBSSBI-S')).toBe(true);
    expect(p.canHandle('JD-CBSSBI')).toBe(true);
    expect(p.canHandle('VA-SBIPSG-T')).toBe(true);
    expect(p.canHandle('UNKNOWN')).toBe(false);
  });

  it('parses debit card transaction', () => {
    const r = p.parse(
      'Dear Customer, transaction number 1234 for Rs.383.00 by SBI Debit Card 0000 done at merchant on 13Sep25 at 21:38:26. Your updated available balance is Rs.999999999. If not done by you, forward this SMS to 7400165218/ call 1800111109/9449112211 to block card. GOI helpline for cyber fraud 1930.',
      'ATMSBI', 0
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(383);
    expect(r!.type).toBe('EXPENSE');
    expect(r!.accountLast4).toBe('0000');
    expect(r!.currency).toBe('INR');
  });

  it('parses standard debit message', () => {
    const r = p.parse(
      'Rs.500 debited from A/c X1234 on 13Sep25. Avl Bal Rs.999999999',
      'ATMSBI', 0
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(500);
    expect(r!.type).toBe('EXPENSE');
    expect(r!.accountLast4).toBe('1234');
  });

  it('parses debit by transfer with balance', () => {
    const r = p.parse(
      'Dear Customer, Your A/C XXXXX901234 has a debit by transfer of Rs 230.00 on 18/09/25. Avl Bal Rs 6,500.00.-SBI',
      'AD-CBSSBI-S', 0
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(230);
    expect(r!.type).toBe('EXPENSE');
    expect(r!.accountLast4).toBe('1234');
    expect(r!.balance).toBe(6500);
  });

  it('parses credit for merchant (BHPL)', () => {
    const r = p.parse(
      'Your A/C XXXXX314502 has credit for AOFS23546782123411BHPL of Rs 10,700.00 on 02/05/22. Avl Bal Rs 13,50,000.00.-SBI',
      'JD-CBSSBI', 0
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(10700);
    expect(r!.type).toBe('INCOME');
    expect(r!.accountLast4).toBe('4502');
    expect(r!.balance).toBe(1350000);
    expect(r!.merchant).toBe('AOFS23546782123411BHPL');
  });

  it('parses credit by Cheque', () => {
    const r = p.parse(
      'Dear Customer, Your A/C XXXXX314567 has a credit by Cheque of Rs 12,07,000.00 on 07/10/22. Avl Bal Rs 18,06,500.00.-SBI',
      'AD-CBSSBI', 0
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(1207000);
    expect(r!.type).toBe('INCOME');
    expect(r!.accountLast4).toBe('4567');
    expect(r!.balance).toBe(1806500);
    expect(r!.merchant).toBe('Cheque');
  });

  it('parses Credited INR with REVERSE ATM suffix as merchant', () => {
    const r = p.parse(
      'Your AC XXXXX314567 Credited INR 9,000.00 on 22/05/22 -REVERSE ATM WDL. Avl Bal INR 13,08,900.00.-SBI',
      'AD-CBSSBI', 0
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(9000);
    expect(r!.type).toBe('INCOME');
    expect(r!.accountLast4).toBe('4567');
    expect(r!.balance).toBe(1308900);
    expect(r!.merchant).toBe('REVERSE ATM WDL');
  });

  it('parses credit for BY SALARY', () => {
    const r = p.parse(
      'Your A/C XXXXX314567 has credit for BY SALARY of Rs 4,000.00 on 31/12/22. Avl Bal Rs 17,70,200.00.-SBI',
      'JK-CBSSBI', 0
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(4000);
    expect(r!.type).toBe('INCOME');
    expect(r!.accountLast4).toBe('4567');
    expect(r!.balance).toBe(1770200);
    expect(r!.merchant).toBe('BY SALARY');
  });

  it('parses credit for another merchant (BHPL #2)', () => {
    const r = p.parse(
      'Your A/C XXXXX314567 has credit for AOFS1112345677890BHPL of Rs 66,000.00 on 01/05/22. Avl Bal Rs 13,40,000.00.-SBI',
      'JK-CBSSBI', 0
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(66000);
    expect(r!.type).toBe('INCOME');
    expect(r!.accountLast4).toBe('4567');
    expect(r!.balance).toBe(1340000);
    expect(r!.merchant).toBe('AOFS1112345677890BHPL');
  });

  it('parses debit with credited destination (issue #35)', () => {
    const r = p.parse(
      'Dear Customer, Your a/c no. XXXXXXXX5045 is debited for Rs.500.00 on 31-03-26 and a/c XXXXXXX418 credited (IMPS Ref no ---------------). -SBI',
      'VA-SBIPSG-T', 0
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(500);
    expect(r!.type).toBe('EXPENSE');
    expect(r!.accountLast4).toBe('5045');
  });
});

// ─── ICICI ───────────────────────────────────────────────────────────────────
// Source: ICICIBankParserTest.kt

describe('ICICIBankParser', () => {
  const p = new ICICIBankParser();

  it('handles known senders', () => {
    expect(p.canHandle('AX-ICICIT-S')).toBe(true);
    expect(p.canHandle('JM-ICICIT-S')).toBe(true);
    expect(p.canHandle('VM-ICICIT-S')).toBe(true);
    expect(p.canHandle('ICICIB')).toBe(true);
    expect(p.canHandle('ICICIBANK')).toBe(true);
    expect(p.canHandle('HDFC')).toBe(false);
  });

  it('parses USD card purchase as CREDIT', () => {
    const r = p.parse(
      'USD 11.80 spent using ICICI Bank Card XX7004 on 03-Sep-25 on 1xJetBrains AI . Avl Limit: INR 17,95,899.53. If not you, call 1800 2662/SMS BLOCK 7004 to 9215676766.',
      'JM-ICICIT-S', 0
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(11.80);
    expect(r!.currency).toBe('USD');
    expect(r!.type).toBe('CREDIT');
    expect(r!.merchant).toBe('1xJetBrains AI');
    expect(r!.accountLast4).toBe('7004');
  });

  it('parses EUR card purchase as CREDIT', () => {
    const r = p.parse(
      'EUR 50.00 spent using ICICI Bank Card XX1234 on 05-Sep-25 on Amazon DE. Avl Limit: INR 2,00,000.00. SMS BLOCK 1234 to 9215676766',
      'JM-ICICIT-S', 0
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(50);
    expect(r!.currency).toBe('EUR');
    expect(r!.type).toBe('CREDIT');
    expect(r!.merchant).toBe('Amazon DE');
    expect(r!.accountLast4).toBe('1234');
  });

  it('parses INR card purchase (Swiggy) as CREDIT', () => {
    const r = p.parse(
      'INR 500.00 spent using ICICI Bank Card XX5678 on 06-Sep-25 on Swiggy. Avl Limit: INR 1,50,000.00.',
      'JM-ICICIT-S', 0
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(500);
    expect(r!.currency).toBe('INR');
    expect(r!.type).toBe('CREDIT');
    expect(r!.merchant).toBe('Swiggy');
    expect(r!.accountLast4).toBe('5678');
  });

  it('does not parse future autopay notification', () => {
    expect(p.parse(
      'Your account will be debited with Rs 649.00 on 03-Oct-25 towards Netflix Entertainment Ser for AutoPay MERCHANTMANDATE, RRN 421723106963-ICICI Bank.',
      'AX-ICICIT-S', 0
    )).toBeNull();
  });

  it('parses actual autopay debit with merchant and balance', () => {
    const r = p.parse(
      'Your account has been debited with Rs 649.00 towards Netflix Entertainment Ser for AutoPay MERCHANTMANDATE. RRN 421723106963. Avl Bal Rs 10,000.00-ICICI Bank',
      'AX-ICICIT-S', 0
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(649);
    expect(r!.type).toBe('EXPENSE');
    expect(r!.merchant).toBe('Netflix Entertainment Ser');
    expect(r!.balance).toBe(10000);
    expect(r!.reference).toBe('421723106963');
  });

  it('does not parse future debit variation 1', () => {
    expect(p.parse(
      'Rs. 500.00 will be debited from your account on 05-Oct-25 for EMI payment',
      'AX-ICICIT-S', 0
    )).toBeNull();
  });

  it('does not parse future debit variation 2', () => {
    expect(p.parse(
      'Your ICICI Bank Account will be debited with Rs 1,000.00 on 10-Oct-25',
      'AX-ICICIT-S', 0
    )).toBeNull();
  });

  it('does not parse future debit variation 3', () => {
    expect(p.parse(
      'AutoPay: Rs 299.00 will be debited on 15-Oct-25 for Spotify subscription',
      'AX-ICICIT-S', 0
    )).toBeNull();
  });

  it('does not parse credit card bill payment received', () => {
    expect(p.parse(
      'Payment of Rs 26,266.00 has been received on your ICICI Bank Credit Card XX9006 through Bharat Bill Payment System on 06-DEC-25.',
      'AD-ICICIT-S', 0
    )).toBeNull();
  });

  it('parses regular debit with UPI reference (UPI: with space)', () => {
    const r = p.parse(
      'ICICI Bank Acct XX123 debited for Rs 500.00 on 01-Oct-25; merchant credited. UPI: 543210987654. Call 18002662 for dispute. Updated Bal: Rs 5,000.00',
      'AX-ICICIT-S', 0
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(500);
    expect(r!.type).toBe('EXPENSE');
    expect(r!.accountLast4).toBe('123');
    expect(r!.reference).toBe('543210987654');
    expect(r!.balance).toBe(5000);
  });

  it('parses regular debit bill payment with balance', () => {
    const r = p.parse(
      'Rs. 1,000.00 has been debited from your account XX456 for bill payment. Avl Bal: Rs 3,000.00',
      'AX-ICICIT-S', 0
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(1000);
    expect(r!.type).toBe('EXPENSE');
    expect(r!.balance).toBe(3000);
  });

  it('parses regular debit with reference', () => {
    const r = p.parse(
      'Your account has been successfully debited with Rs 250.00. Reference: TXN123456789',
      'AX-ICICIT-S', 0
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(250);
    expect(r!.type).toBe('EXPENSE');
    expect(r!.reference).toBe('TXN123456789');
  });

  it('parses salary credit with INF format', () => {
    const r = p.parse(
      'ICICI Bank Account XX566 credited:Rs. 18,832.00 on 28-Feb-25. Info INF*000169831922*IQBO SAL FE. Available Balance is Rs. 28,076.14.',
      'VM-ICICIT', 0
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(18832);
    expect(r!.type).toBe('INCOME');
    expect(r!.merchant).toBe('Salary');
    expect(r!.accountLast4).toBe('566');
    expect(r!.balance).toBe(28076.14);
  });

  it('parses UPI debit - DINDUGAL ORIGIN (Nov 10)', () => {
    const r = p.parse(
      'ICICI Bank Acct XX051 debited for Rs 180.00 on 10-Nov-25; DINDUGAL ORIGIN credited. UPI:568069174081. Call 18002662 for dispute. SMS BLOCK 051 to 9215676766. 06:33 PM',
      'ICICIB', 0
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(180);
    expect(r!.type).toBe('EXPENSE');
    expect(r!.merchant).toBe('DINDUGAL ORIGIN');
    expect(r!.reference).toBe('568069174081');
    expect(r!.accountLast4).toBe('051');
  });

  it('parses UPI debit - HOTEL SARADHAS (Nov 11)', () => {
    const r = p.parse(
      'ICICI Bank Acct XX051 debited for Rs 210.00 on 11-Nov-25; HOTEL SARADHAS credited. UPI:531517664120. Call 18002662 for dispute. SMS BLOCK 051 to 9215676766. 06:57 PM',
      'ICICIB', 0
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(210);
    expect(r!.type).toBe('EXPENSE');
    expect(r!.merchant).toBe('HOTEL SARADHAS');
    expect(r!.reference).toBe('531517664120');
    expect(r!.accountLast4).toBe('051');
  });

  it('parses UPI debit - DINDUGAL ORIGIN (Nov 12)', () => {
    const r = p.parse(
      'ICICI Bank Acct XX051 debited for Rs 240.00 on 12-Nov-25; DINDUGAL ORIGIN credited. UPI:568205532451. Call 18002662 for dispute. SMS BLOCK 051 to 9215676766. 06:29 PM',
      'ICICIB', 0
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(240);
    expect(r!.type).toBe('EXPENSE');
    expect(r!.merchant).toBe('DINDUGAL ORIGIN');
    expect(r!.reference).toBe('568205532451');
    expect(r!.accountLast4).toBe('051');
  });
});

// ─── AXIS ────────────────────────────────────────────────────────────────────
// Source: AxisBankParserTest.kt

describe('AxisBankParser', () => {
  const p = new AxisBankParser();

  it('handles known senders', () => {
    expect(p.canHandle('AX-AXISBK-S')).toBe(true);
    expect(p.canHandle('JD-AXISBK-S')).toBe(true);
    expect(p.canHandle('CP-AXISBK-S')).toBe(true);
    expect(p.canHandle('JX-AXISBK-S')).toBe(true);
    expect(p.canHandle('AX-AXISBANK-S')).toBe(true);
    expect(p.canHandle('AX-AXIS-S')).toBe(true);
    expect(p.canHandle('AXISBK')).toBe(true);
    expect(p.canHandle('AXISBANK')).toBe(true);
    expect(p.canHandle('AXIS')).toBe(true);
    expect(p.canHandle('HDFC')).toBe(false);
    expect(p.canHandle('SBI')).toBe(false);
    expect(p.canHandle('')).toBe(false);
  });

  it('parses credit card spent - Swiggy (IST format)', () => {
    const msg = `Spent INR 131\nAxis Bank Card no. XX0818\n05-10-25 09:43:27 IST\nSwiggy Limi\nAvl Limit: INR 217162.72\nNot you? SMS BLOCK 0818 to 919951860002`;
    const r = p.parse(msg, 'AX-AXISBK-S', 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(131);
    expect(r!.type).toBe('CREDIT');
    expect(r!.merchant).toBe('Swiggy');
    expect(r!.accountLast4).toBe('0818');
    expect(r!.isFromCard).toBe(true);
    expect(r!.creditLimit).toBe(217162.72);
  });

  it('parses credit card spent - Amazon Pay (IST format)', () => {
    const msg = `Spent INR 1299.00\nAxis Bank Card no. XX5678\n12-10-25 14:30:15 IST\nAmazon Pay\nAvl Limit: INR 50000.00\nNot you? SMS BLOCK 5678 to 919951860002`;
    const r = p.parse(msg, 'AX-AXISBK-S', 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(1299);
    expect(r!.type).toBe('CREDIT');
    expect(r!.merchant).toBe('Amazon');
    expect(r!.accountLast4).toBe('5678');
    expect(r!.isFromCard).toBe(true);
    expect(r!.creditLimit).toBe(50000);
  });

  it('parses credit card spent - Avenue Supermarts (no-IST format)', () => {
    const msg = `Spent\nCard no. XX7441\nINR 562\n01-09-25 12:04:18\nAVENUE SUPE\nAvl Lmt INR 5120.87\nSMS BLOCK 7441 to 919951860002, if not you - Axis Bank`;
    const r = p.parse(msg, 'CP-AXISBK-S', 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(562);
    expect(r!.type).toBe('CREDIT');
    expect(r!.merchant).toBe('AVENUE');
    expect(r!.accountLast4).toBe('7441');
    expect(r!.isFromCard).toBe(true);
    expect(r!.creditLimit).toBe(5120.87);
  });

  it('parses credit card spent - Blinkit (IST format)', () => {
    const msg = `Spent INR 174\nAxis Bank Card no. XX7441\n13-09-25 21:35:56 IST\nBlinkit\nAvl Limit: INR 6652.78\nNot you? SMS BLOCK 7441 to 919951860002`;
    const r = p.parse(msg, 'JX-AXISBK-S', 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(174);
    expect(r!.type).toBe('CREDIT');
    expect(r!.merchant).toBe('Blinkit');
    expect(r!.accountLast4).toBe('7441');
    expect(r!.isFromCard).toBe(true);
    expect(r!.creditLimit).toBe(6652.78);
  });

  it('parses credit card spent - Blinkit (no-IST format)', () => {
    const msg = `Spent\nCard no. XX7441\nINR 207\n01-09-25 14:10:35\nBlinkit\nAvl Lmt INR 4632.87\nSMS BLOCK 7441 to 919951860002, if not you - Axis Bank`;
    const r = p.parse(msg, 'AX-AXISBK-S', 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(207);
    expect(r!.type).toBe('CREDIT');
    expect(r!.merchant).toBe('Blinkit');
    expect(r!.accountLast4).toBe('7441');
    expect(r!.isFromCard).toBe(true);
    expect(r!.creditLimit).toBe(4632.87);
  });

  it('parses credit card spent - BPCL petrol', () => {
    const msg = `Spent INR 500\nAxis Bank Card no. XX6018\n22-09-25 09:03:41 IST\nBPCL ARUNAA\nAvl Limit: INR 17131.47\nNot you? SMS BLOCK 6018 to 919951860002`;
    const r = p.parse(msg, 'CP-AXISBK-S', 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(500);
    expect(r!.type).toBe('CREDIT');
    expect(r!.merchant).toBe('BPCL ARUNAA');
    expect(r!.accountLast4).toBe('6018');
    expect(r!.isFromCard).toBe(true);
    expect(r!.creditLimit).toBe(17131.47);
  });

  it('parses credit card spent - JSK Fuel Station', () => {
    const msg = `Spent INR 500\nAxis Bank Card no. XX6018\n13-09-25 13:08:07 IST\nJSK FUEL ST\nAvl Limit: INR 6826.78\nNot you? SMS BLOCK 6018 to 919951860002`;
    const r = p.parse(msg, 'JX-AXISBK-S', 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(500);
    expect(r!.type).toBe('CREDIT');
    expect(r!.merchant).toBe('JSK FUEL ST');
    expect(r!.accountLast4).toBe('6018');
    expect(r!.isFromCard).toBe(true);
    expect(r!.creditLimit).toBe(6826.78);
  });

  it('parses ATM withdrawal (Axis Bank location)', () => {
    const r = p.parse(
      'INR 2000.00 debited from A/c no. XX589034 on AXIS BANK L 04-11-2025 16:06:39 IST. Avl bal: INR 98919.81. Not you? SMS BLOCKCARD XX0192 to +919951860002 - Axis Bank',
      'JD-AXISBK-S', 0
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(2000);
    expect(r!.type).toBe('EXPENSE');
    expect(r!.merchant).toBe('ATM');
    expect(r!.accountLast4).toBe('9034');
    expect(r!.balance).toBe(98919.81);
  });

  it('parses debit card - BURGRILL', () => {
    const r = p.parse(
      'INR 209.00 debited from A/c no. XXxxxxy on BURGRILL 04-12-2025 13:13:27 IST. Avl bal: INR xxxxxxx. Not you? SMS BLOCKCARD XX0023 to +919951860002 - Axis Bank',
      'JD-AXISBK-S', 0
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(209);
    expect(r!.type).toBe('EXPENSE');
    expect(r!.merchant).toBe('BURGRILL');
    expect(r!.accountLast4).toBe('xxxy');
  });

  it('parses debit card - Restaurant', () => {
    const r = p.parse(
      'INR 1028.00 debited from A/c no. XXxxxxy on RESTAURANT XY 02-12-2025 20:38:23 IST. Avl bal: INR xxxxxxx. Not you? SMS BLOCKCARD XX0023 to +919951860002 - Axis Bank',
      'JD-AXISBK-S', 0
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(1028);
    expect(r!.type).toBe('EXPENSE');
    expect(r!.merchant).toBe('RESTAURANT XY');
    expect(r!.accountLast4).toBe('xxxy');
  });

  it('parses debit card - numeric account pattern', () => {
    const r = p.parse(
      'INR 500.00 debited from A/c no. XX312225 on MERCHANT ABC 02-12-2025 20:38:23 IST. Avl bal: INR 10000.00. Not you? SMS BLOCKCARD XX0023 to +919951860002 - Axis Bank',
      'JD-AXISBK-S', 0
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(500);
    expect(r!.type).toBe('EXPENSE');
    expect(r!.merchant).toBe('MERCHANT ABC');
    expect(r!.accountLast4).toBe('2225');
    expect(r!.balance).toBe(10000);
  });
});

// ─── IndusInd ─────────────────────────────────────────────────────────────────
// Source: IndusIndBankParserTest.kt

describe('IndusIndBankParser', () => {
  const p = new IndusIndBankParser();

  it('handles known senders', () => {
    expect(p.canHandle('AD-INDUSB-S')).toBe(true);
    expect(p.canHandle('VM-INDUSB-T')).toBe(true);
    expect(p.canHandle('VM-INDUSIND-S')).toBe(true);
    expect(p.canHandle('JK-INDUSB-S')).toBe(true);
    expect(p.canHandle('JX-INDUSB-S')).toBe(true);
    expect(p.canHandle('JD-INDUSB-S')).toBe(true);
    expect(p.canHandle('JM-INDUSB-S')).toBe(true);
    expect(p.canHandle('INDUSB')).toBe(true);
    expect(p.canHandle('INDUSIND')).toBe(true);
    expect(p.canHandle('AX-HDFC-S')).toBe(false);
  });

  it('parses debit with merchant and balance', () => {
    const r = p.parse(
      'Rs. 1,234.00 debited from A/c XX1234 at ZOMATO Ref 998877. Avl Bal: Rs 10,000.00',
      'VM-INDUSB-S', 0
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(1234);
    expect(r!.type).toBe('EXPENSE');
    expect(r!.merchant).toBe('ZOMATO');
    expect(r!.accountLast4).toBe('1234');
    expect(r!.balance).toBe(10000);
    expect(r!.reference).toBe('998877');
  });

  it('parses UPI debit with RRN and VPA', () => {
    const r = p.parse(
      'A/c *XX1234 debited by Rs 1234.00 towards xxxx.yyyy@icici. RRN: 510048508040. Not You? call 18602677777- IndusInd Bank.',
      'AD-INDUSIND-S', 0
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(1234);
    expect(r!.type).toBe('EXPENSE');
    expect(r!.merchant).toBe('xxxx.yyyy');
    expect(r!.accountLast4).toBe('1234');
    expect(r!.reference).toBe('510048508040');
  });

  it('parses UPI credit with RRN and VPA', () => {
    const r = p.parse(
      'A/C *XX1234 credited by Rs 25000.00 from xxxx.yyyy@ybl. RRN:510048508040. Avl Bal:105502.12. Not you? Call 18602677777 - IndusInd bank.',
      'AD-INDUSIND-S', 0
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(25000);
    expect(r!.type).toBe('INCOME');
    expect(r!.merchant).toBe('xxxx.yyyy');
    expect(r!.accountLast4).toBe('1234');
    expect(r!.reference).toBe('510048508040');
    expect(r!.balance).toBe(105502.12);
  });

  it('does not parse deposit interest notification', () => {
    expect(p.parse(
      'Net interest INR 248.07 paid on your IndusInd Deposit No 300***123456 on 17/09/25. Call 18602677777 for assistance - IndusInd Bank',
      'AD-INDUSIND-S', 0
    )).toBeNull();
  });

  it('parses IMPS debit with merchant', () => {
    const r = p.parse(
      'Your IndusInd Account 20XXXXX1234 has been debited for INR 6440 towards IMPS/12345678901. Call 18602677777 to report issue-IndusInd Bank.',
      'AD-INDUSIND-S', 0
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(6440);
    expect(r!.type).toBe('EXPENSE');
    expect(r!.merchant).toBe('IMPS');
    expect(r!.accountLast4).toBe('1234');
  });

  it('does not parse balance-only message', () => {
    expect(p.parse(
      'Your A/C 2134***12345 has Avl BAL of INR 1,234.56 as on 05/10/25 04:10 AM. Download IndusMobile from PlayStore - IndusInd Bank',
      'AD-INDUSIND-S', 0
    )).toBeNull();
  });

  it('parses ACH debit with Grow merchant and balance', () => {
    const r = p.parse(
      'IndusInd A/C  Debited; INR 4,500.00 Ref-ACH DR INW PAY/0000WD2CEFDT2Z58B2202320321456/Grow.Bal INR 141,999.93.Dispute-Call 18602677777-IndusInd Bank.',
      'AD-INDUSIND-S', 0
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(4500);
    expect(r!.type).toBe('EXPENSE');
    expect(r!.merchant).toBe('Grow');
    expect(r!.balance).toBe(141999.93);
    expect(r!.isFromCard).toBe(false);
    expect(r!.accountLast4).toBeNull();
  });

  it('parses debit card purchase with masked account', () => {
    const r = p.parse(
      'INR 1,101.53 debited from your A/C 201***123456 towards Debit Card Purchase. Avl BAL INR 400.20 - Not you? Call 18602677777 to report issue - IndusInd Bank.',
      'AD-INDUSIND-S', 0
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(1101.53);
    expect(r!.type).toBe('EXPENSE');
    expect(r!.accountLast4).toBe('3456');
    expect(r!.balance).toBe(400.20);
    expect(r!.isFromCard).toBe(false);
  });

  it('parses UPI credit from JK sender', () => {
    const r = p.parse(
      'A/C *XX0000 credited by Rs 300.00 from abcd@upiid. RRN:123456789098. Avl Bal:00.00. Not you? Call 18602677777 - IndusInd bank',
      'JK-INDUSB-S', 0
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(300);
    expect(r!.type).toBe('INCOME');
    expect(r!.merchant).toBe('abcd');
    expect(r!.accountLast4).toBe('0000');
    expect(r!.reference).toBe('123456789098');
    expect(r!.balance).toBe(0);
  });

  it('parses UPI credit from JX sender', () => {
    const r = p.parse(
      'A/C *XX0000 credited by Rs 890.00 from abcd@upiid. RRN:123456789098. Avl Bal:00.00. Not you? Call 18602677777 - IndusInd bank',
      'JX-INDUSB-S', 0
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(890);
    expect(r!.type).toBe('INCOME');
    expect(r!.merchant).toBe('abcd');
    expect(r!.accountLast4).toBe('0000');
    expect(r!.reference).toBe('123456789098');
    expect(r!.balance).toBe(0);
  });

  it('parses UPI credit from JD sender', () => {
    const r = p.parse(
      'A/C *XX0000 credited by Rs 890.00 from abcd@upiid. RRN:123456789098. Avl Bal:00.00. Not you? Call 18602677777 - IndusInd bank',
      'JD-INDUSB-S', 0
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(890);
    expect(r!.type).toBe('INCOME');
    expect(r!.merchant).toBe('abcd');
    expect(r!.accountLast4).toBe('0000');
    expect(r!.reference).toBe('123456789098');
    expect(r!.balance).toBe(0);
  });

  it('does not parse deposit interest from JM sender', () => {
    expect(p.parse(
      'Net interest INR 96.61 paid on your IndusInd Deposit No 371***060020 on 30/06/25. Call 18602677777 for assistance - IndusInd Bank',
      'JM-INDUSB-S', 0
    )).toBeNull();
  });

  it('parses IMPS credit', () => {
    const r = p.parse(
      'Your IndusInd Account 15XXXXX0000 has been credited for INR 116.56 towards IMPS/500200000290. Call 18602677777 to report issue-IndusInd Bank',
      'JM-INDUSB-S', 0
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(116.56);
    expect(r!.type).toBe('INCOME');
    expect(r!.merchant).toBe('IMPS');
    expect(r!.accountLast4).toBe('0000');
  });

  it('parses IMPS credit with from account/merchant pattern', () => {
    const r = p.parse(
      'Your account XXXXXXX1234 is credited by Rs.54321 on 07-11-25 received from account XXXXXXX4321/MADMONEY (IMPS Ref no. 123456789). Call 18602677777 to report issue-IndusInd Bank',
      'VM-INDUSB-T', 0
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(54321);
    expect(r!.type).toBe('INCOME');
    expect(r!.merchant).toBe('MADMONEY');
    expect(r!.accountLast4).toBe('1234');
    expect(r!.reference).toBe('123456789');
  });

  it('detects and parses balance update notification', () => {
    const msg = 'Your A/C 2134***12345 has Avl BAL of INR 1,234.56 as on 05/10/25 04:10 AM. Download IndusMobile from PlayStore - IndusInd Bank';
    expect(p.isBalanceUpdateNotification(msg)).toBe(true);
    const info = p.parseBalanceUpdate(msg);
    expect(info).not.toBeNull();
    expect(info!.bankName).toBe('IndusInd Bank');
    expect(info!.accountLast4).toBe('2345');
    expect(info!.balance).toBe(1234.56);
  });
});

// ─── YesBank ─────────────────────────────────────────────────────────────────
// Source: YesBankParserTest.kt

describe('YesBankParser', () => {
  const p = new YesBankParser();

  it('handles known senders', () => {
    expect(p.canHandle('CP-YESBNK-S')).toBe(true);
    expect(p.canHandle('VM-YESBNK-S')).toBe(true);
    expect(p.canHandle('JX-YESBNK-S')).toBe(true);
    expect(p.canHandle('YESBANK')).toBe(true);
    expect(p.canHandle('UNKNOWN')).toBe(false);
  });

  it('parses YES BANK card spend - C N S Fuel Port', () => {
    const r = p.parse(
      'INR 404.36 spent on YES BANK Card X3349 @UPI_C N S FUEL PORT 24-08-2025 06:17:25 pm. Avl Lmt INR 211,476.24. SMS BLKCC 3349 to 9840909000 if not you',
      'CP-YESBNK-S', 0
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(404.36);
    expect(r!.type).toBe('CREDIT');
    expect(r!.merchant).toBe('C N S FUEL PORT');
    expect(r!.accountLast4).toBe('3349');
    expect(r!.creditLimit).toBe(211476.24);
    expect(r!.isFromCard).toBe(true);
  });

  it('parses YES BANK card spend - S B Enterprises', () => {
    const r = p.parse(
      'INR 56.00 spent on YES BANK Card X3349 @UPI_S B ENTERPRISES 24-08-2025 06:03:40 am. Avl Lmt INR 211,880.60. SMS BLKCC 3349 to 9840909000 if not you',
      'VM-YESBNK-S', 0
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(56);
    expect(r!.type).toBe('CREDIT');
    expect(r!.merchant).toBe('S B ENTERPRISES');
    expect(r!.accountLast4).toBe('3349');
    expect(r!.creditLimit).toBe(211880.60);
    expect(r!.isFromCard).toBe(true);
  });

  it('parses YES BANK card spend - Mohammed Akram', () => {
    const r = p.parse(
      'INR 24.00 spent on YES BANK Card X3349 @UPI_MOHAMMED AKRAM 23-08-2025 11:51:19 am. Avl Lmt INR 212,012.60. SMS BLKCC 3349 to 9840909000 if not you',
      'JX-YESBNK-S', 0
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(24);
    expect(r!.type).toBe('CREDIT');
    expect(r!.merchant).toBe('MOHAMMED AKRAM');
    expect(r!.accountLast4).toBe('3349');
    expect(r!.creditLimit).toBe(212012.60);
    expect(r!.isFromCard).toBe(true);
  });

  it('parses YES BANK card spend - Surakshaa Healthcare', () => {
    const r = p.parse(
      'INR 250.00 spent on YES BANK Card X3349 @UPI_SURAKSHAA HEALTHCA 23-08-2025 10:02:59 am. Avl Lmt INR 212,036.60. SMS BLKCC 3349 to 9840909000 if not you',
      'CP-YESBNK-S', 0
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(250);
    expect(r!.type).toBe('CREDIT');
    expect(r!.merchant).toBe('SURAKSHAA HEALTHCA');
    expect(r!.accountLast4).toBe('3349');
    expect(r!.creditLimit).toBe(212036.60);
    expect(r!.isFromCard).toBe(true);
  });

  it('does not parse OTP message', () => {
    expect(p.parse(
      'Dear Customer, your OTP for login is 123456. Do not share with anyone. -Yes Bank',
      'CP-YESBNK-S', 0
    )).toBeNull();
  });

  it('does not parse promotional offer', () => {
    expect(p.parse(
      'Get exciting offers on Yes Bank Credit Cards. Apply now! Visit yesbank.in',
      'CP-YESBNK-S', 0
    )).toBeNull();
  });

  it('does not parse payment request', () => {
    expect(p.parse(
      'Payment request of INR 500.00 from merchant@upi. Ignore if already paid.',
      'CP-YESBNK-S', 0
    )).toBeNull();
  });

  it('does not parse payment due reminder', () => {
    expect(p.parse(
      'Your Yes Bank Credit Card payment of INR 10,000 is due by 25-08-2025',
      'CP-YESBNK-S', 0
    )).toBeNull();
  });
});

// ─── PNB ─────────────────────────────────────────────────────────────────────

describe('PNBBankParser', () => {
  const p = new PNBBankParser();

  it('handles known senders', () => {
    expect(p.canHandle('AD-PNBSMS-S')).toBe(true);
    expect(p.canHandle('PNBBNK')).toBe(true);
    expect(p.canHandle('CP-PNBBNK-S')).toBe(true);
    expect(p.canHandle('HDFC')).toBe(false);
  });
});

// ─── Canara ──────────────────────────────────────────────────────────────────

describe('CanaraBankParser', () => {
  const p = new CanaraBankParser();

  it('handles known senders', () => {
    expect(p.canHandle('AD-CANBNK-S')).toBe(true);
    expect(p.canHandle('CANBNK')).toBe(true);
    expect(p.canHandle('CANARABANK')).toBe(true);
    expect(p.canHandle('HDFC')).toBe(false);
  });
});

// ─── Bank of Baroda ──────────────────────────────────────────────────────────

describe('BankOfBarodaParser', () => {
  const p = new BankOfBarodaParser();

  it('handles known senders', () => {
    expect(p.canHandle('AD-BOBSMS-S')).toBe(true);
    expect(p.canHandle('BOBSMS')).toBe(true);
    expect(p.canHandle('HDFC')).toBe(false);
  });
});

// ─── Kotak ───────────────────────────────────────────────────────────────────

describe('KotakBankParser', () => {
  const p = new KotakBankParser();

  it('handles known senders', () => {
    expect(p.canHandle('AD-KOTAKB-S')).toBe(true);
    expect(p.canHandle('KOTAKB')).toBe(true);
    expect(p.canHandle('HDFC')).toBe(false);
  });
});

// ─── IDFC ────────────────────────────────────────────────────────────────────

describe('IDFCFirstBankParser', () => {
  const p = new IDFCFirstBankParser();

  it('handles known senders', () => {
    expect(p.canHandle('AD-IDFCFB-S')).toBe(true);
    expect(p.canHandle('IDFCFB')).toBe(true);
    expect(p.canHandle('HDFC')).toBe(false);
  });
});

// ─── Union Bank ──────────────────────────────────────────────────────────────

describe('UnionBankParser', () => {
  const p = new UnionBankParser();

  it('handles known senders', () => {
    expect(p.canHandle('AD-UNIONB-S')).toBe(true);
    expect(p.canHandle('UNIONBANK')).toBe(true);
    expect(p.canHandle('HDFC')).toBe(false);
  });
});

// ─── HDFC Mutual Fund ────────────────────────────────────────────────────────

describe('HDFCMutualFundParser', () => {
  const p = new HDFCMutualFundParser();

  it('handles HDFCMF sender', () => {
    expect(p.canHandle('HDFCMF')).toBe(true);
    expect(p.canHandle('AD-HDFCMF-S')).toBe(true);
    expect(p.canHandle('HDFC')).toBe(false);
  });

  it('parses SIP purchase as INVESTMENT', () => {
    const r = p.parse(
      'Your SIP purchase of Rs.1000 under HDFC Mid-Cap Opp Fund for Folio 1234 has been processed successfully.',
      'HDFCMF', 0
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(1000);
    expect(r!.type).toBe('INVESTMENT');
  });
});
