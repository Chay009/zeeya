import { describe, it, expect } from 'vitest';
import { CanaraBankParser } from '../banks/canara.js';

const parser = new CanaraBankParser();

describe('CanaraBankParser', () => {
  it('returns correct bank name', () => {
    expect(parser.getBankName()).toBe('Canara Bank');
  });

  it('returns INR currency', () => {
    expect(parser.getCurrency()).toBe('INR');
  });

  describe('canHandle', () => {
    it('handles Canara senders', () => {
      expect(parser.canHandle('CANBNK')).toBe(true);
      expect(parser.canHandle('CANARA')).toBe(true);
      expect(parser.canHandle('AD-CANBNK-S')).toBe(true);
      expect(parser.canHandle('VM-CANARA-S')).toBe(true);
    });

    it('rejects unrelated senders', () => {
      expect(parser.canHandle('HDFC')).toBe(false);
    });
  });

  it('parses UPI paid transaction with merchant', () => {
    const r = parser.parse(
      'Rs.1000.00 paid thru UPI to BMTC BUS, UPI Ref 123456789012. Total Avail.bal INR 9000.00',
      'CANBNK',
      0,
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(1000);
    expect(r!.currency).toBe('INR');
    expect(r!.type).toBe('EXPENSE');
    expect(r!.merchant).toBe('BMTC BUS');
    expect(r!.reference).toBe('123456789012');
    expect(r!.balance).toBe(9000);
  });

  it('parses DEBITED message with generic merchant', () => {
    const r = parser.parse(
      'INR 500.00 has been DEBITED from A/C XX1234. Total Avail.bal INR 4500.00',
      'CANARA',
      0,
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(500);
    expect(r!.currency).toBe('INR');
    expect(r!.type).toBe('EXPENSE');
    expect(r!.merchant).toBe('Canara Bank Debit');
    expect(r!.accountLast4).toBe('1234');
    expect(r!.balance).toBe(4500);
  });

  it('parses CREDITED message', () => {
    const r = parser.parse(
      'INR 2000.00 has been CREDITED. Total Avail.bal INR 12000.00',
      'CANBNK',
      0,
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(2000);
    expect(r!.currency).toBe('INR');
    expect(r!.type).toBe('INCOME');
    expect(r!.balance).toBe(12000);
  });

  it('should not parse failed transaction message', () => {
    expect(
      parser.parse(
        'Transaction failed due to insufficient funds. Please try again.',
        'CANBNK',
        0,
      ),
    ).toBeNull();
  });
});
