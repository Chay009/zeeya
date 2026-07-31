import { describe, it, expect } from 'vitest';
import { AxisBankParser } from '../banks/axis.js';

const parser = new AxisBankParser();

describe('AxisBankParser', () => {
  it('returns correct bank name', () => {
    expect(parser.getBankName()).toBe('Axis Bank');
  });

  it('returns INR currency', () => {
    expect(parser.getCurrency()).toBe('INR');
  });

  describe('canHandle', () => {
    it('handles Axis senders', () => {
      expect(parser.canHandle('AX-AXISBK-S')).toBe(true);
      expect(parser.canHandle('JD-AXISBK-S')).toBe(true);
      expect(parser.canHandle('CP-AXISBK-S')).toBe(true);
      expect(parser.canHandle('JX-AXISBK-S')).toBe(true);
      expect(parser.canHandle('AX-AXISBANK-S')).toBe(true);
      expect(parser.canHandle('AX-AXIS-S')).toBe(true);
      expect(parser.canHandle('AXISBK')).toBe(true);
      expect(parser.canHandle('AXISBANK')).toBe(true);
      expect(parser.canHandle('AXIS')).toBe(true);
    });

    it('rejects unrelated senders', () => {
      expect(parser.canHandle('HDFC')).toBe(false);
      expect(parser.canHandle('SBI')).toBe(false);
      expect(parser.canHandle('')).toBe(false);
    });
  });

  it('parses credit card spent - Swiggy', () => {
    const msg = `Spent INR 131\nAxis Bank Card no. XX0818\n05-10-25 09:43:27 IST\nSwiggy Limi\nAvl Limit: INR 217162.72\nNot you? SMS BLOCK 0818 to 919951860002`;
    const r = parser.parse(msg, 'AX-AXISBK-S', 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(131);
    expect(r!.currency).toBe('INR');
    expect(r!.type).toBe('CREDIT');
    expect(r!.merchant).toBe('Swiggy');
    expect(r!.accountLast4).toBe('0818');
    expect(r!.isFromCard).toBe(true);
    expect(r!.creditLimit).toBe(217162.72);
  });

  it('parses credit card spent - Amazon Pay', () => {
    const msg = `Spent INR 1299.00\nAxis Bank Card no. XX5678\n12-10-25 14:30:15 IST\nAmazon Pay\nAvl Limit: INR 50000.00\nNot you? SMS BLOCK 5678 to 919951860002`;
    const r = parser.parse(msg, 'AX-AXISBK-S', 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(1299);
    expect(r!.currency).toBe('INR');
    expect(r!.type).toBe('CREDIT');
    expect(r!.merchant).toBe('Amazon');
    expect(r!.accountLast4).toBe('5678');
    expect(r!.isFromCard).toBe(true);
    expect(r!.creditLimit).toBe(50000);
  });

  it('parses credit card spent - Avenue Supermarts format 2', () => {
    const msg = `Spent\nCard no. XX7441\nINR 562\n01-09-25 12:04:18\nAVENUE SUPE\nAvl Lmt INR 5120.87\nSMS BLOCK 7441 to 919951860002, if not you - Axis Bank`;
    const r = parser.parse(msg, 'CP-AXISBK-S', 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(562);
    expect(r!.currency).toBe('INR');
    expect(r!.type).toBe('CREDIT');
    expect(r!.merchant).toBe('AVENUE');
    expect(r!.accountLast4).toBe('7441');
    expect(r!.isFromCard).toBe(true);
    expect(r!.creditLimit).toBe(5120.87);
  });

  it('parses credit card spent - Blinkit format 1 with IST', () => {
    const msg = `Spent INR 174\nAxis Bank Card no. XX7441\n13-09-25 21:35:56 IST\nBlinkit\nAvl Limit: INR 6652.78\nNot you? SMS BLOCK 7441 to 919951860002`;
    const r = parser.parse(msg, 'JX-AXISBK-S', 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(174);
    expect(r!.currency).toBe('INR');
    expect(r!.type).toBe('CREDIT');
    expect(r!.merchant).toBe('Blinkit');
    expect(r!.accountLast4).toBe('7441');
    expect(r!.isFromCard).toBe(true);
    expect(r!.creditLimit).toBe(6652.78);
  });

  it('parses credit card spent - Blinkit format 2 without IST', () => {
    const msg = `Spent\nCard no. XX7441\nINR 207\n01-09-25 14:10:35\nBlinkit\nAvl Lmt INR 4632.87\nSMS BLOCK 7441 to 919951860002, if not you - Axis Bank`;
    const r = parser.parse(msg, 'AX-AXISBK-S', 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(207);
    expect(r!.currency).toBe('INR');
    expect(r!.type).toBe('CREDIT');
    expect(r!.merchant).toBe('Blinkit');
    expect(r!.accountLast4).toBe('7441');
    expect(r!.isFromCard).toBe(true);
    expect(r!.creditLimit).toBe(4632.87);
  });

  it('parses credit card spent - BPCL petrol', () => {
    const msg = `Spent INR 500\nAxis Bank Card no. XX6018\n22-09-25 09:03:41 IST\nBPCL ARUNAA\nAvl Limit: INR 17131.47\nNot you? SMS BLOCK 6018 to 919951860002`;
    const r = parser.parse(msg, 'CP-AXISBK-S', 0);
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(500);
    expect(r!.currency).toBe('INR');
    expect(r!.type).toBe('CREDIT');
    expect(r!.merchant).toBe('BPCL ARUNAA');
    expect(r!.accountLast4).toBe('6018');
    expect(r!.isFromCard).toBe(true);
    expect(r!.creditLimit).toBe(17131.47);
  });

  it('parses ATM withdrawal', () => {
    const r = parser.parse(
      'INR 2000.00 debited from A/c no. XX589034 on AXIS BANK L 04-11-2025 16:06:39 IST. Avl bal: INR 98919.81. Not you? SMS BLOCKCARD XX0192 to +919951860002 - Axis Bank',
      'JD-AXISBK-S',
      0,
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(2000);
    expect(r!.currency).toBe('INR');
    expect(r!.type).toBe('EXPENSE');
    expect(r!.merchant).toBe('ATM');
    expect(r!.accountLast4).toBe('9034');
    expect(r!.balance).toBe(98919.81);
  });

  it('parses debit card - BURGRILL', () => {
    const r = parser.parse(
      'INR 209.00 debited from A/c no. XXxxxxy on BURGRILL 04-12-2025 13:13:27 IST. Avl bal: INR xxxxxxx. Not you? SMS BLOCKCARD XX0023 to +919951860002 - Axis Bank',
      'JD-AXISBK-S',
      0,
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(209);
    expect(r!.currency).toBe('INR');
    expect(r!.type).toBe('EXPENSE');
    expect(r!.merchant).toBe('BURGRILL');
    expect(r!.accountLast4).toBe('xxxy');
  });

  it('parses debit card - numeric account pattern', () => {
    const r = parser.parse(
      'INR 500.00 debited from A/c no. XX312225 on MERCHANT ABC 02-12-2025 20:38:23 IST. Avl bal: INR 10000.00. Not you? SMS BLOCKCARD XX0023 to +919951860002 - Axis Bank',
      'JD-AXISBK-S',
      0,
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(500);
    expect(r!.currency).toBe('INR');
    expect(r!.type).toBe('EXPENSE');
    expect(r!.merchant).toBe('MERCHANT ABC');
    expect(r!.accountLast4).toBe('2225');
    expect(r!.balance).toBe(10000);
  });
});
