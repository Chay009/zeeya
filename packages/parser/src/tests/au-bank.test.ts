import { describe, it, expect } from 'vitest';
import { AUBankParser } from '../banks/au-bank.js';

const parser = new AUBankParser();

describe('AUBankParser', () => {
  it('handles known senders', () => {
    expect(parser.canHandle('AD-AUSFIN')).toBe(true);
    expect(parser.canHandle('JK-AUBANK')).toBe(true);
    expect(parser.canHandle('AUBNK')).toBe(true);
    expect(parser.canHandle('HDFCBK')).toBe(false);
  });

  it('returns correct bank name', () => {
    expect(parser.getBankName()).toBe('AU Small Finance Bank');
  });

  it('parses savings account debit', () => {
    const r = parser.parse(
      'Rs.500.00 debited from your AU Bank A/c XX1234 on 01-01-2025. Avl Bal Rs.1500.00',
      'AD-AUSFIN',
      0
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(500.00);
    expect(r!.type).toBe('EXPENSE');
    expect(r!.accountLast4).toBe('1234');
    expect(r!.balance).toBe(1500.00);
    expect(r!.bankName).toBe('AU Small Finance Bank');
  });

  it('parses savings account credit', () => {
    const r = parser.parse(
      'Rs.1,000.00 credited to AU Bank A/c XX5678 on 15-Jan-2025. Balance Rs.3,000.00',
      'JK-AUSFIN',
      0
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(1000.00);
    expect(r!.type).toBe('INCOME');
    expect(r!.accountLast4).toBe('5678');
    expect(r!.balance).toBe(3000.00);
  });

  it('parses credit card spend', () => {
    const r = parser.parse(
      'Rs.500.00 spent on AU Bank Credit Card XX1234 at SWIGGY on 01 Jan 2025. Avl Lmt Rs.50,000',
      'AD-AUSFIN',
      0
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(500.00);
    expect(r!.type).toBe('CREDIT');
    expect(r!.accountLast4).toBe('1234');
    expect(r!.creditLimit).toBe(50000.00);
  });

  it('parses txn format with available limit', () => {
    const r = parser.parse(
      'Txn of INR 1234.56 on AU Bank CC ending 5678 at AMAZON. Avl Cr Lmt: Rs.45,000.00',
      'JK-AUBNK',
      0
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(1234.56);
    expect(r!.type).toBe('CREDIT');
    expect(r!.accountLast4).toBe('5678');
    expect(r!.creditLimit).toBe(45000.00);
  });

  it('filters OTP messages', () => {
    expect(parser.parse('Your AU Bank OTP is 123456. Do not share.', 'AD-AUSFIN', 0)).toBeNull();
  });
});
