import type { SeedData } from './types';

const P1 = /\{([^}]*)\}(.*)/;   // {N:types}restToken
const P2 = /(.*)<(.*)>(.*)/;    // token<multiplier>rest
const P3 = /(.*)\[(.*)\]/;      // token[tag,...]

export interface GrammarEntry {
  skipCount: number;
  types: string[] | null;
  resultType: string;
  resultAttrs: Record<string, string>;
  multiplier: number;
}

export interface CompiledLayer {
  // "prevType-nextType" → what this pair produces
  pairMap: Map<string, GrammarEntry>;
}

function parseResultKey(key: string): { type: string; attrs: Record<string, string>; multiplier: number } {
  let s = key;
  let multiplier = 1;
  const m2 = P2.exec(s);
  if (m2) { s = ((m2[1] ?? '') + (m2[3] ?? '')).trim(); multiplier = Number(m2[2]) || 1; }
  const m3 = P3.exec(s);
  const attrs: Record<string, string> = {};
  if (m3) {
    s = (m3[1] ?? '').trim();
    for (const attr of (m3[2] ?? '').split(',')) {
      const trimmed = attr.trim();
      if (!trimmed) continue;
      const eq = trimmed.indexOf('=');
      if (eq !== -1) {
        attrs[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
      } else {
        // positional tag like [trx] or [bal] — store as _tag
        attrs['_tag'] = trimmed;
      }
    }
  }
  return { type: s, attrs, multiplier };
}

export function compileLayer(grmrLayer: Record<string, string>): CompiledLayer {
  const pairMap = new Map<string, GrammarEntry>();

  for (const [resultKey, rulesStr] of Object.entries(grmrLayer)) {
    const { type: resultType, attrs, multiplier } = parseResultKey(resultKey);

    for (const rule of rulesStr.split(',')) {
      const parts = rule.trim().split(/\s+/).filter(Boolean);
      if (parts.length < 2) continue;

      let prev = '';
      let i = 0;

      while (i < parts.length) {
        const part = parts[i] ?? '';

        if (part.startsWith('{')) {
          const m = P1.exec(part);
          if (!m) { i++; continue; }
          const skipSpec = m[1] ?? '';
          const nextToken = m[2] ?? '';

          const colonIdx = skipSpec.indexOf(':');
          let skipCount = 0;
          let types: string[] | null = null;
          if (colonIdx !== -1) {
            skipCount = parseInt(skipSpec.slice(0, colonIdx), 10) || 0;
            const typeStr = skipSpec.slice(colonIdx + 1);
            types = typeStr ? typeStr.split(';').map(t => t.trim()).filter(Boolean) : null;
          } else {
            skipCount = parseInt(skipSpec, 10) || 0;
          }

          if (prev && nextToken) {
            const mapKey = `${prev}-${nextToken}`;
            if (!pairMap.has(mapKey)) {
              pairMap.set(mapKey, { skipCount, types, resultType, resultAttrs: attrs, multiplier });
            }
          }
          prev = nextToken;
          i++;
        } else if (part) {
          if (prev) {
            const mapKey = `${prev}-${part}`;
            if (!pairMap.has(mapKey)) {
              pairMap.set(mapKey, { skipCount: 0, types: null, resultType, resultAttrs: attrs, multiplier });
            }
          }
          prev = part;
          i++;
        }
      }
    }
  }

  return { pairMap };
}

export function compileSeed(seed: SeedData, category: string): CompiledLayer[] {
  const grammarEntry = seed.GRAMMAR[category];
  if (!grammarEntry) return [];
  return grammarEntry.GRMR.map(layer => compileLayer(layer));
}
