import { describe, it, expect } from 'vitest';
import { KeralaBankParser } from '../banks/kerala-bank.js';

const parser = new KeralaBankParser();

describe('KeralaBankParser', () => {
  describe('canHandle', () => {
    it('handles KRLBNK', () => {
      expect(parser.canHandle('KRLBNK')).toBe(true);
    });
    it('handles AD-KRLBNK', () => {
      expect(parser.canHandle('AD-KRLBNK')).toBe(true);
    });
    it('handles KERBNK', () => {
      expect(parser.canHandle('KERBNK')).toBe(true);
    });
    it('handles JK-KERBNK', () => {
      expect(parser.canHandle('JK-KERBNK')).toBe(true);
    });
    it('handles KERALAB', () => {
      expect(parser.canHandle('KERALAB')).toBe(true);
    });
    it('handles KERALABANK', () => {
      expect(parser.canHandle('KERALABANK')).toBe(true);
    });
    it('handles lowercase krlbnk', () => {
      expect(parser.canHandle('krlbnk')).toBe(true);
    });
    it('rejects KGBANK (Kerala Gramin, not Kerala Bank)', () => {
      expect(parser.canHandle('KGBANK')).toBe(false);
    });
    it('rejects HDFC', () => {
      expect(parser.canHandle('HDFC')).toBe(false);
    });
    it('rejects SBI', () => {
      expect(parser.canHandle('SBI')).toBe(false);
    });
    it('rejects empty string', () => {
      expect(parser.canHandle('')).toBe(false);
    });
  });

  describe('Simple debit with Avl Bal', () => {
    const message =
      'Your A/c XXXX1234 debited Rs.500.00 on 01-01-2025. Avl Bal: Rs.1500.00';
    const sender = 'AD-KRLBNK';
    const result = parser.parse(message, sender, 0);

    it('parses successfully', () => {
      expect(result).not.toBeNull();
    });
    it('amount is 500', () => {
      expect(result?.amount).toBe(500);
    });
    it('currency is INR', () => {
      expect(result?.currency).toBe('INR');
    });
    it('type is EXPENSE', () => {
      expect(result?.type).toBe('EXPENSE');
    });
    it('accountLast4 is 1234', () => {
      expect(result?.accountLast4).toBe('1234');
    });
    it('balance is 1500', () => {
      expect(result?.balance).toBe(1500);
    });
    it('bankName is Kerala Bank', () => {
      expect(result?.bankName).toBe('Kerala Bank');
    });
  });

  describe('Credit to Kerala Bank A/c with Balance', () => {
    const message =
      'Rs.1000 credited to your Kerala Bank A/c XXXX5678. Balance Rs.3000.00';
    const sender = 'KRLBNK';
    const result = parser.parse(message, sender, 0);

    it('parses successfully', () => {
      expect(result).not.toBeNull();
    });
    it('amount is 1000', () => {
      expect(result?.amount).toBe(1000);
    });
    it('currency is INR', () => {
      expect(result?.currency).toBe('INR');
    });
    it('type is INCOME', () => {
      expect(result?.type).toBe('INCOME');
    });
    it('accountLast4 is 5678', () => {
      expect(result?.accountLast4).toBe('5678');
    });
    it('balance is 3000', () => {
      expect(result?.balance).toBe(3000);
    });
  });

  describe('UPI debit with Ref and Bal', () => {
    const message =
      'Dear Customer, A/c No XX1234 is debited with INR 250.00 via UPI. Ref: 123456789. Bal Rs.750';
    const sender = 'KERBNK';
    const result = parser.parse(message, sender, 0);

    it('parses successfully', () => {
      expect(result).not.toBeNull();
    });
    it('amount is 250', () => {
      expect(result?.amount).toBe(250);
    });
    it('currency is INR', () => {
      expect(result?.currency).toBe('INR');
    });
    it('type is EXPENSE', () => {
      expect(result?.type).toBe('EXPENSE');
    });
    it('accountLast4 is 1234', () => {
      expect(result?.accountLast4).toBe('1234');
    });
    it('reference is 123456789', () => {
      expect(result?.reference).toBe('123456789');
    });
    it('balance is 750', () => {
      expect(result?.balance).toBe(750);
    });
    it('merchant is UPI Payment', () => {
      expect(result?.merchant).toBe('UPI Payment');
    });
  });

  describe('IMPS credit with From and Bal', () => {
    const message =
      'Your Kerala Bank Savings A/c XX9012 credited by Rs.2000. From: JOHN DOE via IMPS. Bal: Rs.7000';
    const sender = 'AD-KRLBNK';
    const result = parser.parse(message, sender, 0);

    it('parses successfully', () => {
      expect(result).not.toBeNull();
    });
    it('amount is 2000', () => {
      expect(result?.amount).toBe(2000);
    });
    it('currency is INR', () => {
      expect(result?.currency).toBe('INR');
    });
    it('type is INCOME', () => {
      expect(result?.type).toBe('INCOME');
    });
    it('accountLast4 is 9012', () => {
      expect(result?.accountLast4).toBe('9012');
    });
    it('merchant is JOHN DOE', () => {
      expect(result?.merchant).toBe('JOHN DOE');
    });
    it('balance is 7000', () => {
      expect(result?.balance).toBe(7000);
    });
  });

  describe('OTP message is rejected', () => {
    const message =
      'Your Kerala Bank OTP is 123456. Do not share with anyone.';
    const sender = 'KRLBNK';
    const result = parser.parse(message, sender, 0);

    it('returns null for OTP messages', () => {
      expect(result).toBeNull();
    });
  });

  describe('Password reset message is rejected', () => {
    const message =
      'Your Kerala Bank internet banking password has been reset. If not done by you, contact us immediately.';
    const sender = 'KERALAB';
    const result = parser.parse(message, sender, 0);

    it('returns null for password messages', () => {
      expect(result).toBeNull();
    });
  });
});
