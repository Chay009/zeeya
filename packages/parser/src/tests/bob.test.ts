import { describe, it, expect } from 'vitest';
import { BankOfBarodaParser } from '../banks/bob.js';

const parser = new BankOfBarodaParser();

describe('BankOfBarodaParser', () => {
  it('returns correct bank name', () => {
    expect(parser.getBankName()).toBe('Bank of Baroda');
  });

  it('returns INR currency', () => {
    expect(parser.getCurrency()).toBe('INR');
  });

  describe('canHandle', () => {
    it('handles BOB senders', () => {
      expect(parser.canHandle('VM-BOBTXN-S')).toBe(true);
      expect(parser.canHandle('VM-BOBTXN')).toBe(true);
      expect(parser.canHandle('VM-BOBSMS')).toBe(true);
      expect(parser.canHandle('VM-BOBCRD-S')).toBe(true);
      expect(parser.canHandle('AD-BOBTXN-S')).toBe(true);
      expect(parser.canHandle('JM-BOB-S')).toBe(true);
      expect(parser.canHandle('BOB')).toBe(true);
      expect(parser.canHandle('BANKOFBARODA')).toBe(true);
      expect(parser.canHandle('BOBSMS')).toBe(true);
      expect(parser.canHandle('BOBTXN')).toBe(true);
      expect(parser.canHandle('BOBCRD')).toBe(true);
    });

    it('rejects unrelated senders', () => {
      expect(parser.canHandle('HDFC')).toBe(false);
      expect(parser.canHandle('ICICI')).toBe(false);
      expect(parser.canHandle('')).toBe(false);
    });
  });

  it('parses transfer to loan recovery', () => {
    const r = parser.parse(
      'Rs.29 transferred from A/c ...5494 to:Loan Recovery Fo. Total Bal:Rs.24898.57CR. Avlbl Amt:Rs.24898.57(04-11-2025 04:03:09) - Bank of Baroda',
      'VM-BOBTXN-S',
      0,
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(29);
    expect(r!.currency).toBe('INR');
    expect(r!.type).toBe('EXPENSE');
    expect(r!.merchant).toBe('Loan Recovery Fo');
    expect(r!.accountLast4).toBe('5494');
    expect(r!.balance).toBe(24898.57);
    expect(r!.isFromCard).toBe(false);
  });

  it('parses transfer to individual', () => {
    const r = parser.parse(
      'Rs.1500.00 transferred from A/c ...1234 to:John Smith. Total Bal:Rs.15000.00CR. Avlbl Amt:Rs.15000.00(10-11-2025 10:30:00) - Bank of Baroda',
      'VM-BOBTXN-S',
      0,
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(1500);
    expect(r!.currency).toBe('INR');
    expect(r!.type).toBe('EXPENSE');
    expect(r!.merchant).toBe('John Smith');
    expect(r!.accountLast4).toBe('1234');
    expect(r!.balance).toBe(15000);
    expect(r!.isFromCard).toBe(false);
  });

  it('parses debit from account', () => {
    const r = parser.parse(
      'Rs.80.00 Dr. from A/c XX123456 on 12-11-2024. AvlBal:Rs1234.56cx. Ref:52211012345 -Bank of Baroda',
      'VM-BOBTXN',
      0,
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(80);
    expect(r!.currency).toBe('INR');
    expect(r!.type).toBe('EXPENSE');
    expect(r!.accountLast4).toBe('3456');
    expect(r!.balance).toBe(1234.56);
    expect(r!.reference).toBe('52211012345');
    expect(r!.isFromCard).toBe(false);
  });

  it('parses UPI credit with redacted VPA', () => {
    const r = parser.parse(
      'Rs.500.00 Cr. to redacted@ybl A/c XX789012 on 15-11-2024. AvlBal:Rs5678.90. Ref:987654321 -Bank of Baroda',
      'VM-BOBSMS',
      0,
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(500);
    expect(r!.currency).toBe('INR');
    expect(r!.type).toBe('INCOME');
    expect(r!.merchant).toBe('UPI Payment');
    expect(r!.accountLast4).toBe('9012');
    expect(r!.balance).toBe(5678.9);
    expect(r!.reference).toBe('987654321');
    expect(r!.isFromCard).toBe(false);
  });

  it('parses UPI credit with real VPA', () => {
    const r = parser.parse(
      'Rs.1000.00 Cr. to merchant@okaxis A/c XX345678 on 16-11-2024. AvlBal:Rs10000.00. Ref:1234567890 -Bank of Baroda',
      'VM-BOBSMS',
      0,
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(1000);
    expect(r!.currency).toBe('INR');
    expect(r!.type).toBe('INCOME');
    expect(r!.merchant).toBe('merchant');
    expect(r!.accountLast4).toBe('5678');
    expect(r!.balance).toBe(10000);
    expect(r!.reference).toBe('1234567890');
    expect(r!.isFromCard).toBe(false);
  });

  it('parses IMPS transfer by person', () => {
    const r = parser.parse(
      'Rs.2500.00 credited to A/c XX456789 via IMPS/518233445566 by JOHN DOE. AvlBal:Rs25000.00 -Bank of Baroda',
      'VM-BOBTXN-S',
      0,
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(2500);
    expect(r!.currency).toBe('INR');
    expect(r!.type).toBe('INCOME');
    expect(r!.merchant).toBe('JOHN DOE');
    expect(r!.accountLast4).toBe('6789');
    expect(r!.balance).toBe(25000);
    expect(r!.reference).toBe('518233445566');
    expect(r!.isFromCard).toBe(false);
  });

  it('parses cash deposit', () => {
    const r = parser.parse(
      'Rs.10000.00 deposited in cash to A/c XX234567 on 20-11-2024. AvlBal:Rs45000.00 -Bank of Baroda',
      'VM-BOBSMS',
      0,
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(10000);
    expect(r!.currency).toBe('INR');
    expect(r!.type).toBe('INCOME');
    expect(r!.merchant).toBe('Cash Deposit');
    expect(r!.accountLast4).toBe('4567');
    expect(r!.balance).toBe(45000);
    expect(r!.isFromCard).toBe(false);
  });

  it('parses credit card purchase', () => {
    const r = parser.parse(
      'ALERT: INR 1,500.00 is spent on your BOBCARD ending 1234 at AMAZON on 25-11-2024 10:30:00. Available credit limit is Rs 42,981.46 -Bank of Baroda',
      'VM-BOBCRD-S',
      0,
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(1500);
    expect(r!.currency).toBe('INR');
    expect(r!.type).toBe('CREDIT');
    expect(r!.accountLast4).toBe('1234');
    expect(r!.creditLimit).toBe(42981.46);
    expect(r!.isFromCard).toBe(true);
  });

  it('parses account credited with INR', () => {
    const r = parser.parse(
      'Your A/c XX987654 is credited with INR 70.00 on 30-11-2024. Total Bal:Rs.5000.00 -Bank of Baroda',
      'VM-BOBSMS',
      0,
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(70);
    expect(r!.currency).toBe('INR');
    expect(r!.type).toBe('INCOME');
    expect(r!.accountLast4).toBe('7654');
    expect(r!.balance).toBe(5000);
    expect(r!.isFromCard).toBe(false);
  });

  it('parses amount credited to account', () => {
    const r = parser.parse(
      'Rs.5000.00 Credited to A/c XX112233 on 01-12-2024. AvlBal:Rs12345.67 -Bank of Baroda',
      'VM-BOBTXN',
      0,
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(5000);
    expect(r!.currency).toBe('INR');
    expect(r!.type).toBe('INCOME');
    expect(r!.accountLast4).toBe('2233');
    expect(r!.balance).toBe(12345.67);
    expect(r!.isFromCard).toBe(false);
  });
});
