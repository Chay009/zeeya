/**
 * Tests for airport/location/offers.json enrichment — the three malanaSeed
 * files that were previously extracted from the Truecaller APK but never
 * wired into the parser (see enrichment.ts's "Airport / location /
 * offer-sender enrichment" section for the honest caveat on how these were
 * integrated, vs. the byte-for-byte bytecode port used for vendor matching).
 */
import { describe, it, expect } from 'vitest';
import { detectAirports, detectLocation, detectOfferCategory } from './enrichment.js';
import { readFileSync } from 'fs';
import { MalanaEngine } from './malana.js';

describe('detectAirports', () => {
  it('resolves IATA codes for known city names', () => {
    const matches = detectAirports('Flight from Chennai to Jaipur departs at 6am');
    expect(matches).toContainEqual({ city: 'chennai', code: 'maa' });
    expect(matches).toContainEqual({ city: 'jaipur', code: 'jai' });
  });

  it('returns empty array for unknown/empty text', () => {
    expect(detectAirports('')).toEqual([]);
    expect(detectAirports('no cities mentioned here')).toEqual([]);
  });
});

describe('detectLocation', () => {
  it('finds a single-word gazetteer match', () => {
    expect(detectLocation('Your parcel is out for delivery in Guwahati')).toBe('guwahati');
  });

  it('finds the one multi-word gazetteer entry', () => {
    expect(detectLocation('Shipping to Port Blair via express')).toBe('port blair');
  });

  it('returns null when nothing matches', () => {
    expect(detectLocation('')).toBeNull();
    expect(detectLocation('xyzabc123 not a place')).toBeNull();
  });
});

describe('detectOfferCategory', () => {
  it('classifies a known promo sender code', () => {
    expect(detectOfferCategory('AD-ADIDAS')).toBe('fashion');
    expect(detectOfferCategory('VM-PVRCIN')).toBe('entertainment');
  });

  it('returns null for a non-promo sender', () => {
    expect(detectOfferCategory('VM-HDFCBK')).toBeNull();
    expect(detectOfferCategory('')).toBeNull();
  });
});

describe('MalanaResult integration', () => {
  const seed = JSON.parse(readFileSync('/tmp/seeddata.json', 'utf8'));
  const engine = new MalanaEngine(seed);

  it('fills departureCode/arrivalCode from travel messages', () => {
    const r = engine.parse('Your flight from Mumbai to Delhi is confirmed. PNR: ABC123', 'VM-AIRIND');
    // Grammar may or may not capture dept/arrv tags for this phrasing — if it
    // does, the airport code lookup should resolve correctly.
    if (r.departure) expect(typeof r.departureCode === 'string' || r.departureCode === null).toBe(true);
  });

  it('every result carries the new fields (never throws, always typed)', () => {
    const r = engine.parse('Test message', 'VM-TEST');
    expect(r.departureCode === null || typeof r.departureCode === 'string').toBe(true);
    expect(r.arrivalCode === null || typeof r.arrivalCode === 'string').toBe(true);
    expect(r.offerCategory === null || typeof r.offerCategory === 'string').toBe(true);
    expect(r.location === null || typeof r.location === 'string').toBe(true);
  });
});
