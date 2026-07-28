import { describe, it, expect } from 'vitest';
import { UtkarshBankParser } from '../banks/utkarsh.js';

const parser = new UtkarshBankParser();

describe('UtkarshBankParser', () => {
  // ── canHandle ─────────────────────────────────────────────────────────────

  it('handles known senders', () => {
    // UTKSPR variants
    expect(parser.canHandle('UTKSPR')).toBe(true);
    expect(parser.canHandle('utkspr')).toBe(true);
    expect(parser.canHandle('AD-UTKSPR')).toBe(true);
    expect(parser.canHandle('CP-UTKSPR-S')).toBe(true);
    // UTKARSH variants
    expect(parser.canHandle('UTKARSH')).toBe(true);
    expect(parser.canHandle('utkarsh')).toBe(true);
    expect(parser.canHandle('BZ-UTKARSH')).toBe(true);
    // UTKSFB variants
    expect(parser.canHandle('UTKSFB')).toBe(true);
    expect(parser.canHandle('utksfb')).toBe(true);
    expect(parser.canHandle('CP-UTKSFB-S')).toBe(true);
    // Non-matching senders
    expect(parser.canHandle('HDFCBK')).toBe(false);
    expect(parser.canHandle('SBIBNK')).toBe(false);
    expect(parser.canHandle('ICICI')).toBe(false);
    expect(parser.canHandle('')).toBe(false);
  });

  // ── getBankName ───────────────────────────────────────────────────────────

  it('returns correct bank name', () => {
    expect(parser.getBankName()).toBe('Utkarsh Bank');
  });

  // ── transaction type always CREDIT ────────────────────────────────────────

  it('always returns CREDIT type for debited messages', () => {
    const msg =
      'INR 500.00 debited from Utkarsh Bank SuperCard xx1234 for UPI - Swiggy on 01-Jan-2024. Avl Limit: Rs.9500.00';
    const r = parser.parse(msg, 'UTKSPR', 0);
    expect(r).not.toBeNull();
    expect(r!.type).toBe('CREDIT');
  });

  it('always returns CREDIT type for spent messages', () => {
    const msg =
      'INR 250.00 spent on Utkarsh Bank SuperCard xx3456 via UPI on 10-May-2024. Avl Limit: Rs.9750.00';
    const r = parser.parse(msg, 'UTKSPR', 0);
    expect(r).not.toBeNull();
    expect(r!.type).toBe('CREDIT');
  });

  // ── amount extraction ─────────────────────────────────────────────────────

  it('extracts INR amount', () => {
    // No Rs. in the message so RS_PATTERN does not shadow the INR amount
    const msg =
      'INR 500.00 debited from Utkarsh Bank SuperCard xx1234 for UPI - Swiggy on 01-Jan-2024. Available Limit: INR 9500.00';
    const r = parser.parse(msg, 'UTKSPR', 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(500);
  });

  it('extracts Rs. amount', () => {
    const msg =
      'Rs.1200.00 debited from Utkarsh Bank SuperCard xx5678 for BigBazaar on 15-May-2024. Avl Limit: Rs.8800.00';
    const r = parser.parse(msg, 'UTKSPR', 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(1200);
  });

  it('extracts comma-separated amount', () => {
    // No Rs. in the message so RS_PATTERN does not shadow the INR amount
    const msg =
      'INR 1,500.00 debited from Utkarsh Bank SuperCard xx7890 for Amazon on 20-Jun-2024. Available Limit: INR 8500.00';
    const r = parser.parse(msg, 'UTKSPR', 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(1500);
  });

  // ── merchant extraction ───────────────────────────────────────────────────

  it('extracts merchant via "for UPI - merchant" pattern (Pattern 1)', () => {
    const msg =
      'INR 500.00 debited from Utkarsh Bank SuperCard xx1234 for UPI - Swiggy on 01-Jan-2024. Avl Limit: Rs.9500.00';
    const r = parser.parse(msg, 'UTKSPR', 0);
    expect(r).not.toBeNull();
    expect(r!.merchant).toBe('Swiggy');
  });

  it('returns UPI Payment when Pattern 1 value is a reference number', () => {
    const msg =
      'INR 350.00 debited from Utkarsh Bank SuperCard xx9012 for UPI - 412345678901 on 20-May-2024. Avl Limit: Rs.9650.00';
    const r = parser.parse(msg, 'UTKSPR', 0);
    expect(r).not.toBeNull();
    expect(r!.merchant).toBe('UPI Payment');
  });

  it('extracts merchant via "for merchant on date" pattern (Pattern 2)', () => {
    const msg =
      'Rs.1200.00 debited from Utkarsh Bank SuperCard xx5678 for BigBazaar on 15-May-2024. Avl Limit: Rs.8800.00';
    const r = parser.parse(msg, 'UTKSPR', 0);
    expect(r).not.toBeNull();
    expect(r!.merchant).toBe('BigBazaar');
  });

  it('skips Pattern 2 when merchant is UPI and falls through to UPI Payment', () => {
    // "for UPI on" would match Pattern 2 but "UPI" is excluded -> falls through to supercard+upi check
    const msg =
      'INR 250.00 spent on Utkarsh Bank SuperCard xx3456 via UPI on 10-May-2024. Avl Limit: Rs.9750.00';
    const r = parser.parse(msg, 'UTKSPR', 0);
    expect(r).not.toBeNull();
    expect(r!.merchant).toBe('UPI Payment');
  });

  it('falls back to Utkarsh SuperCard when no merchant pattern matches and no upi keyword', () => {
    // No "for"/"from"/"to"/"at" keyword that base patterns can latch onto,
    // no "upi" keyword, so super.extractMerchant returns null and we get the fallback.
    const msg =
      'INR 100.00 debited. Utkarsh Bank SuperCard xx2222 transaction alert.';
    const r = parser.parse(msg, 'UTKSPR', 0);
    expect(r).not.toBeNull();
    expect(r!.merchant).toBe('Utkarsh SuperCard');
  });

  // ── account last4 extraction ──────────────────────────────────────────────

  it('extracts accountLast4 from SuperCard xx pattern', () => {
    const msg =
      'INR 500.00 debited from Utkarsh Bank SuperCard xx1234 for UPI - Swiggy on 01-Jan-2024. Avl Limit: Rs.9500.00';
    const r = parser.parse(msg, 'UTKSPR', 0);
    expect(r).not.toBeNull();
    expect(r!.accountLast4).toBe('1234');
  });

  it('extracts accountLast4 from SuperCard XX pattern (uppercase)', () => {
    const msg =
      'INR 750.00 debited from Utkarsh Bank SuperCard XX5678 for Zomato on 05-Feb-2024. Avl Limit: Rs.9250.00';
    const r = parser.parse(msg, 'UTKSPR', 0);
    expect(r).not.toBeNull();
    expect(r!.accountLast4).toBe('5678');
  });

  it('extracts accountLast4 from account xx pattern', () => {
    const msg =
      'INR 100.00 debited from your Utkarsh Bank account xx7890 on 01-Jan-2024. Bal: Rs.5000.00';
    const r = parser.parse(msg, 'UTKARSH', 0);
    expect(r).not.toBeNull();
    expect(r!.accountLast4).toBe('7890');
  });

  // ── balance extraction ────────────────────────────────────────────────────

  it('extracts balance from "Bal: Rs." pattern', () => {
    const msg =
      'INR 100.00 debited from your Utkarsh Bank account xx7890 on 01-Jan-2024. Bal: Rs.5000.00';
    const r = parser.parse(msg, 'UTKARSH', 0);
    expect(r).not.toBeNull();
    expect(r!.balance).toBe(5000);
  });

  it('extracts balance from "Available Balance: Rs." pattern', () => {
    const msg =
      'INR 200.00 debited from Utkarsh Bank SuperCard xx4321 for Flipkart on 10-Mar-2024. Available Balance: Rs.4800.00';
    const r = parser.parse(msg, 'UTKSPR', 0);
    expect(r).not.toBeNull();
    expect(r!.balance).toBe(4800);
  });

  // ── creditLimit extraction ────────────────────────────────────────────────

  it('extracts creditLimit from "Avl Limit: Rs." pattern', () => {
    const msg =
      'INR 500.00 debited from Utkarsh Bank SuperCard xx1234 for UPI - Swiggy on 01-Jan-2024. Avl Limit: Rs.9500.00';
    const r = parser.parse(msg, 'UTKSPR', 0);
    expect(r).not.toBeNull();
    expect(r!.creditLimit).toBe(9500);
  });

  // ── isFromCard ────────────────────────────────────────────────────────────

  it('sets isFromCard true for SuperCard messages', () => {
    const msg =
      'INR 500.00 debited from Utkarsh Bank SuperCard xx1234 for UPI - Swiggy on 01-Jan-2024. Avl Limit: Rs.9500.00';
    const r = parser.parse(msg, 'UTKSPR', 0);
    expect(r).not.toBeNull();
    expect(r!.isFromCard).toBe(true);
  });

  // ── bankName ──────────────────────────────────────────────────────────────

  it('sets bankName to Utkarsh Bank', () => {
    const msg =
      'INR 500.00 debited from Utkarsh Bank SuperCard xx1234 for UPI - Swiggy on 01-Jan-2024. Avl Limit: Rs.9500.00';
    const r = parser.parse(msg, 'UTKSPR', 0);
    expect(r).not.toBeNull();
    expect(r!.bankName).toBe('Utkarsh Bank');
  });

  // ── currency ──────────────────────────────────────────────────────────────

  it('defaults currency to INR', () => {
    const msg =
      'INR 500.00 debited from Utkarsh Bank SuperCard xx1234 for UPI - Swiggy on 01-Jan-2024. Avl Limit: Rs.9500.00';
    const r = parser.parse(msg, 'UTKSPR', 0);
    expect(r).not.toBeNull();
    expect(r!.currency).toBe('INR');
  });

  // ── non-transaction messages ──────────────────────────────────────────────

  it('does not parse OTP messages', () => {
    const msg =
      'Your Utkarsh Bank OTP for SuperCard is 123456. Valid for 10 minutes. Do not share.';
    expect(parser.parse(msg, 'UTKSPR', 0)).toBeNull();
  });

  it('does not parse promotional/offer messages', () => {
    const msg =
      'Exclusive offer! Get 5% cashback offer on Utkarsh Bank SuperCard transactions this festive season.';
    expect(parser.parse(msg, 'UTKSPR', 0)).toBeNull();
  });

  it('does not parse messages without a recognisable amount', () => {
    const msg =
      'Your Utkarsh Bank SuperCard xx1234 has been debited. Please contact support for details.';
    expect(parser.parse(msg, 'UTKSPR', 0)).toBeNull();
  });
});
