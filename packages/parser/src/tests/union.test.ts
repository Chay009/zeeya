import { describe, it, expect } from 'vitest';
import { UnionBankParser } from '../banks/union.js';

const parser = new UnionBankParser();

describe('UnionBankParser', () => {
  // ── getBankName ──────────────────────────────────────────────────────────

  it('returns correct bank name', () => {
    expect(parser.getBankName()).toBe('Union Bank of India');
  });

  // ── canHandle ────────────────────────────────────────────────────────────

  it('handles UNIONB sender', () => {
    expect(parser.canHandle('UNIONB')).toBe(true);
  });

  it('handles UNIONBANK sender', () => {
    expect(parser.canHandle('UNIONBANK')).toBe(true);
  });

  it('handles UBOI sender', () => {
    expect(parser.canHandle('UBOI')).toBe(true);
  });

  it('handles DLT pattern XX-UNIONB-S', () => {
    expect(parser.canHandle('AX-UNIONB-S')).toBe(true);
  });

  it('handles DLT pattern XX-UNIONB-T', () => {
    expect(parser.canHandle('VD-UNIONB-T')).toBe(true);
  });

  it('handles DLT pattern XX-UNIONB-P', () => {
    expect(parser.canHandle('CP-UNIONB-P')).toBe(true);
  });

  it('handles DLT pattern XX-UNIONB (no suffix)', () => {
    expect(parser.canHandle('AD-UNIONB')).toBe(true);
  });

  it('handles DLT pattern XX-UNIONBANK', () => {
    expect(parser.canHandle('VK-UNIONBANK')).toBe(true);
  });

  it('does not handle HDFC', () => {
    expect(parser.canHandle('HDFC')).toBe(false);
  });

  it('does not handle UNKNOWN', () => {
    expect(parser.canHandle('UNKNOWN')).toBe(false);
  });

  // ── Mobile Banking debit (from Kotlin comment example) ──────────────────
  // Format: "A/c *1234 Debited for Rs:100.00 on 11-08-2025 18:28:02 by Mob Bk
  //          ref no 123456789000 Avl Bal Rs:12345.67"

  it('parses mobile banking debit with Mob Bk', () => {
    const msg =
      'A/c *1234 Debited for Rs:100.00 on 11-08-2025 18:28:02 by Mob Bk ref no 123456789000 Avl Bal Rs:12345.67';
    const r = parser.parse(msg, 'AX-UNIONB-S', 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(100.0);
    expect(r!.type).toBe('EXPENSE');
    expect(r!.merchant).toBe('Mobile Banking Transfer');
    expect(r!.accountLast4).toBe('1234');
    expect(r!.balance).toBe(12345.67);
    expect(r!.reference).toBe('123456789000');
    expect(r!.bankName).toBe('Union Bank of India');
    expect(r!.currency).toBe('INR');
  });

  // ── Rs: colon format for amount extraction ───────────────────────────────

  it('extracts amount from Rs: (colon) format', () => {
    const msg =
      'A/c *5678 Credited Rs:500.00 by NEFT ref no 200000001234 Avl Bal Rs:99999.00';
    const r = parser.parse(msg, 'UNIONB', 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(500.0);
    expect(r!.type).toBe('INCOME');
    expect(r!.accountLast4).toBe('5678');
    expect(r!.balance).toBe(99999.0);
    expect(r!.reference).toBe('200000001234');
  });

  // ── INR format for amount extraction ────────────────────────────────────

  it('extracts amount from INR format when no Rs prefix is present', () => {
    // The extractAmount override tries Rs pattern first; fallback to INR
    // only when there is no Rs/Rs./Rs: prefix in the message at all.
    const msg =
      'A/c X9999 Debited INR 2500 on 10-01-2025. Available Balance INR 50000';
    const r = parser.parse(msg, 'VK-UNIONBANK', 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(2500);
    expect(r!.type).toBe('EXPENSE');
    expect(r!.accountLast4).toBe('9999');
  });

  // ── Account last4 patterns ──────────────────────────────────────────────

  it('extracts account last4 from A/c *XXXX pattern', () => {
    const msg = 'A/c *4321 Debited Rs:300.00 by Mob Bk ref no 111222333 Avl Bal Rs:1000.00';
    const r = parser.parse(msg, 'UNIONB', 0);
    expect(r).not.toBeNull();
    expect(r!.accountLast4).toBe('4321');
  });

  it('extracts account last4 from A/c XXXX pattern (no asterisk)', () => {
    const msg = 'A/c 8765 Debited Rs:150.00 by Mob Bk ref no 999888777 Avl Bal Rs:5000.00';
    const r = parser.parse(msg, 'AD-UNIONB', 0);
    expect(r).not.toBeNull();
    expect(r!.accountLast4).toBe('8765');
  });

  // ── Avl Bal balance pattern ─────────────────────────────────────────────

  it('extracts balance from Avl Bal Rs: pattern', () => {
    const msg =
      'A/c *2222 Debited Rs:999.00 by Mob Bk ref no 555666777 Avl Bal Rs:88888.88';
    const r = parser.parse(msg, 'UBOI', 0);
    expect(r).not.toBeNull();
    expect(r!.balance).toBe(88888.88);
  });

  // ── Reference patterns ──────────────────────────────────────────────────

  it('extracts reference from "ref no" pattern', () => {
    const msg =
      'A/c *3333 Debited Rs:750.00 by Mob Bk ref no 123000000456 Avl Bal Rs:10000.00';
    const r = parser.parse(msg, 'AX-UNIONB-S', 0);
    expect(r).not.toBeNull();
    expect(r!.reference).toBe('123000000456');
  });

  it('extracts reference from txn pattern', () => {
    const msg =
      'A/c *6666 Debited Rs:200.00 Txn:TXN20240101 Avl Bal Rs:5000.00';
    const r = parser.parse(msg, 'UNIONB', 0);
    expect(r).not.toBeNull();
    expect(r!.reference).toBe('TXN20240101');
  });

  // ── Credit transaction ──────────────────────────────────────────────────

  it('parses credit transaction type correctly', () => {
    const msg =
      'A/c *7777 Credited Rs:1000.00 by NEFT ref no 777888999 Avl Bal Rs:20000.00';
    const r = parser.parse(msg, 'CP-UNIONB-P', 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(1000.0);
    expect(r!.type).toBe('INCOME');
    expect(r!.accountLast4).toBe('7777');
    expect(r!.balance).toBe(20000.0);
    expect(r!.reference).toBe('777888999');
  });

  // ── isTransactionMessage: OTP override ─────────────────────────────────
  // Union Bank includes "Never Share OTP/PIN/CVV" in transaction messages.
  // The override ensures it still parses if transaction keyword is present.

  it('parses transaction message that also contains OTP warning text', () => {
    const msg =
      'A/c *1234 Debited Rs:500.00 ref no 100200300400 Avl Bal Rs:5000.00. Never Share OTP/PIN/CVV.';
    const r = parser.parse(msg, 'UNIONB', 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(500.0);
    expect(r!.type).toBe('EXPENSE');
  });

  // ── OTP-only message should return null ─────────────────────────────────

  it('returns null for a pure OTP message with no transaction keywords', () => {
    const r = parser.parse(
      'Your Union Bank OTP is 123456. Valid for 10 minutes.',
      'AX-UNIONB-S',
      0,
    );
    expect(r).toBeNull();
  });

  // ── Large amount with comma separators ─────────────────────────────────

  it('parses large amounts with comma separators', () => {
    const msg =
      'A/c *1111 Debited Rs:1,50,000.00 by Mob Bk ref no 999000111 Avl Bal Rs:3,00,000.00';
    const r = parser.parse(msg, 'UNIONB', 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(150000.0);
    expect(r!.balance).toBe(300000.0);
  });
});
