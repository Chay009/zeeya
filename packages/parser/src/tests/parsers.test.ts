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

describe('HDFCBankParser', () => {
  const p = new HDFCBankParser();

  it('handles known senders', () => {
    expect(p.canHandle('CP-HDFCBK-S')).toBe(true);
    expect(p.canHandle('AX-HDFCBK-S')).toBe(true);
    expect(p.canHandle('HDFCBANK')).toBe(true);
    expect(p.canHandle('SBI')).toBe(false);
  });

  it('does not parse bill alert', () => {
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

  it('parses sent UPI to named payee', () => {
    const r = p.parse(
      'Sent Rs.45.00\nFrom HDFC Bank A/C *1234\nTo Sample Friend\nOn 23/05/26\nRef 123456789012\nNot You?\nContact bank support/SMS BLOCK UPI',
      'JD-HDFCBK-S', 0
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(45);
    expect(r!.type).toBe('EXPENSE');
    expect(r!.merchant).toBe('Sample Friend');
    expect(r!.accountLast4).toBe('1234');
    expect(r!.reference).toBe('123456789012');
  });
});

// ─── SBI ─────────────────────────────────────────────────────────────────────

describe('SBIBankParser', () => {
  const p = new SBIBankParser();

  it('handles known senders', () => {
    expect(p.canHandle('ATMSBI')).toBe(true);
    expect(p.canHandle('AD-CBSSBI-S')).toBe(true);
    expect(p.canHandle('JD-CBSSBI')).toBe(true);
    expect(p.canHandle('HDFC')).toBe(false);
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
});

// ─── ICICI ───────────────────────────────────────────────────────────────────

describe('ICICIBankParser', () => {
  const p = new ICICIBankParser();

  it('handles known senders', () => {
    expect(p.canHandle('AX-ICICIT-S')).toBe(true);
    expect(p.canHandle('JM-ICICIT-S')).toBe(true);
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
    expect(r!.accountLast4).toBe('1234');
  });

  it('does not parse future autopay notification (will be debited)', () => {
    expect(p.parse(
      'Your account will be debited with Rs 649.00 on 03-Oct-25 towards Netflix Entertainment Ser for AutoPay MERCHANTMANDATE, RRN 421723106963-ICICI Bank.',
      'AX-ICICIT-S', 0
    )).toBeNull();
  });

  it('does not parse future debit variations', () => {
    expect(p.parse('Rs. 500.00 will be debited from your account on 05-Oct-25 for EMI payment', 'AX-ICICIT-S', 0)).toBeNull();
    expect(p.parse('Your ICICI Bank Account will be debited with Rs 1,000.00 on 10-Oct-25', 'AX-ICICIT-S', 0)).toBeNull();
    expect(p.parse('AutoPay: Rs 299.00 will be debited on 15-Oct-25 for Spotify subscription', 'AX-ICICIT-S', 0)).toBeNull();
  });

  it('does not parse credit card bill payment', () => {
    expect(p.parse(
      'Payment of Rs 26,266.00 has been received on your ICICI Bank Credit Card XX9006 through Bharat Bill Payment System on 06-DEC-25.',
      'AD-ICICIT-S', 0
    )).toBeNull();
  });

  it('parses actual autopay debit with merchant', () => {
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

  it('parses UPI debit with credited pattern', () => {
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
});

// ─── AXIS ────────────────────────────────────────────────────────────────────

describe('AxisBankParser', () => {
  const p = new AxisBankParser();

  it('handles known senders', () => {
    expect(p.canHandle('AX-AXISBK-S')).toBe(true);
    expect(p.canHandle('CP-AXISBK-S')).toBe(true);
    expect(p.canHandle('HDFC')).toBe(false);
  });

  it('parses credit card spent as CREDIT', () => {
    const r = p.parse(
      'Spent INR 131\nAxis Bank Card no. XX0818\n05-10-25 09:43:27 IST\nSwiggy Limi\nAvl Limit: INR 217162.72\nNot you? SMS BLOCK 0818 to 919951860002',
      'AX-AXISBK-S', 0
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(131);
    expect(r!.type).toBe('CREDIT');
    expect(r!.accountLast4).toBe('0818');
    expect(r!.isFromCard).toBe(true);
  });
});

// ─── IndusInd ─────────────────────────────────────────────────────────────────

describe('IndusIndBankParser', () => {
  const p = new IndusIndBankParser();

  it('handles known senders', () => {
    expect(p.canHandle('VM-INDUSB-S')).toBe(true);
    expect(p.canHandle('AD-INDUSIND-S')).toBe(true);
    expect(p.canHandle('HDFC')).toBe(false);
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
    expect(r!.accountLast4).toBe('1234');
    expect(r!.reference).toBe('510048508040');
  });
});

// ─── YesBank ─────────────────────────────────────────────────────────────────

describe('YesBankParser', () => {
  const p = new YesBankParser();

  it('handles known senders', () => {
    expect(p.canHandle('CP-YESBNK-S')).toBe(true);
    expect(p.canHandle('VM-YESBNK-S')).toBe(true);
    expect(p.canHandle('HDFC')).toBe(false);
  });

  it('parses YES BANK card spend via UPI as CREDIT', () => {
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
