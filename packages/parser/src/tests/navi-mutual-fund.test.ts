import { describe, it, expect } from 'vitest';
import { NaviMutualFundParser } from '../banks/navi-mutual-fund.js';

const parser = new NaviMutualFundParser();

describe('NaviMutualFundParser', () => {
  describe('canHandle', () => {
    it('handles NAVIMF senders', () => {
      expect(parser.canHandle('NAVIMF')).toBe(true);
      expect(parser.canHandle('AD-NAVIMF')).toBe(true);
      expect(parser.canHandle('JK-NAVIMF')).toBe(true);
    });

    it('handles NAVIMU senders', () => {
      expect(parser.canHandle('NAVIMU')).toBe(true);
      expect(parser.canHandle('AD-NAVIMU')).toBe(true);
    });

    it('handles NAVIMUTUAL senders', () => {
      expect(parser.canHandle('NAVIMUTUAL')).toBe(true);
    });

    it('rejects unrelated senders', () => {
      expect(parser.canHandle('NAVI')).toBe(false);
      expect(parser.canHandle('HDFCMF')).toBe(false);
      expect(parser.canHandle('SBIMF')).toBe(false);
      expect(parser.canHandle('UNKNOWN')).toBe(false);
    });
  });

  describe('isTransactionMessage', () => {
    it('accepts SIP messages', () => {
      expect(
        parser.parse(
          'Your SIP of Rs.500.00 in Navi Nifty 50 Index Fund has been processed. Folio: 12345678. Date: 01-Jan-2025',
          'NAVIMF',
          0,
        ),
      ).not.toBeNull();
    });

    it('accepts investment messages', () => {
      expect(
        parser.parse(
          'Navi Mutual Fund: Rs.1,000.00 invested in Navi Large & Midcap Fund. Units allotted: 12.345. NAV: Rs.81.12',
          'NAVIMF',
          0,
        ),
      ).not.toBeNull();
    });

    it('accepts lumpsum investment messages', () => {
      expect(
        parser.parse(
          'Your lumpsum investment of INR 5000.00 in Navi ELSS Tax Saver Fund confirmed. Ref: NMF123456',
          'NAVIMF',
          0,
        ),
      ).not.toBeNull();
    });

    it('accepts redemption messages', () => {
      expect(
        parser.parse(
          'Redemption of Rs.2,500.00 from Navi Liquid Fund processed. Expected credit: 01-Jan-2025',
          'NAVIMF',
          0,
        ),
      ).not.toBeNull();
    });

    it('rejects OTP messages', () => {
      expect(
        parser.parse(
          'Your OTP for Navi Mutual Fund login is 123456. Do not share with anyone.',
          'NAVIMF',
          0,
        ),
      ).toBeNull();
    });
  });

  describe('SIP investment', () => {
    it('parses SIP with Folio reference', () => {
      const r = parser.parse(
        'Your SIP of Rs.500.00 in Navi Nifty 50 Index Fund has been processed. Folio: 12345678. Date: 01-Jan-2025',
        'NAVIMF',
        0,
      );
      expect(r).not.toBeNull();
      expect(r!.amount).toBe(500.0);
      expect(r!.type).toBe('INVESTMENT');
      expect(r!.merchant).toBe('Navi Nifty 50 Index Fund');
      expect(r!.reference).toBe('12345678');
      expect(r!.bankName).toBe('Navi Mutual Fund');
      expect(r!.currency).toBe('INR');
      expect(r!.balance).toBeNull();
      expect(r!.accountLast4).toBeNull();
    });
  });

  describe('lumpsum investment', () => {
    it('parses investment via "invested in" pattern', () => {
      const r = parser.parse(
        'Navi Mutual Fund: Rs.1,000.00 invested in Navi Large & Midcap Fund. Units allotted: 12.345. NAV: Rs.81.12',
        'NAVIMF',
        0,
      );
      expect(r).not.toBeNull();
      expect(r!.amount).toBe(1000.0);
      expect(r!.type).toBe('INVESTMENT');
      expect(r!.merchant).toBe('Navi Large & Midcap Fund');
      expect(r!.bankName).toBe('Navi Mutual Fund');
    });

    it('parses lumpsum investment with Ref', () => {
      const r = parser.parse(
        'Your lumpsum investment of INR 5000.00 in Navi ELSS Tax Saver Fund confirmed. Ref: NMF123456',
        'NAVIMF',
        0,
      );
      expect(r).not.toBeNull();
      expect(r!.amount).toBe(5000.0);
      expect(r!.type).toBe('INVESTMENT');
      expect(r!.merchant).toBe('Navi ELSS Tax Saver Fund');
      expect(r!.reference).toBe('NMF123456');
    });
  });

  describe('redemption', () => {
    it('parses redemption from fund', () => {
      const r = parser.parse(
        'Redemption of Rs.2,500.00 from Navi Liquid Fund processed. Expected credit: 01-Jan-2025',
        'NAVIMF',
        0,
      );
      expect(r).not.toBeNull();
      expect(r!.amount).toBe(2500.0);
      expect(r!.type).toBe('INCOME');
      expect(r!.merchant).toBe('Navi Liquid Fund');
      expect(r!.bankName).toBe('Navi Mutual Fund');
    });
  });

  describe('amount extraction', () => {
    it('handles comma-formatted amounts', () => {
      const r = parser.parse(
        'Your SIP of Rs.1,500.00 in Navi Nifty 50 Index Fund has been processed. Folio: 99999999.',
        'AD-NAVIMF',
        0,
      );
      expect(r).not.toBeNull();
      expect(r!.amount).toBe(1500.0);
    });

    it('handles INR prefix amounts', () => {
      const r = parser.parse(
        'Your SIP of INR 2000.00 in Navi Flexicap Fund has been processed. Ref: ABC123.',
        'NAVIMU',
        0,
      );
      expect(r).not.toBeNull();
      expect(r!.amount).toBe(2000.0);
    });
  });
});
