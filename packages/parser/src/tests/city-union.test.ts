import { describe, it, expect } from 'vitest';
import { CityUnionBankParser } from '../banks/city-union.js';

const parser = new CityUnionBankParser();

describe('CityUnionBankParser', () => {
  // canHandle checks
  it('handles known senders', () => {
    expect(parser.canHandle('JK-CUBLTD-S')).toBe(true);
    expect(parser.canHandle('XX-CUBLTD-T')).toBe(true);
    expect(parser.canHandle('CUBANK')).toBe(true);
    expect(parser.canHandle('AD-CUBLTD')).toBe(true);
    expect(parser.canHandle('CUB')).toBe(true);
  });

  it('rejects unknown senders', () => {
    expect(parser.canHandle('HDFCBK')).toBe(false);
    expect(parser.canHandle('SBIINB')).toBe(false);
    expect(parser.canHandle('ICICIB')).toBe(false);
  });

  // UPI debit: "Your a/c no. XXXXXXXXXXXXXXX is debited for Rs.111.00 on 01-09-2025
  //             and credited to a/c no. YYYYYYYYYYYYYYY (UPI Ref no 123456789012)"
  it('parses UPI debit with account last4 and reference', () => {
    const r = parser.parse(
      'Your a/c no. XXXXXXXXXXXX1234 is debited for Rs.500.00 on 01-09-2025 and credited to a/c no. YYYYYYYYYYYY5678 (UPI Ref no 123456789012)',
      'JK-CUBLTD-S',
      0
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(500.00);
    expect(r!.type).toBe('EXPENSE');
    expect(r!.currency).toBe('INR');
    expect(r!.accountLast4).toBe('1234');
    expect(r!.merchant).toBe('UPI Transfer to A/C XX5678');
    expect(r!.reference).toBe('123456789012');
    expect(r!.balance).toBeNull();
    expect(r!.bankName).toBe('City Union Bank');
  });

  // UPI credit: "Your a/c no. XXXXXXXXXXXXXXX is credited for Rs.111.00 on 01-09-2025
  //              and debited from a/c no. YYYYYYYYYYYYYYY (UPI Ref no 123456789012)"
  // Kotlin checks "debited from" → EXPENSE before "is credited" → INCOME, so this returns EXPENSE
  it('parses UPI credit with account last4 and reference', () => {
    const r = parser.parse(
      'Your a/c no. XXXXXXXXXXXX1234 is credited for Rs.1000.00 on 02-09-2025 and debited from a/c no. YYYYYYYYYYYY9012 (UPI Ref no 987654321098)',
      'XX-CUBLTD-T',
      0
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(1000.00);
    expect(r!.type).toBe('EXPENSE');
    expect(r!.currency).toBe('INR');
    expect(r!.accountLast4).toBe('1234');
    expect(r!.merchant).toBe('UPI Transfer from A/C XX9012');
    expect(r!.reference).toBe('987654321098');
    expect(r!.balance).toBeNull();
    expect(r!.bankName).toBe('City Union Bank');
  });

  // NEFT credit: "Savings No XXXXXXXXXXXXXXX credited with INR 111.00 towards
  //               BY NEFT TRF:AMBANI YYYYYYYYYYYYYYY: on 01-SEP-2025. Avl Bal 120.00"
  it('parses NEFT credit with balance and merchant name', () => {
    const r = parser.parse(
      'Savings No XXXXXXXXXXXXXXX1234 credited with INR 5000.00 towards BY NEFT TRF:AMBANI YYYYYYYY: on 01-SEP-2025. Avl Bal 120.00',
      'CUBANK',
      0
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(5000.00);
    expect(r!.type).toBe('INCOME');
    expect(r!.currency).toBe('INR');
    expect(r!.accountLast4).toBe('1234');
    expect(r!.merchant).toBe('NEFT - AMBANI YYYYYYYY');
    expect(r!.balance).toBe(120.00);
    expect(r!.bankName).toBe('City Union Bank');
  });

  it('parses NEFT credit with comma-formatted balance', () => {
    const r = parser.parse(
      'Savings No XXXXXXXXXXXXXXX5678 credited with INR 10,000.00 towards BY NEFT TRF:TATA MOTORS: on 15-OCT-2025. Avl Bal 25,500.50',
      'AD-CUBLTD',
      0
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(10000.00);
    expect(r!.type).toBe('INCOME');
    expect(r!.accountLast4).toBe('5678');
    expect(r!.merchant).toBe('NEFT - TATA MOTORS');
    expect(r!.balance).toBe(25500.50);
  });

  it('filters out OTP messages', () => {
    const r = parser.parse(
      'Your City Union Bank OTP for transaction is 123456. Valid for 10 minutes.',
      'JK-CUBLTD-S',
      0
    );
    expect(r).toBeNull();
  });

  it('filters out verification messages', () => {
    const r = parser.parse(
      'Use 789012 for verification of your City Union Bank account.',
      'CUBANK',
      0
    );
    expect(r).toBeNull();
  });

  it('filters out request messages', () => {
    const r = parser.parse(
      'Payment request of Rs.200.00 from MERCHANT. Approve in your app.',
      'JK-CUBLTD-S',
      0
    );
    expect(r).toBeNull();
  });

  it('returns correct bankName', () => {
    expect(parser.getBankName()).toBe('City Union Bank');
  });
});
