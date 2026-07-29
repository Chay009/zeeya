import { describe, it, expect } from 'vitest';
import { AMEXBankParser } from '../banks/amex.js';

const parser = new AMEXBankParser();

describe('AMEXBankParser', () => {
  // ── canHandle ─────────────────────────────────────────────────────────────

  describe('canHandle', () => {
    it('handles AMEXIN sender', () => {
      expect(parser.canHandle('AMEXIN')).toBe(true);
    });

    it('handles AMEXCO sender', () => {
      expect(parser.canHandle('AMEXCO')).toBe(true);
    });

    it('handles AMEX sender', () => {
      expect(parser.canHandle('AMEX')).toBe(true);
    });

    it('handles DLT pattern AD-AMEXIN', () => {
      expect(parser.canHandle('AD-AMEXIN')).toBe(true);
    });

    it('handles DLT pattern JK-AMEXIN', () => {
      expect(parser.canHandle('JK-AMEXIN')).toBe(true);
    });

    it('handles lowercase amexin', () => {
      expect(parser.canHandle('amexin')).toBe(true);
    });

    it('does not handle HDFC', () => {
      expect(parser.canHandle('HDFC')).toBe(false);
    });

    it('does not handle ICICI', () => {
      expect(parser.canHandle('ICICI')).toBe(false);
    });

    it('does not handle UNKNOWN', () => {
      expect(parser.canHandle('UNKNOWN')).toBe(false);
    });

    it('does not handle empty string', () => {
      expect(parser.canHandle('')).toBe(false);
    });
  });

  // ── getBankName ───────────────────────────────────────────────────────────

  describe('getBankName', () => {
    it('returns American Express', () => {
      expect(parser.getBankName()).toBe('American Express');
    });
  });

  // ── Format 1: "Rs.X spent on AMEX Card ending XXXX at MERCHANT on date" ──

  describe('Format 1 – Rs spent on AMEX Card ending at merchant on date', () => {
    const message =
      'Rs.1,234.56 spent on AMEX Card ending 1234 at FLIPKART on 01/01/2025. SMS HELP to 1800-419-2122 for queries.';
    const result = parser.parse(message, 'AMEXIN', 1700000000000);

    it('parses amount', () => {
      expect(result?.amount).toBe(1234.56);
    });

    it('parses type as CREDIT', () => {
      expect(result?.type).toBe('CREDIT');
    });

    it('parses merchant', () => {
      expect(result?.merchant).toBe('FLIPKART');
    });

    it('parses accountLast4', () => {
      expect(result?.accountLast4).toBe('1234');
    });

    it('is not null', () => {
      expect(result).not.toBeNull();
    });

    it('has bankName American Express', () => {
      expect(result?.bankName).toBe('American Express');
    });
  });

  // ── Format 2: "INR X charged on your American Express Card ending XXXX at MERCHANT on date" ──

  describe('Format 2 – INR charged on American Express Card ending at merchant on date', () => {
    const message =
      'INR 1234.56 charged on your American Express Card ending XXXX at AMAZON on 01-JAN-2025.';
    const result = parser.parse(message, 'AMEXCO', 1700000000000);

    it('parses amount', () => {
      expect(result?.amount).toBe(1234.56);
    });

    it('parses type as CREDIT', () => {
      expect(result?.type).toBe('CREDIT');
    });

    it('parses merchant', () => {
      expect(result?.merchant).toBe('AMAZON');
    });

    it('is not null', () => {
      expect(result).not.toBeNull();
    });
  });

  // ── Format 3: "Transaction of Rs.X on AMEX Card XXXX1234. Merchant: NAME. Available Credit: Rs.XXXXX" ──

  describe('Format 3 – Transaction on AMEX Card with Merchant label and Available Credit', () => {
    const message =
      'Transaction of Rs.500.00 on AMEX Card XXXX5678. Merchant: SWIGGY. Available Credit: Rs.45000.00';
    const result = parser.parse(message, 'AMEXIN', 1700000000000);

    it('parses amount', () => {
      expect(result?.amount).toBe(500.0);
    });

    it('parses type as CREDIT', () => {
      expect(result?.type).toBe('CREDIT');
    });

    it('parses merchant from Merchant: label', () => {
      expect(result?.merchant).toBe('SWIGGY');
    });

    it('parses accountLast4 from Card XXXX5678', () => {
      expect(result?.accountLast4).toBe('5678');
    });

    it('parses availableLimit from Available Credit', () => {
      expect(result?.creditLimit).toBe(45000.0);
    });

    it('is not null', () => {
      expect(result).not.toBeNull();
    });
  });

  // ── Format 4: "Your American Express Card ending XXXX has been used for INR X at MERCHANT." ──

  describe('Format 4 – American Express Card ending has been used for INR at merchant', () => {
    const message =
      'Your American Express Card ending 4321 has been used for INR 500.00 at ZOMATO.';
    const result = parser.parse(message, 'AD-AMEXIN', 1700000000000);

    it('parses amount', () => {
      expect(result?.amount).toBe(500.0);
    });

    it('parses type as CREDIT', () => {
      expect(result?.type).toBe('CREDIT');
    });

    it('parses merchant', () => {
      expect(result?.merchant).toBe('ZOMATO');
    });

    it('parses accountLast4 from ending', () => {
      expect(result?.accountLast4).toBe('4321');
    });

    it('is not null', () => {
      expect(result).not.toBeNull();
    });
  });

  // ── Available limit patterns ───────────────────────────────────────────────

  describe('Available limit – Avl Cr Limit pattern', () => {
    const message =
      'Rs.750.00 spent on AMEX Card ending 9999 at NETFLIX on 15/06/2025. Avl Cr Limit: Rs.25000.00';
    const result = parser.parse(message, 'AMEXIN', 1700000000000);

    it('parses creditLimit from Avl Cr Limit', () => {
      expect(result?.creditLimit).toBe(25000.0);
    });

    it('parses amount', () => {
      expect(result?.amount).toBe(750.0);
    });

    it('parses type as CREDIT', () => {
      expect(result?.type).toBe('CREDIT');
    });
  });

  // ── Large amount with commas ───────────────────────────────────────────────

  describe('Large amount with comma separators', () => {
    const message =
      'Rs.12,345.67 spent on AMEX Card ending 1111 at APPLE STORE on 20/03/2025.';
    const result = parser.parse(message, 'JK-AMEXIN', 1700000000000);

    it('parses large amount with commas correctly', () => {
      expect(result?.amount).toBe(12345.67);
    });

    it('parses type as CREDIT', () => {
      expect(result?.type).toBe('CREDIT');
    });

    it('parses merchant', () => {
      expect(result?.merchant).toBe('APPLE STORE');
    });

    it('parses accountLast4', () => {
      expect(result?.accountLast4).toBe('1111');
    });
  });

  // ── Negative filters ──────────────────────────────────────────────────────

  describe('OTP message filtering', () => {
    it('returns null for OTP messages', () => {
      const result = parser.parse(
        'Your AMEX OTP is 123456. Do not share this with anyone.',
        'AMEXIN',
        1700000000000,
      );
      expect(result).toBeNull();
    });
  });

  describe('Password message filtering', () => {
    it('returns null for password messages', () => {
      const result = parser.parse(
        'Your AMEX Card password has been changed successfully.',
        'AMEXIN',
        1700000000000,
      );
      expect(result).toBeNull();
    });
  });

  describe('PIN message filtering', () => {
    it('returns null for PIN messages', () => {
      const result = parser.parse(
        'Your American Express Card PIN has been set. Please do not share it.',
        'AMEXCO',
        1700000000000,
      );
      expect(result).toBeNull();
    });
  });

  describe('Message without amount', () => {
    it('returns null when no amount is present', () => {
      const result = parser.parse(
        'Your AMEX Card ending 1234 transaction was processed.',
        'AMEXIN',
        1700000000000,
      );
      expect(result).toBeNull();
    });
  });

  // ── isFromCard detection ──────────────────────────────────────────────────

  describe('isFromCard detection', () => {
    it('marks transaction as from card for "ending" pattern', () => {
      const message = 'Rs.100.00 spent on AMEX Card ending 1234 at MERCHANT on 01/01/2025.';
      const result = parser.parse(message, 'AMEXIN', 1700000000000);
      expect(result?.isFromCard).toBe(true);
    });
  });

  // ── Currency ──────────────────────────────────────────────────────────────

  describe('currency', () => {
    it('returns INR as currency', () => {
      const message =
        'INR 200.00 charged on your American Express Card ending 5555 at MERCHANT on 05-MAR-2025.';
      const result = parser.parse(message, 'AMEXIN', 1700000000000);
      expect(result?.currency).toBe('INR');
    });
  });
});
