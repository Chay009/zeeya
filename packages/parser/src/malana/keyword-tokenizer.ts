import type { Token } from "./types";

interface TrieNode {
  children: Map<string, TrieNode>;
  isEnd: boolean;
  tokenType: string;
  normalizedValue: string;
  // Static attrs from bracket like _tense=past → {tense:'past'}
  attrs: Record<string, string>;
  // Positional attr keys that should receive the normalized value at match time.
  // e.g. TRX[type,...] → positionalKeys=['type'] so values['type']='debit'/'credit'
  positionalKeys: string[];
}

// Strip trailing digits from token type to get the BASE TYPE, matching ga3.baz.l() behavior:
// ([^0-9]*)([0-9]+) extracts group(1) = base type (e.g. TRX2 → TRX, INS3 → INS)
function baseType(t: string): string {
  return t.replace(/\d+$/, "");
}

function parseTokenKey(key: string): {
  type: string;
  attrs: Record<string, string>;
  positionalKeys: string[];
  annotationKeys: string[];
} {
  const bracketIdx = key.indexOf("[");
  if (bracketIdx === -1)
    return { type: baseType(key), attrs: {}, positionalKeys: [], annotationKeys: [] };
  const rawType = key.slice(0, bracketIdx);
  const attrStr = key.slice(bracketIdx + 1, key.length - 1);
  const attrs: Record<string, string> = {};
  const positionalKeys: string[] = [];
  const annotationKeys: string[] = [];

  for (const rawPart of attrStr.split(",")) {
    const part = rawPart.trim();
    if (!part) continue;
    const eq = part.indexOf("=");
    annotationKeys.push((eq === -1 ? part : part.slice(0, eq)).replace(/^_/, "").trim());

    if (part.startsWith("_")) {
      // _key=value — strip leading underscore, store as named attr
      if (eq !== -1) attrs[part.slice(1, eq)] = part.slice(eq + 1);
    } else {
      if (eq !== -1) {
        // key=value — plain named attr (no underscore)
        attrs[part.slice(0, eq).trim()] = part.slice(eq + 1).trim();
      } else {
        // Bare key like "type" — positional: at match time set values[key] = normalizedValue.
        // Confirmed from ga3.baz.l() bytecode: these keys receive the pipe-right normalized value.
        positionalKeys.push(part);
      }
    }
  }

  return { type: baseType(rawType), attrs, positionalKeys, annotationKeys };
}

function parseDictionaryEntry(
  entry: string,
  positionalKeys: string[],
  annotationKeys: string[],
): { keyword: string; normalized: string; attrs: Record<string, string> } {
  let value = entry;
  let annotationValues: string[] | null = null;
  const annotation = value.match(/\[([^\]]*)\]$/);
  if (annotation?.index !== undefined) {
    value = value.slice(0, annotation.index);
    if (value.endsWith("|")) value = value.slice(0, -1);
    annotationValues = annotation[1]!.split(";");
  }

  const pipeIdx = value.indexOf("|");
  const keyword = pipeIdx === -1 ? value : value.slice(0, pipeIdx);
  let normalized = pipeIdx === -1 ? value : value.slice(pipeIdx + 1);
  const attrs: Record<string, string> = {};

  if (annotationValues) {
    for (let index = 0; index < annotationKeys.length; index++) {
      const annotationValue = annotationValues[index]?.trim();
      if (annotationValue) attrs[annotationKeys[index]!] = annotationValue;
    }
    const positionalValue = positionalKeys
      .map((key) => annotationValues![annotationKeys.indexOf(key)]?.trim())
      .find(Boolean);
    if (positionalValue) normalized = positionalValue;
  }

  return { keyword, normalized: normalized || keyword, attrs };
}

function newNode(): TrieNode {
  return {
    children: new Map(),
    isEnd: false,
    tokenType: "",
    normalizedValue: "",
    attrs: {},
    positionalKeys: [],
  };
}

function insertTrie(
  root: TrieNode,
  phrase: string,
  type: string,
  normalized: string,
  attrs: Record<string, string>,
  positionalKeys: string[],
) {
  let node = root;
  for (const ch of phrase) {
    if (!node.children.has(ch)) node.children.set(ch, newNode());
    node = node.children.get(ch)!;
  }
  node.isEnd = true;
  node.tokenType = type;
  node.normalizedValue = normalized || phrase;
  node.attrs = attrs;
  node.positionalKeys = positionalKeys;
}

export class KeywordTokenizer {
  private root: TrieNode = newNode();

  constructor(tokensDict: Record<string, string>) {
    for (const [rawKey, rawValues] of Object.entries(tokensDict)) {
      const { type, attrs, positionalKeys, annotationKeys } = parseTokenKey(rawKey);
      for (const entry of rawValues.split(",")) {
        const trimmed = entry.trim();
        if (!trimmed) continue;
        const parsed = parseDictionaryEntry(trimmed, positionalKeys, annotationKeys);
        const entryAttrs = { ...attrs, ...parsed.attrs };
        const { keyword, normalized } = parsed;
        if (keyword)
          insertTrie(
            this.root,
            keyword.toLowerCase(),
            type,
            normalized,
            entryAttrs,
            positionalKeys,
          );
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
      if (covered[i]) {
        i++;
        continue;
      }

      let node = this.root;
      let j = i;
      let lastMatch: { end: number; node: TrieNode } | null = null;

      while (j < len) {
        const ch = lower[j] ?? "";
        if (!node.children.has(ch)) break;
        node = node.children.get(ch)!;
        j++;
        if (node.isEnd) {
          // Only accept match at word boundary
          const nextOk = j >= len || /[\s,.:;!?()[\]{}"'/\\]/.test(lower[j] ?? "");
          const prevOk = i === 0 || /[\s,.:;!?()[\]{}"'/\\]/.test(lower[i - 1] ?? "");
          if (prevOk && nextOk) lastMatch = { end: j, node };
        }
      }

      if (lastMatch) {
        const rawText = message.slice(i, lastMatch.end);
        const norm = lastMatch.node.normalizedValue;

        // Build values: static attrs + positional keys filled with normalized value
        const values: Record<string, string> = { ...lastMatch.node.attrs };
        if (norm) values["_norm"] = norm;
        // Positional bracket attrs: TRX[type,...] → values['type'] = norm
        for (const pk of lastMatch.node.positionalKeys) {
          if (norm) values[pk] = norm;
        }

        tokens.push({
          type: lastMatch.node.tokenType,
          raw: norm || rawText,
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
