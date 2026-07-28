import { BankParser } from '../base-parser.js';

// Bank of Baroda + Bank of India (both BOB/BOI prefixes appear)
const SENDERS = new Set(['BARBKM', 'BARB', 'BOBIMT', 'BOIBKM', 'BOBSMS', 'BOISBI', 'BOBBNK']);
const DLT = /^[A-Z]{2}-(?:BARB|BOIB)/;

export class BankOfBarodaParser extends BankParser {
  getBankName() { return 'Bank of Baroda'; }

  canHandle(sender: string): boolean {
    const u = sender.toUpperCase();
    return SENDERS.has(u) || DLT.test(u);
  }
}
