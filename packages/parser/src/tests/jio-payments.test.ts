import { describe, it, expect } from 'vitest';
import { JioPaymentsBankParser } from '../banks/jio-payments.js';

const parser = new JioPaymentsBankParser();

describe('JioPaymentsBankParser', () => {
  // ── getBankName ───────────────────────────────────────────────────────────

  it('returns correct bank name', () => {
    expect(parser.getBankName()).toBe('Jio Payments Bank');
  });

  // ── canHandle ─────────────────────────────────────────────────────────────

  it('handles sender containing JIOPBS', () => {
    expect(parser.canHandle('JIOPBS')).toBe(true);
    expect(parser.canHandle('AD-JIOPBS')).toBe(true);
    expect(parser.canHandle('BZ-JIOPBS-S')).toBe(true);
    expect(parser.canHandle('jiopbs')).toBe(true);
  });

  it('rejects unrelated senders', () => {
    expect(parser.canHandle('HDFCBK')).toBe(false);
    expect(parser.canHandle('SBIBNK')).toBe(false);
    expect(parser.canHandle('ICICIB')).toBe(false);
    expect(parser.canHandle('')).toBe(false);
  });

  // ── credit transactions ───────────────────────────────────────────────────

  it('parses UPI credit transaction with merchant name', () => {
    const msg =
      'Your JPB A/c x4288 credited with Rs.1670.00 by UPI/CR/700003371002/AMAN KU. Avl. Bal: Rs. 9095.5';
    const r = parser.parse(msg, 'AD-JIOPBS', 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(1670.0);
    expect(r!.type).toBe('INCOME');
    expect(r!.accountLast4).toBe('4288');
    expect(r!.balance).toBe(9095.5);
    expect(r!.merchant).toBe('AMAN KU');
    expect(r!.reference).toBe('700003371002');
    expect(r!.bankName).toBe('Jio Payments Bank');
    expect(r!.currency).toBe('INR');
  });

  it('parses UPI credit via UPI/CR keyword with no named merchant', () => {
    const msg =
      'Your JPB A/c x1234 credited with Rs.500.00 via UPI/CR/123456789. Avl. Bal: Rs. 5000.00';
    const r = parser.parse(msg, 'AD-JIOPBS', 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(500.0);
    expect(r!.type).toBe('INCOME');
    expect(r!.accountLast4).toBe('1234');
    expect(r!.balance).toBe(5000.0);
    expect(r!.reference).toBe('123456789');
  });

  it('parses credit transaction with comma-separated amount', () => {
    const msg =
      'Your JPB A/c x9012 credited with Rs.1,200.00 by UPI/CR/900001234567/RAHUL SH. Avl. Bal: Rs. 15,000.00';
    const r = parser.parse(msg, 'JIOPBS', 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(1200.0);
    expect(r!.type).toBe('INCOME');
    expect(r!.accountLast4).toBe('9012');
    expect(r!.balance).toBe(15000.0);
    expect(r!.merchant).toBe('RAHUL SH');
  });

  // ── debit transactions ────────────────────────────────────────────────────

  it('parses UPI debit transaction with merchant name', () => {
    const msg =
      'Your JPB A/c x4288 debited with Rs. 1750.00 for UPI/DR/520300007125/AMAN KUM. Avl. Bal: Rs. 7345.5';
    const r = parser.parse(msg, 'AD-JIOPBS', 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(1750.0);
    expect(r!.type).toBe('EXPENSE');
    expect(r!.accountLast4).toBe('4288');
    expect(r!.balance).toBe(7345.5);
    expect(r!.merchant).toBe('AMAN KUM');
    expect(r!.reference).toBe('520300007125');
  });

  it('parses UPI debit via UPI/DR keyword', () => {
    const msg =
      'Your JPB A/c x5678 debited with Rs.300.00 via UPI/DR/987654321. Avl. Bal: Rs. 2000.00';
    const r = parser.parse(msg, 'AD-JIOPBS', 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(300.0);
    expect(r!.type).toBe('EXPENSE');
    expect(r!.accountLast4).toBe('5678');
    expect(r!.reference).toBe('987654321');
    expect(r!.merchant).toBe('UPI Payment');
  });

  it('parses debit transaction with comma-separated amount', () => {
    const msg =
      'Your JPB A/c x3456 debited with Rs.2,500.00 via UPI/DR/111222333/ZOMATO. Avl. Bal: Rs. 8,500.00';
    const r = parser.parse(msg, 'JIOPBS', 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(2500.0);
    expect(r!.type).toBe('EXPENSE');
    expect(r!.accountLast4).toBe('3456');
    expect(r!.balance).toBe(8500.0);
    expect(r!.merchant).toBe('ZOMATO');
  });

  // ── sent-from transactions ────────────────────────────────────────────────

  it('parses "Sent from" transfer transaction', () => {
    const msg =
      'Rs. 1170.00 Sent from x4288 to user@upi. Avl. Bal: Rs. 3000.00';
    const r = parser.parse(msg, 'AD-JIOPBS', 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(1170.0);
    expect(r!.type).toBe('EXPENSE');
    expect(r!.accountLast4).toBe('4288');
    expect(r!.balance).toBe(3000.0);
    expect(r!.merchant).toBe('Money Transfer');
  });

  it('parses "Sent from" with comma-separated amount', () => {
    const msg =
      'Rs. 5,000.00 Sent from x7890. Avl. Bal: Rs. 12,000.00';
    const r = parser.parse(msg, 'JIOPBS', 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(5000.0);
    expect(r!.type).toBe('EXPENSE');
    expect(r!.accountLast4).toBe('7890');
    expect(r!.balance).toBe(12000.0);
    expect(r!.merchant).toBe('Money Transfer');
  });

  // ── account last4 patterns ────────────────────────────────────────────────

  it('extracts account last4 from "JPB A/c xNNNN" pattern', () => {
    const msg =
      'Your JPB A/c x4288 credited with Rs.1670.00 by UPI/CR/700003371002/SELLER. Avl. Bal: Rs. 9095.5';
    const r = parser.parse(msg, 'JIOPBS', 0);
    expect(r).not.toBeNull();
    expect(r!.accountLast4).toBe('4288');
  });

  it('extracts account last4 from "from xNNNN" pattern', () => {
    const msg =
      'Rs. 1170.00 Sent from x5566 to merchant@upi. Avl. Bal: Rs. 2000.00';
    const r = parser.parse(msg, 'AD-JIOPBS', 0);
    expect(r).not.toBeNull();
    expect(r!.accountLast4).toBe('5566');
  });

  // ── balance extraction ────────────────────────────────────────────────────

  it('extracts balance from "Avl. Bal: Rs." pattern', () => {
    const msg =
      'Your JPB A/c x4288 credited with Rs.1670.00 by UPI/CR/700003371002/VENDOR. Avl. Bal: Rs. 9095.5';
    const r = parser.parse(msg, 'JIOPBS', 0);
    expect(r).not.toBeNull();
    expect(r!.balance).toBe(9095.5);
  });

  it('extracts balance without period in "Avl Bal: Rs." pattern', () => {
    const msg =
      'Your JPB A/c x1111 debited with Rs.200.00 via UPI/DR/111000222. Avl Bal: Rs. 800.00';
    const r = parser.parse(msg, 'AD-JIOPBS', 0);
    expect(r).not.toBeNull();
    expect(r!.balance).toBe(800.0);
  });

  it('extracts balance with comma-separated value', () => {
    const msg =
      'Your JPB A/c x2222 credited with Rs.3,000.00 by UPI/CR/333444555/MERCHANT. Avl. Bal: Rs. 13,000.00';
    const r = parser.parse(msg, 'JIOPBS', 0);
    expect(r).not.toBeNull();
    expect(r!.balance).toBe(13000.0);
  });

  // ── reference extraction ──────────────────────────────────────────────────

  it('extracts UPI credit reference number', () => {
    const msg =
      'Your JPB A/c x4288 credited with Rs.1670.00 by UPI/CR/700003371002/AMAN KU. Avl. Bal: Rs. 9095.5';
    const r = parser.parse(msg, 'AD-JIOPBS', 0);
    expect(r).not.toBeNull();
    expect(r!.reference).toBe('700003371002');
  });

  it('extracts UPI debit reference number', () => {
    const msg =
      'Your JPB A/c x4288 debited with Rs.1750.00 via UPI/DR/520300007125/SHOP. Avl. Bal: Rs. 7345.5';
    const r = parser.parse(msg, 'AD-JIOPBS', 0);
    expect(r).not.toBeNull();
    expect(r!.reference).toBe('520300007125');
  });

  // ── merchant extraction ───────────────────────────────────────────────────

  it('extracts merchant from UPI/CR path', () => {
    const msg =
      'Your JPB A/c x4288 credited with Rs.500.00 by UPI/CR/111222333/FLIPKART. Avl. Bal: Rs. 5500.00';
    const r = parser.parse(msg, 'JIOPBS', 0);
    expect(r).not.toBeNull();
    expect(r!.merchant).toBe('FLIPKART');
  });

  it('extracts merchant from UPI/DR path', () => {
    const msg =
      'Your JPB A/c x4288 debited with Rs.150.00 for UPI/DR/777888999/SWIGGY. Avl. Bal: Rs. 4350.00';
    const r = parser.parse(msg, 'JIOPBS', 0);
    expect(r).not.toBeNull();
    expect(r!.merchant).toBe('SWIGGY');
  });

  it('falls back to "UPI Credit" when no merchant in UPI/CR message', () => {
    const msg =
      'Your JPB A/c x1234 credited with Rs.100.00 via UPI/CR/000111222. Avl. Bal: Rs. 1100.00';
    const r = parser.parse(msg, 'AD-JIOPBS', 0);
    expect(r).not.toBeNull();
    expect(r!.merchant).toBe('UPI Credit');
  });

  it('falls back to "UPI Payment" when no merchant in UPI/DR message', () => {
    const msg =
      'Your JPB A/c x1234 debited with Rs.50.00 via UPI/DR/000444555. Avl. Bal: Rs. 1050.00';
    const r = parser.parse(msg, 'AD-JIOPBS', 0);
    expect(r).not.toBeNull();
    expect(r!.merchant).toBe('UPI Payment');
  });

  it('falls back to "Money Transfer" for Sent from messages', () => {
    const msg = 'Rs. 200.00 Sent from x9999 to another@upi. Avl. Bal: Rs. 800.00';
    const r = parser.parse(msg, 'JIOPBS', 0);
    expect(r).not.toBeNull();
    expect(r!.merchant).toBe('Money Transfer');
  });

  // ── non-transaction messages ──────────────────────────────────────────────

  it('does not parse OTP messages', () => {
    const msg = 'Your Jio Payments Bank OTP is 123456. Valid for 10 minutes. Do not share.';
    expect(parser.parse(msg, 'AD-JIOPBS', 0)).toBeNull();
  });

  it('does not parse promotional/offer messages', () => {
    const msg = 'Exclusive offer! Get 5% cashback offer on your Jio Payments Bank wallet. T&C apply.';
    expect(parser.parse(msg, 'AD-JIOPBS', 0)).toBeNull();
  });

  it('does not parse payment request messages', () => {
    const msg = 'user@upi has requested Rs. 500.00 from your Jio Payments Bank account.';
    expect(parser.parse(msg, 'AD-JIOPBS', 0)).toBeNull();
  });
});
