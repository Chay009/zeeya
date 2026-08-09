import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { MalanaEngine } from './malana.js';

const seedPath = '/tmp/seeddata.json';
const seed = JSON.parse(readFileSync(seedPath, 'utf8'));
const engine = new MalanaEngine(seed);

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
});
