import { describe, it, expect } from 'vitest';
import { IndianOverseasBankParser } from '../banks/indian-overseas.js';

const parser = new IndianOverseasBankParser();

describe('IndianOverseasBankParser', () => {
  it('handles known senders', () => {
    expect(parser.canHandle('JK-IOB')).toBe(true);
    expect(parser.canHandle('AD-IOBCHN')).toBe(true);
    expect(parser.canHandle('IOBSMS')).toBe(true);
  });

  it('rejects unknown senders', () => {
    expect(parser.canHandle('HDFCBK')).toBe(false);
    expect(parser.canHandle('SBIINB')).toBe(false);
  });

  it('parses debit SMS with bracket merchant', () => {
    const r = parser.parse(
      'Rs.500.00 Debited to SB-XX1234 [NEFT-AMBANI] AcBal:1000.00',
      'JK-IOB',
      0
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(500.00);
    expect(r!.type).toBe('EXPENSE');
    expect(r!.accountLast4).toBe('1234');
    expect(r!.merchant).toBe('AMBANI');
    expect(r!.balance).toBe(1000.00);
    expect(r!.bankName).toBe('Indian Overseas Bank');
  });

  it('parses credit SMS with bracket merchant', () => {
    const r = parser.parse(
      'Rs.2000.00 Credited to SB-XX5678 [NEFT-TATA] AcBal:5000.00',
      'AD-IOBCHN',
      0
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(2000.00);
    expect(r!.type).toBe('INCOME');
    expect(r!.accountLast4).toBe('5678');
    expect(r!.merchant).toBe('TATA');
    expect(r!.balance).toBe(5000.00);
  });

  it('parses UPI credit with payer remark', () => {
    const r = parser.parse(
      'Your IOB account XX9012 is credited by Rs.100.00 from JOHN DOE(UPI Ref no 123456789012) AcBal:1100.00',
      'JK-IOB',
      0
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(100.00);
    expect(r!.type).toBe('INCOME');
    expect(r!.reference).toBe('123456789012');
  });

  it('parses UPI debit with payee', () => {
    const r = parser.parse(
      'Your IOB account XX1234 is debited by Rs.250.00 debited for payee swiggy@upi for Rs.250.00 AcBal:750.00',
      'JK-IOB',
      0
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(250.00);
    expect(r!.type).toBe('EXPENSE');
    expect(r!.merchant).toBe('swiggy');
  });

  it('filters out OTP messages', () => {
    const r = parser.parse(
      'Your IOB OTP is 123456. Do not share.',
      'JK-IOB',
      0
    );
    expect(r).toBeNull();
  });

  it('returns correct bankName', () => {
    expect(parser.getBankName()).toBe('Indian Overseas Bank');
  });
});
