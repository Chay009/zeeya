// Binary Naive Bayes SMS relevance pre-classifier.
// Loaded from categorizer.json (Truecaller APK asset).
// class 0 = relevant/financial SMS, class 1 = irrelevant/spam
// Returns true if the SMS is relevant enough to parse.

import categorizerRaw from './data/categorizer.json';

interface ProbEntry {
  word: string;
  probability: [number, number, number, number, number, number];
}

interface CategorizerData {
  probabilities: ProbEntry[];
  meta: number[];
  version: number;
}

const data = categorizerRaw as CategorizerData;

// Build word → [logP0, logP1] lookup
const WORD_MAP = new Map<string, [number, number]>();
for (const entry of data.probabilities) {
  const p0 = entry.probability[0];
  const p1 = entry.probability[1];
  if (p0 > 0 && p1 > 0) {
    WORD_MAP.set(entry.word.toLowerCase(), [Math.log(p0), Math.log(p1)]);
  }
}

// Class priors (log scale)
const LOG_PRIOR0 = Math.log(data.meta[0] ?? 0.5);
const LOG_PRIOR1 = Math.log(data.meta[1] ?? 0.5);

// Minimum vocabulary matches required (India config: 3)
const MIN_WORDS = 3;

// Tokenize SMS into overlapping n-grams up to 3 words (matches training ngram structure)
function ngramTokenize(text: string): string[] {
  const words = text.toLowerCase().split(/\s+/).filter(Boolean);
  const ngrams: string[] = [...words];
  for (let i = 0; i < words.length - 1; i++) {
    ngrams.push(`${words[i]} ${words[i + 1]}`);
  }
  for (let i = 0; i < words.length - 2; i++) {
    ngrams.push(`${words[i]} ${words[i + 1]} ${words[i + 2]}`);
  }
  return ngrams;
}

// Returns true if the SMS is likely relevant (financial/transactional).
// Pass-through (returns true) when fewer than MIN_WORDS are found in vocabulary.
export function isSmsRelevant(message: string): boolean {
  const tokens = ngramTokenize(message);
  let score0 = LOG_PRIOR0;
  let score1 = LOG_PRIOR1;
  let matched = 0;

  for (const tok of tokens) {
    const probs = WORD_MAP.get(tok);
    if (!probs) continue;
    score0 += probs[0];
    score1 += probs[1];
    matched++;
  }

  // Not enough evidence — assume relevant
  if (matched < MIN_WORDS) return true;

  // class 0 wins → relevant
  return score0 >= score1;
}
