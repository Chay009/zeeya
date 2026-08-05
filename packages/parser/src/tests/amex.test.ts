import { describe, it, expect } from 'vitest';
import { AMEXBankParser } from '../banks/amex.js';

const parser = new AMEXBankParser();

describe('AMEXBankParser', () => {
  // ── canHandle ─────────────────────────────────────────────────────────────

  describe('canHandle', () => {
    it('handles AMEXIN sender', () => {
      expect(parser.canHandle('AMEXIN')).toBe(true);
    });

    it('handles AMEXCO sender (contains AMEX)', () => {
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

    it('handles TX-AMEXIN-S', () => {
      expect(parser.canHandle('TX-AMEXIN-S')).toBe(true);
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

  // ── Canonical format: "You've spent INR X on your AMEX card ** XXXXX at MERCHANT on DD Month YYYY" ──

  describe('Format 1 – spent INR on AMEX card at merchant on date', () => {
    const message =
      "Alert: You've spent INR 1,234.56 on your AMEX card ** 41234 at FLIPKART on 01 January 2025.";
    const result = parser.parse(message, 'AMEXIN', 1700000000000);

    it('is not null', () => {
      expect(result).not.toBeNull();
    });

    it('parses amount', () => {
      expect(result?.amount).toBe(1234.56);
    });

    it('parses type as CREDIT', () => {
      expect(result?.type).toBe('CREDIT');
    });

    it('parses merchant', () => {
      expect(result?.merchant).toBe('FLIPKART');
    });

    it('parses accountLast4 (last 4 of 41234)', () => {
      expect(result?.accountLast4).toBe('1234');
    });

    it('has bankName American Express', () => {
      expect(result?.bankName).toBe('American Express');
    });
  });

  // ── Format 2: "INR X spent on your AMEX card" ──

  describe('Format 2 – INR X spent (alt order)', () => {
    const message =
      "INR 1,234.56 spent on your AMEX card ** 91234 at AMAZON on 01 Jan 2025.";
    const result = parser.parse(message, 'AMEXCO', 1700000000000);

    it('is not null', () => {
      expect(result).not.toBeNull();
    });

    it('parses amount', () => {
      expect(result?.amount).toBe(1234.56);
    });

    it('parses type as CREDIT', () => {
      expect(result?.type).toBe('CREDIT');
    });

    it('parses merchant', () => {
      expect(result?.merchant).toBe('AMAZON');
    });
  });

  // ── Large amount with commas ───────────────────────────────────────────────

  describe('Large amount with comma separators', () => {
    const message =
      "Alert: You've spent INR 12,345.67 on your AMEX card ** 11111 at APPLE STORE on 20 March 2025.";
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

  describe('Offer message filtering', () => {
    it('returns null for offer messages', () => {
      const result = parser.parse(
        'Special offer! Get 5X reward points on your AMEX card this month.',
        'AMEXIN',
        1700000000000,
      );
      expect(result).toBeNull();
    });
  });

  describe('Statement message filtering', () => {
    it('returns null for statement messages', () => {
      const result = parser.parse(
        'Your AMEX card statement for December is ready. Due date is 15 January.',
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
    it('marks transaction as from card', () => {
      const message =
        "Alert: You've spent INR 100.00 on your AMEX card ** 41234 at MERCHANT on 01 January 2025.";
      const result = parser.parse(message, 'AMEXIN', 1700000000000);
      expect(result?.isFromCard).toBe(true);
    });
  });

  // ── Currency ──────────────────────────────────────────────────────────────

  describe('currency', () => {
    it('returns INR as currency', () => {
      const message =
        "Alert: You've spent INR 200.00 on your AMEX card ** 55555 at MERCHANT on 05 March 2025.";
      const result = parser.parse(message, 'AMEXIN', 1700000000000);
      expect(result?.currency).toBe('INR');
    });
  });
});
