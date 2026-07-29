import { describe, it, expect } from 'vitest';
import { NSDLPaymentsBankParser } from '../banks/nsdl-payments.js';

const parser = new NSDLPaymentsBankParser();

describe('NSDLPaymentsBankParser', () => {
  // ── getBankName ───────────────────────────────────────────────────────────

  it('returns correct bank name', () => {
    expect(parser.getBankName()).toBe('NSDL Payments Bank');
  });

  // ── canHandle ─────────────────────────────────────────────────────────────

  it('handles sender containing NSDLPB', () => {
    expect(parser.canHandle('NSDLPB')).toBe(true);
    expect(parser.canHandle('AD-NSDLPB')).toBe(true);
    expect(parser.canHandle('JK-NSDLPB')).toBe(true);
    expect(parser.canHandle('nsdlpb')).toBe(true);
  });

  it('handles sender containing NSDLPY', () => {
    expect(parser.canHandle('NSDLPY')).toBe(true);
    expect(parser.canHandle('AD-NSDLPY')).toBe(true);
  });

  it('handles sender containing NSDL', () => {
    expect(parser.canHandle('NSDL')).toBe(true);
    expect(parser.canHandle('AD-NSDL')).toBe(true);
  });

  it('rejects unrelated senders', () => {
    expect(parser.canHandle('HDFCBK')).toBe(false);
    expect(parser.canHandle('SBIBNK')).toBe(false);
    expect(parser.canHandle('ICICIB')).toBe(false);
    expect(parser.canHandle('AIRBNK')).toBe(false);
    expect(parser.canHandle('')).toBe(false);
  });

  // ── debit transactions ────────────────────────────────────────────────────

  it('parses debit transaction with Rs. and Avl Bal', () => {
    const msg =
      'Dear Customer, Rs.500.00 has been debited from your NSDL Payments Bank A/c XX1234 on 01-Jan-2025. Avl Bal: Rs.1500.00';
    const r = parser.parse(msg, 'AD-NSDLPB', 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(500.0);
    expect(r!.type).toBe('EXPENSE');
    expect(r!.accountLast4).toBe('1234');
    expect(r!.balance).toBe(1500.0);
    expect(r!.bankName).toBe('NSDL Payments Bank');
    expect(r!.currency).toBe('INR');
  });

  it('parses debit transaction via UPI with INR and Txn Ref', () => {
    const msg =
      'Your NSDL Payments Bank A/c XX1234 debited by INR 250 via UPI. Txn Ref: 123456789012. Bal: Rs.750.00';
    const r = parser.parse(msg, 'NSDLPB', 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(250.0);
    expect(r!.type).toBe('EXPENSE');
    expect(r!.accountLast4).toBe('1234');
    expect(r!.balance).toBe(750.0);
    expect(r!.reference).toBe('123456789012');
  });

  // ── credit transactions ───────────────────────────────────────────────────

  it('parses credit transaction with comma-formatted amount and Ref', () => {
    const msg =
      'Rs.1,000.00 credited to your NSDL Payments Bank a/c XXXX5678. Bal: Rs.3,000.00. Ref: 123456789';
    const r = parser.parse(msg, 'AD-NSDLPB', 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(1000.0);
    expect(r!.type).toBe('INCOME');
    expect(r!.accountLast4).toBe('5678');
    expect(r!.balance).toBe(3000.0);
    expect(r!.reference).toBe('123456789');
  });

  it('parses credit from UPI with INR amount and Bal pattern', () => {
    const msg =
      'INR 100.00 credited to A/c XXXX9012 from UPI. Bal Rs.900.00';
    const r = parser.parse(msg, 'NSDLPB', 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(100.0);
    expect(r!.type).toBe('INCOME');
    expect(r!.accountLast4).toBe('9012');
    expect(r!.balance).toBe(900.0);
  });

  // ── amount extraction ─────────────────────────────────────────────────────

  it('extracts Rs. amount with comma formatting', () => {
    const msg =
      'Rs.1,000.00 credited to your NSDL Payments Bank a/c XXXX5678. Bal: Rs.3,000.00.';
    const r = parser.parse(msg, 'AD-NSDLPB', 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(1000.0);
  });

  it('extracts INR amount without decimal', () => {
    const msg =
      'Your NSDL Payments Bank A/c XX1234 debited by INR 250 via UPI. Bal: Rs.750.00';
    const r = parser.parse(msg, 'NSDLPB', 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(250.0);
  });

  // ── account last4 extraction ──────────────────────────────────────────────

  it('extracts last4 from XX-prefixed account', () => {
    const msg =
      'Dear Customer, Rs.500.00 has been debited from your NSDL Payments Bank A/c XX1234 on 01-Jan-2025. Avl Bal: Rs.1500.00';
    const r = parser.parse(msg, 'AD-NSDLPB', 0);
    expect(r).not.toBeNull();
    expect(r!.accountLast4).toBe('1234');
  });

  it('extracts last4 from XXXX-prefixed account', () => {
    const msg =
      'Rs.1,000.00 credited to your NSDL Payments Bank a/c XXXX5678. Bal: Rs.3,000.00.';
    const r = parser.parse(msg, 'AD-NSDLPB', 0);
    expect(r).not.toBeNull();
    expect(r!.accountLast4).toBe('5678');
  });

  // ── balance extraction ────────────────────────────────────────────────────

  it('extracts balance from "Avl Bal: Rs." pattern', () => {
    const msg =
      'Dear Customer, Rs.500.00 has been debited from your NSDL Payments Bank A/c XX1234 on 01-Jan-2025. Avl Bal: Rs.1500.00';
    const r = parser.parse(msg, 'AD-NSDLPB', 0);
    expect(r).not.toBeNull();
    expect(r!.balance).toBe(1500.0);
  });

  it('extracts balance from "Bal: Rs." pattern', () => {
    const msg =
      'Rs.1,000.00 credited to your NSDL Payments Bank a/c XXXX5678. Bal: Rs.3,000.00. Ref: 123456789';
    const r = parser.parse(msg, 'AD-NSDLPB', 0);
    expect(r).not.toBeNull();
    expect(r!.balance).toBe(3000.0);
  });

  it('extracts balance from "Bal Rs." pattern (no colon)', () => {
    const msg =
      'INR 100.00 credited to A/c XXXX9012 from UPI. Bal Rs.900.00';
    const r = parser.parse(msg, 'NSDLPB', 0);
    expect(r).not.toBeNull();
    expect(r!.balance).toBe(900.0);
  });

  // ── reference extraction ──────────────────────────────────────────────────

  it('extracts reference from "Txn Ref:" pattern', () => {
    const msg =
      'Your NSDL Payments Bank A/c XX1234 debited by INR 250 via UPI. Txn Ref: 123456789012. Bal: Rs.750.00';
    const r = parser.parse(msg, 'NSDLPB', 0);
    expect(r).not.toBeNull();
    expect(r!.reference).toBe('123456789012');
  });

  it('extracts reference from "Ref:" pattern', () => {
    const msg =
      'Rs.1,000.00 credited to your NSDL Payments Bank a/c XXXX5678. Bal: Rs.3,000.00. Ref: 123456789';
    const r = parser.parse(msg, 'AD-NSDLPB', 0);
    expect(r).not.toBeNull();
    expect(r!.reference).toBe('123456789');
  });

  // ── non-transaction messages ──────────────────────────────────────────────

  it('does not parse OTP messages', () => {
    const msg =
      'Your NSDL Payments Bank OTP is 123456. Valid for 10 minutes. Do not share.';
    expect(parser.parse(msg, 'AD-NSDLPB', 0)).toBeNull();
  });

  it('does not parse password messages', () => {
    const msg =
      'Your NSDL Payments Bank mPIN/password has been changed successfully.';
    expect(parser.parse(msg, 'NSDLPB', 0)).toBeNull();
  });
});
