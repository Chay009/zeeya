import { describe, it, expect } from 'vitest';
import { CashfreeParser } from '../banks/cashfree.js';

const parser = new CashfreeParser();

describe('CashfreeParser', () => {
  it('returns correct bank name', () => {
    expect(parser.getBankName()).toBe('Cashfree');
  });

  it('returns INR currency', () => {
    expect(parser.getCurrency()).toBe('INR');
  });

  it('handles known senders', () => {
    expect(parser.canHandle('CASHFREE')).toBe(true);
    expect(parser.canHandle('CASHFREE-PAY')).toBe(true);
    expect(parser.canHandle('cashfree')).toBe(true);
    expect(parser.canHandle('HDFCBK')).toBe(false);
  });

  it('parses Cashfree debit transaction', () => {
    const r = parser.parse(
      'INR 999.00 debited from your account via Cashfree. Ref: CF123456',
      'CASHFREE',
      0,
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(999);
    expect(r!.type).toBe('EXPENSE');
    expect(r!.currency).toBe('INR');
    expect(r!.bankName).toBe('Cashfree');
  });

  it('parses Cashfree credit transaction', () => {
    const r = parser.parse(
      'INR 5000.00 credited to your account via Cashfree. Ref: CF789012',
      'CASHFREE',
      0,
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(5000);
    expect(r!.type).toBe('INCOME');
    expect(r!.currency).toBe('INR');
    expect(r!.bankName).toBe('Cashfree');
  });
});
