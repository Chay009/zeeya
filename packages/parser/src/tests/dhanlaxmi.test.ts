import { describe, it, expect } from 'vitest';
import { DhanlaxmiBankParser } from '../banks/dhanlaxmi.js';

const parser = new DhanlaxmiBankParser();

describe('DhanlaxmiBankParser', () => {
  describe('canHandle', () => {
    it('handles DLBBNK', () => {
      expect(parser.canHandle('DLBBNK')).toBe(true);
    });
    it('handles AD-DLBBNK', () => {
      expect(parser.canHandle('AD-DLBBNK')).toBe(true);
    });
    it('handles JK-DLBBNK', () => {
      expect(parser.canHandle('JK-DLBBNK')).toBe(true);
    });
    it('handles DLBANK', () => {
      expect(parser.canHandle('DLBANK')).toBe(true);
    });
    it('handles DHANLA', () => {
      expect(parser.canHandle('DHANLA')).toBe(true);
    });
    it('handles DHANLAXMI', () => {
      expect(parser.canHandle('DHANLAXMI')).toBe(true);
    });
    it('handles lowercase dlbbnk', () => {
      expect(parser.canHandle('dlbbnk')).toBe(true);
    });
    it('rejects HDFC', () => {
      expect(parser.canHandle('HDFC')).toBe(false);
    });
    it('rejects SBI', () => {
      expect(parser.canHandle('SBI')).toBe(false);
    });
    it('rejects FEDBNK', () => {
      expect(parser.canHandle('FEDBNK')).toBe(false);
    });
    it('rejects empty string', () => {
      expect(parser.canHandle('')).toBe(false);
    });
  });

  describe('Debit with Available Balance', () => {
    const message =
      'Your A/c XXXX1234 is debited by Rs.500.00 on 01-01-2025. Available Balance: Rs.1,500.00';
    const sender = 'DLBBNK';
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
    it('bankName is Dhanlaxmi Bank', () => {
      expect(result?.bankName).toBe('Dhanlaxmi Bank');
    });
    it('isFromCard is false', () => {
      expect(result?.isFromCard).toBe(false);
    });
  });

  describe('Credit to Dhanlaxmi Bank A/c with Bal', () => {
    const message =
      'Rs.1,000.00 credited to your Dhanlaxmi Bank A/c XXXX5678 on 15-Jan-2025. Bal: Rs.3,000.00';
    const sender = 'AD-DLBBNK';
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
    it('bankName is Dhanlaxmi Bank', () => {
      expect(result?.bankName).toBe('Dhanlaxmi Bank');
    });
    it('isFromCard is false', () => {
      expect(result?.isFromCard).toBe(false);
    });
  });

  describe('UPI debit with Ref and Bal', () => {
    const message =
      'Dear Customer, INR 250.00 debited from Dhanlaxmi Bank a/c ending 1234 via UPI. Ref: 123456789012. Bal Rs.750.00';
    const sender = 'JK-DLBBNK';
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
    it('reference is 123456789012', () => {
      expect(result?.reference).toBe('123456789012');
    });
    it('balance is 750', () => {
      expect(result?.balance).toBe(750);
    });
    it('merchant is UPI Payment', () => {
      expect(result?.merchant).toBe('UPI Payment');
    });
    it('isFromCard is false', () => {
      expect(result?.isFromCard).toBe(false);
    });
  });

  describe('NEFT credit with From and Bal', () => {
    const message =
      'Your Dhanlaxmi Bank a/c XX9012 credited with Rs.2,000.00. From: JOHN via NEFT. Bal: Rs.7,000.00';
    const sender = 'DHANLA';
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
    it('merchant is JOHN', () => {
      expect(result?.merchant).toBe('JOHN');
    });
    it('balance is 7000', () => {
      expect(result?.balance).toBe(7000);
    });
    it('isFromCard is false', () => {
      expect(result?.isFromCard).toBe(false);
    });
  });

  describe('OTP message is rejected', () => {
    const message =
      'Your Dhanlaxmi Bank OTP is 123456. Do not share with anyone.';
    const sender = 'DLBBNK';
    const result = parser.parse(message, sender, 0);

    it('returns null for OTP messages', () => {
      expect(result).toBeNull();
    });
  });

  describe('Password message is rejected', () => {
    const message =
      'Your Dhanlaxmi Bank internet banking password has been reset. If not done by you, contact us immediately.';
    const sender = 'AD-DLBBNK';
    const result = parser.parse(message, sender, 0);

    it('returns null for password messages', () => {
      expect(result).toBeNull();
    });
  });

  describe('PIN message is rejected', () => {
    const message =
      'Your Dhanlaxmi Bank A/c XXXX1234 PIN has been changed. If not done by you, call 1800-425-1747.';
    const sender = 'DLBBNK';
    const result = parser.parse(message, sender, 0);

    it('returns null for PIN messages', () => {
      expect(result).toBeNull();
    });
  });
});
