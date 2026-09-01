import {
  createCategoryMatch,
  hasGrammarEvidence,
  isProductCategory,
  qualifyCategoryEvidence,
} from "./category-policy";
import type { MalanaCategory, MalanaCategoryEvidence, MalanaResult, Token } from "./types";

export interface ParsedCategory {
  result: MalanaResult;
  evidence: MalanaCategoryEvidence[];
}

export function composeCategoryResults(
  primaryCategory: MalanaCategory,
  candidates: MalanaCategory[],
  parsedByCategory: ReadonlyMap<MalanaCategory, ParsedCategory>,
  tokens: Token[],
  suppressPromotionalTransaction: boolean,
): MalanaResult {
  const primary = parsedByCategory.get(primaryCategory)!;
  let result = primary.result;
  const bank = parsedByCategory.get("GRM_BANK");
  const bankEvidence = bank ? qualifyCategoryEvidence("GRM_BANK", bank.evidence, tokens) : [];
  const confirmedBankTransaction =
    !suppressPromotionalTransaction &&
    bank?.result.trx &&
    bank.result.trxTypeRich &&
    hasGrammarEvidence(bankEvidence, "trx")
      ? bank.result
      : null;
  const suppressFinancialFacts =
    primaryCategory === "GRM_OTP" ||
    (primaryCategory === "GRM_OFFERS" && !confirmedBankTransaction);

  // The flat financial result is owned by Bank. Non-bank primary grammars may
  // still expose local facts in categoryMatches, but cannot create a second transaction.
  if (primaryCategory !== "GRM_BANK") {
    result = clearTransaction(result);
  }
  if (confirmedBankTransaction && primaryCategory !== "GRM_OTP") {
    result = {
      ...result,
      trx: confirmedBankTransaction.trx,
      bal: confirmedBankTransaction.bal ?? result.bal,
      acc: confirmedBankTransaction.acc ?? result.acc,
      trxType: confirmedBankTransaction.trxType,
      trxTypeRich: confirmedBankTransaction.trxTypeRich,
      currency: confirmedBankTransaction.currency,
      ref: confirmedBankTransaction.ref ?? result.ref,
      bene: confirmedBankTransaction.bene ?? result.bene,
      beneAcc: confirmedBankTransaction.beneAcc ?? result.beneAcc,
    };
  }

  if (suppressFinancialFacts) result = clearSafetyMoney(result);

  const bill = parsedByCategory.get("GRM_BILL");
  if (
    !suppressFinancialFacts &&
    !result.trx &&
    bill?.result.trx &&
    bill.result.trxTypeRich === "RECHARGE" &&
    hasGrammarEvidence(bill.evidence, "rechrgsucc")
  ) {
    result = {
      ...result,
      category: result.category ?? "GRM_BILL",
      trx: bill.result.trx,
      trxType: bill.result.trxType,
      trxTypeRich: bill.result.trxTypeRich,
      currency: bill.result.currency,
      rechargeAmount: bill.result.rechargeAmount,
    };
  }

  const categoryMatches = candidates.flatMap((category) => {
    if (suppressPromotionalTransaction && category === "GRM_BANK") return [];
    if (!isProductCategory(category)) return [];
    const parsed = parsedByCategory.get(category)!;
    const routedPrimary = category === primaryCategory && parsed.result.category === category;
    const evidence = qualifyCategoryEvidence(category, parsed.evidence, tokens);
    if (evidence.length === 0 && !routedPrimary) return [];
    return [
      createCategoryMatch(
        category,
        parsed.result,
        evidence.length > 0 ? evidence : [{ kind: "policy", value: "route" }],
      ),
    ];
  });

  return {
    ...result,
    matchedCategories: categoryMatches.map((match) => match.category),
    categoryMatches,
  };
}

function clearTransaction(result: MalanaResult): MalanaResult {
  const tags = { ...result.tags };
  delete tags["trx"];
  delete tags["type"];
  return { ...result, tags, trx: null, trxType: null, trxTypeRich: null };
}

function clearSafetyMoney(result: MalanaResult): MalanaResult {
  const cleared = clearTransaction(result);
  const tags = { ...cleared.tags };
  for (const key of [
    "amount",
    "bal",
    "bill",
    "cashback",
    "crdlmt",
    "discount",
    "emi",
    "mandate",
    "recharge",
  ]) {
    delete tags[key];
  }
  return {
    ...cleared,
    tags,
    bal: null,
    billAmount: null,
    cashback: null,
    creditLimit: null,
    currency: null,
    discount: null,
    emiAmount: null,
    mandateAmount: null,
    rechargeAmount: null,
  };
}
