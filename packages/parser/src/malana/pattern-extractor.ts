// PATTERN and STRUCT extraction from seeddata.json grammar definitions.
// Patterns use a mini-language to locate and capture named spans from the token stream.
//
// PATTERN syntax elements:
//   TOKEN_TYPE          – match a token of this type
//   TOKEN|(literal)     – match token type OR literal normalized value
//   (literal)           – match literal normalized value only
//   #name               – capture free text (text of tokens until next anchor)
//   {N}                 – skip up to N tokens
//   {N}|TOKEN           – skip up to N tokens, stop if TOKEN is found
//
// STRUCT syntax: same as PATTERN but describes structural templates with named slots.

import type { Token } from "./types";

// Patterns that should never be captured as a merchant/vendor name
const DATE_RE = /^\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}$/;
const PURE_NUM_RE = /^\d+$/;
const URL_RE = /^https?:\/\//i;

type MatchEl =
  | { kind: "tok"; type: string; literal?: string }
  | { kind: "capture"; name: string }
  | { kind: "skip"; max: number; stopType?: string };

function parsePatternString(pat: string): MatchEl[] {
  const els: MatchEl[] = [];
  const parts = pat.trim().split(/\s+/).filter(Boolean);

  for (const part of parts) {
    if (part.startsWith("#")) {
      els.push({ kind: "capture", name: part.slice(1) });
      continue;
    }

    if (part.startsWith("{")) {
      const close = part.indexOf("}");
      const inner = part.slice(1, close === -1 ? undefined : close);
      const after = close !== -1 ? part.slice(close + 1) : "";
      const max = parseInt(inner, 10) || 0;
      const stopType = after.startsWith("|") ? after.slice(1) : undefined;
      els.push({ kind: "skip", max, stopType });
      continue;
    }

    // TOKEN|(literal) or TOKEN or (literal)
    const pipeIdx = part.indexOf("|(");
    if (pipeIdx !== -1) {
      const type = part.slice(0, pipeIdx);
      const literal = part.slice(pipeIdx + 2, part.endsWith(")") ? part.length - 1 : part.length);
      // literal may have commas: "(to,for)" — multiple alternatives
      els.push({ kind: "tok", type, literal });
    } else if (part.startsWith("(") && part.endsWith(")")) {
      const literal = part.slice(1, -1);
      els.push({ kind: "tok", type: "", literal });
    } else {
      els.push({ kind: "tok", type: part });
    }
  }

  return els;
}

function tokenMatchesEl(tok: Token, el: MatchEl & { kind: "tok" }): boolean {
  const typeMatch = el.type && tok.type === el.type;
  if (!el.literal) return !!typeMatch;

  // literal may be comma-separated alternatives: "to,for"
  const norm = (tok.values["_norm"] ?? "").toLowerCase();
  const raw = tok.text.toLowerCase();
  const lits = el.literal
    .toLowerCase()
    .split(",")
    .map((s) => s.trim());
  const litMatch = lits.some((l) => norm === l || raw === l);

  return !!typeMatch || litMatch;
}

function tryMatchAt(els: MatchEl[], tokens: Token[], start: number): Record<string, string> | null {
  const captures: Record<string, string> = {};
  let pos = start;

  for (let ei = 0; ei < els.length; ei++) {
    const el = els[ei];
    if (!el) continue;

    if (el.kind === "tok") {
      // Must match exactly at pos
      const tok = tokens[pos];
      if (!tok) return null;
      if (!tokenMatchesEl(tok, el)) return null;
      pos++;
    } else if (el.kind === "skip") {
      let skipped = 0;
      while (pos < tokens.length && skipped < el.max) {
        const tok = tokens[pos];
        if (!tok) break;
        if (el.stopType && tok.type === el.stopType) break;
        pos++;
        skipped++;
      }
    } else {
      // capture — collect text until the next anchor element
      const nextAnchor = els
        .slice(ei + 1)
        .find((e) => e.kind === "tok" || (e.kind === "skip" && (e.stopType ?? "") !== ""));
      const parts: string[] = [];

      while (pos < tokens.length) {
        const tok = tokens[pos];
        if (!tok) break;

        // Stop if this token matches the next anchor
        if (nextAnchor) {
          if (nextAnchor.kind === "tok" && tokenMatchesEl(tok, nextAnchor)) break;
          if (nextAnchor.kind === "skip" && nextAnchor.stopType && tok.type === nextAnchor.stopType)
            break;
        }

        // Only capture unmatched / free-text tokens; stop at structural token types
        const structural = [
          "AMT",
          "BAL",
          "INS",
          "INSTR",
          "TRX",
          "TRANS",
          "INTENT",
          "PREPV",
          "PREPL",
          "PREP",
          "DET",
          "AUX",
          "AVBL",
          "TRANSFER",
          "WALLET",
          "LOCATION",
          "FAVRG",
          "INFO",
        ];
        if (structural.includes(tok.type)) break;

        // Skip tokens whose raw text looks like a date, pure number, or URL —
        // these are never merchant names
        const raw = tok.text.trim();
        if (DATE_RE.test(raw) || PURE_NUM_RE.test(raw) || URL_RE.test(raw)) {
          pos++;
          continue;
        }

        parts.push(tok.text);
        pos++;
      }

      if (parts.length > 0) {
        captures[el.name] = parts.join(" ").trim();
      }
    }
  }

  // At least one capture must have been filled
  return Object.keys(captures).length > 0 ? captures : null;
}

export interface CompiledPattern {
  name: string; // e.g. "vendor", "item", "location"
  elements: MatchEl[];
}

export function compilePatterns(patterns: string[]): CompiledPattern[] {
  return patterns.map((pat) => {
    const els = parsePatternString(pat);
    // Derive name from first capture in pattern
    const cap = els.find((e) => e.kind === "capture");
    const name = cap && cap.kind === "capture" ? cap.name : "unknown";
    return { name, elements: els };
  });
}

// Run all compiled patterns against the token stream; return the first match's captures.
export function runPatterns(
  compiledPatterns: CompiledPattern[],
  tokens: Token[],
): Record<string, string> {
  const result: Record<string, string> = {};

  for (const cp of compiledPatterns) {
    for (let start = 0; start < tokens.length; start++) {
      const caps = tryMatchAt(cp.elements, tokens, start);
      if (caps) {
        // Merge captures; first-wins per key
        for (const [k, v] of Object.entries(caps)) {
          if (v && !result[k]) result[k] = v;
        }
        break; // move to next pattern after first successful match
      }
    }
  }

  return result;
}
