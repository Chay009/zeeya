/**
 * Regression test for a false-positive "bal" (account balance) tag.
 *
 * grammar-compiler.ts compiles multi-token chain rules (e.g. BAL[bal]'s
 * "AMT AUX BLNC" — amount, then a word like "is", then the literal word
 * balance) into independent adjacent-pair transitions. Each pair is checked
 * separately, so the FIRST pair alone ("AMT-AUX") was enough to satisfy the
 * whole rule, even with no actual balance-related word ("BLNC"/"AVBL"/"BAL"/
 * etc.) anywhere in the message. A real UPI-mandate-creation SMS containing
 * "Rs.1999.00 is successfully created..." was misread as a balance
 * statement purely because of the amount-then-"is" shape.
 *
 * Fixed in malana.ts via isBalanceIndicatorPair() — the "bal" tag is only
 * trusted when the actual matched pair touches one of BAL[bal]'s own
 * balance-indicating token types, not just any amount+auxiliary-verb pair.
 */
import { describe, it, expect } from 'vitest';
import { MalanaEngine, deriveBalanceIndicatorTypes } from './malana.js';
import { seedData } from './index.js';

const engine = new MalanaEngine(seedData);

describe('bal false positive — amount+auxiliary-verb is not a balance statement', () => {
  it('UPI mandate creation notice: amount is the mandate value, not a balance', () => {
    const r = engine.parse(
      'Your UPI-Mandater for  Rs.1999.00   is successfully created towards OpenAI LLC for 1999.00 from A/c No.XXXXXX7521. UMN:c7969215595642979e8ed5da1152758e@axl -SBI',
      'VA-SBIUPI-S',
    );
    expect(r.bal).toBeNull();
  });

  it('still recognizes a real balance statement', () => {
    const r = engine.parse(
      'Your A/c XX1234 has been debited with Rs.500.00. Available Balance: Rs.4500.00',
      'VM-TESTBK',
    );
    expect(r.bal).not.toBeNull();
  });
});

// The original fix hand-typed the balance-indicator set from reading BAL[bal]'s
// rule text once — a plausible source of drift if the seed grammar changes, and
// it turned out to already be incomplete (missed GRM_BANK's separate
// INSUFFBAL[bal] rule, contributing "insufficient"). deriveBalanceIndicatorTypes
// parses every [bal]-tagged rule in the real seed instead of hand-listing them.
describe('deriveBalanceIndicatorTypes', () => {
  const derived = deriveBalanceIndicatorTypes(seedData);

  it('includes every real semantic balance word from the seed', () => {
    for (const type of ['BLNC', 'AVBL', 'BAL', 'CURR', 'TOTAL', 'CLRNC', 'INSUFF']) {
      expect(derived.has(type)).toBe(true);
    }
  });

  it('excludes generic leaf-value and grammatical function-word types', () => {
    for (const type of ['AMT', 'NUM', 'AUX']) {
      expect(derived.has(type)).toBe(false);
    }
  });
});
