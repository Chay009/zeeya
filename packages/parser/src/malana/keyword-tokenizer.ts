import type { Token } from './types';

interface TrieNode {
  children: Map<string, TrieNode>;
  isEnd: boolean;
  tokenType: string;
  normalizedValue: string;
  attrs: Record<string, string>;
}

// Strip trailing digits from token type to get the BASE TYPE, matching ga3.baz.l() behavior:
// ([^0-9]*)([0-9]+) extracts group(1) = base type (e.g. TRX2 → TRX, INS3 → INS)
function baseType(t: string): string {
  return t.replace(/\d+$/, '');
}

function parseTokenKey(key: string): { type: string; attrs: Record<string, string> } {
  const bracketIdx = key.indexOf('[');
  if (bracketIdx === -1) return { type: baseType(key), attrs: {} };
  const rawType = key.slice(0, bracketIdx);
  const attrStr = key.slice(bracketIdx + 1, key.length - 1);
  const attrs: Record<string, string> = {};
  for (const part of attrStr.split(',')) {
    if (part.startsWith('_')) {
      const eq = part.indexOf('=');
      if (eq !== -1) attrs[part.slice(1, eq)] = part.slice(eq + 1);
    } else if (part.trim()) {
      // Non-underscore attribute: store as _type or plain attribute
      const eq = part.indexOf('=');
      if (eq !== -1) attrs[part.slice(0, eq).trim()] = part.slice(eq + 1).trim();
    }
  }
  return { type: baseType(rawType), attrs };
}

function newNode(): TrieNode {
  return { children: new Map(), isEnd: false, tokenType: '', normalizedValue: '', attrs: {} };
}

function insertTrie(root: TrieNode, phrase: string, type: string, normalized: string, attrs: Record<string, string>) {
  let node = root;
  for (const ch of phrase) {
    if (!node.children.has(ch)) node.children.set(ch, newNode());
    node = node.children.get(ch)!;
  }
  node.isEnd = true;
  node.tokenType = type;
  node.normalizedValue = normalized || phrase;
  node.attrs = attrs;
}

export class KeywordTokenizer {
  private root: TrieNode = newNode();

  constructor(tokensDict: Record<string, string>) {
    for (const [rawKey, rawValues] of Object.entries(tokensDict)) {
      const { type, attrs } = parseTokenKey(rawKey);
      for (const entry of rawValues.split(',')) {
        const trimmed = entry.trim();
        if (!trimmed) continue;
        const pipeIdx = trimmed.indexOf('|');
        const keyword = pipeIdx !== -1 ? trimmed.slice(0, pipeIdx) : trimmed;
        const normalized = pipeIdx !== -1 ? trimmed.slice(pipeIdx + 1) : trimmed;
        if (keyword) insertTrie(this.root, keyword.toLowerCase(), type, normalized, attrs);
      }
    }
  }

  tokenize(message: string): Token[] {
    const lower = message.toLowerCase();
    const len = lower.length;
    const tokens: Token[] = [];
    const covered = new Uint8Array(len);
    let i = 0;

    while (i < len) {
      if (covered[i]) { i++; continue; }

      let node = this.root;
      let j = i;
      let lastMatch: { end: number; node: TrieNode } | null = null;

      while (j < len) {
        const ch = lower[j] ?? '';
        if (!node.children.has(ch)) break;
        node = node.children.get(ch)!;
        j++;
        if (node.isEnd) {
          // Only accept match at word boundary
          const nextOk = j >= len || /[\s,.:;!?()[\]{}"'\/\\]/.test(lower[j] ?? '');
          const prevOk = i === 0 || /[\s,.:;!?()[\]{}"'\/\\]/.test(lower[i - 1] ?? '');
          if (prevOk && nextOk) lastMatch = { end: j, node };
        }
      }

      if (lastMatch) {
        const rawText = message.slice(i, lastMatch.end);
        const values: Record<string, string> = { ...lastMatch.node.attrs };
        if (lastMatch.node.normalizedValue) values['_norm'] = lastMatch.node.normalizedValue;
        tokens.push({
          type: lastMatch.node.tokenType,
          raw: lastMatch.node.normalizedValue || rawText,
          text: rawText,
          values,
          locked: false,
          matched: false,
          children: [],
        });
        for (let k = i; k < lastMatch.end; k++) covered[k] = 1;
        i = lastMatch.end;
      } else {
        i++;
      }
    }

    return tokens;
  }
}
