export const UNCATEGORIZED_TRANSACTION_LABEL = "Transaction";

export function titleCase(value: string): string {
  return value
    .replace(/^GRM_/i, "")
    .replace(/[_-]+/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function transactionCategoryLabel(
  merchantCategory: string | null | undefined,
  subcategory: string | null | undefined,
): string {
  const raw = merchantCategory?.trim() || subcategory?.trim() || UNCATEGORIZED_TRANSACTION_LABEL;
  return raw === UNCATEGORIZED_TRANSACTION_LABEL ? raw : titleCase(raw);
}
