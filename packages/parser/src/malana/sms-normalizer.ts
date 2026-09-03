/**
 * Converts compatibility Unicode forms to their ordinary equivalents before
 * parsing. Financial SMS occasionally arrive with mathematical/styled Latin
 * letters (for example, `𝖽𝖾𝖻𝗂𝗍𝖾𝖽`); NFKC turns those into `debited` while
 * preserving the original SMS body in the caller's ledger.
 */
export function normalizeSmsForParsing(message: string): string {
  return message.normalize("NFKC");
}
