import { BankParser } from '../base-parser.js';

const SENDERS = new Set(['CANBNK', 'CANARA', 'CANARASMS', 'CANBNKTS', 'CANBKTS']);
const DLT = /^[A-Z]{2}-CANB/;

export class CanarabanParser extends BankParser {
  getBankName() { return 'Canara Bank'; }

  canHandle(sender: string): boolean {
    const u = sender.toUpperCase();
    return SENDERS.has(u) || DLT.test(u);
  }
}
