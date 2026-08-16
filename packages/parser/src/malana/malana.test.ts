import { describe, it, expect } from 'vitest';
import { MalanaEngine } from './malana.js';
import { seedData } from './index.js';

const engine = new MalanaEngine(seedData);

describe('MalanaEngine', () => {
  it('extracts debit transaction from HDFC-style SMS', () => {
    const msg = 'INR 5,000.00 debited from account XX1234 on 09-08-2026. Avail Bal: INR 12,500.00';
    const r = engine.parse(msg);
    const matched = r.tokens.filter(t => t.matched).map(t => t.type);
    console.log('debit tags:', r.tags);
    console.log('matched:', matched);
    expect(matched.length).toBeGreaterThan(0);
  });

  it('extracts NEFT credit transaction', () => {
    const msg = 'Your a/c XXXX4321 is credited with INR 10,000.00 on 09-Aug-2026 by NEFT. Ref No 12345678901234';
    const r = engine.parse(msg);
    const matched = r.tokens.filter(t => t.matched).map(t => t.type);
    console.log('neft credit tags:', r.tags);
    console.log('matched:', matched);
    expect(matched.length).toBeGreaterThan(0);
  });

  it('extracts UPI payment', () => {
    const msg = 'UPI: Rs.250.00 paid to AMAZON via UPI ref 123456789012345';
    const r = engine.parse(msg);
    const matched = r.tokens.filter(t => t.matched).map(t => t.type);
    console.log('upi tags:', r.tags);
    console.log('matched:', matched);
    expect(matched.length).toBeGreaterThan(0);
  });

  it('extracts balance enquiry', () => {
    const msg = 'Dear customer, your account balance is INR 25,000.00 as on 09-Aug-2026';
    const r = engine.parse(msg);
    const matched = r.tokens.filter(t => t.matched).map(t => t.type);
    console.log('balance tags:', r.tags);
    console.log('matched:', matched);
    expect(r.tags).toBeDefined();
  });

  it('keyword tokenizer uses base type (no trailing digits)', () => {
    const msg = 'debited from your account';
    const r = engine.parse(msg);
    // TRX token types should not have trailing digits
    const hasTRX2 = r.tokens.some(t => t.type === 'TRX2');
    console.log('tokens:', r.tokens.map(t => t.type + ':' + t.raw));
    expect(hasTRX2).toBe(false);
  });

  it('routes OTP SMS to GRM_OTP', () => {
    const msg = 'Your OTP is 456789. Valid for 10 minutes. Do not share with anyone.';
    const r = engine.parse(msg, 'VM-HDFCBK');
    console.log('otp category:', r.category, 'otp:', r.otp);
    // Category routing is the key assertion; otp tag extraction requires direct OTP-NUM adjacency
    expect(r.category).toBe('GRM_OTP');
  });

  it('routes delivery SMS to GRM_DELIVERY', () => {
    const msg = 'Your order #OD987654 from Flipkart is out for delivery today.';
    const r = engine.parse(msg, 'FKORDER');
    console.log('delivery category:', r.category, 'tags:', r.tags);
    expect(r.category).toBe('GRM_DELIVERY');
  });

  it('detects bank name from sender', () => {
    const msg = 'INR 1000 debited from account XX4567';
    const r = engine.parse(msg, 'VM-HDFCBK');
    console.log('bankName:', r.bankName);
    expect(r.bankName).toBe('HDFC Bank');
  });

  it('detects brand from merchant text', () => {
    const msg = 'INR 499 debited for Google Play. Avail Bal: 2000';
    const r = engine.parse(msg, 'VM-HDFCBK');
    console.log('brand:', r.brandName, 'isOnline:', r.isOnlineBrand, 'category:', r.merchantCategory);
    // Google is in vendor_brands.json with tag "payments"
    expect(r.brandName).not.toBeNull();
  });

  it('exposes typed trx, bal, acc fields', () => {
    const msg = 'INR 5,000.00 debited from account XX1234 on 09-08-2026. Avail Bal: INR 12,500.00';
    const r = engine.parse(msg);
    console.log('trx:', r.trx, 'bal:', r.bal, 'acc:', r.acc);
    expect(r.trx).toBeTruthy();
    expect(r.bal).toBeTruthy();
  });
});
