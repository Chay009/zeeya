import type { Token } from './types';
import type { CompiledLayer, GrammarEntry } from './grammar-compiler';

// Implements na3.bar.a() — token pair FSA matching
// For each adjacent pair of tokens (with optional skipped tokens between),
// tries 4 HashMap key variants in order:
//   1. raw1-raw2
//   2. type1-type2
//   3. type1-raw2
//   4. raw1-type2
// On match: validate skip count & required middle types, then merge into result type.

// Normalize token type for grammar matching: strip trailing digits so TRX2→TRX, INS3→INS, etc.
// This allows grammar rules written against base types to match all numbered variants.
function baseType(t: string): string {
  return t.replace(/\d+$/, '');
}

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

  // Try all combinations: raw, exact type, base type
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

        const sliceText = result.slice(i, j + 1);
        const merged: Token = {
          type: entry.resultType,
          raw: entry.resultType,
          text: sliceText.map(t => t.text).join(' '),
          values: {
            ...prev.values,
            ...next.values,
            ...entry.resultAttrs,
            _prevType: prev.type,
            _prevRaw: prev.raw,
            _nextType: next.type,
            _nextRaw: next.raw,
          },
          locked: false,
          matched: true,
          children: [prev, ...between, next] as Token[],
        };

        inheritLeafValues(merged, [prev, ...between, next] as Token[]);

        result.splice(i, j - i + 1, merged);
        changed = true;
        break;
      }
    }
  }

  return result;
}

// Bubble up numeric/string values from leaf tokens into merged token
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
  }
}

export function runGrammar(tokens: Token[], layers: CompiledLayer[]): Token[] {
  let current = tokens;
  for (const layer of layers) {
    current = runLayer(current, layer);
  }
  return current;
}
