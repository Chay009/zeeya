import { describe, it, expect } from 'vitest';
import { PunjabSindBankParser } from '../banks/punjab-sind.js';

const parser = new PunjabSindBankParser();

describe('PunjabSindBankParser', () => {
  // ── canHandle ──────────────────────────────────────────────────────────────

  it('handles known senders', () => {
    expect(parser.canHandle('PSBBNK')).toBe(true);
    expect(parser.canHandle('PSBANK')).toBe(true);
    expect(parser.canHandle('PUNSIN')).toBe(true);
    expect(parser.canHandle('PUNJABSIND')).toBe(true);
    expect(parser.canHandle('AD-PSBBNK')).toBe(true);
    expect(parser.canHandle('JK-PSBBNK')).toBe(true);
  });

  it('does not handle unrelated senders', () => {
    expect(parser.canHandle('HDFCBK')).toBe(false);
    expect(parser.canHandle('SBIINB')).toBe(false);
    expect(parser.canHandle('PNBBNK')).toBe(false);
    expect(parser.canHandle('UNKNOWN')).toBe(false);
    expect(parser.canHandle('')).toBe(false);
  });

  // ── getBankName ────────────────────────────────────────────────────────────

  it('returns correct bank name', () => {
    expect(parser.getBankName()).toBe('Punjab & Sind Bank');
  });

  // ── Debit via "Debited by Rs." ─────────────────────────────────────────────

  it('parses debit transaction (Debited by Rs.)', () => {
    const r = parser.parse(
      'Your A/c XXXX1234 Debited by Rs.500.00 on 01/01/2025 Bal Rs.1500.00',
      'PSBBNK',
      0
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(500.00);
    expect(r!.type).toBe('EXPENSE');
    expect(r!.accountLast4).toBe('1234');
    expect(r!.balance).toBe(1500.00);
    expect(r!.bankName).toBe('Punjab & Sind Bank');
    expect(r!.currency).toBe('INR');
  });

  // ── Credit via "Rs. Credited to A/c" ──────────────────────────────────────

  it('parses credit transaction (Credited to A/c)', () => {
    const r = parser.parse(
      'Rs.1,000.00 Credited to your Punjab & Sind Bank A/c XXXX5678. Balance: Rs.5,000.00',
      'PSBANK',
      0
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(1000.00);
    expect(r!.type).toBe('INCOME');
    expect(r!.accountLast4).toBe('5678');
    expect(r!.balance).toBe(5000.00);
    expect(r!.currency).toBe('INR');
  });

  // ── Debit via "Acct No" with UPI Ref ──────────────────────────────────────

  it('parses debit with Acct No and UPI Ref', () => {
    const r = parser.parse(
      'Acct No XXXXXXXX1234 Debit Rs 250.00 on 15-Jan-2025. Avl Bal Rs 750. UPI Ref 123456789012',
      'AD-PSBBNK',
      0
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(250.00);
    expect(r!.type).toBe('EXPENSE');
    expect(r!.accountLast4).toBe('1234');
    expect(r!.balance).toBe(750);
    expect(r!.reference).toBe('123456789012');
    expect(r!.currency).toBe('INR');
  });

  // ── Credit via INR to Acct ─────────────────────────────────────────────────

  it('parses credit with INR and Acct (no decimals)', () => {
    const r = parser.parse(
      'Dear Customer INR 100 Credit to Acct XXXX9012. Bal Rs.900',
      'PUNSIN',
      0
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(100);
    expect(r!.type).toBe('INCOME');
    expect(r!.accountLast4).toBe('9012');
    expect(r!.balance).toBe(900);
    expect(r!.currency).toBe('INR');
  });

  // ── Balance extraction: "Avl Bal Rs" ──────────────────────────────────────

  it('extracts Avl Bal Rs pattern', () => {
    const r = parser.parse(
      'Your A/c XXXX3333 Debited Rs.200.00. Avl Bal Rs.8,000.50',
      'PSBBNK',
      0
    );
    expect(r).not.toBeNull();
    expect(r!.balance).toBe(8000.50);
  });

  // ── Reference: "Ref No" ────────────────────────────────────────────────────

  it('extracts Ref No reference', () => {
    const r = parser.parse(
      'Your A/c XXXX4444 Debited Rs.300.00. Bal Rs.700.00. Ref No 987654321',
      'PSBANK',
      0
    );
    expect(r).not.toBeNull();
    expect(r!.reference).toBe('987654321');
  });

  // ── Large amount with commas ───────────────────────────────────────────────

  it('parses large debit amount with commas', () => {
    const r = parser.parse(
      'Your A/c XXXX7777 Debited by Rs.25,000.00 on 10/06/2025 Bal Rs.75,000.00',
      'JK-PSBBNK',
      0
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(25000.00);
    expect(r!.type).toBe('EXPENSE');
    expect(r!.balance).toBe(75000.00);
    expect(r!.accountLast4).toBe('7777');
  });

  // ── Negative: OTP should not parse ────────────────────────────────────────

  it('does not parse OTP message', () => {
    const r = parser.parse(
      'Your OTP for Punjab & Sind Bank login is 456789. Do not share.',
      'PSBBNK',
      0
    );
    expect(r).toBeNull();
  });

  // ── Negative: password-change alert ───────────────────────────────────────

  it('does not parse password change message', () => {
    const r = parser.parse(
      'Your Punjab & Sind Bank internet banking password has been changed successfully.',
      'PSBANK',
      0
    );
    expect(r).toBeNull();
  });

  // ── Parse result fields ────────────────────────────────────────────────────

  it('returns a complete ParsedTransaction with expected fields', () => {
    const r = parser.parse(
      'Your A/c XXXX1234 Debited by Rs.100.00 on 01/01/2025 Bal Rs.900.00',
      'PSBBNK',
      1234567890
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(100.00);
    expect(r!.type).toBe('EXPENSE');
    expect(r!.bankName).toBe('Punjab & Sind Bank');
    expect(r!.sender).toBe('PSBBNK');
    expect(r!.timestamp).toBe(1234567890);
    expect(r!.currency).toBe('INR');
    expect(r!.isFromCard).toBe(false);
  });

  // ── A/c with "No." pattern ────────────────────────────────────────────────

  it('parses A/c No. pattern for account last4', () => {
    const r = parser.parse(
      'Your A/c No XXXXXXXXXX5566 Debited by Rs.450.00. Bal Rs.2,550.00',
      'PSBBNK',
      0
    );
    expect(r).not.toBeNull();
    expect(r!.accountLast4).toBe('5566');
    expect(r!.amount).toBe(450.00);
    expect(r!.type).toBe('EXPENSE');
  });

  // ── PUNJABSIND sender variant ──────────────────────────────────────────────

  it('handles PUNJABSIND sender', () => {
    const r = parser.parse(
      'Rs.500.00 Credited to your A/c XXXX2222. Balance: Rs.3,500.00',
      'PUNJABSIND',
      0
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(500.00);
    expect(r!.type).toBe('INCOME');
    expect(r!.accountLast4).toBe('2222');
    expect(r!.balance).toBe(3500.00);
  });
});
