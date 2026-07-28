import type { BankParser } from './base-parser.js';
import type { ParseResult, SmsInput } from './types.js';
import type { ParsedTransaction } from './types.js';

import { HDFCBankParser } from './banks/hdfc.js';
import { ICICIBankParser } from './banks/icici.js';
import { SBIBankParser } from './banks/sbi.js';
import { AxisBankParser } from './banks/axis.js';
import { KotakBankParser } from './banks/kotak.js';
import { IndusIndBankParser } from './banks/indusind.js';
import { IDFCFirstBankParser } from './banks/idfc.js';
import { YesBankParser } from './banks/yes.js';
import { PNBBankParser } from './banks/pnb.js';
import { BankOfBarodaParser } from './banks/bob.js';
import { CanarabanParser } from './banks/canara.js';
import { UnionBankParser } from './banks/union.js';
import { GenericUPIParser } from './banks/upi-generic.js';

// Order matters: more specific parsers must precede broader ones.
const PARSERS: BankParser[] = [
  new HDFCBankParser(),
  new ICICIBankParser(),
  new SBIBankParser(),
  new AxisBankParser(),
  new KotakBankParser(),
  new IndusIndBankParser(),
  new IDFCFirstBankParser(),
  new YesBankParser(),
  new PNBBankParser(),
  new BankOfBarodaParser(),
  new CanarabanParser(),
  new UnionBankParser(),
  new GenericUPIParser(),
];

function getParser(sender: string): BankParser | null {
  for (const p of PARSERS) {
    if (p.canHandle(sender)) return p;
  }
  return null;
}

function scoreConfidence(tx: ParsedTransaction): number {
  let score = 0.7; // base: known bank + amount + type
  if (tx.merchant !== null) score += 0.1;
  if (tx.accountLast4 !== null) score += 0.1;
  if (tx.reference !== null) score += 0.05;
  if (tx.balance !== null) score += 0.05;
  return Math.min(score, 1.0);
}

export function parseSms(input: SmsInput): ParseResult | null {
  const parser = getParser(input.sender);
  if (!parser) return null;

  const tx = parser.parse(input);
  if (!tx) return null;

  return {
    ...tx,
    raw: input.body,
    sender: input.sender,
    timestamp: input.timestamp,
    confidence: scoreConfidence(tx),
  };
}

export function isKnownSender(sender: string): boolean {
  return getParser(sender) !== null;
}
