/**
 * Tests for UPI mandate lifecycle tracking (mandateId, mandateEvent) — not
 * part of the ported Truecaller grammar (see regex-tokenizer.ts's MANDATEID
 * token and enrichment.ts's isMandateCancelled for the rationale). Only
 * "active"/"cancelled" are distinguished: the real seed TOKENS dictionary has
 * a genuine keyword class for cancellation (RESCHE, checked directly — it's
 * the same generic cancel/reschedule class the seed reuses elsewhere for
 * order/delivery cancellation) but none for creation vs. execution, so that
 * distinction isn't invented. Verifies against the real SBI/OpenAI mandate
 * create + cancel SMS this was built from.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { MalanaEngine } from './malana.js';

const seed = JSON.parse(readFileSync('/tmp/seeddata.json', 'utf8'));
const engine = new MalanaEngine(seed);

const CREATED =
  'Your UPI-Mandater for  Rs.1999.00   is successfully created towards OpenAI LLC for 1999.00 from A/c No.XXXXXX7521. UMN:c7969215595642979e8ed5da1152758e@axl -SBI';
const CANCELLED =
  'Your UPI-Mandate is successfully cancelled towards OpenAI LLC for 1999.00 from A/c No.XXXXXX7521. UMN:c7969215595642979e8ed5da1152758e@axl -SBI';

describe('UPI mandate lifecycle', () => {
  it('extracts the UMN as mandateId', () => {
    const r = engine.parse(CREATED, 'VA-SBIUPI-S');
    expect(r.mandateId).toBe('c7969215595642979e8ed5da1152758e@axl');
  });

  it('classifies a creation notice as "active"', () => {
    const r = engine.parse(CREATED, 'VA-SBIUPI-S');
    expect(r.mandateEvent).toBe('active');
  });

  it('classifies a cancellation notice as "cancelled"', () => {
    const r = engine.parse(CANCELLED, 'VA-SBIUPI-S');
    expect(r.mandateEvent).toBe('cancelled');
  });

  it('created and cancelled messages for the same mandate share the same mandateId', () => {
    const created = engine.parse(CREATED, 'VA-SBIUPI-S');
    const cancelled = engine.parse(CANCELLED, 'VA-SBIUPI-S');
    expect(created.mandateId).toBe(cancelled.mandateId);
  });

  it('a real VPA-shaped UPI handle is not mistaken for a mandate UMN', () => {
    const r = engine.parse('Rs.500 paid to merchant@okhdfc via UPI', 'VM-TESTBK');
    expect(r.mandateId).toBeNull();
  });

  it('a message with no mandate context has no mandateEvent', () => {
    const r = engine.parse('Rs.500.00 debited from A/c XX1234 on 20-Oct-25', 'VM-TESTBK');
    expect(r.mandateEvent).toBeNull();
  });

  // The generic #vendor PATTERN capture is unreliable on real mandate SMS —
  // verified directly: it captured the UMN itself on the creation notice, and
  // the stray word "cancelled" on the cancellation notice. mandateMerchant
  // exists specifically because of that, anchored on the real "towards X for
  // Y" shape both messages share instead of trusting the broken capture.
  it('extracts the real merchant name, not the broken #vendor capture', () => {
    const created = engine.parse(CREATED, 'VA-SBIUPI-S');
    const cancelled = engine.parse(CANCELLED, 'VA-SBIUPI-S');
    expect(created.mandateMerchant).toBe('OpenAI LLC');
    expect(cancelled.mandateMerchant).toBe('OpenAI LLC');
    expect(created.vendor).not.toBe('OpenAI LLC'); // documents why mandateMerchant exists
  });

  it('extracts the mandate amount from the "towards X for Y" shape', () => {
    const r = engine.parse(CREATED, 'VA-SBIUPI-S');
    expect(r.mandateAmount).toBe('1999.00');
  });

  it('does not extract a mandate merchant when there is no mandateId', () => {
    const r = engine.parse('Package delivered towards your address for verification', 'VM-TESTBK');
    expect(r.mandateMerchant).toBeNull();
  });
});
