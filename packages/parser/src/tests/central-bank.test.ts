import { describe, it, expect } from 'vitest';
import { CentralBankOfIndiaParser } from '../banks/central-bank.js';

const parser = new CentralBankOfIndiaParser();

describe('CentralBankOfIndiaParser', () => {
  // ── getBankName ────────────────────────────────────────────────────────────

  it('returns correct bank name', () => {
    expect(parser.getBankName()).toBe('Central Bank of India');
  });

  // ── canHandle ──────────────────────────────────────────────────────────────

  it('handles CENTBK sender', () => {
    expect(parser.canHandle('CENTBK')).toBe(true);
  });

  it('handles CBOI sender', () => {
    expect(parser.canHandle('CBOI')).toBe(true);
  });

  it('handles CENTRALBANK sender', () => {
    expect(parser.canHandle('CENTRALBANK')).toBe(true);
  });

  it('handles CENTRAL sender', () => {
    expect(parser.canHandle('CENTRAL')).toBe(true);
  });

  it('handles DLT pattern BV-CENTBK-S', () => {
    expect(parser.canHandle('BV-CENTBK-S')).toBe(true);
  });

  it('handles DLT pattern AD-CBOI-T', () => {
    expect(parser.canHandle('AD-CBOI-T')).toBe(true);
  });

  it('rejects unrelated sender HDFC', () => {
    expect(parser.canHandle('HDFC')).toBe(false);
  });

  it('rejects unrelated sender SBI', () => {
    expect(parser.canHandle('SBI')).toBe(false);
  });

  it('rejects unrelated sender UNKNOWN', () => {
    expect(parser.canHandle('UNKNOWN')).toBe(false);
  });

  // ── "Debited by Rs.XXX" with account + Total Bal CR + Ref No ──────────────

  it('parses debit with "Debited by Rs." format', () => {
    const msg =
      'Dear Customer, Your account XX3113 is Debited by Rs.100.50 on 10-Jan-2024. Total Bal Rs.5000.00 CR. Ref No.541986000003 -CBoI';
    const r = parser.parse(msg, 'CENTBK', 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(100.5);
    expect(r!.type).toBe('EXPENSE');
    expect(r!.accountLast4).toBe('3113');
    expect(r!.balance).toBe(5000.0);
    expect(r!.reference).toBe('541986000003');
    expect(r!.bankName).toBe('Central Bank of India');
    expect(r!.currency).toBe('INR');
  });

  // ── "Credited by Rs.XXX" with account + Total Bal CR + Ref No ─────────────

  it('parses credit with "Credited by Rs." format', () => {
    const msg =
      'Dear Customer, Your account XX3113 is Credited by Rs.500.00 on 11-Jan-2024. Total Bal Rs.5500.00 CR. Ref No.541986000004 -CBoI';
    const r = parser.parse(msg, 'CBOI', 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(500.0);
    expect(r!.type).toBe('INCOME');
    expect(r!.accountLast4).toBe('3113');
    expect(r!.balance).toBe(5500.0);
    expect(r!.reference).toBe('541986000004');
    expect(r!.bankName).toBe('Central Bank of India');
  });

  // ── "Rs.XXX credited" (Pattern 2 amount) ─────────────────────────────────

  it('parses credit with "Rs.XXX credited" format', () => {
    const msg =
      'Rs.1500.00 credited to A/C ending 7890. Total Bal Rs.7000.00 CR -CBoI';
    const r = parser.parse(msg, 'BV-CENTBK-S', 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(1500.0);
    expect(r!.type).toBe('INCOME');
    expect(r!.accountLast4).toBe('7890');
    expect(r!.balance).toBe(7000.0);
  });

  // ── "Rs.XXX debited" (Pattern 2 amount) ──────────────────────────────────

  it('parses debit with "Rs.XXX debited" format', () => {
    const msg =
      'Rs.250.00 debited from A/C ending 7890. Clear Bal Rs.3000.00 CR -CBoI';
    const r = parser.parse(msg, 'CENTBK', 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(250.0);
    expect(r!.type).toBe('EXPENSE');
    expect(r!.accountLast4).toBe('7890');
    expect(r!.balance).toBe(3000.0);
  });

  // ── Balance: DR suffix makes balance negative ─────────────────────────────

  it('returns negative balance when DR suffix is present', () => {
    const msg =
      'Your account XX1234 Debited by Rs.200.00. Total Bal Rs.150.00 DR. -CBoI';
    const r = parser.parse(msg, 'CBOI', 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(200.0);
    expect(r!.balance).toBe(-150.0);
  });

  // ── Clear Bal pattern ─────────────────────────────────────────────────────

  it('parses balance from Clear Bal pattern with CR', () => {
    const msg =
      'A/C XX5678 Credited by Rs.300.00. Clear Bal Rs.1200.00 CR. -CBoI';
    const r = parser.parse(msg, 'BV-CENTBK-S', 0);
    expect(r).not.toBeNull();
    expect(r!.balance).toBe(1200.0);
  });

  // ── UPI credit / debit via UPI ─────────────────────────────────────────────

  it('returns "UPI Credit" merchant when message says credited via UPI', () => {
    const msg =
      'Rs.800.00 credited to account XX4321 via UPI. Total Bal Rs.9000.00 CR -CBoI';
    const r = parser.parse(msg, 'CENTBK', 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(800.0);
    expect(r!.type).toBe('INCOME');
    expect(r!.merchant).toBe('UPI Credit');
  });

  it('returns "UPI Payment" merchant when message says debited via UPI', () => {
    const msg =
      'Rs.400.00 debited from account XX4321 via UPI. Total Bal Rs.8600.00 CR -CBoI';
    const r = parser.parse(msg, 'CENTBK', 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(400.0);
    expect(r!.type).toBe('EXPENSE');
    expect(r!.merchant).toBe('UPI Payment');
  });

  // ── Masked UPI sender → "UPI Transfer" ────────────────────────────────────

  it('returns "UPI Transfer" when merchant name contains X (masked UPI)', () => {
    const msg =
      'account XX3113 Credited by Rs.50.00 from XXXXXXXXXX via UPI. Total Bal Rs.2050.00 CR -CBoI';
    const r = parser.parse(msg, 'CBOI', 0);
    expect(r).not.toBeNull();
    expect(r!.merchant).toBe('UPI Transfer');
  });

  // ── Ref No extraction ─────────────────────────────────────────────────────

  it('extracts reference number from Ref No. pattern', () => {
    const msg =
      'account XX3113 Debited by Rs.75.00. Total Bal Rs.1000.00 CR. Ref No.987654321 -CBoI';
    const r = parser.parse(msg, 'CENTBK', 0);
    expect(r).not.toBeNull();
    expect(r!.reference).toBe('987654321');
  });

  // ── isTransactionMessage: "credited by" + "bal" gate ─────────────────────

  it('recognises transaction when message has "credited by" and "bal"', () => {
    const msg = 'account XX3113 Credited by Rs.200.00. Total Bal Rs.4200.00 CR';
    const r = parser.parse(msg, 'CENTBK', 0);
    expect(r).not.toBeNull();
  });

  // ── isTransactionMessage: -cboi signature ─────────────────────────────────

  it('recognises transaction via -cboi signature with credited keyword', () => {
    const msg = 'Rs.100.00 credited to account XX9999 -CBoI';
    const r = parser.parse(msg, 'CBOI', 0);
    expect(r).not.toBeNull();
  });

  // ── Account last4 from A/C ending pattern ─────────────────────────────────

  it('extracts account last4 from "A/C ending" pattern', () => {
    const msg =
      'Rs.600.00 credited to A/C ending 5566. Total Bal Rs.6600.00 CR -CBoI';
    const r = parser.parse(msg, 'CENTBK', 0);
    expect(r).not.toBeNull();
    expect(r!.accountLast4).toBe('5566');
  });

  // ── Large amount with commas ───────────────────────────────────────────────

  it('parses large amount with comma separators', () => {
    const msg =
      'account XX1111 Credited by Rs.1,00,000.00 on 15-Feb-2024. Total Bal Rs.2,00,000.00 CR. Ref No.999888777 -CBoI';
    const r = parser.parse(msg, 'BV-CENTBK-S', 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(100000.0);
    expect(r!.balance).toBe(200000.0);
  });

  // ── withdrawn → EXPENSE ───────────────────────────────────────────────────
  // Messages without -cboi signature fall through to super.isTransactionMessage
  // which recognises "withdrawn". extractTransactionType maps it to EXPENSE.

  it('maps withdrawn to EXPENSE type', () => {
    const msg =
      'Rs.2000.00 withdrawn from account XX6677. Avl Bal Rs.3000.00';
    const r = parser.parse(msg, 'CENTBK', 0);
    expect(r).not.toBeNull();
    expect(r!.type).toBe('EXPENSE');
  });

  // ── deposited → INCOME ────────────────────────────────────────────────────

  it('maps deposited to INCOME type', () => {
    const msg =
      'Rs.3000.00 deposited to account XX6677. Avl Bal Rs.8000.00';
    const r = parser.parse(msg, 'CENTBK', 0);
    expect(r).not.toBeNull();
    expect(r!.type).toBe('INCOME');
  });

  // ── DLT sender BV-CENTBK-S ────────────────────────────────────────────────

  it('parses correctly with DLT sender BV-CENTBK-S', () => {
    const msg =
      'account XX2222 Debited by Rs.500.00. Total Bal Rs.4500.00 CR. Ref No.111222333 -CBoI';
    const r = parser.parse(msg, 'BV-CENTBK-S', 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(500.0);
    expect(r!.type).toBe('EXPENSE');
    expect(r!.bankName).toBe('Central Bank of India');
  });
});
