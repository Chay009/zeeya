import { describe, it, expect } from 'vitest';
import { CashfreeParser } from '../banks/cashfree.js';

const parser = new CashfreeParser();

describe('CashfreeParser', () => {
  // ── canHandle ─────────────────────────────────────────────────────────────

  it('handles known senders', () => {
    expect(parser.canHandle('CASHFR')).toBe(true);
    expect(parser.canHandle('CFPAY')).toBe(true);
    expect(parser.canHandle('AD-CASHFR')).toBe(true);
    expect(parser.canHandle('JK-CASHFR')).toBe(true);
    expect(parser.canHandle('CASFRP')).toBe(true);
    expect(parser.canHandle('CASHFREE')).toBe(true);
    // Non-matching senders
    expect(parser.canHandle('HDFC')).toBe(false);
    expect(parser.canHandle('UNKNOWN')).toBe(false);
    expect(parser.canHandle('PAYTM')).toBe(false);
  });

  // ── getBankName ───────────────────────────────────────────────────────────

  it('returns correct bank name', () => {
    expect(parser.getBankName()).toBe('Cashfree');
  });

  // ── payout processed ─────────────────────────────────────────────────────

  it('parses Cashfree payout with Ref', () => {
    const msg =
      'Your Cashfree payout of Rs.500.00 has been processed. Ref: CF123456789';
    const r = parser.parse(msg, 'CASHFR', 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(500);
    expect(r!.type).toBe('INCOME');
    expect(r!.currency).toBe('INR');
    expect(r!.reference).toBe('CF123456789');
    expect(r!.merchant).toBe('Cashfree');
    expect(r!.bankName).toBe('Cashfree');
  });

  it('parses payout with large amount', () => {
    const msg =
      'Your Cashfree payout of Rs.10,000.00 has been processed. Ref: CF999888777';
    const r = parser.parse(msg, 'AD-CASHFR', 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(10000);
    expect(r!.type).toBe('INCOME');
    expect(r!.currency).toBe('INR');
    expect(r!.reference).toBe('CF999888777');
    expect(r!.merchant).toBe('Cashfree');
  });

  // ── credited via Cashfree ─────────────────────────────────────────────────

  it('parses credited via Cashfree with Txn ID', () => {
    const msg =
      'Rs.1,000.00 credited to your account via Cashfree. Txn ID: CF987654321';
    const r = parser.parse(msg, 'CFPAY', 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(1000);
    expect(r!.type).toBe('INCOME');
    expect(r!.currency).toBe('INR');
    expect(r!.reference).toBe('CF987654321');
    expect(r!.merchant).toBe('Cashfree');
  });

  it('parses credited amount with decimal via Cashfree', () => {
    const msg =
      'Rs.250.75 credited to your account via Cashfree. Txn ID: CF111222333';
    const r = parser.parse(msg, 'CASFRP', 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(250.75);
    expect(r!.type).toBe('INCOME');
    expect(r!.currency).toBe('INR');
    expect(r!.reference).toBe('CF111222333');
  });

  // ── settlement with INR and account ──────────────────────────────────────

  it('parses settlement with INR amount and account last4', () => {
    const msg =
      'Cashfree settlement of INR 250.00 processed. Reference: 123456789. Account: XXXX1234';
    const r = parser.parse(msg, 'CASHFR', 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(250);
    expect(r!.type).toBe('INCOME');
    expect(r!.currency).toBe('INR');
    expect(r!.reference).toBe('123456789');
    expect(r!.accountLast4).toBe('1234');
    expect(r!.merchant).toBe('Cashfree');
  });

  it('parses settlement without account', () => {
    const msg =
      'Cashfree settlement of INR 5000.00 processed. Reference: 987654321';
    const r = parser.parse(msg, 'JK-CASHFR', 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(5000);
    expect(r!.type).toBe('INCOME');
    expect(r!.currency).toBe('INR');
    expect(r!.reference).toBe('987654321');
    expect(r!.accountLast4).toBeNull();
  });

  // ── payment received via Cashfree (UPI Ref) ───────────────────────────────

  it('parses payment received via Cashfree with UPI Ref', () => {
    const msg =
      'Payment of Rs.100.00 received via Cashfree. UPI Ref: 123456789012';
    const r = parser.parse(msg, 'CASHFREE', 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(100);
    expect(r!.type).toBe('INCOME');
    expect(r!.currency).toBe('INR');
    expect(r!.reference).toBe('123456789012');
    expect(r!.merchant).toBe('Cashfree');
  });

  it('parses payment received with large UPI amount', () => {
    const msg =
      'Payment of Rs.75,000.00 received via Cashfree. UPI Ref: 987654321098';
    const r = parser.parse(msg, 'CFPAY', 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(75000);
    expect(r!.type).toBe('INCOME');
    expect(r!.currency).toBe('INR');
    expect(r!.reference).toBe('987654321098');
  });

  // ── negative: OTP messages should be rejected ─────────────────────────────

  it('rejects OTP messages', () => {
    const msg =
      'Your Cashfree OTP is 123456. Do not share with anyone.';
    const r = parser.parse(msg, 'CASHFR', 0);
    expect(r).toBeNull();
  });

  // ── payout keyword without Rs. prefix ─────────────────────────────────────

  it('parses payout message with INR prefix', () => {
    const msg =
      'Cashfree payout of INR 3500.00 has been successfully credited. Ref: CF456789123';
    const r = parser.parse(msg, 'AD-CASHFR', 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(3500);
    expect(r!.type).toBe('INCOME');
    expect(r!.reference).toBe('CF456789123');
  });
});
