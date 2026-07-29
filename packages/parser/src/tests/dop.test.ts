import { describe, it, expect } from 'vitest';
import { DOPBankParser } from '../banks/dop.js';

const parser = new DOPBankParser();

describe('DOPBankParser', () => {
  // canHandle checks
  it('canHandle VM-DOPBNK-G', () => expect(parser.canHandle('VM-DOPBNK-G')).toBe(true));
  it('canHandle BZ-DOPBNK-G', () => expect(parser.canHandle('BZ-DOPBNK-G')).toBe(true));
  it('canHandle BV-DOPBNK-S', () => expect(parser.canHandle('BV-DOPBNK-S')).toBe(true));
  it('canHandle BT-DOPBNK-G', () => expect(parser.canHandle('BT-DOPBNK-G')).toBe(true));
  it('canHandle BH-DOPBNK-G', () => expect(parser.canHandle('BH-DOPBNK-G')).toBe(true));
  it('canHandle VA-DOPBNK-G', () => expect(parser.canHandle('VA-DOPBNK-G')).toBe(true));
  it('canHandle BV-DOPBNK-G', () => expect(parser.canHandle('BV-DOPBNK-G')).toBe(true));
  it('does not handle UNKNOWN', () => expect(parser.canHandle('UNKNOWN')).toBe(false));

  // Credit message 1
  it('Credit message 1', () => {
    const result = parser.parse(
      'Account  No. XXXXXXXX1234 CREDIT with amount Rs. 5550.00 on 02-03-2026. Balance: Rs.40000.00. [S76543210]',
      'VM-DOPBNK-G',
      0,
    );
    expect(result).not.toBeNull();
    expect(result?.amount).toBe(5550.00);
    expect(result?.currency).toBe('INR');
    expect(result?.type).toBe('INCOME');
    expect(result?.accountLast4).toBe('1234');
    expect(result?.balance).toBe(40000.00);
    expect(result?.reference).toBe('S76543210');
  });

  // Credit message 2
  it('Credit message 2', () => {
    const result = parser.parse(
      'Account  No. XXXXXXXX1234 CREDIT with amount Rs. 5550.00 on 02-02-2026. Balance: Rs.37500.00. [S33475450]',
      'BZ-DOPBNK-G',
      0,
    );
    expect(result).not.toBeNull();
    expect(result?.amount).toBe(5550.00);
    expect(result?.currency).toBe('INR');
    expect(result?.type).toBe('INCOME');
    expect(result?.accountLast4).toBe('1234');
    expect(result?.balance).toBe(37500.00);
    expect(result?.reference).toBe('S33475450');
  });

  // Credit message 3
  it('Credit message 3', () => {
    const result = parser.parse(
      'Account  No. XXXXXXXX1234 CREDIT with amount Rs. 5550.00 on 02-01-2026. Balance: Rs.32000.00. [S92247102]',
      'BV-DOPBNK-S',
      0,
    );
    expect(result).not.toBeNull();
    expect(result?.amount).toBe(5550.00);
    expect(result?.currency).toBe('INR');
    expect(result?.type).toBe('INCOME');
    expect(result?.accountLast4).toBe('1234');
    expect(result?.balance).toBe(32000.00);
    expect(result?.reference).toBe('S92247102');
  });

  // Credit message 4
  it('Credit message 4', () => {
    const result = parser.parse(
      'Account  No. XXXXXXXX1234 CREDIT with amount Rs. 5550.00 on 02-12-2025. Balance: Rs.26000.00. [S52580401]',
      'BT-DOPBNK-G',
      0,
    );
    expect(result).not.toBeNull();
    expect(result?.amount).toBe(5550.00);
    expect(result?.currency).toBe('INR');
    expect(result?.type).toBe('INCOME');
    expect(result?.accountLast4).toBe('1234');
    expect(result?.balance).toBe(26000.00);
    expect(result?.reference).toBe('S52580401');
  });

  // Credit message 5
  it('Credit message 5', () => {
    const result = parser.parse(
      'Account  No. XXXXXXXX1234 CREDIT with amount Rs. 5550.00 on 01-11-2025. Balance: Rs.20900.00. [S13879515]',
      'BH-DOPBNK-G',
      0,
    );
    expect(result).not.toBeNull();
    expect(result?.amount).toBe(5550.00);
    expect(result?.currency).toBe('INR');
    expect(result?.type).toBe('INCOME');
    expect(result?.accountLast4).toBe('1234');
    expect(result?.balance).toBe(20900.00);
    expect(result?.reference).toBe('S13879515');
  });

  // Credit message 6
  it('Credit message 6', () => {
    const result = parser.parse(
      'Account  No. XXXXXXXX1234 CREDIT with amount Rs. 5550.00 on 01-10-2025. Balance: Rs.15500.00. [S72876106]',
      'VA-DOPBNK-G',
      0,
    );
    expect(result).not.toBeNull();
    expect(result?.amount).toBe(5550.00);
    expect(result?.currency).toBe('INR');
    expect(result?.type).toBe('INCOME');
    expect(result?.accountLast4).toBe('1234');
    expect(result?.balance).toBe(15500.00);
    expect(result?.reference).toBe('S72876106');
  });

  // Credit message 7
  it('Credit message 7', () => {
    const result = parser.parse(
      'Account  No. XXXXXXXX1234 CREDIT with amount Rs. 5550.00 on 02-09-2025. Balance: Rs.9990.00. [S34160488]',
      'BV-DOPBNK-G',
      0,
    );
    expect(result).not.toBeNull();
    expect(result?.amount).toBe(5550.00);
    expect(result?.currency).toBe('INR');
    expect(result?.type).toBe('INCOME');
    expect(result?.accountLast4).toBe('1234');
    expect(result?.balance).toBe(9990.00);
    expect(result?.reference).toBe('S34160488');
  });
});
