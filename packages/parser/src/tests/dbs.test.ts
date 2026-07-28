import { describe, it, expect } from 'vitest';
import { DBSBankParser } from '../banks/dbs.js';

const parser = new DBSBankParser();

describe('DBSBankParser', () => {
  // ── canHandle ────────────────────────────────────────────────────────────

  it('handles known senders', () => {
    // Direct string matches
    expect(parser.canHandle('DBSBNK')).toBe(true);
    expect(parser.canHandle('DBS')).toBe(true);
    expect(parser.canHandle('DBSBANK')).toBe(true);
    // Contains-based matches
    expect(parser.canHandle('DBSBNK-123')).toBe(true);
    expect(parser.canHandle('MY-DBS')).toBe(true);
    // DLT patterns
    expect(parser.canHandle('CP-DBSBNK-S')).toBe(true);
    expect(parser.canHandle('AX-DBSBNK-T')).toBe(true);
    expect(parser.canHandle('JM-DBS-S')).toBe(true);
    expect(parser.canHandle('IN-DBS-T')).toBe(true);
    expect(parser.canHandle('CP-DBSBANK-S')).toBe(true);
    expect(parser.canHandle('AX-DBSBANK-T')).toBe(true);
    // Non-matching senders
    expect(parser.canHandle('HDFCBK')).toBe(false);
    expect(parser.canHandle('SBIBNK')).toBe(false);
    expect(parser.canHandle('')).toBe(false);
  });

  // ── getBankName ───────────────────────────────────────────────────────────

  it('returns correct bank name', () => {
    expect(parser.getBankName()).toBe('DBS Bank');
  });

  // ── debit transactions ────────────────────────────────────────────────────

  it('parses debit transaction with INR amount (debited with INR)', () => {
    const msg =
      'Your DBS Bank account no ********1234 has been debited with INR 11 on 01-Jan-2024. Current Balance is INR37888.45';
    const r = parser.parse(msg, 'CP-DBSBNK-S', 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(11);
    expect(r!.type).toBe('EXPENSE');
    expect(r!.accountLast4).toBe('1234');
    expect(r!.balance).toBe(37888.45);
    expect(r!.bankName).toBe('DBS Bank');
    expect(r!.currency).toBe('INR');
  });

  it('parses debit transaction with decimal amount', () => {
    const msg =
      'Your DBS Bank account no ********5678 has been debited with INR 250.50 on 15-Mar-2024. Current Balance is INR5000.00';
    const r = parser.parse(msg, 'DBSBNK', 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(250.5);
    expect(r!.type).toBe('EXPENSE');
    expect(r!.accountLast4).toBe('5678');
    expect(r!.balance).toBe(5000.0);
  });

  it('parses debit with comma-separated amount', () => {
    const msg =
      'Your DBS Bank a/c ****9012 debited with INR 1,500.00. Current Balance is INR10,000.00';
    const r = parser.parse(msg, 'DBS', 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(1500);
    expect(r!.type).toBe('EXPENSE');
    expect(r!.accountLast4).toBe('9012');
    expect(r!.balance).toBe(10000);
  });

  it('parses INR amount debited (amount before keyword)', () => {
    const msg =
      'INR 500 debited from your DBS Bank account ****3456. Balance: INR 2000.00';
    const r = parser.parse(msg, 'CP-DBSBNK-S', 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(500);
    expect(r!.type).toBe('EXPENSE');
    expect(r!.accountLast4).toBe('3456');
    expect(r!.balance).toBe(2000);
  });

  // ── credit transactions ───────────────────────────────────────────────────

  it('parses credit transaction with INR amount (credited with INR)', () => {
    const msg =
      'Your DBS Bank account no ********1234 has been credited with INR 100 on 02-Feb-2024. Current Balance is INR10000.00';
    const r = parser.parse(msg, 'CP-DBSBNK-S', 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(100);
    expect(r!.type).toBe('INCOME');
    expect(r!.accountLast4).toBe('1234');
    expect(r!.balance).toBe(10000);
  });

  it('parses credit transaction with decimal amount', () => {
    const msg =
      'Your DBS Bank account no ********7890 has been credited with INR 5,250.75. Avl Bal: INR 15,250.75';
    const r = parser.parse(msg, 'DBSBNK', 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(5250.75);
    expect(r!.type).toBe('INCOME');
    expect(r!.accountLast4).toBe('7890');
    expect(r!.balance).toBe(15250.75);
  });

  it('parses INR amount credited (amount before keyword)', () => {
    const msg =
      'INR 1000 credited to your DBS Bank account ****2222. Balance: INR 6000.00';
    const r = parser.parse(msg, 'CP-DBS-S', 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(1000);
    expect(r!.type).toBe('INCOME');
    expect(r!.accountLast4).toBe('2222');
    expect(r!.balance).toBe(6000);
  });

  // ── withdrawn transactions ────────────────────────────────────────────────

  it('parses withdrawn transaction', () => {
    const msg =
      'INR 2000.00 withdrawn from your DBS Bank account no ****4321. Current Balance is INR 8000.00';
    const r = parser.parse(msg, 'DBSBNK', 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(2000);
    expect(r!.type).toBe('EXPENSE');
    expect(r!.accountLast4).toBe('4321');
    expect(r!.balance).toBe(8000);
  });

  // ── deposited transactions ────────────────────────────────────────────────

  it('parses deposited transaction', () => {
    const msg =
      'INR 3000.00 deposited to your DBS Bank account ****8888. Balance: INR 11000.00';
    const r = parser.parse(msg, 'CP-DBSBANK-S', 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(3000);
    expect(r!.type).toBe('INCOME');
    expect(r!.accountLast4).toBe('8888');
    expect(r!.balance).toBe(11000);
  });

  // ── account last4 patterns ────────────────────────────────────────────────

  it('extracts account last4 from "account no ****NNNN" pattern', () => {
    const msg =
      'Your DBS Bank account no ********1111 has been debited with INR 50. Current Balance is INR 500.00';
    const r = parser.parse(msg, 'DBSBNK', 0);
    expect(r).not.toBeNull();
    expect(r!.accountLast4).toBe('1111');
  });

  it('extracts account last4 from "a/c ****NNNN" pattern', () => {
    const msg =
      'DBS a/c ****2222 debited with INR 75. Balance: INR 925.00';
    const r = parser.parse(msg, 'DBSBNK', 0);
    expect(r).not.toBeNull();
    expect(r!.accountLast4).toBe('2222');
  });

  it('extracts account last4 from "account ****NNNN" pattern', () => {
    const msg =
      'DBS account ****3333 debited with INR 200. Current Balance is INR 800.00';
    const r = parser.parse(msg, 'DBS', 0);
    expect(r).not.toBeNull();
    expect(r!.accountLast4).toBe('3333');
  });

  // ── balance patterns ──────────────────────────────────────────────────────

  it('extracts balance from "Current Balance is INR" pattern', () => {
    const msg =
      'Your DBS Bank account no ****1234 debited with INR 100. Current Balance is INR37888.45';
    const r = parser.parse(msg, 'DBSBNK', 0);
    expect(r).not.toBeNull();
    expect(r!.balance).toBe(37888.45);
  });

  it('extracts balance from "Balance: INR" pattern', () => {
    const msg =
      'Your DBS account ****5555 credited with INR 500. Balance: INR 1000';
    const r = parser.parse(msg, 'DBS', 0);
    expect(r).not.toBeNull();
    expect(r!.balance).toBe(1000);
  });

  it('extracts balance from "Avl Bal: INR" pattern', () => {
    const msg =
      'Your DBS account ****6666 debited with INR 200. Avl Bal: INR 4800.00';
    const r = parser.parse(msg, 'DBSBNK', 0);
    expect(r).not.toBeNull();
    expect(r!.balance).toBe(4800);
  });

  // ── non-transaction messages ──────────────────────────────────────────────

  it('does not parse OTP messages', () => {
    const msg = 'Your DBS Bank OTP is 123456. Do not share this OTP with anyone.';
    expect(parser.parse(msg, 'DBSBNK', 0)).toBeNull();
  });

  it('does not parse offer/promotional messages', () => {
    const msg = 'Exciting offer! Get 10% cashback offer on your DBS Bank account. T&C apply.';
    expect(parser.parse(msg, 'DBSBNK', 0)).toBeNull();
  });

  it('does not parse messages without amount', () => {
    const msg = 'Your DBS Bank account no ****1234 has been debited. Please contact us for details.';
    expect(parser.parse(msg, 'DBSBNK', 0)).toBeNull();
  });
});
