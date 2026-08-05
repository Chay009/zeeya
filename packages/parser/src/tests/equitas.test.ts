import { describe, it, expect } from 'vitest';
import { EquitasBankParser } from '../banks/equitas.js';

const parser = new EquitasBankParser();

describe('EquitasBankParser', () => {
  describe('canHandle', () => {
    it('handles EQUTAS', () => expect(parser.canHandle('EQUTAS')).toBe(true));
    it('handles AD-EQUITAS', () => expect(parser.canHandle('AD-EQUITAS')).toBe(true));
    it('handles JK-EQUITA', () => expect(parser.canHandle('JK-EQUITA')).toBe(true));
    it('handles EQUITSBNK', () => expect(parser.canHandle('EQUITSBNK')).toBe(true));
    it('handles lowercase equitas', () => expect(parser.canHandle('ad-equitas')).toBe(true));
    it('rejects EQBNK', () => expect(parser.canHandle('EQBNK')).toBe(false));
    it('rejects EQUBNK', () => expect(parser.canHandle('EQUBNK')).toBe(false));
    it('rejects HDFCBK', () => expect(parser.canHandle('HDFCBK')).toBe(false));
    it('rejects ICICIBK', () => expect(parser.canHandle('ICICIBK')).toBe(false));
    it('rejects empty string', () => expect(parser.canHandle('')).toBe(false));
  });

  it('returns correct bank name', () => {
    expect(parser.getBankName()).toBe('Equitas Small Finance Bank');
  });

  describe('UPI debit (INR X debited)', () => {
    const message =
      'INR 500.00 debited on 01-01-25 to SWIGGY. Avl Bal is INR 1,000.00';
    const result = parser.parse(message, 'AD-EQUITAS', 0);

    it('parses successfully', () => expect(result).not.toBeNull());
    it('amount is 500', () => expect(result?.amount).toBe(500));
    it('type is EXPENSE', () => expect(result?.type).toBe('EXPENSE'));
    it('balance is 1000', () => expect(result?.balance).toBe(1000));
    it('merchant is SWIGGY', () => expect(result?.merchant).toBe('SWIGGY'));
    it('bankName is Equitas Small Finance Bank', () =>
      expect(result?.bankName).toBe('Equitas Small Finance Bank'));
  });

  describe('UPI credit (INR X credited)', () => {
    const message =
      'INR 1,000.00 credited on 15-01-25 from AMAZON. Avl Bal is INR 5,000.00';
    const result = parser.parse(message, 'AD-EQUITAS', 0);

    it('parses successfully', () => expect(result).not.toBeNull());
    it('amount is 1000', () => expect(result?.amount).toBe(1000));
    it('type is INCOME', () => expect(result?.type).toBe('INCOME'));
    it('balance is 5000', () => expect(result?.balance).toBe(5000));
    it('merchant is AMAZON', () => expect(result?.merchant).toBe('AMAZON'));
    it('bankName is Equitas Small Finance Bank', () =>
      expect(result?.bankName).toBe('Equitas Small Finance Bank'));
  });

  describe('UPI payment via UPI (merchant as UPI Transaction)', () => {
    const message = 'INR 250.00 debited via UPI. Avl Bal is INR 750.00';
    const result = parser.parse(message, 'EQUTAS', 0);

    it('parses successfully', () => expect(result).not.toBeNull());
    it('amount is 250', () => expect(result?.amount).toBe(250));
    it('type is EXPENSE', () => expect(result?.type).toBe('EXPENSE'));
    it('merchant is UPI Transaction', () => expect(result?.merchant).toBe('UPI Transaction'));
  });

  describe('OTP message is rejected', () => {
    it('returns null', () => {
      expect(
        parser.parse('Your Equitas Bank OTP is 123456. Do not share.', 'AD-EQUITAS', 0),
      ).toBeNull();
    });
  });

  describe('Offer message is rejected', () => {
    it('returns null', () => {
      expect(
        parser.parse('Special offer for Equitas Bank customers! Get 10% cashback offer.', 'EQUTAS', 0),
      ).toBeNull();
    });
  });
});
