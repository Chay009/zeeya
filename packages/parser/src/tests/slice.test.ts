import { describe, it, expect } from 'vitest';
import { SliceParser } from '../banks/slice.js';

const parser = new SliceParser();

describe('SliceParser', () => {
  it('handles known senders', () => {
    expect(parser.canHandle('JK-SLICEIT')).toBe(true);
    expect(parser.canHandle('AD-SLICEIT')).toBe(true);
    expect(parser.canHandle('JD-SLCEIT-S')).toBe(true);
    expect(parser.canHandle('VM-SLICE')).toBe(true);
    expect(parser.canHandle('SLICEIT')).toBe(true);
    expect(parser.canHandle('SLICEPAY')).toBe(true);
    // Non-Slice senders
    expect(parser.canHandle('AD-HDFCBK')).toBe(false);
    expect(parser.canHandle('JK-ICICIB')).toBe(false);
    expect(parser.canHandle('AD-SBIBK')).toBe(false);
    expect(parser.canHandle('')).toBe(false);
  });

  // UPI "sent" transfers

  it('parses UPI sent to individual (CREDIT type)', () => {
    const r = parser.parse(
      'Rs.500.00 sent to JOHN DOE (UPI Ref: 412345678901) from your Slice account. Available balance: Rs.2500.00',
      'JK-SLICEIT',
      0
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(500.00);
    expect(r!.type).toBe('CREDIT');
    expect(r!.merchant).toBe('JOHN DOE');
    expect(r!.currency).toBe('INR');
  });

  it('parses UPI sent to merchant (CREDIT type)', () => {
    const r = parser.parse(
      'Rs.1200.00 sent to AMAZON SELLER (UPI Ref: 512345678901) from your Slice account.',
      'JK-SLICEIT',
      0
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(1200.00);
    expect(r!.type).toBe('CREDIT');
    expect(r!.merchant).toBe('AMAZON SELLER');
    expect(r!.currency).toBe('INR');
  });

  // Credited / INCOME transactions

  it('parses credited transaction as INCOME', () => {
    const r = parser.parse(
      'Rs.2000.00 credited to your Slice account on 15-08-2024. Ref: 612345678901.',
      'JK-SLICEIT',
      0
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(2000.00);
    expect(r!.type).toBe('INCOME');
    expect(r!.merchant).toBe('Slice Credit');
    expect(r!.currency).toBe('INR');
  });

  it('parses refund as INCOME', () => {
    const r = parser.parse(
      'Rs.499.00 refund credited to your Slice account for order #12345. Ref: 712345678901.',
      'JK-SLICEIT',
      0
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(499.00);
    expect(r!.type).toBe('INCOME');
    expect(r!.currency).toBe('INR');
  });

  it('parses cashback as INCOME', () => {
    const r = parser.parse(
      'Yay! Rs.50.00 cashback credited to your Slice account. Keep spending!',
      'AD-SLICEIT',
      0
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(50.00);
    expect(r!.type).toBe('INCOME');
    expect(r!.currency).toBe('INR');
  });

  it('parses received money as INCOME', () => {
    const r = parser.parse(
      'Rs.3000.00 received in your Slice account from JANE SMITH on 20-08-2024.',
      'JK-SLICEIT',
      0
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(3000.00);
    expect(r!.type).toBe('INCOME');
    expect(r!.currency).toBe('INR');
  });

  // Debited / spent / paid → CREDIT type (Slice is a credit card)

  it('parses debited transaction as CREDIT', () => {
    const r = parser.parse(
      'Rs.899.00 debited from your Slice card at SWIGGY on 10-09-2024. Available limit: Rs.9101.00.',
      'JK-SLICEIT',
      0
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(899.00);
    expect(r!.type).toBe('CREDIT');
    expect(r!.currency).toBe('INR');
  });

  it('parses spent transaction as CREDIT', () => {
    const r = parser.parse(
      'Rs.349.00 spent on your Slice card at NETFLIX. Avl Limit: Rs.14651.00. Ref: 812345678901.',
      'JK-SLICEIT',
      0
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(349.00);
    expect(r!.type).toBe('CREDIT');
    expect(r!.currency).toBe('INR');
  });

  it('parses paid transaction as CREDIT', () => {
    const r = parser.parse(
      'Rs.1500.00 paid to AMAZON from your Slice card on 22-08-2024. Ref: 912345678901.',
      'JK-SLICEIT',
      0
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(1500.00);
    expect(r!.type).toBe('CREDIT');
    expect(r!.currency).toBe('INR');
  });

  it('parses payment (without received) as CREDIT', () => {
    const r = parser.parse(
      'Your Slice card payment of Rs.200.00 has been debited. Ref: 1012345678901.',
      'AD-SLICEIT',
      0
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(200.00);
    expect(r!.type).toBe('CREDIT');
    expect(r!.currency).toBe('INR');
  });

  // Merchant extraction patterns

  it('extracts PayPal merchant from message containing paypal', () => {
    const r = parser.parse(
      'Rs.1999.00 debited for PayPal subscription on your Slice card. Ref: 1112345678901.',
      'JK-SLICEIT',
      0
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(1999.00);
    expect(r!.merchant).toBe('PayPal');
  });

  it('extracts merchant from "from MERCHANT on" pattern', () => {
    const r = parser.parse(
      'Rs.750.00 received from GOOGLE PAY on 18-09-2024. Ref: 1112345678901.',
      'JK-SLICEIT',
      0
    );
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(750.00);
    expect(r!.type).toBe('INCOME');
  });

  // Messages that should NOT parse

  it('does not parse OTP message', () => {
    const r = parser.parse(
      'Your OTP for Slice transaction is 123456. Do not share with anyone.',
      'JK-SLICEIT',
      0
    );
    expect(r).toBeNull();
  });

  it('does not parse payment request message', () => {
    const r = parser.parse(
      'Someone has requested Rs.500 from your Slice account. Approve or reject in the app.',
      'JK-SLICEIT',
      0
    );
    expect(r).toBeNull();
  });

  it('does not parse minimum amount due message', () => {
    const r = parser.parse(
      'Your minimum amount due on Slice card is Rs.500. Please pay by 05-10-2024 to avoid late fees.',
      'JK-SLICEIT',
      0
    );
    expect(r).toBeNull();
  });

  it('does not parse payment due message', () => {
    const r = parser.parse(
      'Your Slice card payment of Rs.2000 is due by 10-10-2024. Pay now to avoid interest.',
      'JK-SLICEIT',
      0
    );
    expect(r).toBeNull();
  });
});
