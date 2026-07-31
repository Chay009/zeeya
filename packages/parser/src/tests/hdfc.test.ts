import { describe, it, expect } from 'vitest';
import { HDFCBankParser } from '../banks/hdfc.js';

const parser = new HDFCBankParser();

describe('HDFCBankParser', () => {
  it('returns correct bank name', () => {
    expect(parser.getBankName()).toBe('HDFC Bank');
  });

  it('returns INR currency', () => {
    expect(parser.getCurrency()).toBe('INR');
  });

  describe('canHandle', () => {
    it('handles DLT-prefixed HDFC senders', () => {
      expect(parser.canHandle('CP-HDFCBK-S')).toBe(true);
      expect(parser.canHandle('AX-HDFCBK-S')).toBe(true);
      expect(parser.canHandle('JM-HDFCBK-S')).toBe(true);
    });

    it('handles exact HDFC senders', () => {
      expect(parser.canHandle('HDFCBANK')).toBe(true);
    });

    it('rejects unrelated senders', () => {
      expect(parser.canHandle('SBI')).toBe(false);
      expect(parser.canHandle('')).toBe(false);
    });
  });

  it('should not parse bill alert', () => {
    const msg = `New Bill Alert:
Your AUBA00000NAT3Q Bill 8078064625 of Rs.3953.72 is due on 05-Nov-2025. To pay, login to HDFC Bank Net/Mobile Banking>BillPay
T&C. Ignore if paid`;
    expect(parser.parse(msg, 'CP-HDFCBK-S', 0)).toBeNull();
  });

  it('parses UPI debit transaction', () => {
    const r = parser.parse(
      'Rs.500.00 debited from A/c XX1234 on 20-Oct-25 to merchant@upi (UPI Ref No 123456789012)',
      'CP-HDFCBK-S',
      0,
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(500);
    expect(r!.currency).toBe('INR');
    expect(r!.type).toBe('EXPENSE');
    expect(r!.accountLast4).toBe('1234');
    expect(r!.reference).toBe('123456789012');
  });

  it('parses Sent UPI transaction to named payee', () => {
    const r = parser.parse(
      `Sent Rs.45.00\nFrom HDFC Bank A/C *1234\nTo Sample Friend\nOn 23/05/26\nRef 123456789012\nNot You?\nContact bank support/SMS BLOCK UPI`,
      'JD-HDFCBK-S',
      0,
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(45);
    expect(r!.currency).toBe('INR');
    expect(r!.type).toBe('EXPENSE');
    expect(r!.merchant).toBe('Sample Friend');
    expect(r!.accountLast4).toBe('1234');
    expect(r!.reference).toBe('123456789012');
  });

  it('parses Sent UPI transaction to numeric VPA', () => {
    const r = parser.parse(
      `Sent Rs.70.00\nFrom HDFC Bank A/C *1234\nTo 0000000000@bank\nOn 23/05/26\nRef 123456789013\nNot You?\nContact bank support/SMS BLOCK UPI`,
      'AD-HDFCBK-S',
      0,
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(70);
    expect(r!.currency).toBe('INR');
    expect(r!.type).toBe('EXPENSE');
    expect(r!.merchant).toBe('UPI Payee');
    expect(r!.accountLast4).toBe('1234');
    expect(r!.reference).toBe('123456789013');
  });
});
