import { describe, it, expect } from 'vitest';
import { KeralaBankParser } from '../banks/kerala-bank.js';

const parser = new KeralaBankParser();

describe('KeralaBankParser', () => {
  it('returns correct bank name', () => {
    expect(parser.getBankName()).toBe('Kerala Bank');
  });

  it('returns INR currency', () => {
    expect(parser.getCurrency()).toBe('INR');
  });

  describe('canHandle', () => {
    it('handles senders containing KERALA', () => {
      expect(parser.canHandle('KERALABK')).toBe(true);
      expect(parser.canHandle('KERALA BANK')).toBe(true);
      expect(parser.canHandle('KERALABANK')).toBe(true);
      expect(parser.canHandle('kerala')).toBe(true);
    });

    it('rejects senders not containing KERALA', () => {
      expect(parser.canHandle('KRLBNK')).toBe(false);
      expect(parser.canHandle('KERBNK')).toBe(false);
      expect(parser.canHandle('HDFCBK')).toBe(false);
      expect(parser.canHandle('KGBANK')).toBe(false);
      expect(parser.canHandle('')).toBe(false);
    });
  });

  it('parses Kerala Bank debit transaction', () => {
    const r = parser.parse(
      'INR 750.00 debited from your Kerala Bank account. Avl Bal INR 9250.00',
      'KERALABK',
      0,
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(750);
    expect(r!.type).toBe('EXPENSE');
    expect(r!.currency).toBe('INR');
    expect(r!.bankName).toBe('Kerala Bank');
  });

  it('parses Kerala Bank credit transaction', () => {
    const r = parser.parse(
      'INR 2000.00 credited to your Kerala Bank account. Avl Bal INR 11250.00',
      'KERALABK',
      0,
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(2000);
    expect(r!.type).toBe('INCOME');
    expect(r!.currency).toBe('INR');
    expect(r!.bankName).toBe('Kerala Bank');
  });
});
