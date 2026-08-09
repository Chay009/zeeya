import type { Token } from './types';
import type { CompiledLayer, GrammarEntry } from './grammar-compiler';

// Implements na3.bar.a() — token pair FSA matching
// For each adjacent pair of tokens (with optional skipped tokens between),
// tries key variants combining raw value, exact type, and base type for each position.
// On match: validate skip count & required middle types, then merge into result type.

// Normalize token type for grammar matching: strip trailing digits so TRX2→TRX, INS3→INS.
// Confirmed from ga3.baz.l() Dalvik bytecode: ([^0-9]*)([0-9]+) extracts group(1)=base type.
// Both keyword-tokenizer and grammar-runner use the same strip to ensure consistent matching.
function baseType(t: string): string {
  return t.replace(/\d+$/, '');
}

// Payment method token types that override generic "debit" when merging attributes.
// Confirmed from na3.bar.b() bytecode: special-cased values when raw == "neft"|"imps"|"upi"|"rtgs"|"aeps"
const PAYMENT_METHODS = new Set(['neft', 'imps', 'upi', 'rtgs', 'aeps']);

function findMatch(
  layer: CompiledLayer,
  prev: Token,
  next: Token,
  between: Token[],
): GrammarEntry | null {
  const pt = prev.type;
  const nt = next.type;
  const pb = baseType(pt);
  const nb = baseType(nt);

  // Try all combinations: raw, exact type, base type (de-duped)
  const prevVariants = [...new Set([prev.raw, pt, pb])];
  const nextVariants = [...new Set([next.raw, nt, nb])];

  const keys: string[] = [];
  for (const pv of prevVariants) {
    for (const nv of nextVariants) {
      keys.push(`${pv}-${nv}`);
    }
  }

  for (const key of keys) {
    const entry = layer.pairMap.get(key);
    if (!entry) continue;
    if (between.length > entry.skipCount) continue;
    if (entry.types && between.length > 0) {
      const allOk = between.every(t =>
        entry.types!.some(rt => t.type === rt || t.raw === rt),
      );
      if (!allOk) continue;
    }
    return entry;
  }
  return null;
}

// Implements na3.bar.b() — merge xa3.d attribute maps from child tokens into parent.
// Special handling confirmed from bytecode:
//   - "type" attribute: if child has PAYMENT_METHOD value AND parent already has "debit",
//     the more-specific payment method type wins.
//   - "loc" attribute: fan out to both "from_loc" and "to_loc" on parent.
//   - "airport" attribute: fan out to both "from_airport" and "to_airport" on parent.
//   - "time" attribute: fan out to both "from_time" and "to_time" on parent.
//   - all other attributes: child value wins only if parent doesn't already have that key.
function mergeChildAttrs(parent: Token, children: Token[]) {
  for (const child of children) {
    for (const [k, v] of Object.entries(child.values)) {
      if (k === '_norm') {
        // _norm carries normalized direction for TRANS1/TRANS2/TRANS3 and SEND tokens
        // that lack a [type,...] positional bracket — propagate as type when absent
        if (!parent.values['type'] && (v === 'debit' || v === 'credit')) {
          parent.values['type'] = v;
        }
        continue;
      }
      if (k.startsWith('_')) continue; // other internal metadata, don't propagate

      if (k === 'type') {
        const existing = parent.values['type'];
        // If child carries a specific payment method and parent only has generic "debit", upgrade
        if (PAYMENT_METHODS.has(v) && (!existing || existing === 'debit')) {
          parent.values['type'] = v;
        } else if (!existing) {
          parent.values['type'] = v;
        }
        continue;
      }

      if (k === 'loc') {
        if (!parent.values['from_loc']) parent.values['from_loc'] = v;
        if (!parent.values['to_loc']) parent.values['to_loc'] = v;
        continue;
      }

      if (k === 'airport') {
        if (!parent.values['from_airport']) parent.values['from_airport'] = v;
        if (!parent.values['to_airport']) parent.values['to_airport'] = v;
        continue;
      }

      if (k === 'time') {
        if (!parent.values['from_time']) parent.values['from_time'] = v;
        if (!parent.values['to_time']) parent.values['to_time'] = v;
        continue;
      }

      if (!parent.values[k]) parent.values[k] = v;
    }

    // SEND token carries implicit debit direction (grammar rule SEND+AMT → INTENT)
    if (child.type === 'SEND' && !parent.values['type']) {
      parent.values['type'] = 'debit';
    }

    // Recurse into child's own children (na3.bar.b() processes entire child subtree)
    if (child.children.length > 0) {
      mergeChildAttrs(parent, child.children);
    }
  }
}

export function runLayer(tokens: Token[], layer: CompiledLayer): Token[] {
  if (tokens.length < 2) return tokens;

  const result: Token[] = [...tokens];
  let changed = true;

  while (changed) {
    changed = false;

    for (let i = 0; i < result.length - 1; i++) {
      const prev = result[i]!;
      if (prev.locked) continue;

      for (let j = i + 1; j < result.length; j++) {
        const next = result[j]!;
        if (next.locked) continue;

        const between = result.slice(i + 1, j);
        if (between.length > 9) break;

        const entry = findMatch(layer, prev, next, between);
        if (!entry) continue;

        const childTokens = [prev, ...between, next] as Token[];
        const sliceText = result.slice(i, j + 1);

        const merged: Token = {
          type: entry.resultType,
          raw: entry.resultType,
          text: sliceText.map(t => t.text).join(' '),
          values: {
            ...entry.resultAttrs,
            _prevType: prev.type,
            _prevRaw: prev.raw,
            _nextType: next.type,
            _nextRaw: next.raw,
          },
          locked: false,
          matched: true,
          children: childTokens,
        };

        // First: pull up leaf-level typed values (amounts, dates, etc.)
        inheritLeafValues(merged, childTokens);

        // Then: apply na3.bar.b() attribute inheritance from child token value maps
        mergeChildAttrs(merged, childTokens);

        result.splice(i, j - i + 1, merged);
        changed = true;
        break;
      }
    }
  }

  return result;
}

// Pull up structured values from typed leaf tokens (AMT, DATE, INSTRNO, IDVAL).
// These appear as first-class extraction targets in the Malana result.
function inheritLeafValues(merged: Token, sources: Token[]) {
  for (const src of sources) {
    if (src.type === 'AMT' || src.type === 'NUM') {
      if (!merged.values['amount']) merged.values['amount'] = src.raw;
    }
    if (src.type === 'INSTRNO') {
      if (!merged.values['instrno']) merged.values['instrno'] = src.raw;
    }
    if (src.type === 'IDVAL') {
      if (!merged.values['idval']) merged.values['idval'] = src.raw;
    }
    if (src.type === 'DATE' || src.type === 'DATETIME') {
      if (!merged.values['date']) merged.values['date'] = src.raw;
    }
    // Recurse into children that may hold typed leaves
    if (src.children.length > 0) {
      inheritLeafValues(merged, src.children);
    }
  }
}

export function runGrammar(tokens: Token[], layers: CompiledLayer[]): Token[] {
  let current = tokens;
  for (const layer of layers) {
    current = runLayer(current, layer);
  }
  return current;
}
