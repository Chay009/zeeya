import { describe, it, expect } from 'vitest';
import { CredParser } from '../banks/cred.js';

const parser = new CredParser();

describe('CredParser', () => {
  it('handles known senders', () => {
    expect(parser.canHandle('JK-CREDIN-S')).toBe(true);
    expect(parser.canHandle('AX-CREDIN-S')).toBe(true);
    expect(parser.canHandle('CREDIN')).toBe(true);
    expect(parser.canHandle('CRED')).toBe(true);
    expect(parser.canHandle('HDFCBK')).toBe(false);
    expect(parser.canHandle('VK-JTEDGE-S')).toBe(false);
  });

  it('parses CRED payment to ICICI credit card', () => {
    const r = parser.parse(
      'Payment of Rs.50000 has been successfully credited towards your ICICI Bank Credit Card. Your payment was settled in 3 seconds - CRED',
      'JK-CREDIN-S',
      0
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(50000);
    expect(r!.currency).toBe('INR');
    expect(r!.type).toBe('TRANSFER');
    expect(r!.merchant).toBe('ICICI Bank Credit Card');
    expect(r!.accountLast4).toBeNull();
    expect(r!.reference).toBeNull();
  });

  it('parses CRED payment with decimal amount', () => {
    const r = parser.parse(
      'Payment of Rs.1234.56 has been successfully credited towards your HDFC Credit Card. Your payment was settled in 3 seconds - CRED',
      'AX-CREDIN-S',
      0
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(1234.56);
    expect(r!.currency).toBe('INR');
    expect(r!.type).toBe('TRANSFER');
    expect(r!.merchant).toBe('HDFC Credit Card');
    expect(r!.accountLast4).toBeNull();
    expect(r!.reference).toBeNull();
  });

  it('parses CRED payment with comma-formatted amount', () => {
    const r = parser.parse(
      'Payment of Rs.50,000 has been successfully credited towards your ICICI Bank Credit Card. Your payment was settled in 3 seconds - CRED',
      'JK-CREDIN-S',
      0
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(50000);
    expect(r!.currency).toBe('INR');
    expect(r!.type).toBe('TRANSFER');
    expect(r!.merchant).toBe('ICICI Bank Credit Card');
    expect(r!.accountLast4).toBeNull();
    expect(r!.reference).toBeNull();
  });

  it('parses CRED sender CRED-S pattern', () => {
    const r = parser.parse(
      'Payment of Rs.10000 has been successfully credited towards your SBI Credit Card.',
      'AD-CRED-S',
      0
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(10000);
    expect(r!.currency).toBe('INR');
    expect(r!.type).toBe('TRANSFER');
    expect(r!.merchant).toBe('SBI Credit Card');
    expect(r!.accountLast4).toBeNull();
    expect(r!.reference).toBeNull();
  });

  it('parses CRED sender CRED-T pattern', () => {
    const r = parser.parse(
      'Payment of Rs.5000 has been successfully credited towards your HDFC Credit Card.',
      'AX-CRED-T',
      0
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(5000);
    expect(r!.currency).toBe('INR');
    expect(r!.type).toBe('TRANSFER');
    expect(r!.merchant).toBe('HDFC Credit Card');
    expect(r!.accountLast4).toBeNull();
    expect(r!.reference).toBeNull();
  });

  it('does not parse non-CRED message (OTP)', () => {
    const r = parser.parse(
      'Your OTP for transaction is 123456. Do not share.',
      'JK-CREDIN-S',
      0
    );
    expect(r).toBeNull();
  });

  it('does not parse failed CRED payment', () => {
    const r = parser.parse(
      'Payment of Rs.50000 could not be processed. Please try again later.',
      'JK-CREDIN-S',
      0
    );
    expect(r).toBeNull();
  });
});
