import { describe, it, expect } from 'vitest';
import { SaraswatBankParser } from '../banks/saraswat.js';

const parser = new SaraswatBankParser();

describe('SaraswatBankParser', () => {
  it('handles known senders', () => {
    expect(parser.canHandle('JD-SARBNK-S')).toBe(true);
    expect(parser.canHandle('AD-SARBNK-S')).toBe(true);
    expect(parser.canHandle('BV-SARBNK-S')).toBe(true);
    expect(parser.canHandle('SARBNK')).toBe(true);
    expect(parser.canHandle('SARASWAT')).toBe(true);
    expect(parser.canHandle('SARASWATBANK')).toBe(true);
    expect(parser.canHandle('XX-SARBNK-T')).toBe(true);
    expect(parser.canHandle('UNKNOWN')).toBe(false);
    expect(parser.canHandle('HDFC')).toBe(false);
    expect(parser.canHandle('SBI')).toBe(false);
  });

  it('parses ACH Credit transaction', () => {
    const r = parser.parse(
      'Your A/c no. 1234 is credited with INR 100.50 on 13-10-2025 towards ACH Credit:MERCHANT NAME. Current Bal is INR 950.00 CR  - Saraswat Bank',
      'JD-SARBNK-S',
      0
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(100.50);
    expect(r!.currency).toBe('INR');
    expect(r!.type).toBe('INCOME');
    expect(r!.accountLast4).toBe('1234');
    expect(r!.merchant).toBe('MERCHANT NAME');
    expect(r!.balance).toBe(950.00);
  });

  it('parses Standing Instruction debit', () => {
    const r = parser.parse(
      'Dear Customer, Your account no. ending with 5678 is debited with INR 1,000.00 on 25-09-2025  for S.I. Current Bal is INR 8,500.00CR. - Saraswat Bank',
      'JD-SARBNK-S',
      0
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(1000.00);
    expect(r!.currency).toBe('INR');
    expect(r!.type).toBe('EXPENSE');
    expect(r!.accountLast4).toBe('5678');
    expect(r!.merchant).toBe('Standing Instruction');
    expect(r!.balance).toBe(8500.00);
  });

  it('parses simple credit transaction (salary)', () => {
    const r = parser.parse(
      'Your A/c no. 9012 is credited with INR 500.00 on 01-11-2025 towards Salary. Current Bal is INR 15,000.00 CR - Saraswat Bank',
      'SARBNK',
      0
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(500.00);
    expect(r!.currency).toBe('INR');
    expect(r!.type).toBe('INCOME');
    expect(r!.accountLast4).toBe('9012');
    expect(r!.merchant).toBe('Salary');
    expect(r!.balance).toBe(15000.00);
  });

  it('parses large amount debit (NEFT)', () => {
    const r = parser.parse(
      'Dear Customer, Your account no. ending with 3456 is debited with INR 25,000.00 on 15-10-2025 for NEFT. Current Bal is INR 50,000.00CR. - Saraswat Bank',
      'AD-SARBNK-S',
      0
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(25000.00);
    expect(r!.currency).toBe('INR');
    expect(r!.type).toBe('EXPENSE');
    expect(r!.accountLast4).toBe('3456');
    expect(r!.merchant).toBe('NEFT Transfer');
    expect(r!.balance).toBe(50000.00);
  });

  it('parses small amount credit (cashback)', () => {
    const r = parser.parse(
      'Your A/c no. 7890 is credited with INR 10.00 on 20-10-2025 towards Cashback. Current Bal is INR 1,200.50 CR - Saraswat Bank',
      'SARASWAT',
      0
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(10.00);
    expect(r!.currency).toBe('INR');
    expect(r!.type).toBe('INCOME');
    expect(r!.accountLast4).toBe('7890');
    expect(r!.merchant).toBe('Cashback');
    expect(r!.balance).toBe(1200.50);
  });

  it('parses RTGS transfer debit', () => {
    const r = parser.parse(
      'Dear Customer, Your account no. ending with 2468 is debited with INR 50,000.00 on 22-10-2025 for RTGS. Current Bal is INR 100,000.00CR. - Saraswat Bank',
      'JD-SARBNK-S',
      0
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(50000.00);
    expect(r!.currency).toBe('INR');
    expect(r!.type).toBe('EXPENSE');
    expect(r!.accountLast4).toBe('2468');
    expect(r!.merchant).toBe('RTGS Transfer');
    expect(r!.balance).toBe(100000.00);
  });

  it('parses IMPS transfer debit', () => {
    const r = parser.parse(
      'Dear Customer, Your account no. ending with 1357 is debited with INR 2,500.00 on 23-10-2025 for IMPS. Current Bal is INR 12,345.67CR. - Saraswat Bank',
      'BV-SARBNK-S',
      0
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(2500.00);
    expect(r!.currency).toBe('INR');
    expect(r!.type).toBe('EXPENSE');
    expect(r!.accountLast4).toBe('1357');
    expect(r!.merchant).toBe('IMPS Transfer');
    expect(r!.balance).toBe(12345.67);
  });

  it('parses alternative sender format (refund credit)', () => {
    const r = parser.parse(
      'Your A/c no. 9753 is credited with INR 750.00 on 24-10-2025 towards Refund. Current Bal is INR 5,000.00 CR - Saraswat Bank',
      'SARASWATBANK',
      0
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(750.00);
    expect(r!.currency).toBe('INR');
    expect(r!.type).toBe('INCOME');
    expect(r!.accountLast4).toBe('9753');
    expect(r!.merchant).toBe('Refund');
    expect(r!.balance).toBe(5000.00);
  });

  // Mirror of factory test cases — tested directly via parser
  it('parses payment credit (factory test case 1)', () => {
    const r = parser.parse(
      'Your A/c no. 1234 is credited with INR 100.00 on 01-01-2025 towards Payment. Current Bal is INR 1,000.00 CR - Saraswat Bank',
      'JD-SARBNK-S',
      0
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(100.00);
    expect(r!.currency).toBe('INR');
    expect(r!.type).toBe('INCOME');
    expect(r!.accountLast4).toBe('1234');
    expect(r!.merchant).toBe('Payment');
    expect(r!.balance).toBe(1000.00);
  });

  it('parses SI debit (factory test case 2)', () => {
    const r = parser.parse(
      'Dear Customer, Your account no. ending with 5678 is debited with INR 500.00 on 02-01-2025 for SI. Current Bal is INR 2,000.00CR. - Saraswat Bank',
      'SARBNK',
      0
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(500.00);
    expect(r!.currency).toBe('INR');
    expect(r!.type).toBe('EXPENSE');
    expect(r!.accountLast4).toBe('5678');
    expect(r!.merchant).toBe('Standing Instruction');
    expect(r!.balance).toBe(2000.00);
  });
});
