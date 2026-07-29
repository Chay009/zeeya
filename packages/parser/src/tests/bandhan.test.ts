import { describe, it, expect } from 'vitest';
import { BandhanBankParser } from '../banks/bandhan.js';

const parser = new BandhanBankParser();

describe('BandhanBankParser', () => {
  it('handles known senders', () => {
    expect(parser.canHandle('BANBNK')).toBe(true);
    expect(parser.canHandle('AD-BANBNK')).toBe(true);
    expect(parser.canHandle('JK-BANBNK')).toBe(true);
    expect(parser.canHandle('BNDBNK')).toBe(true);
    expect(parser.canHandle('BANDHAN')).toBe(true);
    expect(parser.canHandle('AD-BANDHAN')).toBe(true);
    expect(parser.canHandle('UNKNOWN')).toBe(false);
    expect(parser.canHandle('HDFC')).toBe(false);
    expect(parser.canHandle('SBI')).toBe(false);
  });

  it('parses debit transaction with Available Balance and UPI Ref', () => {
    const r = parser.parse(
      'Your A/c XXXX1234 is debited by Rs.500.00 on 01-01-2025. Available Balance: Rs.1,500.00. UPI Ref: 123456789012',
      'BANBNK',
      0
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(500.00);
    expect(r!.type).toBe('EXPENSE');
    expect(r!.accountLast4).toBe('1234');
    expect(r!.balance).toBe(1500.00);
    expect(r!.reference).toBe('123456789012');
    expect(r!.bankName).toBe('Bandhan Bank');
  });

  it('parses credit transaction with Bal and date', () => {
    const r = parser.parse(
      'Rs.1,000.00 credited to your Bandhan Bank A/c XXXX5678 on 15-Jan-2025. Bal: Rs.5,000.00',
      'AD-BANBNK',
      0
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(1000.00);
    expect(r!.type).toBe('INCOME');
    expect(r!.accountLast4).toBe('5678');
    expect(r!.balance).toBe(5000.00);
    expect(r!.bankName).toBe('Bandhan Bank');
  });

  it('parses INR debit with a/c ending and Ref No', () => {
    const r = parser.parse(
      'INR 250 debited from Bandhan Bank a/c ending 1234 for UPI txn on 01/01/2025. Ref No 123456. Bal Rs.750.00',
      'BNDBNK',
      0
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(250);
    expect(r!.type).toBe('EXPENSE');
    expect(r!.accountLast4).toBe('1234');
    expect(r!.balance).toBe(750.00);
    expect(r!.reference).toBe('123456');
  });

  it('parses credit with merchant via UPI and Ref', () => {
    const r = parser.parse(
      'Your Bandhan Bank a/c XX9012 is credited with Rs.2,000.00 from JOHN DOE via UPI. Ref: 987654321. Bal: Rs.7,000.00',
      'BANDHAN',
      0
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(2000.00);
    expect(r!.type).toBe('INCOME');
    expect(r!.accountLast4).toBe('9012');
    expect(r!.merchant).toBe('JOHN DOE');
    expect(r!.balance).toBe(7000.00);
    expect(r!.reference).toBe('987654321');
  });

  it('rejects OTP messages', () => {
    const r = parser.parse(
      'Your Bandhan Bank OTP is 123456. Valid for 10 minutes. Do not share.',
      'BANBNK',
      0
    );
    expect(r).toBeNull();
  });

  it('rejects password messages', () => {
    const r = parser.parse(
      'Your Bandhan Bank net banking password has been changed successfully.',
      'BANDHAN',
      0
    );
    expect(r).toBeNull();
  });

  it('rejects PIN messages', () => {
    const r = parser.parse(
      'Your Bandhan Bank debit card PIN has been set. Contact 1800 258 8181 for help.',
      'BANBNK',
      0
    );
    expect(r).toBeNull();
  });

  it('correctly identifies bank name', () => {
    expect(parser.getBankName()).toBe('Bandhan Bank');
  });
});
