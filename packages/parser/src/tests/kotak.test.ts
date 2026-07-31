import { describe, it, expect } from 'vitest';
import { KotakBankParser } from '../banks/kotak.js';

const parser = new KotakBankParser();

describe('KotakBankParser', () => {
  it('returns correct bank name', () => {
    expect(parser.getBankName()).toBe('Kotak Bank');
  });

  it('returns INR currency', () => {
    expect(parser.getCurrency()).toBe('INR');
  });

  describe('canHandle', () => {
    it('handles Kotak senders', () => {
      expect(parser.canHandle('JD-KOTAKB-S')).toBe(true);
      expect(parser.canHandle('JD-KOTAKB-T')).toBe(true);
    });

    it('rejects non-Kotak senders', () => {
      expect(parser.canHandle('VM-KOTAKB')).toBe(false);
      expect(parser.canHandle('UNKNOWN')).toBe(false);
    });
  });

  it('parses Paytm QR code transaction', () => {
    const r = parser.parse(
      'Sent Rs.15.00 from Kotak Bank AC X1234 to paytmqr288005050101t74afkchmxjd@paytm on 14-10-25.UPI Ref 1234567890. Not you, https://kotak.com/KBANKT/Fraud',
      'JD-KOTAKB-S',
      0,
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(15);
    expect(r!.currency).toBe('INR');
    expect(r!.type).toBe('EXPENSE');
    expect(r!.merchant).toBe('Paytm');
    expect(r!.reference).toBe('1234567890');
    expect(r!.accountLast4).toBe('1234');
  });

  it('parses PhonePe QR code transaction', () => {
    const r = parser.parse(
      'Sent Rs.100.00 from Kotak Bank AC X5678 to phonepeqr123456789xyz@ybl on 15-10-25.UPI Ref 9876543210. Not you, https://kotak.com/KBANKT/Fraud',
      'JD-KOTAKB-S',
      0,
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(100);
    expect(r!.currency).toBe('INR');
    expect(r!.type).toBe('EXPENSE');
    expect(r!.merchant).toBe('PhonePe');
    expect(r!.reference).toBe('9876543210');
    expect(r!.accountLast4).toBe('5678');
  });

  it('parses person-to-person UPI with phone number', () => {
    const r = parser.parse(
      'Sent Rs.500.00 from Kotak Bank AC X9999 to 9876543210@paytm on 15-10-25.UPI Ref 1111111111. Not you, https://kotak.com/KBANKT/Fraud',
      'JD-KOTAKB-S',
      0,
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(500);
    expect(r!.currency).toBe('INR');
    expect(r!.type).toBe('EXPENSE');
    expect(r!.merchant).toBe('9876543210');
    expect(r!.reference).toBe('1111111111');
    expect(r!.accountLast4).toBe('9999');
  });

  it('parses UPI received transaction', () => {
    const r = parser.parse(
      'Received Rs.250.00 in your Kotak Bank AC X3333 from john.doe@oksbi on 14-10-25.UPI Ref 2222222222. Not you, https://kotak.com/KBANKT/Fraud',
      'JD-KOTAKB-S',
      0,
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(250);
    expect(r!.currency).toBe('INR');
    expect(r!.type).toBe('INCOME');
    expect(r!.merchant).toBe('john.doe');
    expect(r!.reference).toBe('2222222222');
    expect(r!.accountLast4).toBe('3333');
  });

  it('parses standard debit message', () => {
    const r = parser.parse(
      'Rs.1000.00 debited from your Kotak Bank AC X4444 on 15-10-25. Avl Bal Rs.10000.00',
      'JD-KOTAKB-S',
      0,
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(1000);
    expect(r!.currency).toBe('INR');
    expect(r!.type).toBe('EXPENSE');
    expect(r!.accountLast4).toBe('4444');
    expect(r!.balance).toBe(10000);
  });
});
