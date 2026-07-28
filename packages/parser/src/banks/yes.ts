import { BankParser } from '../base-parser.js';

const SENDERS = new Set(['YESBK', 'YESBNK', 'YESB', 'YESBKTS', 'YESBANK']);
const DLT = /^[A-Z]{2}-YES/;

export class YesBankParser extends BankParser {
  getBankName() { return 'Yes Bank'; }

  canHandle(sender: string): boolean {
    const u = sender.toUpperCase();
    return SENDERS.has(u) || DLT.test(u);
  }
}
