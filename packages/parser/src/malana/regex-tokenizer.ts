import type { Token } from './types';

// Patterns derived from qg1/bar.java Dalvik disassembly
const PATTERNS: Array<{ type: string; re: RegExp }> = [
  {
    type: 'DATETIME',
    re: /\b(?:(?:Sun|Mon|Tue|Wed|Thu|Fri|Sat)(?:urday|nesday|rsday|day)?[,\s]+)?(?:\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}|\d{1,2}[\s\-](?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*(?:[\s,\-]+\d{2,4})?)[,\s]+(?:[01]?\d|2[0-3]):[0-5]\d(?::[0-5]\d)?(?:\s?(?:AM|PM|HRS))?\b/gi,
  },
  {
    type: 'DATE',
    re: /\b(?:(?:Sun|Mon|Tue|Wed|Thu|Fri|Sat)(?:urday|nesday|rsday|day)?[,\s]+)?(?:\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}|\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2}|\d{1,2}[\s\-](?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*(?:[\s,\-]+\d{2,4})?)\b/gi,
  },
  {
    type: 'TIME',
    re: /\b(?:[01]?\d|2[0-3]):[0-5]\d(?::[0-5]\d)?(?:\s?(?:AM|PM|HRS))?\b/gi,
  },
  {
    type: 'AMT',
    re: /(?:[₤$€¥₹₩₽₮₱฿]|(?:\b(?:USD|EUR|GBP|JPY|INR|CNY|AUD|CAD|CHF|SEK|NZD|AED|SGD|HKD|MYR|THB|IDR|PHP|KRW|VND|RS|RE)\b))\.?\s*(\b\d{1,2}(?:,\d{2})*(?:,\d{3})*(?:[.,]\d+)?(?=\b|[a-zA-Z])|\b\d+(?:[.,]\d+)?)(?:\s*(?:[₤$€¥₹₩₽₮₱฿]|(?:\b(?:USD|EUR|GBP|JPY|INR|CNY|AUD|CAD|CHF|SEK|NZD|AED|SGD|HKD|MYR|THB|IDR|PHP|KRW|VND|RS|RE)\b)))?|\b\d{1,2}(?:,\d{2})*(?:,\d{3})+(?:[.,]\d+)?\b|\b\d+[.,]\d{2}\b(?!\s*%)/gi,
  },
  {
    type: 'PCT',
    re: /\b\d{1,3}(?:[.,]\d+)?%|\b\d{1,3}(?:[.,]\d+)?\s+(?:percent|p\.a\.)\b/gi,
  },
  {
    type: 'INSTRNO',
    re: /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b|\b\d{12,22}\b|\b[Xx*]{2,14}\d{3,10}\b|\b(?:[Xx*.\s-]{1,6}\d){1,4}\d{2,6}\b/g,
  },
  {
    type: 'USSD',
    re: /(?:\*\d+)+#/g,
  },
  {
    type: 'DATA',
    re: /\b\d+(?:\.\d+)?\s?(?:B|KB|MB|GB|TB|PB|Kbps|Mbps|Gbps)\b/gi,
  },
  {
    type: 'URL',
    re: /\b(?:(?:https?|ftp):\/\/|www\d?\.)[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}(?:\/[^\s]*)?\b/gi,
  },
  {
    type: 'NUM',
    re: /\b\d{1,2}(?:,\d{2})*(?:,\d{3})*(?:[.,]\d+)?\b/g,
  },
  {
    type: 'IDVAL',
    re: /\b(?:[A-Z0-9]+-[A-Z0-9]+|[A-Z]+\d+[A-Z\d]*|\d+[A-Z]+[A-Z\d]*)\b/g,
  },
];

export function regexTokenize(message: string): Token[] {
  const spans: Array<{ start: number; end: number; type: string; match: string }> = [];
  const covered = new Uint8Array(message.length);

  for (const { type, re } of PATTERNS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(message)) !== null) {
      const start = m.index;
      const end = start + m[0].length;
      let overlap = false;
      for (let i = start; i < end; i++) {
        if (covered[i]) { overlap = true; break; }
      }
      if (!overlap) {
        spans.push({ start, end, type, match: m[0] });
        for (let i = start; i < end; i++) covered[i] = 1;
      }
    }
  }

  spans.sort((a, b) => a.start - b.start);

  return spans.map(s => ({
    type: s.type,
    raw: s.match.trim(),
    text: s.match.trim(),
    values: {},
    locked: false,
    matched: false,
    children: [],
  }));
}
