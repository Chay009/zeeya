export function normalizeSms(body: string): string {
  return body.normalize("NFC").replace(/\s+/g, " ").trim();
}

// A plain decimal, a Western-grouped one (groups of 3: "5,000.00"), or an
// Indian-grouped one (lakh/crore: "1,00,000.00", "12,34,567"). Real bank SMS
// use both. Anything else ("1,,2.00", "1,23.00") is malformed — stripping
// the commas would invent a different amount.
const PLAIN_DECIMAL_RE = /^-?\d+(\.\d+)?$/;
const WESTERN_GROUPED_RE = /^-?\d{1,3}(,\d{3})*(\.\d+)?$/;
const INDIAN_GROUPED_RE = /^-?\d{1,2}(,\d{2})*,\d{3}(\.\d+)?$/;

/** Plain decimal string, or throws when the grouping or the digits are not a decimal. */
export function ungroupDecimal(raw: string): string {
  const trimmed = raw.trim();
  const hasGrouping = trimmed.includes(",");
  if (hasGrouping && !WESTERN_GROUPED_RE.test(trimmed) && !INDIAN_GROUPED_RE.test(trimmed)) {
    throw new Error(`Malformed digit grouping: ${JSON.stringify(raw)}`);
  }

  const normalized = trimmed.replace(/,/g, "");
  if (!PLAIN_DECIMAL_RE.test(normalized)) {
    throw new Error(`Not a decimal amount: ${JSON.stringify(raw)}`);
  }
  return normalized;
}

function decimalStringToNumber(normalized: string): number | null {
  const negative = normalized.startsWith("-");
  const unsigned = negative ? normalized.slice(1) : normalized;
  const [integerPart, fractionalPart = ""] = unsigned.split(".");
  if (fractionalPart.length > 9) return null;

  const digits = `${integerPart}${fractionalPart}`.replace(/^0+(?=\d)/, "") || "0";
  let scaled: bigint;
  try {
    scaled = BigInt(digits);
  } catch {
    return null;
  }
  if (negative) scaled = -scaled;
  if (scaled > BigInt(Number.MAX_SAFE_INTEGER) || scaled < BigInt(Number.MIN_SAFE_INTEGER)) {
    return null;
  }
  if (fractionalPart.length === 0) return Number(scaled);

  const value = Number(scaled) / 10 ** fractionalPart.length;
  return Number.isFinite(value) ? value : null;
}

/**
 * Major-unit amount, or null when the text is empty or not a well-formed
 * decimal. Grouping is validated before any numeric conversion, so a broken
 * comma pattern cannot be read as a different amount.
 */
export function parseDecimalAmount(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  let normalized: string;
  try {
    normalized = ungroupDecimal(trimmed);
  } catch {
    return null;
  }
  return decimalStringToNumber(normalized);
}

/** Positive amount only. Zero, negatives, and unreadable text are null. */
export function parseAmount(raw: string): number | null {
  const value = parseDecimalAmount(raw);
  return value !== null && value > 0 ? value : null;
}

export function cleanMerchant(raw: string): string {
  return raw
    .replace(/\s+/g, " ")
    .replace(/\s*\(.*?\)\s*/g, "")
    .replace(/^[-\s*]+|[-\s*]+$/g, "")
    .trim();
}

export function extractLast4Digits(raw: string): string | null {
  const match = raw.match(/(\d{4})\D*$/);
  return match?.[1] ?? null;
}
