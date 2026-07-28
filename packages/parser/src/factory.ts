// Exact 1:1 port of BankParserFactory.kt from Cashiro parser-core
import type { BankParser } from './base-parser.js';
import type { ParseResult, SmsInput } from './types.js';

import { HDFCMutualFundParser } from './banks/hdfc-mutual-fund.js';
import { HDFCBankParser } from './banks/hdfc.js';
import { SBIBankParser } from './banks/sbi.js';
import { ICICIBankParser } from './banks/icici.js';
import { AxisBankParser } from './banks/axis.js';
import { PNBBankParser } from './banks/pnb.js';
import { CanaraBankParser } from './banks/canara.js';
import { BankOfBarodaParser } from './banks/bob.js';
import { KotakBankParser } from './banks/kotak.js';
import { IDFCFirstBankParser } from './banks/idfc.js';
import { UnionBankParser } from './banks/union.js';
import { IndusIndBankParser } from './banks/indusind.js';
import { YesBankParser } from './banks/yes.js';
import { GenericUPIParser } from './banks/upi-generic.js';

// Order mirrors BankParserFactory.kt — HDFCMutualFundParser must precede HDFCBankParser
const PARSERS: BankParser[] = [
  new HDFCMutualFundParser(),
  new HDFCBankParser(),
  new SBIBankParser(),
  new ICICIBankParser(),
  new AxisBankParser(),
  new PNBBankParser(),
  new CanaraBankParser(),
  new BankOfBarodaParser(),
  new KotakBankParser(),
  new IDFCFirstBankParser(),
  new UnionBankParser(),
  new IndusIndBankParser(),
  new YesBankParser(),
  new GenericUPIParser(),
];

function getParser(sender: string): BankParser | null {
  for (const p of PARSERS) {
    if (p.canHandle(sender)) return p;
  }
  return null;
}

export function parseSms(input: SmsInput): ParseResult {
  const parser = getParser(input.sender);
  if (!parser) return null;
  return parser.parse(input.body, input.sender, input.timestamp);
}

export function isKnownSender(sender: string): boolean {
  return getParser(sender) !== null;
}

export function getParserByName(bankName: string): BankParser | null {
  return PARSERS.find(p => p.getBankName() === bankName) ?? null;
}

export function getAllParsers(): BankParser[] {
  return PARSERS;
}
