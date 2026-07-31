import { describe, it, expect } from 'vitest';
import { IDFCFirstBankParser } from '../banks/idfc.js';

const parser = new IDFCFirstBankParser();

describe('IDFCFirstBankParser', () => {
  it('returns correct bank name', () => {
    expect(parser.getBankName()).toBe('IDFC First Bank');
  });

  it('returns INR currency', () => {
    expect(parser.getCurrency()).toBe('INR');
  });

  describe('canHandle', () => {
    it('handles IDFC senders', () => {
      expect(parser.canHandle('BM-IDFCBK-S')).toBe(true);
      expect(parser.canHandle('AX-IDFCBK-T')).toBe(true);
      expect(parser.canHandle('AD-IDFCB-S')).toBe(true);
      expect(parser.canHandle('IDFCBK')).toBe(true);
      expect(parser.canHandle('IDFC')).toBe(true);
    });

    it('rejects unrelated senders', () => {
      expect(parser.canHandle('HDFC')).toBe(false);
      expect(parser.canHandle('SBI')).toBe(false);
      expect(parser.canHandle('')).toBe(false);
    });
  });

  it('parses EUR credit card transaction', () => {
    const r = parser.parse(
      'Transaction Successful! EUR 500.00 spent on your IDFC FIRST Bank Credit Card ending XX1234 at AMAZON EU on 08-FEB-2025 at 01:28 PM Avbl Limit: INR 4074.10 If not done by you, call 180010888',
      'BM-IDFCBK-S',
      0,
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(500);
    expect(r!.currency).toBe('EUR');
    expect(r!.type).toBe('EXPENSE');
    expect(r!.merchant).toBe('AMAZON EU');
    expect(r!.accountLast4).toBe('1234');
    expect(r!.isFromCard).toBe(true);
  });

  it('parses USD credit card transaction', () => {
    const r = parser.parse(
      'Transaction Successful! USD 99.99 spent on your IDFC FIRST Bank Credit Card ending XX5678 at NETFLIX on 15-MAR-2025 at 10:00 AM Avbl Limit: INR 25000.00',
      'BM-IDFCBK-S',
      0,
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(99.99);
    expect(r!.currency).toBe('USD');
    expect(r!.type).toBe('EXPENSE');
    expect(r!.merchant).toBe('NETFLIX');
    expect(r!.accountLast4).toBe('5678');
    expect(r!.isFromCard).toBe(true);
  });

  it('parses GBP credit card transaction', () => {
    const r = parser.parse(
      'Transaction Successful! GBP 150.00 spent on your IDFC FIRST Bank Credit Card ending XX9999 at LONDON SHOP on 20-APR-2025 at 03:45 PM Avbl Limit: INR 10000.00',
      'AX-IDFCBK-T',
      0,
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(150);
    expect(r!.currency).toBe('GBP');
    expect(r!.type).toBe('EXPENSE');
    expect(r!.accountLast4).toBe('9999');
    expect(r!.isFromCard).toBe(true);
  });

  it('parses INR debit transaction', () => {
    const r = parser.parse(
      'Your A/C XXXXXXX1234 is debited by INR 68.00 on 06/08/25 17:36. New Bal :INR 5000.00',
      'BM-IDFCBK-S',
      0,
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(68);
    expect(r!.currency).toBe('INR');
    expect(r!.type).toBe('EXPENSE');
    expect(r!.accountLast4).toBe('1234');
    expect(r!.balance).toBe(5000);
    expect(r!.isFromCard).toBe(false);
  });

  it('parses INR credit transaction', () => {
    const r = parser.parse(
      'Your A/C XXXXXXX5678 is credited by INR 500.00 on 06/08/25 17:36. New Bal :INR 10000.00',
      'BM-IDFCBK-S',
      0,
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(500);
    expect(r!.currency).toBe('INR');
    expect(r!.type).toBe('INCOME');
    expect(r!.accountLast4).toBe('5678');
    expect(r!.balance).toBe(10000);
    expect(r!.isFromCard).toBe(false);
  });

  it('parses monthly interest credit', () => {
    const r = parser.parse(
      'Your A/C XXXXXXX1234 is credited by INR 125.50 on 01/01/25 for monthly interest. New Bal :INR 15125.50',
      'BM-IDFCBK-S',
      0,
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(125.5);
    expect(r!.currency).toBe('INR');
    expect(r!.type).toBe('INCOME');
    expect(r!.merchant).toBe('Interest Credit');
    expect(r!.accountLast4).toBe('1234');
    expect(r!.balance).toBe(15125.5);
    expect(r!.isFromCard).toBe(false);
  });

  it('should not parse OTP message', () => {
    expect(
      parser.parse(
        'Your IDFC First Bank OTP is 123456. Do not share this code with anyone.',
        'BM-IDFCBK-S',
        0,
      ),
    ).toBeNull();
  });

  it('should not parse promotional message', () => {
    expect(
      parser.parse(
        'IDFC First Bank: Get 10% cashback offer on all online purchases!',
        'BM-IDFCBK-S',
        0,
      ),
    ).toBeNull();
  });
});
