import { describe, it, expect } from 'vitest';
import { NSDLPaymentsBankParser } from '../banks/nsdl-payments.js';

const parser = new NSDLPaymentsBankParser();

describe('NSDLPaymentsBankParser', () => {
  // ── getBankName / getCurrency ─────────────────────────────────────────────

  it('returns correct bank name', () => {
    expect(parser.getBankName()).toBe('NSDL Payments Bank');
  });

  it('returns INR currency', () => {
    expect(parser.getCurrency()).toBe('INR');
  });

  // ── canHandle ─────────────────────────────────────────────────────────────

  it('handles sender containing NSDL', () => {
    expect(parser.canHandle('NSDL')).toBe(true);
    expect(parser.canHandle('AD-NSDL')).toBe(true);
    expect(parser.canHandle('JK-NSDLPB')).toBe(true);
    expect(parser.canHandle('nsdl')).toBe(true);
  });

  it('rejects senders not containing NSDL', () => {
    expect(parser.canHandle('HDFCBK')).toBe(false);
    expect(parser.canHandle('SBIBNK')).toBe(false);
    expect(parser.canHandle('ICICIB')).toBe(false);
    expect(parser.canHandle('')).toBe(false);
  });

  // ── extractAmount: INR pattern ────────────────────────────────────────────

  it('extracts amount from INR pattern (debit)', () => {
    const msg = 'INR 500.00 debited from your account. Balance is Rs.1000.00';
    const r = parser.parse(msg, 'AD-NSDL', 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(500.0);
  });

  it('extracts amount from INR pattern with comma formatting', () => {
    const msg = 'INR 1,500.00 credited to your account.';
    const r = parser.parse(msg, 'AD-NSDL', 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(1500.0);
  });

  it('extracts amount from INR pattern without decimal', () => {
    const msg = 'INR 250 debited from your account.';
    const r = parser.parse(msg, 'AD-NSDL', 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(250);
  });

  it('falls back to super extractAmount for Rs. pattern', () => {
    const msg = 'Rs.750.00 debited from your account.';
    const r = parser.parse(msg, 'AD-NSDL', 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(750.0);
  });

  // ── extractTransactionType ────────────────────────────────────────────────

  it('returns INCOME for credited', () => {
    const msg = 'INR 200.00 credited to your account.';
    const r = parser.parse(msg, 'AD-NSDL', 0);
    expect(r).not.toBeNull();
    expect(r!.type).toBe('INCOME');
  });

  it('returns EXPENSE for debited', () => {
    const msg = 'INR 300.00 debited from your account.';
    const r = parser.parse(msg, 'AD-NSDL', 0);
    expect(r).not.toBeNull();
    expect(r!.type).toBe('EXPENSE');
  });

  it('returns EXPENSE for spent', () => {
    const msg = 'INR 100.00 spent at merchant.';
    const r = parser.parse(msg, 'AD-NSDL', 0);
    expect(r).not.toBeNull();
    expect(r!.type).toBe('EXPENSE');
  });

  it('returns EXPENSE for paid', () => {
    const msg = 'INR 400.00 paid to merchant.';
    const r = parser.parse(msg, 'AD-NSDL', 0);
    expect(r).not.toBeNull();
    expect(r!.type).toBe('EXPENSE');
  });

  it('credited takes priority over debited when both present', () => {
    const msg = 'INR 500.00 credited after debited amount reversed.';
    const r = parser.parse(msg, 'AD-NSDL', 0);
    expect(r).not.toBeNull();
    expect(r!.type).toBe('INCOME');
  });

  // ── bankName / currency in result ─────────────────────────────────────────

  it('sets bankName and currency in parse result', () => {
    const msg = 'INR 100.00 debited from your account.';
    const r = parser.parse(msg, 'AD-NSDL', 0);
    expect(r).not.toBeNull();
    expect(r!.bankName).toBe('NSDL Payments Bank');
    expect(r!.currency).toBe('INR');
  });

  // ── non-transaction messages ──────────────────────────────────────────────

  it('does not parse OTP messages', () => {
    const msg = 'Your OTP for NSDL Payments Bank is 123456. Valid for 10 minutes.';
    expect(parser.parse(msg, 'AD-NSDL', 0)).toBeNull();
  });
});
