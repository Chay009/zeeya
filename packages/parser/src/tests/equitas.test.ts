import { describe, it, expect } from 'vitest';
import { EquitasBankParser } from '../banks/equitas.js';

const parser = new EquitasBankParser();

describe('EquitasBankParser', () => {
  it('handles known senders', () => {
    expect(parser.canHandle('EQBNK')).toBe(true);
    expect(parser.canHandle('AD-EQBNK')).toBe(true);
    expect(parser.canHandle('JK-EQBNK')).toBe(true);
    expect(parser.canHandle('EQUBNK')).toBe(true);
    expect(parser.canHandle('EQUITAS')).toBe(true);
    expect(parser.canHandle('AD-EQUITAS')).toBe(true);
    expect(parser.canHandle('HDFCBK')).toBe(false);
    expect(parser.canHandle('ICICIBK')).toBe(false);
  });

  it('returns correct bank name', () => {
    expect(parser.getBankName()).toBe('Equitas Small Finance Bank');
  });

  it('parses savings account debit', () => {
    const r = parser.parse(
      'Rs.500.00 debited from your Equitas Bank A/c XX1234 on 01-01-2025. Avl Bal Rs.1500.00',
      'AD-EQBNK',
      0
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(500.00);
    expect(r!.type).toBe('EXPENSE');
    expect(r!.accountLast4).toBe('1234');
    expect(r!.balance).toBe(1500.00);
    expect(r!.bankName).toBe('Equitas Small Finance Bank');
  });

  it('parses savings account credit', () => {
    const r = parser.parse(
      'Rs.1,000.00 credited to Equitas SFB A/c XX5678 on 15-Jan-2025. Balance: Rs.3,000.00',
      'JK-EQBNK',
      0
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(1000.00);
    expect(r!.type).toBe('INCOME');
    expect(r!.accountLast4).toBe('5678');
    expect(r!.balance).toBe(3000.00);
  });

  it('parses UPI debit with INR format and ref number', () => {
    const r = parser.parse(
      'Dear Customer, Your Equitas a/c ending 1234 debited by INR 250.00 via UPI. Ref: 123456789. Bal Rs.750.00',
      'EQUITAS',
      0
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(250.00);
    expect(r!.type).toBe('EXPENSE');
    expect(r!.accountLast4).toBe('1234');
    expect(r!.balance).toBe(750.00);
  });

  it('parses credit card spend with avl lmt', () => {
    const r = parser.parse(
      'Rs.500.00 spent on Equitas Bank Credit Card XX1234 at SWIGGY on 01 Jan 2025. Avl Lmt Rs.20,000',
      'AD-EQBNK',
      0
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(500.00);
    expect(r!.type).toBe('CREDIT');
    expect(r!.accountLast4).toBe('1234');
    expect(r!.creditLimit).toBe(20000.00);
  });

  it('parses txn format with avl cr lmt', () => {
    const r = parser.parse(
      'Txn of INR 1234.56 on Equitas CC ending 5678 at AMAZON. Avl Cr Lmt: Rs.15,000.00',
      'JK-EQUBNK',
      0
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(1234.56);
    expect(r!.type).toBe('CREDIT');
    expect(r!.accountLast4).toBe('5678');
    expect(r!.creditLimit).toBe(15000.00);
  });

  it('filters OTP messages', () => {
    expect(
      parser.parse('Your Equitas Bank OTP is 123456. Do not share.', 'AD-EQBNK', 0)
    ).toBeNull();
  });

  it('filters password messages', () => {
    expect(
      parser.parse('Your Equitas Bank password has been reset successfully.', 'AD-EQBNK', 0)
    ).toBeNull();
  });

  it('correctly identifies credit card transactions by avl cr lmt keyword', () => {
    const r = parser.parse(
      'INR 999.00 spent on Equitas Credit Card XX9999. Avl Cr Lmt: Rs.10,000.00',
      'EQUITAS',
      0
    );
    expect(r).not.toBeNull();
    expect(r!.type).toBe('CREDIT');
    expect(r!.creditLimit).toBe(10000.00);
  });

  it('handles comma-formatted amounts', () => {
    const r = parser.parse(
      'Rs.1,50,000.00 credited to Equitas Bank A/c XX9999 on 05-Jan-2025. Balance: Rs.2,00,000.00',
      'EQBNK',
      0
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(150000.00);
    expect(r!.type).toBe('INCOME');
    expect(r!.balance).toBe(200000.00);
  });
});
