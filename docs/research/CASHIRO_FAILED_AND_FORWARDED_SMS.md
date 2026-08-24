# Cashiro: failed transactions and forwarded SMS ownership

Research target: `ritesh-kanwar/Cashiro`

## Conclusions

1. Cashiro has no general forwarded/shared-SMS ownership safeguard. A known-bank sender is not required for every message: `isKnownBankSender()` is mainly an exception to the `-P`/`-G` sender filter. An ordinary numeric sender or contact can still reach parser selection. There is no recipient/SIM verification, repeated-message corroboration, ownership confidence, or user-confirmation gate before downstream account/card persistence.
2. Failed-transaction rejection is implemented separately by individual bank parsers, not as a central outcome model. ADCB, Mashreq, and Federal have explicit failed/declined negative cases, but that evidence cannot be generalized to every bank.
3. Cashiro's Kotak parser does not explicitly reject `failed`, `declined`, or `low balance` in `isTransactionMessage()` for the reported message shape.
4. The exact reported Kotak SMS still returns `null` in Cashiro because it contains no transaction amount. `BankParser.parse()` exits when `extractAmount()` returns `null`, before account/card extraction. This is an incidental safety property of this one message, not robust failed-transaction handling. A similar failed Kotak SMS containing an amount remains an uncovered risk.
5. Cashiro therefore supports Zeeya's product distinction: a message can belong to the bank domain without being a successful ledger event or sufficient account evidence. Cashiro does not provide a model Zeeya can copy for forwarded-message ownership.

## Exact reported Kotak message

```text
Txn at BLACKBOX SUBSCRIPTION via Kotak Debit Card XX8068 on 11/08/2026 IST failed due to low balance in a/c XX9152. Charges apply on declined txns.
```

DeepWiki's code trace reports:

- `KotakBankParser.isTransactionMessage()` does not have a failed/declined exclusion that rejects this body.
- `BankParser.parse()` calls `extractAmount()` before account/card extraction and returns `null` when no amount is found.
- `XX8068` and `XX9152` do not match its amount patterns because they lack a currency marker.
- Consequently, neither account `9152` nor card `8068` is persisted from this exact body in Cashiro.
- No Kotak test covers this exact failure shape.

## Relevant Cashiro paths

- `parser-core/src/main/kotlin/com/ritesh/parser/core/bank/BankParser.kt` — common parse gate; returns `null` when the message is rejected, amount is absent, or type is absent.
- `parser-core/src/main/kotlin/com/ritesh/parser/core/bank/KotakBankParser.kt` — Kotak-specific message and field extraction; lacks the reported failure-status exclusion.
- `parser-core/src/main/kotlin/com/ritesh/parser/core/bank/ADCBParser.kt` — per-bank failed/insufficient-funds exclusions.
- `parser-core/bin/main/com/ritesh/parser/core/bank/MashreqBankParser.kt` — per-bank failed/declined exclusions.
- `parser-core/bin/test/com/ritesh/parser/core/bank/FederalBankParserTest.kt` — failed/declined negative fixtures.
- `app/src/main/java/com/ritesh/cashiro/worker/OptimizedSmsReaderWorker.kt` — sender filtering and account/card/balance persistence.
- `app/src/main/java/com/ritesh/cashiro/worker/SmsReaderWorker.kt` — alternate ingestion worker with related sender filtering.

## Sender-filter behavior

The important condition in the optimized worker is effectively:

```text
skip = (sender ends with "-P" or "-G") and sender is not a known bank
```

This means `isKnownBankSender()` is not a universal authenticity allowlist. It prevents known banks from being discarded by a promotional/government suffix rule. It does not establish that the account in the SMS belongs to the device owner.

## Implication for Zeeya

- Keep `GRM_BANK` as a domain classification for the Kotak notice.
- Do not create a transaction, mutate a balance, or establish a detected account unless the parse supplies affirmative financial evidence (successful transaction amount/type, balance reading, or confirmed mandate data).
- Treat forwarded/shared-message ownership as a separate identity-confidence problem. Bank classification and account ownership must not be the same decision.
- Do not copy Cashiro's fragmented per-bank failure lists as Zeeya's long-term architecture; central outcome/evidence semantics are safer. Bank-specific fixtures should still test real wording variants.

## DeepWiki queries

- [Kotak exact-message trace](https://deepwiki.com/search/for-the-exact-kotak-failed-sms_72c2922b-8753-4be9-8581-c750b75df200)
- [Cashiro ingestion and ownership trace](https://deepwiki.com/search/inspect-cashiros-production-in_f2d48681-44f3-432b-b37a-987bfa72472c)
- [Known-bank sender condition](https://deepwiki.com/search/resolve-this-precise-ambiguity_5353baf7-92ea-4ed6-9ae1-db08c67b1174)
