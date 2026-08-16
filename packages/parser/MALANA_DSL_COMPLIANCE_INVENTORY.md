# Malana JSON DSL — Static Compliance Inventory

Read-only audit. No production code was changed to produce this document. All
figures below were computed directly against `src/malana/data/seeddata.json`
and the current `src/malana/*.ts` implementation, with the analysis scripts
faithfully re-implementing the relevant parsing logic from
`grammar-compiler.ts` and `keyword-tokenizer.ts` in Python (not assumed).

Scope, per the staged plan: complete the static inventory; do **not** merge
grammar categories or touch `subscriptions.ts`/`enrichment.ts` behavior yet.
Every "architecture" statement below is flagged as a hypothesis requiring
Java bytecode or Yuga-equivalent verification, not a conclusion.

## 1. Category / GRM_VOID composition — dependency graph

### 1a. The graph is not "GRM_VOID feeds everyone." It's a near-total mesh.

Built a directed graph where an edge `A → B` means some `GRMR` rule in
category A references a result-symbol whose *only* producer(s) are in
category B (symbol appears in >1 category's `GRMR`, or only in a different
category than the consumer).

- 13 categories (12 + `GRM_VOID`), **53 cross-category edges**.
- Every one of the 13 categories both *produces for* and *consumes from* at
  least one other category (see full edge list in §1c).

### 1b. Strongly connected components

```
SCC 1 (size 11): GRM_APPOINTMENT, GRM_BANK, GRM_BILL, GRM_CALLALERTS,
                 GRM_DELIVERY, GRM_EVENT, GRM_NOTIF, GRM_OFFERS,
                 GRM_TELECOM, GRM_TRAVEL, GRM_VOID
SCC 2 (size 1):  GRM_OTP          (consumes from others, nothing consumes from it)
SCC 3 (size 1):  GRM_STOCKUPDATES (consumes from others, nothing consumes from it)
```

**11 of 13 categories form one strongly connected component** — genuine
cycles exist (e.g. `GRM_BANK ⇄ GRM_BILL`, `GRM_BANK ⇄ GRM_OFFERS`,
`GRM_VOID ⇄ GRM_BANK`, `GRM_VOID ⇄ GRM_BILL`). A cycle cannot be resolved by
"compile A, then compile B" in either order — this rules out a simple
"prepend GRM_VOID" or "compile in category order" model. It's consistent
with either (a) a flat/global symbol table where all categories' `GRMR`
rules are compiled into one shared rule space and "category" only
determines which output tags are extracted at the end, or (b) genuine
recursive/fixed-point compilation. Distinguishing these needs bytecode
tracing — this inventory only establishes that a simple staged-merge model
is inconsistent with the data.

`GRM_OTP` and `GRM_STOCKUPDATES` have **zero in-edges** — nothing depends on
symbols they produce. Consistent with them being narrow, terminal-only
categories.

### 1c. Full cross-category edge list (consumer → producer : symbol count)

```
GRM_APPOINTMENT -> GRM_EVENT (4): APPNTMENTDATE, APPNTMENTID, APPNTMENTSTATUS, APPNTMENTTIME
GRM_BANK -> GRM_BILL (8): AUTOPAYRQSTAMNT, BILLPRCS, INSTR, POLNUM, REFNO, TRANSINTENT, TRFREQ, TRXID
GRM_BANK -> GRM_NOTIF (1): TRFREQ
GRM_BANK -> GRM_OFFERS (3): CASHBACKVALUE, TRANSINTENT, WORTHAMT
GRM_BANK -> GRM_TRAVEL (1): REFNO
GRM_BANK -> GRM_VOID (3): AVBLINACCNT, LINKADHRURL, NUMBER
GRM_BILL -> GRM_BANK (6): BAL, INSTR, INTENT, MOBILE, SUCCESSTRANS, TRANSINTENT
GRM_BILL -> GRM_NOTIF (5): MOBPACKNUMB, RECHRGPACK, REVTOTALDUE, TRFREQ, USELINK
GRM_BILL -> GRM_OFFERS (3): EXPDATE, MINPURCHASE, TRANSINTENT
GRM_BILL -> GRM_TELECOM (1): MOBPACK
GRM_BILL -> GRM_VOID (9): CASHMEMONUM, LINKACCNT, MOREINFOURL, NUMBER, PLSENSUR, PLSIGNORE, PLSPAY, RENTALAMT, UPTOAMT
GRM_CALLALERTS -> GRM_VOID (2): CALLNO, MOREINFOURL
GRM_DELIVERY -> GRM_BANK (1): MOBILE
GRM_DELIVERY -> GRM_BILL (2): MOBILE, SRVCERQST
GRM_DELIVERY -> GRM_OFFERS (1): THNXSHOPPING
GRM_DELIVERY -> GRM_TRAVEL (1): ORDERIDVAL
GRM_DELIVERY -> GRM_VOID (5): CALLNO, MAKESMILE, MOREINFOURL, NUMBER, NUMDAYS
GRM_EVENT -> GRM_APPOINTMENT (3): APPNTMENTDATE, APPNTMENTID, APPNTMENTTIME
GRM_EVENT -> GRM_TRAVEL (1): SEATNO
GRM_EVENT -> GRM_VOID (1): GENDATE
GRM_NOTIF -> GRM_BANK (6): CHQAMT, CHQFORPYMNT, CHQNO, INSTR, INTENT, TRANSINTENT
GRM_NOTIF -> GRM_BILL (9): AUTPAYEMNDT, CONSUMERNUM, EXPDATE, INSTR, INTENTDUE, RECHRGAMT, TRANSINTENT, TRFREQ, TRFREQ_AMT
GRM_NOTIF -> GRM_DELIVERY (1): RESCHEORDER
GRM_NOTIF -> GRM_OFFERS (3): EXPDATE, INKINDCASH, TRANSINTENT
GRM_NOTIF -> GRM_TELECOM (2): CALLDURATION, MOBPACK
GRM_NOTIF -> GRM_VOID (6): ELIGREFUND, NUMDAYS, PCTCHARGEONTRX, RENTALPLAN, SECREASON, UPTOAMT
GRM_OFFERS -> GRM_BANK (6): ADDAMT, CASHBACKTOCARD, INSTR, INTENT, TRANSINTENT, WALADD
GRM_OFFERS -> GRM_BILL (9): APRVEDAMT, EMIAMT, EXPDATE, INSTR, INTENTDUE, MINAMT, RECHRGAMT, TOTAMT, TRANSINTENT
GRM_OFFERS -> GRM_DELIVERY (1): ORDERSTATUS
GRM_OFFERS -> GRM_NOTIF (1): LIMITTRXAMT
GRM_OFFERS -> GRM_VOID (7): GETORDER, NEXTORDER, NUMDAYS, SALCUST, UPTOAMT, VALIDDAYS, VALIDUPTO
GRM_OTP -> GRM_BANK (1): INSTR
GRM_OTP -> GRM_BILL (1): INSTR
GRM_OTP -> GRM_DELIVERY (1): CANCELDLVRY
GRM_OTP -> GRM_OFFERS (1): USECODE
GRM_OTP -> GRM_VOID (2): LINKACCNT, NUMBER
GRM_STOCKUPDATES -> GRM_BANK (1): BAL
GRM_STOCKUPDATES -> GRM_BILL (3): BAL, FOLIONUM, TOTAMT
GRM_STOCKUPDATES -> GRM_NOTIF (1): CASHAMTALLOCTD
GRM_TELECOM -> GRM_BANK (1): BAL
GRM_TELECOM -> GRM_BILL (2): BAL, RECHRGAMT
GRM_TELECOM -> GRM_NOTIF (2): CALLCHARGE, CURRPACK
GRM_TRAVEL -> GRM_BANK (1): REFNO
GRM_TRAVEL -> GRM_BILL (1): REFNO
GRM_TRAVEL -> GRM_DELIVERY (1): ORDERIDVAL
GRM_TRAVEL -> GRM_EVENT (2): BKNGID, SEATNO
GRM_TRAVEL -> GRM_VOID (3): BKNGNUM, MOREINFOURL, NUMBER
GRM_VOID -> GRM_BANK (6): CARDENDINGWD, INSTR, INTENT, MOBILE, TRANSINTENT, WALLETPYMNT
GRM_VOID -> GRM_BILL (5): ACCPTRQST, INSTR, MOBILE, PAYBILLONLINE, TRANSINTENT
GRM_VOID -> GRM_CALLALERTS (1): MISSEDCALL
GRM_VOID -> GRM_DELIVERY (1): ORDERSTATUS
GRM_VOID -> GRM_NOTIF (2): LOGINURL, USELINK
GRM_VOID -> GRM_OFFERS (2): CASHBACKVALUE, TRANSINTENT
```

### 1d. Producer/consumer layer-index relationship

For every cross-category dependency, compared the producer's `GRMR` layer
index to the consumer's:

| Relationship | Count |
|---|---|
| producer's layer index is *later* than consumer's | 153 |
| producer's layer index is the *same* as consumer's | 118 |
| producer's layer index is *earlier* than consumer's | 47 |

No consistent ordering exists — a producer is about as likely to be at a
later layer index as an earlier one. **Layer index does not by itself
encode a global execution order across categories.** This is more evidence
against "layers merge in index order across categories" and leans toward a
flat/global rule space (per §1b), but again — hypothesis, not conclusion.

## 2. Symbols with multiple producers (19 found)

Same result-symbol name defined independently in more than one
category/layer. If categories were merged, these need explicit
reconciliation (identical rule bodies? different ones that should both
apply? one should win?).

```
APPNMNTDATETIME  GRM_EVENT:L2[appntmnt]        GRM_APPOINTMENT:L1
APPNTMENTDATE    GRM_EVENT:L1[appntmnt]<2>     GRM_APPOINTMENT:L1
APPNTMENTID      GRM_EVENT:L1[appntmnt]        GRM_APPOINTMENT:L1
APPNTMENTTIME    GRM_EVENT:L1[appntmnt]<2>     GRM_APPOINTMENT:L1
BAL              GRM_BANK:L1[bal]              GRM_BILL:L1[bal]
BKNGID           GRM_EVENT:L0[booking]         GRM_TRAVEL:L1[booking]
BLNC             GRM_BANK:L2                   GRM_VOID:L2
EXPDATE          GRM_BILL:L0[expire]           GRM_OFFERS:L1[expire]<2>
INSTALOAN        GRM_VOID:L2 (x2, same layer, two key variants)
INSTR            GRM_BANK:L0[acc]              GRM_BILL:L1[acc]
MOBILE           GRM_BANK:L2[mobile]           GRM_BILL:L1[mobile]
ORDERIDVAL       GRM_TRAVEL:L2[order]          GRM_DELIVERY:L1[order]
ORDEROFFER       GRM_OFFERS:L0 (x2, same category, two layers)
REFNO            GRM_BANK:L1[ref]  GRM_TRAVEL:L2[ref]  GRM_BILL:L1[ref]
SEATNO           GRM_EVENT:L1                  GRM_TRAVEL:L1
SEATNUMB         GRM_EVENT:L0                  GRM_TRAVEL:L1
TRANSINTENT      GRM_BANK:L0[trx]  GRM_BILL:L1[trx]  GRM_OFFERS:L2[trx]
TRFREQ           GRM_BILL:L2                   GRM_NOTIF:L0
TRXID            GRM_BANK:L1[ref]              GRM_BILL:L1[ref]
```

## 3. Pair-map collisions under a naive merge

Compiled every category's **layer 0** into its own `pairMap` (same algorithm
as `grammar-compiler.ts`'s `compileLayer`, ported faithfully), then
simulated merging all 13 categories' layer-0 maps in `GRAMMAR` object key
order — the same "first write wins" behavior `compileLayer` already has via
`if (!pairMap.has(mapKey))`.

- 597 distinct `prev-next` pair keys total across all categories' layer 0.
- 0 keys are redundantly defined with the *same* result by >1 category.
- **9 keys collide: the same `prev-next` transition is claimed by two (or
  three) categories with *different* result types.**

```
AMNT-AMT    GRM_BILL:MINAMT[min]         vs GRM_DELIVERY:ORDERAMT[order]
AMT-AUX     GRM_BILL:INTENTDUE[bill]<3>  vs GRM_NOTIF:TRXDECLINE[decline]<5>
AUX-DUE1    GRM_TRAVEL:ITINALERT<2>      vs GRM_BILL:BILLRESCHE[billresche]<2>
AUX-GENERATE GRM_EVENT:TICKETGEN<3>      vs GRM_BILL:AMTDUE[bill]
AUX-PROCESS GRM_BILL:BILLPRCS[billprcs]<2> vs GRM_NOTIF:CHQ_CLRG[chqclr]<3>
AUX-RESCHE  GRM_TRAVEL:PNRALERT[alert]   vs GRM_BILL:BILLRESCHE<2>  vs GRM_NOTIF:TRXDECLINE<5>
MIN-TRANSINTENT GRM_BILL:MINAMT[min]     vs GRM_OFFERS:INTENTANGET<2>[discount]
TRANSINTENT-AUX GRM_BILL:INTENTDUE<3>    vs GRM_NOTIF:TRXINIT[init]<5>
USE-AMT     GRM_BANK:INTENT[trx]         vs GRM_NOTIF:BANKALERT<3>
```

This is the concrete evidence behind the earlier caution: **naively unioning
`GRM_BANK` and `GRM_BILL` (or any category pair) is not safe** — whichever
category's key gets inserted first silently wins on these 9 pairs, in a way
that depends entirely on JS object key iteration order, not on any
semantic priority.

## 4. Global reachability — "truly unreachable" symbols

Computed a fixed point: starting from every terminal token type (784+380
`TOKENS`-derived base types plus the 24 `regex-tokenizer.ts` output types,
407 terminals total), repeatedly mark a `GRMR` result-symbol reachable once
*all* of its referenced input types are reachable — allowing a symbol from
*any* category to satisfy a dependency (the most generous possible
"everything is globally merged, no collisions, no ordering issues"
scenario).

- 512 distinct `GRMR` result-symbols total.
- 343 reachable even in the maximally generous global-merge scenario.
- **169 remain unreachable — even if every category's grammar were merged
  with zero collisions.**

### Important qualification before trusting that 169 figure

A large fraction of the blocking chain traces back to one symbol:
**`IDVAL`**, which is referenced by `REFNO`, `TRXID`, `APPNTMENTID`,
`BKNGID`, `PNRID`, `TICKETNUM`, `ORDERIDVAL`, `TRACKINGIDVAL`, `OTPIDVAL`,
`TRIPCODEVAL`, `BUSID`, and more — but `IDVAL` itself is never defined as a
`TOKENS` entry, a regex-tokenizer output, or a `GRMR` result in *any*
category. That's suspicious on its face: `REFNO`/`TRXID`/`TICKETNUM` etc.
are clearly load-bearing in a real transaction/travel/delivery parser.

**Hypothesis, not yet confirmed:** `CLASSIFIER.CLS_ID` — the field this
audit's own item #7 already flagged as validated-but-unused — is
`["BOOKINGID", "REF", "PNR", "TICKETNO", "TICKET", "FLIGHT", "TRIPCODE",
"NO", "IDENTIFICATION", "BUSNO", "CODE", "OFFERCODE", "USECODE", "OFFER",
"OFFERS", "TRANSID", "ORDERID", "TRACKINGID", "AUX", "ORDER", "BOOK",
"STOCKEXCHNG"]`. The naming correspondence with the stuck symbols is
striking: `REF`→`REFNO`, `PNR`→`PNRID`, `TICKETNO`/`TICKET`→`TICKETNUM`,
`TRIPCODE`→`TRIPCODEVAL`, `BUSNO`→`BUSID`, `TRANSID`→`TRXID`,
`ORDERID`→`ORDERIDVAL`, `TRACKINGID`→`TRACKINGIDVAL`,
`BOOKINGID`→`BKNGID`. This strongly suggests `CLASSIFIER.CLS_ID` is the
vocabulary for a generic "one of these identifier-marker words, followed by
a generic alphanumeric/numeric string → `IDVAL`" mechanism that exists
*outside* the `TOKENS`/`GRMR` pair-grammar entirely — which would explain
both why it looks structurally unreachable in a `TOKENS`/`GRMR`-only
analysis, and why the TS port (which never reads `CLASSIFIER.CLS_ID`,
per item #7) can't produce it either.

**If confirmed**, this single mechanism would resolve `IDVAL` and cascade
through roughly a third of the 169 "unreachable" list. This is the highest-value
single item to trace against Java bytecode first — more consequential than
tracing any individual grammar rule, since it's a shared primitive many
categories depend on.

Two smaller anomalies inside the 169, flagged for manual review rather than
folded into the main count (both are `{N:type}` skip-gap type-allowlists
containing a bare English word instead of a token type name, most likely a
seed-data quirk rather than a porting gap — needs Java-side confirmation):
`APRVEDAMT: blocked on ['for']` and `CHQCLRING: blocked on ['for']` — both
come from `"APPROVE {3:for}AMT"` / an equivalent `{3:for}` gap spec, where
`for` is parsed as a required type inside the skip-window allowlist rather
than a token type name — same fate either way (blocks a >0-length gap since
no token is ever typed `"for"`), so it doesn't change any conclusion above,
just isn't a "missing producer" in the same sense as the rest.

Full 169-symbol list with each one's specific blocking dependency is in the
appendix at the bottom of this document.

## 5. `<N>` multiplier inventory

140 of 533 `GRMR` result-keys (26%) carry a `<N>` multiplier:

| N | Count | Example |
|---|---|---|
| `<2>` | 79 | `CASHBACKTOCARD[trx]<2>`, `UPITRX[trx]<2>` |
| `<3>` | 50 | `AUTODBTSUCCES[trx]<3>`, `OTPIDVAL[otp]<3>` |
| `<4>` | 6  | `OTPNO[otp]<4>`, `MAKETXNSGETOFFER<4>` |
| `<5>` | 5  | `TRCONV[conv]<5>`, `TRXDECLINE[decline]<5>` |

**TS status: fully inert.** `grammar-compiler.ts:55,95` parses `<N>` into
`GrammarEntry.multiplier` and stores it in the compiled `pairMap` entry, but
`grammar-runner.ts` (`findMatch`/`runLayer`) never reads `entry.multiplier`
— confirmed by grep, the only two files touching `multiplier` at all are
`grammar-compiler.ts` (write) and its own type definition. Every value
1–5 is represented; this isn't a rare edge case, it's over a quarter of all
grammar outputs.

## 6. Embedded bracket annotations in `TOKENS` values

Every keyword entry across all `TOKENS` values, classified by syntax shape
(1,167 total entries):

| Shape | Count | Example |
|---|---|---|
| plain phrase | 784 | `debited` |
| `phrase\|normalizedvalue` | 380 | `dr\|debit` |
| `phrase\|[a;b;c;d]` | 2 | `expire\|[verb;past]`, `picked\|[pickedup;;past;verb]` |
| `phrase[a;b;c;d]` (no pipe) | 1 | `picked up[pickedup;;past;verb]` |

Low raw frequency (3 entries total), but both forms are mishandled by
`keyword-tokenizer.ts:97-99`, which splits on the first `|` only:

- `"picked|[pickedup;;past;verb]"` → keyword `"picked"`, normalized value =
  the **literal string** `"[pickedup;;past;verb]"` (never decoded into
  separate normalized-value/POS/tense/status fields).
- `"picked up[pickedup;;past;verb]"` → no `|` present, so the **entire
  string including the brackets** becomes the search keyword. This can
  never match real SMS text — confirmed dead code path, not a rare-edge
  theoretical concern.

Practical impact: the delivery-status keyword "picked up" (a genuinely
common real-world SMS phrase for courier pickups) never matches through
this entry. There may be a second, working path to the same signal
elsewhere in `TOKENS` (not verified here) — but this specific entry is
confirmed non-functional.

## 7. `_pos` / `_tense` / `_negation` / `_chunk` / `_context` inventory

Broader than the two constructs originally flagged — every underscore-prefixed
attribute found in any `TOKENS` key's bracket:

| Attr | Keys using it | Example |
|---|---|---|
| `_pos` | 22 | `DET[_pos=det]`, `AUX[_pos=aux]` |
| `_tense` | 10 | `TRX[type,_tense=past,_pos=verb,_negation=negatable]` |
| `_negation` | 7 | same `TRX`/`TRX1`/`TRX2`/`TRANS`/`ORDSTATUS5` family |
| `_chunk` | 2 | `COURIER[_chunk=true]`, `PRECODE[_chunk=true]` |
| `_context` | 1 | `SPNDLMT[_context=limit]` |

All five are parsed generically by `keyword-tokenizer.ts:37-40` (any
`_key=value` → `attrs[key] = value`, stripping the underscore) and get
merged into a matched token's `values` at match time. **None are read
anywhere downstream** — grepped `grammar-runner.ts`, `pattern-extractor.ts`,
`malana.ts`, `enrichment.ts` for `"pos"`, `"tense"`, `"negation"`,
`"chunk"`, `"context"` as read-sites (not just the string constants) and
found zero consumers.

**`_negation=negatable` on `TRX`/`TRX1`/`TRX2`/`TRANS` is the one most
worth flagging beyond the original two.** Those are the core transaction
verb tokens (`debited`, `credited`, etc.). A `_negation` marker on exactly
the transaction-verb token family strongly suggests the seed was designed
to let the Java engine recognize a negated transaction statement — "amount
was **not** debited", "transaction **failed** to complete" — and avoid
treating it as a real transaction. If the TS port has no equivalent
handling (confirmed: no negation-aware logic exists anywhere in
`malana.ts`/`enrichment.ts`), this is a plausible source of false-positive
transaction detection on negated/failed-transaction SMS, independent of any
subscription-related question. Worth a targeted test against real negated
messages before assuming it's purely academic.

## 8. Summary table

| # | Construct | TS status | Confidence |
|---|---|---|---|
| 1 | `<N>` multiplier | Parsed, stored, never read (140/533 rules affected) | Confirmed |
| 2 | `phrase\|[a;b;c;d]` bracket annotation | Literal string, fields never decoded (2 entries) | Confirmed |
| 2b | `phrase[a;b;c;d]` (no pipe) | Entire string becomes unmatchable keyword (1 entry) | Confirmed |
| 3 | `_chunk`, `_context`, `_pos`, `_tense`, `_negation` | Parsed into `values`, never read downstream | Confirmed |
| 4 | Cross-category grammar composition | 53 edges, 11-category SCC, 9 pair-map collisions if merged naively | Confirmed structure; correct resolution mechanism unconfirmed |
| 5 | `RECURR`/`SUBSCRPTN`/`AUTORENEW`/`EMANDATE`/`STNDNGINS`/`AUTDBT` | Only `RECURR` is grammar-unused; the rest are real seed-grammar inputs the TS engine doesn't specifically surface | Corrected this session — see below |
| 6 | Pattern bounded backtracking | Not statically verified — needs Yuga-equivalent Java path or golden corpus, not the numeric/date Yuga JAR | Not evaluated |
| 7 | `CLASSIFIER.CLS_ID` | Validated by schema, never read; plausibly the producer of `IDVAL` and everything downstream of it (§4) | Confirmed unused; production-mechanism hypothesis unconfirmed |

## Corrections applied during this pass

The original claim that `RECURR`/`SUBSCRPTN`/`AUTORENEW`/`EMANDATE`/
`STNDNGINS` were "unused" was based on grepping TS source files for literal
token names — the wrong test for a data-driven engine where the generic
compiler consumes these from JSON without any TS-side literal reference.
Re-verified directly against `GRMR`/`PATTERN`/`STRUCT`:

- `RECURR`: zero matches in any `GRMR`, `PATTERN`, or `STRUCT` section, in
  any category. Genuinely grammar-unused, as originally claimed.
- `SUBSCRPTN`: `GRM_BILL:L2 RENTALBILL => "RENTAL {2}SUBSCRPTN"`. Real input.
- `AUTORENEW`: `GRM_BILL:L0 DUEAMT[due]<3> => "...,AUTORENEW {4}AMT,..."`
  and `GRM_NOTIF:L0 AUTORENEWAL<4> => "...,RENTALPLAN {5}AUTORENEW"`. Real.
- `EMANDATE`: `GRM_BILL:L0 AUTPAYEMNDT<2> => "AUTDBT {2}EMANDATE,..."` and
  `GRM_BANK PATTERN: "TRANS EMANDATE #vendor"`. Real, in both GRMR and PATTERN.
- `STNDNGINS`: `GRM_BILL:L2 MANAGEINS => "MANAGE {1}STNDNGINS"`. Real.
- `AUTDBT`: appears in `AUTOPAYRQSTAMNT`, `AUTOPAYTRX`, `AUTPAYEMNDT`, and
  `GRM_BILL:L1 AUTOPAY<2>`. Also read directly in `malana.ts`'s
  `deriveRichType` (`kwToks.some(t => t.type === "AUTDBT")`) to derive
  `AUTO_DEBIT`. Real, and the one member of this family already surfaced.

None of these were re-tested for reachability given the cross-category
dependency finding (§1/§4) — `AUTOPAYRQSTAMNT`, `AUTPAYEMNDT`, `DUEAMT`, and
`RENTALBILL` all sit inside the giant SCC and several are in the 169-symbol
unreachable list, so "the token is a real grammar input" and "the rule that
consumes it can currently fire" are separate questions this document keeps
separate on purpose.

---

## Appendix: full 169-symbol unreachable list

```
ACKNWLDGDLVRYURL, AIRPORTS, AMTDUE, AMTDUERCV, APPNMNTDATETIME,
APPNTMENTDATE, APPNTMENTID, APPNTMENTSTATUS, APPNTMENTTIME, APPRVPAYRQST,
APRVEDAMT, ATMWDRWL, AUTODBTSUCCES, AUTOPAYRQSTAMNT, AUTOPAYTRX, AVAILURL,
AVOIDCHRG, AVOIDORDRESCH, BAGTAGNUM, BANKALERT, BENTRX, BILLPRCS,
BILLRESCHE, BKNGID, BOARDGATENUM, BUSID, CABBKGAMT, CABBKIG, CABCANCEL,
CALLDETAILS, CASHBACKTOCARD, CASHBACKVALUE, CASHBCKURL, CHARGEONFUTTRX,
CHECKTRXURL, CHQCLRING, CHQ_CLRG, CODEVAL, CRNCYDENMN, CRYPTODEPOSIT,
DECLINE_REASON, DELIVDELAY, DELIVERDATE, DELVRYOTP, DELVSTATUSNEGATE,
DISCNTVAL, DISCONMAXBILL, DLVRYNOTIF, EMANDTTRXINTENT, EMANDTTRXINTENT2,
EMIBKD, ENSUREORDDLVRY, EXCHANGE, FEEDBACKURL, FLTALERT, FLTBKNGID,
GATALERT, GATCHNG, GATNUM, GETAMT, GETDISCWORTH, GETDISCWORTHONCARD,
GETINKIND, INKINDCASH, INSTALOAN, INSTR_ORDNTF, INTENT, INTENTANGET,
INTENTDUE, INTENTDUEDATE, INTENTGETEXP, INTENTINOFFERPERIOD, ITEMDLVRD,
ITEMDLVRYOTP, ITINALERT, ITINERARY, JOINURL, LINKADHRDATE, LINKADHRURL,
LOANAPPROVAL, LOGINURL, MAKETXNS, MAKETXNSGETOFFER, MANAGEDLVRYURL,
MANAGEURL, MINAMT, MNGDATAURL, MOREINFOURL, NACHREGISTRED,
NEGATETRANSINTENT, NEWLOAN, NEWPYMNT, OFFERCODE, OFFEREXPDT,
OFFEREXPONSPEND, OFFERSPEND, ORDCANCEL, ORDERAMT, ORDERBOOKED, ORDERIDVAL,
ORDEROFFER, ORDERSTATUS, ORDERTRANSIT, ORDERURL, OTPCODE, OTPFOLLOWS,
OTPIDVAL, OTPNO, PAIDAMT, PAYATURL, PAYLINK, PAYLINKAMT, PAYURL, PLSPAY,
PNRALERT, PNRID, POLDUE, PREAPPRVDLOAN, PREMIUMRECVD, PTMGAMES, RCHRGSUCC,
RCHRGURL, RECEIPTURL, REFNO, RESCHEORDER, RETPICKUPSTATUS, SAVEVAL,
SCHEMEDPOSIT, SEATNUMB, SMSCDNO, SMSTONO, SPENDAMTWORTH, SUCCESSTRANS,
TICKETNUM, TICKTORDID, TOTAMT, TOTFOLIOVAL, TOTINKIND, TRACKDLVRYURL,
TRACKINGIDVAL, TRACKMISSEDCALLSURL, TRACKSTATUS, TRAINALERT, TRAINBKNGID,
TRANSEXCD, TRANSINTENT, TRCONV, TRFREQ, TRFREQSUCCESS, TRFREQ_AMT,
TRIPCODEVAL, TRXATTEMPT, TRXATTEMPTFAIL, TRXCATG, TRXCREDIT, TRXDECLINE,
TRXID, TRXINIT, TRXPROCESS, TRXUNKNWN, UNDELIVERED, USCDNO,
VIEWBRDINGPASSURL, WAIVERONTRX, WALLETAMT, WALLETOFFER, WALLETPYMNT,
WBCHKURL, WLTPYMNTSETUP
```
(See §4 for the `IDVAL`/`CLASSIFIER.CLS_ID` hypothesis that plausibly
resolves a large fraction of this list once traced.)
