import { describe, it, expect } from 'vitest';
import { JupiterBankParser } from '../banks/jupiter.js';

const parser = new JupiterBankParser();

describe('JupiterBankParser', () => {
  // ── getBankName ───────────────────────────────────────────────────────────

  it('returns correct bank name', () => {
    expect(parser.getBankName()).toBe('Jupiter');
  });

  // ── canHandle ────────────────────────────────────────────────────────────

  it('handles DLT senders matching ^[A-Z]{2}-JTEDGE-S$', () => {
    expect(parser.canHandle('AX-JTEDGE-S')).toBe(true);
    expect(parser.canHandle('IN-JTEDGE-S')).toBe(true);
    expect(parser.canHandle('CP-JTEDGE-S')).toBe(true);
  });

  it('handles DLT senders matching ^[A-Z]{2}-JTEDGE-T$', () => {
    expect(parser.canHandle('AX-JTEDGE-T')).toBe(true);
    expect(parser.canHandle('IN-JTEDGE-T')).toBe(true);
  });

  it('handles legacy DLT senders matching ^[A-Z]{2}-JTEDGE$', () => {
    expect(parser.canHandle('AX-JTEDGE')).toBe(true);
    expect(parser.canHandle('CP-JTEDGE')).toBe(true);
  });

  it('rejects non-Jupiter senders', () => {
    expect(parser.canHandle('HDFCBK')).toBe(false);
    expect(parser.canHandle('SBIBNK')).toBe(false);
    expect(parser.canHandle('JTEDGE')).toBe(false);
    expect(parser.canHandle('JUPITER')).toBe(false);
    expect(parser.canHandle('')).toBe(false);
    expect(parser.canHandle('AX-JTEDGE-P')).toBe(false);
  });

  // ── debit / credit card transactions ─────────────────────────────────────

  it('parses Edge CSB Bank RuPay Credit Card debit', () => {
    const msg =
      'Rs.130.00 debited to your Edge CSB Bank RuPay Credit Card ending 6852. Avl Bal: Rs.5000.00';
    const r = parser.parse(msg, 'AX-JTEDGE-S', 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(130);
    expect(r!.type).toBe('EXPENSE');
    expect(r!.accountLast4).toBe('6852');
    expect(r!.balance).toBe(5000);
    expect(r!.merchant).toBe('Credit Card Payment');
    expect(r!.bankName).toBe('Jupiter');
    expect(r!.currency).toBe('INR');
  });

  it('parses credit card debit with comma-separated amount', () => {
    const msg =
      'Rs.1,500.00 debited to your Edge CSB Bank RuPay Credit Card ending 1234. Avl Bal: Rs.10,000.00';
    const r = parser.parse(msg, 'IN-JTEDGE-S', 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(1500);
    expect(r!.type).toBe('EXPENSE');
    expect(r!.accountLast4).toBe('1234');
    expect(r!.balance).toBe(10000);
    expect(r!.merchant).toBe('Credit Card Payment');
  });

  it('parses "jupiter csb edge" transaction as Credit Card Payment', () => {
    const msg =
      'Rs.200.00 debited via Jupiter CSB Edge account. Avl Bal: Rs.3000.00';
    const r = parser.parse(msg, 'AX-JTEDGE-S', 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(200);
    expect(r!.merchant).toBe('Credit Card Payment');
  });

  it('parses generic credit card debit', () => {
    const msg =
      'Rs.500.00 debited to your Jupiter credit card ending 9999. Avl Bal: Rs.7500.00';
    const r = parser.parse(msg, 'CP-JTEDGE-S', 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(500);
    expect(r!.merchant).toBe('Credit Card Payment');
    expect(r!.accountLast4).toBe('9999');
  });

  // ── UPI transactions ──────────────────────────────────────────────────────

  it('parses UPI debit with reference number', () => {
    const msg =
      'Rs.500.00 debited via UPI Ref no.281751568470. Avl Bal: Rs.4500.00';
    const r = parser.parse(msg, 'AX-JTEDGE-S', 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(500);
    expect(r!.type).toBe('EXPENSE');
    expect(r!.merchant).toBe('UPI Transaction');
    expect(r!.reference).toBe('281751568470');
    expect(r!.balance).toBe(4500);
  });

  it('parses UPI credit with reference number', () => {
    const msg =
      'Rs.2000.00 credited via UPI Ref no.123456789012. Avl Bal: Rs.12000.00';
    const r = parser.parse(msg, 'IN-JTEDGE-T', 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(2000);
    expect(r!.type).toBe('INCOME');
    expect(r!.merchant).toBe('UPI Transaction');
    expect(r!.reference).toBe('123456789012');
    expect(r!.balance).toBe(12000);
  });

  it('parses UPI Ref no without period', () => {
    const msg =
      'Rs.300.00 debited via UPI Ref no 987654321098. Avl Bal: Rs.1200.00';
    const r = parser.parse(msg, 'AX-JTEDGE-S', 0);
    expect(r).not.toBeNull();
    expect(r!.reference).toBe('987654321098');
  });

  // ── account credit transactions ───────────────────────────────────────────

  it('parses account credit (non-UPI, non-card)', () => {
    const msg =
      'Rs.5000.00 credited to your Jupiter account. Avl Bal: Rs.20000.00';
    const r = parser.parse(msg, 'AX-JTEDGE-S', 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(5000);
    expect(r!.type).toBe('INCOME');
    expect(r!.balance).toBe(20000);
    expect(r!.bankName).toBe('Jupiter');
  });

  // ── extractAccountLast4 ───────────────────────────────────────────────────

  it('extracts account last4 from "ending NNNN" pattern', () => {
    const msg =
      'Rs.130.00 debited to your Edge CSB Bank RuPay Credit Card ending 6852. Avl Bal: Rs.5000.00';
    const r = parser.parse(msg, 'AX-JTEDGE-S', 0);
    expect(r).not.toBeNull();
    expect(r!.accountLast4).toBe('6852');
  });

  it('extracts account last4 from "Card ending NNNN" pattern', () => {
    const msg =
      'Rs.250.00 debited to your Card ending 4321. Avl Bal: Rs.8000.00';
    const r = parser.parse(msg, 'AX-JTEDGE-S', 0);
    expect(r).not.toBeNull();
    expect(r!.accountLast4).toBe('4321');
  });

  // ── extractReference ──────────────────────────────────────────────────────

  it('extracts UPI reference number', () => {
    const msg =
      'Rs.100.00 debited via UPI Ref no.999888777666. Avl Bal: Rs.900.00';
    const r = parser.parse(msg, 'AX-JTEDGE-S', 0);
    expect(r).not.toBeNull();
    expect(r!.reference).toBe('999888777666');
  });

  // ── non-transaction messages ──────────────────────────────────────────────

  it('does not parse OTP messages', () => {
    const msg = 'Your Jupiter OTP is 123456. Do not share with anyone.';
    expect(parser.parse(msg, 'AX-JTEDGE-S', 0)).toBeNull();
  });

  it('does not parse offer/promotional messages', () => {
    const msg =
      'Exciting offer! Get 10% cashback offer on your Jupiter Edge card. T&C apply.';
    expect(parser.parse(msg, 'AX-JTEDGE-S', 0)).toBeNull();
  });

  it('does not parse messages without a valid amount', () => {
    const msg =
      'Your Jupiter CSB account has been debited. Please check app for details.';
    expect(parser.parse(msg, 'AX-JTEDGE-S', 0)).toBeNull();
  });

  // ── legacy sender ─────────────────────────────────────────────────────────

  it('parses transaction from legacy DLT sender', () => {
    const msg =
      'Rs.750.00 debited to your Edge CSB Bank RuPay Credit Card ending 5555. Avl Bal: Rs.3250.00';
    const r = parser.parse(msg, 'CP-JTEDGE', 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(750);
    expect(r!.type).toBe('EXPENSE');
    expect(r!.merchant).toBe('Credit Card Payment');
    expect(r!.accountLast4).toBe('5555');
  });
});
