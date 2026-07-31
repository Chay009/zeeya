import { describe, it, expect } from 'vitest';
import { PNBBankParser } from '../banks/pnb.js';

const parser = new PNBBankParser();

describe('PNBBankParser', () => {
  it('returns correct bank name', () => {
    expect(parser.getBankName()).toBe('Punjab National Bank');
  });

  it('returns INR currency', () => {
    expect(parser.getCurrency()).toBe('INR');
  });

  describe('canHandle', () => {
    it('handles PNB senders', () => {
      expect(parser.canHandle('VM-PNBSMS-S')).toBe(true);
      expect(parser.canHandle('VA-PNBSMS-S')).toBe(true);
      expect(parser.canHandle('VK-PNBSMS-S')).toBe(true);
      expect(parser.canHandle('AX-PNBSMS-S')).toBe(true);
      expect(parser.canHandle('PNBBNK')).toBe(true);
    });

    it('rejects unrelated senders', () => {
      expect(parser.canHandle('UNKNOWN')).toBe(false);
    });
  });

  it('parses debit message with XX1234', () => {
    const r = parser.parse(
      'Ac XX1234 Debited with Rs.5000.00, 20-02-2026 07:47:16. Aval Bal Rs.27000.00 CR. Helpline 18001800/18002021-PNB',
      'VM-PNBSMS-S',
      0,
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(5000);
    expect(r!.currency).toBe('INR');
    expect(r!.type).toBe('EXPENSE');
    expect(r!.accountLast4).toBe('1234');
    expect(r!.balance).toBe(27000);
  });

  it('parses debit message with card info', () => {
    const r = parser.parse(
      'A/c XX1234 debited with Rs.5000.00,21-11-2025 13:23:22 thru card XX9239  . Out of 5 free txn on PNB ATM, you utilized 1 txn. Chrgs applicable as per policy. Bal 27000.00 CR. If not done, fwd SMS to 9264192641 to block card/call 18001800/18002021-PNB',
      'VM-PNBSMS-S',
      0,
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(5000);
    expect(r!.currency).toBe('INR');
    expect(r!.type).toBe('EXPENSE');
    expect(r!.accountLast4).toBe('1234');
    expect(r!.balance).toBe(27000);
    expect(r!.merchant).toBe('Card XX9239');
  });

  it('parses debit message with VA sender', () => {
    const r = parser.parse(
      'Ac XX1234 Debited with Rs.5000.00, 16-02-2026 10:04:09. Aval Bal Rs.27000.00 CR. Helpline 18001800/18002021-PNB',
      'VA-PNBSMS-S',
      0,
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(5000);
    expect(r!.currency).toBe('INR');
    expect(r!.type).toBe('EXPENSE');
    expect(r!.accountLast4).toBe('1234');
    expect(r!.balance).toBe(27000);
  });

  it('parses debit message with long account number', () => {
    const r = parser.parse(
      'Ac XXXXXXXX00341234 Debited with Rs.10000.00, 20-06-2025 08:18:35. Aval Bal Rs.27000.00 CR. Helpline 18001800/18002021-PNB',
      'VK-PNBSMS-S',
      0,
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(10000);
    expect(r!.currency).toBe('INR');
    expect(r!.type).toBe('EXPENSE');
    expect(r!.accountLast4).toBe('1234');
    expect(r!.balance).toBe(27000);
  });

  it('parses auto-pay activation message', () => {
    const r = parser.parse(
      'Dear Customer, auto pay facility has been successfully activated on your Punjab National Bank Card XX4356 for Rs. 75000.00, from Google Clouds. An initial amount of Rs. 2.00 has been debited from your account. Google Clouds can initiate subsequent transactions for a max amount upto Rs. 75000.00. You will receive notification with the transaction amount prior to any subsequent debits initiated by Google Clouds. Manage / cancel your Auto-Pay facility with ID RTy243262532g via https://www.sihub.in/man',
      'VM-PNBSMS-S',
      0,
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(2);
    expect(r!.currency).toBe('INR');
    expect(r!.type).toBe('EXPENSE');
    expect(r!.accountLast4).toBe('4356');
    expect(r!.merchant).toBe('Google Clouds');
  });

  it('parses UPI-Mandate creation message', () => {
    const r = parser.parse(
      'Your UPI-Mandate is successfully created towards Google for Rs.1500.00 from A/c No.XXXXXX4356. UMN:1d478c77808c410281f435rer5qwerty6@ybl-PNB',
      'AX-PNBSMS-S',
      0,
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(1500);
    expect(r!.currency).toBe('INR');
    expect(r!.type).toBe('EXPENSE');
    expect(r!.accountLast4).toBe('4356');
    expect(r!.merchant).toBe('Google');
  });
});
