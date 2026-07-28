import { describe, it, expect } from 'vitest';
import { KarnatakaBankParser } from '../banks/karnataka.js';

const parser = new KarnatakaBankParser();

describe('KarnatakaBankParser', () => {
  it('handles known senders', () => {
    // Direct IDs
    expect(parser.canHandle('KBLBNK')).toBe(true);
    expect(parser.canHandle('KARBANK')).toBe(true);
    expect(parser.canHandle('KTKBANK')).toBe(true);
    expect(parser.canHandle('KARNATAKABANK')).toBe(true);
    expect(parser.canHandle('KARNATAKA BANK')).toBe(true);
    // DLT -S suffix patterns
    expect(parser.canHandle('JD-KBLBNK-S')).toBe(true);
    expect(parser.canHandle('AD-KBLBNK-S')).toBe(true);
    expect(parser.canHandle('BV-KARBANK-S')).toBe(true);
    // Legacy patterns
    expect(parser.canHandle('JD-KBLBNK')).toBe(true);
    // Negative cases
    expect(parser.canHandle('HDFC')).toBe(false);
    expect(parser.canHandle('SBIINB')).toBe(false);
    expect(parser.canHandle('UNKNOWN')).toBe(false);
  });

  it('parses debit transaction (DEBITED for Rs.X/-)', () => {
    const r = parser.parse(
      'Your Account x001234x has been DEBITED for Rs.6368/- on 15-10-2025. Balance is Rs.10000.00. UPI Ref no 441877242175',
      'JD-KBLBNK-S',
      0
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(6368);
    expect(r!.type).toBe('EXPENSE');
    expect(r!.accountLast4).toBe('1234');
    expect(r!.balance).toBe(10000.00);
    expect(r!.reference).toBe('441877242175');
    expect(r!.bankName).toBe('Karnataka Bank');
    expect(r!.currency).toBe('INR');
  });

  it('parses credit transaction (credited by Rs.X)', () => {
    const r = parser.parse(
      'Your a/c XX1234 is credited by Rs.6600.00 on 01-11-2025. Balance is Rs.16600.00.',
      'KBLBNK',
      0
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(6600.00);
    expect(r!.type).toBe('INCOME');
    expect(r!.accountLast4).toBe('1234');
    expect(r!.balance).toBe(16600.00);
    expect(r!.bankName).toBe('Karnataka Bank');
    expect(r!.currency).toBe('INR');
  });

  it('parses ACH inward debit and extracts merchant from ACH pattern', () => {
    // Note: base class classifies ACH messages as INVESTMENT (contains 'ach' keyword)
    const r = parser.parse(
      'Your Account x005678x has been DEBITED for Rs.1000/- towards ACHInwDr-INSURANCE PREMIUM/2025-11-01. Balance is Rs.5000.00.',
      'AD-KBLBNK-S',
      0
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(1000);
    expect(r!.type).toBe('INVESTMENT');
    expect(r!.accountLast4).toBe('5678');
    expect(r!.merchant).toBe('INSURANCE PREMIUM');
    expect(r!.balance).toBe(5000.00);
  });

  it('parses UPI credit and extracts reference', () => {
    const r = parser.parse(
      'Your a/c XX9012 is credited by Rs.500.00 via UPI from JOHN on 20-10-2025. Balance is Rs.8500.00. UPI Ref no 123456789012',
      'KARBANK',
      0
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(500.00);
    expect(r!.type).toBe('INCOME');
    expect(r!.accountLast4).toBe('9012');
    expect(r!.reference).toBe('123456789012');
    expect(r!.balance).toBe(8500.00);
  });

  it('parses LIC of India payment', () => {
    const r = parser.parse(
      'Your Account x003456x has been DEBITED for Rs.2000/- towards LIC of India premium. Balance is Rs.12000.00.',
      'BV-KBLBNK-S',
      0
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(2000);
    expect(r!.type).toBe('EXPENSE');
    expect(r!.merchant).toBe('LIC of India');
    expect(r!.balance).toBe(12000.00);
  });

  it('parses amount with comma in debit message', () => {
    const r = parser.parse(
      'Your Account x007890x has been DEBITED for Rs.1,500/- on 25-10-2025. Balance is Rs.8,500.50.',
      'KBLBNK',
      0
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(1500);
    expect(r!.type).toBe('EXPENSE');
    expect(r!.accountLast4).toBe('7890');
    expect(r!.balance).toBe(8500.50);
  });

  it('parses large amount credit transaction', () => {
    const r = parser.parse(
      'Your a/c XX2345 is credited by Rs.50,000.00 on 28-10-2025. Balance is Rs.75,000.00.',
      'JD-KARBANK-S',
      0
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(50000.00);
    expect(r!.type).toBe('INCOME');
    expect(r!.accountLast4).toBe('2345');
    expect(r!.balance).toBe(75000.00);
  });

  it('does not parse OTP messages', () => {
    const r = parser.parse(
      'Your OTP for Karnataka Bank transaction is 123456. Valid for 10 minutes.',
      'JD-KBLBNK-S',
      0
    );
    expect(r).toBeNull();
  });

  it('extracts account last4 from Account pattern with trailing X', () => {
    const r = parser.parse(
      'Your Account x001234x has been DEBITED for Rs.100/- on 01-01-2025. Balance is Rs.900.00.',
      'KBLBNK',
      0
    );
    expect(r).not.toBeNull();
    expect(r!.accountLast4).toBe('1234');
  });

  it('extracts account last4 from a/c XX pattern', () => {
    const r = parser.parse(
      'Your a/c XX5678 is credited by Rs.200.00 on 02-01-2025. Balance is Rs.1200.00.',
      'KBLBNK',
      0
    );
    expect(r).not.toBeNull();
    expect(r!.accountLast4).toBe('5678');
  });

  it('returns correct bank name', () => {
    expect(parser.getBankName()).toBe('Karnataka Bank');
  });
});
