import { describe, it, expect } from 'vitest';
import { DhanlaxmiBankParser } from '../banks/dhanlaxmi.js';

const parser = new DhanlaxmiBankParser();

describe('DhanlaxmiBankParser', () => {
  describe('canHandle', () => {
    it('handles DHANBK', () => expect(parser.canHandle('DHANBK')).toBe(true));
    it('handles TL-DHANBK-S', () => expect(parser.canHandle('TL-DHANBK-S')).toBe(true));
    it('handles VM-DHANBK', () => expect(parser.canHandle('VM-DHANBK')).toBe(true));
    it('handles AD-DHANBK-S', () => expect(parser.canHandle('AD-DHANBK-S')).toBe(true));
    it('handles DHANLAXMI', () => expect(parser.canHandle('DHANLAXMI')).toBe(true));
    it('handles lowercase dhanbk', () => expect(parser.canHandle('tl-dhanbk-s')).toBe(true));
    it('rejects DLBBNK', () => expect(parser.canHandle('DLBBNK')).toBe(false));
    it('rejects HDFC', () => expect(parser.canHandle('HDFC')).toBe(false));
    it('rejects SBI', () => expect(parser.canHandle('SBI')).toBe(false));
    it('rejects FEDBNK', () => expect(parser.canHandle('FEDBNK')).toBe(false));
    it('rejects empty string', () => expect(parser.canHandle('')).toBe(false));
  });

  describe('UPI debit (INR X is debited from A/c)', () => {
    const message =
      'INR 20.00 is debited from A/c XXXX1234 on 28-NOV-2025 - UPI TXN: /675325120952-MR /Payment from PhonePe/USER/user@ybl. Aval Bal is INR 1,000.00';
    const result = parser.parse(message, 'TL-DHANBK-S', 0);

    it('parses successfully', () => expect(result).not.toBeNull());
    it('amount is 20', () => expect(result?.amount).toBe(20));
    it('currency is INR', () => expect(result?.currency).toBe('INR'));
    it('type is EXPENSE', () => expect(result?.type).toBe('EXPENSE'));
    it('accountLast4 is 1234', () => expect(result?.accountLast4).toBe('1234'));
    it('balance is 1000', () => expect(result?.balance).toBe(1000));
    it('merchant is PhonePe', () => expect(result?.merchant).toBe('PhonePe'));
    it('bankName is Dhanlaxmi Bank', () => expect(result?.bankName).toBe('Dhanlaxmi Bank'));
    it('isFromCard is false', () => expect(result?.isFromCard).toBe(false));
  });

  describe('UPI credit (INR X is credited to A/c)', () => {
    const message =
      'INR 500.00 is credited to A/c XXXX5678 on 24-APR-2025 - UPI TXN: /123456789012-MR /Payment from Paytm/. Aval Bal is INR 5,000.00';
    const result = parser.parse(message, 'VM-DHANBK', 0);

    it('parses successfully', () => expect(result).not.toBeNull());
    it('amount is 500', () => expect(result?.amount).toBe(500));
    it('type is INCOME', () => expect(result?.type).toBe('INCOME'));
    it('accountLast4 is 5678', () => expect(result?.accountLast4).toBe('5678'));
    it('balance is 5000', () => expect(result?.balance).toBe(5000));
    it('bankName is Dhanlaxmi Bank', () => expect(result?.bankName).toBe('Dhanlaxmi Bank'));
    it('isFromCard is false', () => expect(result?.isFromCard).toBe(false));
  });

  describe('Internal transfer (credited for Rs.)', () => {
    const message =
      'Your a/c no. XXXXXXXX1234 is credited for Rs.1,000.00 on 24-04-25. Aval Bal is INR 10,000.00';
    const result = parser.parse(message, 'DHANLAXMI', 0);

    it('parses successfully', () => expect(result).not.toBeNull());
    it('amount is 1000', () => expect(result?.amount).toBe(1000));
    it('type is INCOME', () => expect(result?.type).toBe('INCOME'));
    it('balance is 10000', () => expect(result?.balance).toBe(10000));
    it('bankName is Dhanlaxmi Bank', () => expect(result?.bankName).toBe('Dhanlaxmi Bank'));
  });

  describe('OTP message is rejected', () => {
    it('returns null', () => {
      expect(
        parser.parse('Your Dhanlaxmi Bank OTP is 123456. Do not share with anyone.', 'DHANBK', 0),
      ).toBeNull();
    });
  });

  describe('Password message is rejected', () => {
    it('returns null', () => {
      expect(
        parser.parse(
          'Your Dhanlaxmi Bank internet banking password has been reset. Contact us if not done by you.',
          'DHANBK',
          0,
        ),
      ).toBeNull();
    });
  });

  describe('PIN message is rejected', () => {
    it('returns null', () => {
      expect(
        parser.parse(
          'Your Dhanlaxmi Bank A/c XXXX1234 PIN has been changed. Call 1800-425-1747 if not done by you.',
          'DHANBK',
          0,
        ),
      ).toBeNull();
    });
  });
});
