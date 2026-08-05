import { describe, it, expect } from 'vitest';
import { BandhanBankParser } from '../banks/bandhan.js';

const parser = new BandhanBankParser();

describe('BandhanBankParser', () => {
  describe('canHandle', () => {
    it('handles BANDHAN', () => expect(parser.canHandle('BANDHAN')).toBe(true));
    it('handles AD-BANDHAN', () => expect(parser.canHandle('AD-BANDHAN')).toBe(true));
    it('handles AD-BDNSMS', () => expect(parser.canHandle('AD-BDNSMS')).toBe(true));
    it('handles AD-BDNSMS-S', () => expect(parser.canHandle('AD-BDNSMS-S')).toBe(true));
    it('handles JK-BANDHN', () => expect(parser.canHandle('JK-BANDHN')).toBe(true));
    it('handles AD-BANDHN-S', () => expect(parser.canHandle('AD-BANDHN-S')).toBe(true));
    it('handles lowercase bandhan', () => expect(parser.canHandle('bandhan')).toBe(true));
    it('rejects BANBNK', () => expect(parser.canHandle('BANBNK')).toBe(false));
    it('rejects BNDBNK', () => expect(parser.canHandle('BNDBNK')).toBe(false));
    it('rejects UNKNOWN', () => expect(parser.canHandle('UNKNOWN')).toBe(false));
    it('rejects HDFC', () => expect(parser.canHandle('HDFC')).toBe(false));
  });

  it('correctly identifies bank name', () => {
    expect(parser.getBankName()).toBe('Bandhan Bank');
  });

  describe('UPI credit with merchant from towards (deposited to A/c)', () => {
    const message =
      'INR 25,000.00 deposited to A/c XXXXXXXXXX1234 towards UPI/CR/C224513287910/JOHN DOE/u on 03-OCT-2025 . Clear Bal is INR 30,123.00 . Bandhan Bank.';
    const result = parser.parse(message, 'AD-BDNSMS', 0);

    it('parses successfully', () => expect(result).not.toBeNull());
    it('amount is 25000', () => expect(result?.amount).toBe(25000));
    it('type is INCOME', () => expect(result?.type).toBe('INCOME'));
    it('accountLast4 is 1234', () => expect(result?.accountLast4).toBe('1234'));
    it('balance is 30123', () => expect(result?.balance).toBe(30123));
    it('merchant is JOHN DOE', () => expect(result?.merchant).toBe('JOHN DOE'));
    it('reference is C224513287910', () => expect(result?.reference).toBe('C224513287910'));
    it('bankName is Bandhan Bank', () => expect(result?.bankName).toBe('Bandhan Bank'));
  });

  describe('Interest credit (towards interest)', () => {
    const message =
      'Dear Customer, your account XXXXXXXXXX1234 is credited with INR 3.00 on 01-OCT-2025 towards interest. Bandhan Bank';
    const result = parser.parse(message, 'BANDHAN', 0);

    it('parses successfully', () => expect(result).not.toBeNull());
    it('amount is 3', () => expect(result?.amount).toBe(3));
    it('type is INCOME', () => expect(result?.type).toBe('INCOME'));
    it('merchant is Interest', () => expect(result?.merchant).toBe('Interest'));
    it('bankName is Bandhan Bank', () => expect(result?.bankName).toBe('Bandhan Bank'));
  });

  describe('OTP message is rejected', () => {
    it('returns null', () => {
      expect(
        parser.parse('Your Bandhan Bank OTP is 123456. Valid for 10 minutes. Do not share.', 'BANDHAN', 0),
      ).toBeNull();
    });
  });

  describe('Password message is rejected', () => {
    it('returns null', () => {
      expect(
        parser.parse(
          'Your Bandhan Bank net banking password has been changed successfully.',
          'AD-BDNSMS',
          0,
        ),
      ).toBeNull();
    });
  });
});
