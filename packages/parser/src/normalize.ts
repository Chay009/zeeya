export function normalizeSms(body: string): string {
  return body.normalize('NFC').replace(/\s+/g, ' ').trim();
}

export function parseAmount(raw: string): number | null {
  const n = parseFloat(raw.replace(/,/g, '').trim());
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function cleanMerchant(raw: string): string {
  return raw
    .replace(/\s+/g, ' ')
    .replace(/\s*\(.*?\)\s*/g, '')
    .replace(/^[-\s*]+|[-\s*]+$/g, '')
    .trim();
}

export function extractLast4Digits(raw: string): string | null {
  const m = raw.match(/(\d{4})\D*$/);
  return m?.[1] ?? null;
}
