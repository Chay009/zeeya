# Bank Parser Agent Prompt

This file contains the exact instructions for a new agent (or human) to port a single bank parser from Cashiro's Kotlin `parser-core` to TypeScript in this repository, maintaining 1:1 parity.

---

## Your Task

Port **one** bank parser from Cashiro's Kotlin source to TypeScript, add it to the factory, and write test cases.

The parser to port is: **`{BANK_PARSER_CLASS_NAME}`** (e.g. `SaraswatBankParser`)

---

## Context

- **Kotlin source**: `packages/parser/src/cashiro-kt/` — if the Kotlin files are not already checked in, read them from the Cashiro GitHub repo at `cashiro-org/parser-core` or wherever the source is available.
- **TypeScript target**: `packages/parser/src/banks/`
- **Factory**: `packages/parser/src/factory.ts` — order MUST match `BankParserFactory.kt` exactly (first-match wins)
- **Tests**: `packages/parser/src/tests/parsers.test.ts`

## Repository Structure

```
packages/parser/src/
  base-parser.ts       ← abstract BankParser class, read this first
  types.ts             ← ParsedTransaction, TransactionType, etc.
  patterns.ts          ← CompiledPatterns — shared regexes
  factory.ts           ← ordered list of parsers, add yours at the correct position
  banks/
    hdfc.ts            ← reference implementation (HDFC Bank)
    icici.ts           ← reference implementation (ICICI Bank)
    sbi.ts             ← reference implementation (SBI)
    axis.ts
    ...
  tests/
    parsers.test.ts    ← add your tests here
```

---

## Step-by-Step Instructions

### 1. Read the base class first

```
packages/parser/src/base-parser.ts
packages/parser/src/types.ts
```

Understand all the `protected` methods you can override:
- `canHandle(sender: string): boolean` — **must override**
- `getBankName(): string` — **must override**
- `isTransactionMessage(message: string): boolean`
- `extractAmount(message: string): number | null`
- `extractTransactionType(message: string): TransactionType | null`
- `extractMerchant(message: string, sender: string): string | null`
- `extractReference(message: string): string | null`
- `extractAccountLast4(message: string): string | null`
- `extractBalance(message: string): number | null`
- `extractAvailableLimit(message: string): number | null`
- `parse(smsBody: string, sender: string, timestamp: number): ParsedTransaction | null` — override only if the bank needs custom top-level parse logic

The base `parse()` calls: `isTransactionMessage → extractAmount → extractTransactionType → extractMerchant → extractReference → extractAccountLast4 → extractBalance → detectIsCard`.

### 2. Read the Kotlin source for this parser

Find the Kotlin file named `{BANK_PARSER_CLASS_NAME}.kt`. Read it completely. Note:
- All senders in `canHandle()` — copy them exactly
- All regex patterns — these must be ported to JavaScript regex syntax
- All `isTransactionMessage` filters — both negative (return false) and positive keyword checks
- `extractTransactionType` logic — particularly the `'CREDIT'` type for credit card transactions
- Any overrides of `parse()` that customize the return object

**Do not guess or approximate patterns. Copy them exactly.**

### 3. Create the TypeScript file

File: `packages/parser/src/banks/{kebab-name}.ts`

Example skeleton:
```typescript
import { BankParser } from '../base-parser.js';
import type { TransactionType } from '../types.js';

export class {BANK_PARSER_CLASS_NAME} extends BankParser {
  getBankName(): string {
    return '{Bank Display Name}';
  }

  canHandle(sender: string): boolean {
    const u = sender.toUpperCase();
    return (
      u.includes('{SENDER_FRAGMENT}') ||
      /^[A-Z]{2}-{PATTERN}$/.test(u)
    );
  }

  protected override isTransactionMessage(message: string): boolean {
    const lower = message.toLowerCase();
    // negative filters first
    if (lower.includes('...')) return false;
    // positive keywords
    return lower.includes('debited') || lower.includes('credited') || super.isTransactionMessage(message);
  }

  // ... override only what's needed
}
```

### 4. Critical TypeScript rules (`noUncheckedIndexedAccess: true`)

`match[1]` returns `string | undefined`, not `string`. Always handle this:

```typescript
// WRONG
const val = parseFloat(match[1].replace(/,/g, ''));

// CORRECT
const val = parseFloat((match[1] ?? '').replace(/,/g, ''));

// WRONG
return match ? match[1] : null;

// CORRECT  
return match?.[1] ?? null;
```

Never access `arr[0]` or `arr[1]` without a guard. Use optional chaining or `?? ''` / `?? null`.

### 5. TransactionType values

- `'INCOME'` — money received into bank account (salary, UPI received, etc.)
- `'EXPENSE'` — money going out from bank account (UPI sent, bill payment, etc.)
- `'CREDIT'` — credit card transaction (debit from card, NOT from bank account)
- `'TRANSFER'` — account-to-account transfer
- `'INVESTMENT'` — mutual fund SIP, stock purchase, etc.
- `'BALANCE_UPDATE'` — balance notification without a transaction

**Key distinction**: `'CREDIT'` is for credit card spends. The Kotlin code checks `avl lmt` or `avl limit` → `CREDIT`, or specific card patterns. Copy this exactly.

### 6. Add to factory.ts

Open `packages/parser/src/factory.ts`. Find the `// TODO: {BANK_PARSER_CLASS_NAME}` comment at the correct position and replace it with:

```typescript
import { {BANK_PARSER_CLASS_NAME} } from './banks/{kebab-name}.js';
// ... and in the PARSERS array at the correct position:
new {BANK_PARSER_CLASS_NAME}(),
```

**The factory order is critical.** Do not move the parser to a different position than where BankParserFactory.kt places it.

### 7. Write tests

Add to `packages/parser/src/tests/parsers.test.ts`:

```typescript
describe('{BankDisplayName}Parser', () => {
  const parser = new {BANK_PARSER_CLASS_NAME}();

  it('handles known senders', () => {
    expect(parser.canHandle('{SENDER_1}')).toBe(true);
    expect(parser.canHandle('{SENDER_2}')).toBe(true);
    expect(parser.canHandle('UNKNOWNBANK')).toBe(false);
  });

  it('parses debit transaction', () => {
    const result = parseSms({
      sender: '{SENDER}',
      body: '{EXACT_SMS_FROM_KOTLIN_TESTS}',
      timestamp: Date.now(),
    });
    expect(result).not.toBeNull();
    expect(result!.amount).toBe({EXPECTED_AMOUNT});
    expect(result!.type).toBe('{EXPECTED_TYPE}');
    expect(result!.merchant).toBe('{EXPECTED_MERCHANT}');
  });

  // Mirror all test cases from the Kotlin test file for this bank
});
```

**Copy all test SMS messages from the Kotlin test file exactly.** Do not paraphrase or shorten them. These are real-world messages the bank sends.

### 8. Verify

```bash
pnpm --filter @zeeya/parser test
```

All tests must pass. TypeScript must compile with zero errors:

```bash
cd packages/parser && npx tsc --noEmit
```

### 9. Commit and push

```bash
git add packages/parser/src/banks/{kebab-name}.ts packages/parser/src/factory.ts packages/parser/src/tests/parsers.test.ts
git commit -m "feat(parser): port {BANK_PARSER_CLASS_NAME} 1:1 from Cashiro Kotlin"
git push -u origin claude/spendbyme-android-analysis-mqiqv4
```

---

## Reference: Correctly ported parsers

Study these before writing yours — they show the expected pattern:

- **ICICI** (`packages/parser/src/banks/icici.ts`) — most complete example, multi-currency, card detection, salary
- **HDFC** (`packages/parser/src/banks/hdfc.ts`) — e-mandate handling, "Sent Rs." pattern, DLT senders
- **SBI** (`packages/parser/src/banks/sbi.ts`) — credit card last4 extraction, complex isTransactionMessage

---

## What NOT to do

- **Do not add patterns that aren't in the Kotlin source.** If the Kotlin doesn't handle a case, neither should you.
- **Do not skip `canHandle` senders.** If the Kotlin has 8 sender patterns, include all 8.
- **Do not change the factory order.**
- **Do not approximate regex patterns.** Port them character-for-character, converting Kotlin regex syntax to JS (e.g., `(?i)` → `/pattern/i` flag, `\d` stays `\d`, named groups `(?<name>...)` → can keep or use positional).
- **Do not write TypeScript that has `string | undefined` type errors.** Always guard regex group accesses.
