# Malana JSON DSL — Static Compliance Inventory

Read-only audit. No production code was changed to produce this document. All
figures below were computed directly against every JSON asset in
`src/malana/data/` (not just `seeddata.json`) and the current
`src/malana/*.ts` implementation, with the analysis scripts faithfully
re-implementing the relevant parsing logic from `grammar-compiler.ts`,
`keyword-tokenizer.ts`, and `pattern-extractor.ts` in Python (not assumed).
The three scripts that produce these numbers are committed at
`packages/parser/scripts/dsl-audit/` — see §10.

Scope, per the staged plan: complete the static inventory; do **not** merge
grammar categories or touch `subscriptions.ts`/`enrichment.ts` behavior yet.

**What this document does and does not claim, stated precisely:**

> Every JSON field and syntax form across all 13 files in
> `src/malana/data/` has been mechanically inventoried and mapped to its
> current TS consumer (or lack of one).

That is what's established here, and it's a factual claim about the TS
codebase, checkable by re-running the committed scripts. It does **not**
mean:

> Every instruction's real Java runtime semantics are proven.

Multiplier meaning, category composition/resolution order, `CLASSIFIER.
CLS_ID`'s actual mechanism, `STRUCT` matching/capture execution, and some
token-level metadata (`_pos`/`_tense`/`_negation`/`_context`) still require
additional Java bytecode or behavioral
verification (a Yuga-equivalent Malana Java path, or a golden real-message
corpus) before any "this is what Java does" claim can be made — the Yuga
JAR itself only covers numeric/date/currency tokenization, not the grammar
or pattern engine, so it cannot answer these questions. Java observations
added later cite the exact traced methods; remaining architectural
hypotheses are explicitly marked as unconfirmed.

> **Revision note:** §1 and §4 of the first version of this document had two
> modeling bugs, both caught in review and corrected here: (1) the
> dependency graph counted an edge whenever _any_ other category also
> defined a referenced symbol, even when the consumer had a perfectly good
> local producer of its own — inflating the edge count and the SCC size;
> (2) reachability required _every_ token referenced across _all_ of a
> rule's comma-separated alternatives to be reachable, instead of requiring
> just one full alternative to work — so one exotic token anywhere in any
> alternative could wrongly mark the whole symbol (including load-bearing
> ones like `TRANSINTENT`/`INTENT`, confirmed reachable at runtime) as
> unreachable. Both are fixed below; the original numbers (53 edges,
> 11-category SCC, 169 unreachable) are superseded and should not be cited.
>
> A later Java/smali trace corrected §4b again: this APK loads all 91
> `PATTERN` strings but `ga3.baz.g()` never compiles them. Only `GRMR` and
> `STRUCT` are compiled. The former “24 dead captures” finding describes a
> defect in the TS-only PATTERN interpreter, not a missing Java behavior, and
> must not be cited as the cause of Java/Truecaller vendor extraction.

## 1. Category / GRM_VOID composition — dependency graph

### 1a. Dependency classification

For every `GRMR` rule's referenced token, classified per-category:

| Classification     | Count | Meaning                                                                                                                                    |
| ------------------ | ----- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| terminal           | 672   | Satisfied by a `TOKENS`/regex-tokenizer type — no grammar dependency                                                                       |
| local              | 211   | The consumer's _own_ category also defines this symbol — no cross-category edge, even if other categories define it too (see §2 for those) |
| required external  | 97    | No local producer; exactly **one** other category defines it                                                                               |
| ambiguous external | 12    | No local producer; **multiple** other categories define it (all are candidate producers)                                                   |
| undefined          | 39    | Referenced, defined nowhere at all — not terminal, not any category's `GRMR`                                                               |

(Counts are per unique (category, dep-symbol) pair, deduped across a
symbol's multiple rule alternatives within one category.)

### 1b. Required cross-category edges (39 distinct category pairs, 97 symbol instances)

An edge only exists when the consuming category has **no local producer**
and **exactly one** external category can supply the symbol:

```
GRM_APPOINTMENT -> GRM_EVENT (1): APPNTMENTSTATUS
GRM_BANK -> GRM_BILL (3): AUTOPAYRQSTAMNT, BILLPRCS, POLNUM
GRM_BANK -> GRM_OFFERS (2): CASHBACKVALUE, WORTHAMT
GRM_BANK -> GRM_VOID (3): AVBLINACCNT, LINKADHRURL, NUMBER
GRM_BILL -> GRM_BANK (2): INTENT, SUCCESSTRANS
GRM_BILL -> GRM_NOTIF (4): MOBPACKNUMB, RECHRGPACK, REVTOTALDUE, USELINK
GRM_BILL -> GRM_OFFERS (1): MINPURCHASE
GRM_BILL -> GRM_TELECOM (1): MOBPACK
GRM_BILL -> GRM_VOID (9): CASHMEMONUM, LINKACCNT, MOREINFOURL, NUMBER, PLSENSUR, PLSIGNORE, PLSPAY, RENTALAMT, UPTOAMT
GRM_CALLALERTS -> GRM_VOID (2): CALLNO, MOREINFOURL
GRM_DELIVERY -> GRM_BILL (1): SRVCERQST
GRM_DELIVERY -> GRM_OFFERS (1): THNXSHOPPING
GRM_DELIVERY -> GRM_VOID (5): CALLNO, MAKESMILE, MOREINFOURL, NUMBER, NUMDAYS
GRM_EVENT -> GRM_VOID (1): GENDATE
GRM_NOTIF -> GRM_BANK (4): CHQAMT, CHQFORPYMNT, CHQNO, INTENT
GRM_NOTIF -> GRM_BILL (5): AUTPAYEMNDT, CONSUMERNUM, INTENTDUE, RECHRGAMT, TRFREQ_AMT
GRM_NOTIF -> GRM_DELIVERY (1): RESCHEORDER
GRM_NOTIF -> GRM_OFFERS (1): INKINDCASH
GRM_NOTIF -> GRM_TELECOM (2): CALLDURATION, MOBPACK
GRM_NOTIF -> GRM_VOID (6): ELIGREFUND, NUMDAYS, PCTCHARGEONTRX, RENTALPLAN, SECREASON, UPTOAMT
GRM_OFFERS -> GRM_BANK (4): ADDAMT, CASHBACKTOCARD, INTENT, WALADD
GRM_OFFERS -> GRM_BILL (6): APRVEDAMT, EMIAMT, INTENTDUE, MINAMT, RECHRGAMT, TOTAMT
GRM_OFFERS -> GRM_DELIVERY (1): ORDERSTATUS
GRM_OFFERS -> GRM_NOTIF (1): LIMITTRXAMT
GRM_OFFERS -> GRM_VOID (7): GETORDER, NEXTORDER, NUMDAYS, SALCUST, UPTOAMT, VALIDDAYS, VALIDUPTO
GRM_OTP -> GRM_DELIVERY (1): CANCELDLVRY
GRM_OTP -> GRM_OFFERS (1): USECODE
GRM_OTP -> GRM_VOID (2): LINKACCNT, NUMBER
GRM_STOCKUPDATES -> GRM_BILL (2): FOLIONUM, TOTAMT
GRM_STOCKUPDATES -> GRM_NOTIF (1): CASHAMTALLOCTD
GRM_TELECOM -> GRM_BILL (1): RECHRGAMT
GRM_TELECOM -> GRM_NOTIF (2): CALLCHARGE, CURRPACK
GRM_TRAVEL -> GRM_VOID (3): BKNGNUM, MOREINFOURL, NUMBER
GRM_VOID -> GRM_BANK (3): CARDENDINGWD, INTENT, WALLETPYMNT
GRM_VOID -> GRM_BILL (2): ACCPTRQST, PAYBILLONLINE
GRM_VOID -> GRM_CALLALERTS (1): MISSEDCALL
GRM_VOID -> GRM_DELIVERY (1): ORDERSTATUS
GRM_VOID -> GRM_NOTIF (2): LOGINURL, USELINK
GRM_VOID -> GRM_OFFERS (1): CASHBACKVALUE
```

Note what dropped out versus the first pass: e.g. `GRM_BANK -> GRM_BILL`
no longer lists `INSTR`, `REFNO`, `TRANSINTENT`, `TRXID` — `GRM_BANK`
defines all four itself (confirmed in §2's multi-producer table), so
referencing them is not evidence of a required dependency on `GRM_BILL`.
`GRM_APPOINTMENT ⇄ GRM_EVENT` and `GRM_EVENT ⇄ GRM_TRAVEL` mostly
disappeared the same way.

### 1c. Ambiguous cross-category edges (18 distinct pairs, 26 symbol instances)

No local producer, but more than one external category could supply it —
can't say _which_ one without knowing the real resolution order:

```
GRM_BANK -> GRM_BILL / GRM_NOTIF: TRFREQ
GRM_DELIVERY -> GRM_BANK / GRM_BILL: MOBILE
GRM_NOTIF -> GRM_BANK / GRM_BILL: INSTR, TRANSINTENT
GRM_NOTIF -> GRM_BILL / GRM_OFFERS: EXPDATE, TRANSINTENT
GRM_OFFERS -> GRM_BANK / GRM_BILL: INSTR
GRM_OTP -> GRM_BANK / GRM_BILL: INSTR
GRM_STOCKUPDATES -> GRM_BANK / GRM_BILL: BAL
GRM_TELECOM -> GRM_BANK / GRM_BILL: BAL
GRM_VOID -> GRM_BANK / GRM_BILL: INSTR, MOBILE, TRANSINTENT
GRM_VOID -> GRM_OFFERS: TRANSINTENT
```

`TRANSINTENT` and `INSTR` account for most of the ambiguity — both are
"multi-producer" symbols (§2) referenced from categories that have no local
copy, so which producer's rule actually governs them is exactly the kind of
question that needs the real Java resolution order, not a guess.

### 1d. Strongly connected components (from required edges only)

```
SCC (size 8): GRM_BANK, GRM_BILL, GRM_CALLALERTS, GRM_DELIVERY, GRM_NOTIF,
              GRM_OFFERS, GRM_TELECOM, GRM_VOID
5 singleton categories (no required-edge cycle): GRM_APPOINTMENT, GRM_EVENT,
              GRM_OTP, GRM_STOCKUPDATES, GRM_TRAVEL
```

Adding the 18 ambiguous edges on top doesn't change the SCC membership —
still exactly these same 8 categories. **The core finding survives
correction, at reduced and now-accurate scale: 8 of 13 categories form a
genuine cycle using only dependencies that have no local fallback** (e.g.
`GRM_BANK ⇄ GRM_BILL` via `AUTOPAYRQSTAMNT`/`INTENT`, `GRM_VOID ⇄ GRM_BANK`
via `CARDENDINGWD`/`WALLETPYMNT`). A cycle still can't be resolved by
"compile A, then compile B" in either order, so the conclusion that a
simple staged/prepend model is inconsistent with the data still holds —
just for a smaller, now correctly-identified set of categories.

`GRM_APPOINTMENT`, `GRM_EVENT`, `GRM_OTP`, `GRM_STOCKUPDATES`, and
`GRM_TRAVEL` were previously shown inside or adjacent to the big cycle
largely because of the counting bug; with local producers correctly
excluded, they only have outbound required/ambiguous dependencies (or
none), not cyclic ones.

The Java trace adds stronger configuration evidence without yet proving the
matcher's traversal policy. `g40.d0.q()` returns all 13 categories, including
`GRM_VOID`; the per-message parser call passes that list to `g40.d0.N(...)`;
and `d61.baz.l(...)` can assemble the selected categories into combined GRMR
and STRUCT roots. This proves the Java path is configured with the full
category set rather than only the TS-routed category. Whether every combined
branch is attempted for every message, or a later runtime gate narrows it,
remains open until `g40.d0.N`/the matcher call path is traced.

### 1e. Producer/consumer layer-index relationship (required edges only)

| Relationship                                        | Count |
| --------------------------------------------------- | ----- |
| producer's layer index is _later_ than consumer's   | 81    |
| producer's layer index is the _same_ as consumer's  | 54    |
| producer's layer index is _earlier_ than consumer's | 19    |

Still no consistent ordering — a producer is more often later than earlier,
but both directions are common. Layer index alone still doesn't encode a
global execution order across categories; this remains evidence against a
simple staged-layer-merge, though the earlier "no pattern at all" framing
is softened slightly (later is roughly 4x more common than earlier, not
statistically flat) — worth keeping in mind during bytecode tracing rather
than treated as fully random.

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
- 0 keys are redundantly defined with the _same_ result by >1 category.
- **9 keys collide: the same `prev-next` transition is claimed by two (or
  three) categories with _different_ result types.**

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

**Worth tracing together with multiplier semantics (§5):** three of the
nine collisions pit rules with _different_ `<N>` multipliers against each
other on the same pair transition — `AMT-AUX` (`INTENTDUE<3>` vs.
`TRXDECLINE<5>`), `TRANSINTENT-AUX` (`INTENTDUE<3>` vs. `TRXINIT<5>`), and
`AUX-RESCHE` (`PNRALERT` — no multiplier — vs. `BILLRESCHE<2>` vs.
`TRXDECLINE<5>`). If the real Java engine uses `<N>` for anything like
priority, confidence weighting, or explicit collision resolution between
competing rules on the same transition, these three collisions are exactly
where that would be observable — a `<5>` rule consistently beating a `<3>`
rule (or vice versa) across multiple collision sites would be a strong
signal, a coincidence would suggest `<N>` is unrelated to collision
resolution. Flagged as a specific, testable hypothesis for the bytecode
pass rather than assumed either way.

## 4. Global reachability — "truly unreachable" symbols

Computed a fixed point: starting from every terminal token **type**
(383 distinct base type names from `TOKENS` keys, after stripping bracket
attrs and the trailing-digit numbered-variant suffix the way
`keyword-tokenizer.ts`'s `baseType()` does — this is a count of distinct
_type names_, not the 1,167 keyword _phrase entries_ tallied in §6, which
is a different measurement of the same dictionary — plus 24
`regex-tokenizer.ts` output types, 407 terminals total), then repeatedly
mark a `GRMR` result-symbol reachable once **at least one of its
comma-separated rule alternatives** has every referenced input type
reachable (not "all tokens across every alternative combined" — the first
pass's bug, corrected below), allowing a symbol from _any_ category to
satisfy a dependency (the most generous possible "everything is globally
merged, no collisions, no ordering issues" scenario).

- 512 distinct `GRMR` result-symbols total, across 1,232 rule alternatives.
- **475 reachable** — including `TRANSINTENT` and `INTENT`, both confirmed
  reachable, matching their observed runtime behavior directly (verified:
  `engine.parse("Rs.500 debited...")` does produce a `TRANSINTENT`-derived
  result in practice). The first pass's flat dependency-merge had wrongly
  marked both unreachable because _some_ alternative among several
  referenced an exotic token — the fix requires only one full alternative
  to work, matching how `grammar-runner.ts` actually evaluates rules.
- **37 remain unreachable** even under the most generous global-merge
  hypothesis (down from the erroneous 169).

### Where the 37 actually cluster

| Blocked on                                              | Count                                                        | Symbols                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `URL`                                                   | 18 direct (+3 more transitively, via a `URL`-blocked symbol) | `ACKNWLDGDLVRYURL`, `AVAILURL`, `CASHBCKURL`, `JOINURL`, `LINKADHRURL`, `LOGINURL`, `MANAGEDLVRYURL`, `MANAGEURL`, `MNGDATAURL`, `MOREINFOURL`, `ORDERURL`, `PAYLINK`, `RCHRGURL`, `RECEIPTURL`, `TRACKDLVRYURL`, `TRACKMISSEDCALLSURL`, `VIEWBRDINGPASSURL`, `WBCHKURL` (+ `CHECKTRXURL`, `FEEDBACKURL`, `PAYURL` transitively) |
| `IDVAL`                                                 | 4                                                            | `BKNGID`, `BUSID`, `OTPIDVAL`, `TICKETNUM`                                                                                                                                                                                                                                                                                       |
| other (`SEATNUM`, `AIRPORT`, `LOCATION`, `VHRGID`, ...) | 15                                                           | see appendix                                                                                                                                                                                                                                                                                                                     |

**New finding from the correction: `URL` is now the dominant blocker (21
of 37, ~57%), not `IDVAL`.** Confirmed by direct inspection — there is no
`TOKENS` key named `URL`, and grepping `regex-tokenizer.ts` for any
URL-detection logic (`http`, `https`, `www`, a URL regex pattern) returns
nothing. The Java engine almost certainly has a URL-matching rule (real
bank/delivery/offer SMS routinely contain bit.ly-style or direct links)
that the TS port's regex-tokenizer simply never implemented. Unlike the
`IDVAL`/`CLASSIFIER.CLS_ID` connection below, this doesn't need bytecode
tracing to be plausible — it's a concrete, well-defined, checkable gap:
does `regex-tokenizer.ts` need a `TY_URL` pattern. Worth a quick check
against real SMS samples containing links before assuming it's the
explanation, but it's the more actionable of the two leads right now.

**`IDVAL`/`CLASSIFIER.CLS_ID` remains a good hypothesis, at reduced
scope.** `IDVAL` is referenced by `REFNO`, `TRXID`, `BKNGID`, `PNRID`,
`TICKETNUM`, `ORDERIDVAL`, `TRACKINGIDVAL`, `OTPIDVAL`, `TRIPCODEVAL`,
`BUSID` — but only 4 of those (`BKNGID`, `BUSID`, `OTPIDVAL`,
`TICKETNUM`) are actually unreachable overall, because `REFNO`,
`TRXID`, `ORDERIDVAL`, and `TRACKINGIDVAL` turned out to have _other_,
already-reachable alternatives that don't need `IDVAL` at all — the exact
kind of thing the alternative-level fix was needed to see correctly.
`CLASSIFIER.CLS_ID`'s word list (`REF`, `PNR`, `TICKETNO`, `TRIPCODE`,
`BUSNO`, `TRANSID`, `ORDERID`, `TRACKINGID`, `BOOKINGID`, ...) still lines
up closely with the _remaining_ stuck symbols, so the hypothesis that
`CLASSIFIER.CLS_ID` drives a generic identifier-marker mechanism outside
`TOKENS`/`GRMR` is retained — but the earlier claim that it would resolve
"roughly a third of the 169" is withdrawn as unsupported. At the corrected
scale it would resolve 4 of 37 symbols directly, plus whatever it
transitively unblocks (not separately computed here).

Two smaller anomalies, unaffected by either correction (flagged for manual
review, not folded into the main count): `APRVEDAMT` and `CHQCLRING` are
each blocked by a `{N:type}` skip-gap allowlist containing the bare English
word `for` instead of a token type name (from `"APPROVE {3:for}AMT"`) —
most likely a seed-data quirk, not a porting gap, since no token is ever
typed `"for"` regardless of how the graph is built.

Full 37-symbol list with each one's specific blocking dependency is in the
appendix at the bottom of this document.

## 4b. `PATTERN` / `STRUCT` compliance (91 + 20 = 111 entries)

All 111 entries remain mechanically inventoried below. The Java trace now
shows that they are not two names for one instruction set.

### JSON inventory versus the two runtimes

- The APK loader stores all three arrays (`GRMR`, `STRUCT`, and `PATTERN`).
- The complete `ga3.baz.g()` body compiles `GRMR` and `STRUCT`, but reads the
  stored `PATTERN` field zero times. Therefore all 91 `PATTERN` entries are
  dormant in this APK version.
- Java compiles each `STRUCT` by splitting on spaces. A word beginning with
  `#` marks a capture on the current trie node; every other word is a literal
  token-type edge. No `{N}` or `TOKEN|(literal)` syntax is parsed by the
  STRUCT compiler.
- The TS port instead concatenates `PATTERN` and `STRUCT` and runs all 111
  strings through `pattern-extractor.ts`'s richer interpreter. It does so
  after grammar processing. This is a confirmed parity divergence: TS
  executes 91 entries Java does not and models STRUCT with PATTERN syntax.

The downstream Java STRUCT traversal and capture boundaries still require
the matching runtime call path. Compilation alone does not prove how an
arbitrary-word span is selected or how competing captures resolve.

### Mechanical JSON shape inventory (all 111 entries)

| Shape                                                  | Count                                                         |
| ------------------------------------------------------ | ------------------------------------------------------------- |
| bare token (`TOKEN`)                                   | 189                                                           |
| capture (`#name`)                                      | 100                                                           |
| skip-with-stop (`{N}\|TOKEN`)                          | 71                                                            |
| token-or-literal (`TOKEN\|(literal)`)                  | 31                                                            |
| `{N}\|#name` (swallowed by the current TS interpreter) | **26**                                                        |
| token-or-literal-alternatives (`TOKEN\|(a,b,c)`)       | 3                                                             |
| literal-only (`(literal)`, standalone)                 | 0 — never occurs in practice, despite being documented syntax |

### TS-only finding: 24 PATTERN entries cannot produce a capture

This is directly provable behavior of the current TS interpreter, but it is
not a missing Java behavior: all 91 PATTERN entries are dormant in the traced
APK. Repairing these 24 entries would therefore be a product extension, not a
Truecaller-parity fix.

The doc comment in `pattern-extractor.ts` describes `{N}|TOKEN` ("skip up
to N tokens, stop if TOKEN is found"). The seed data contains a related
but different shape: `{N}|#name` — e.g. `"AMT {2}|#vendor"`. Because
`parsePatternString` splits on whitespace _first_, and there is no space
between `|` and `#vendor`, the entire substring `{2}|#vendor` is one
whitespace token. It gets parsed as a single **skip** element whose
`stopType` is the literal string `"#vendor"` (hash included) — **not** as
a skip element followed by a separate capture element. Since no real
token ever has `type === "#vendor"`, the stop condition can never fire,
and — critically — **no capture element for `vendor` gets created at
all**. `compilePatterns` then derives that pattern's `name` as `"unknown"`
(no capture element to name it from), and `tryMatchAt`'s final check
(`Object.keys(captures).length > 0 ? captures : null`) always returns
`null` for these, because there is no way for `captures` to ever gain a
key. The pattern still runs (wastes a full start-position scan on every
parse) but can **never** contribute a field to the result.

Confirmed by direct execution of the current TS parsing logic, not just
static reading of the string:

```
GRM_BANK:PATTERN[8]   INS {3}|PREPV|(at) {3}|#vendor
GRM_BANK:PATTERN[11]  TRX {5}|INS {5}|PREPV|(at) {5}|#vendor
GRM_BANK:PATTERN[12]  FAVRG {4}|#vendor
GRM_BANK:PATTERN[14]  AMT {8}|INSTRNO {9}|#vendor
GRM_BANK:PATTERN[15]  INSTRNO {8}|AMT {8}|#vendor
GRM_BANK:PATTERN[17]  AMT {2}|#vendor
GRM_OTP:PATTERN[1]    AMT {2}|#vendor
GRM_OTP:PATTERN[2]    AMT {8}|INSTRNO {5}|#vendor
GRM_TRAVEL:PATTERN[4] DEPART GATE {2}|#boardgate
GRM_TRAVEL:PATTERN[5] FLIGHT {4}|#from_loc {2}|PREP|(to) {2}|#to_loc
GRM_TRAVEL:PATTERN[6] PREPV {2}|#from_loc {2}|PREP|(to) {2}|#to_loc
GRM_BILL:PATTERN[3]   SAL {1}|#billvendor {1}|CUST TRANS
GRM_BILL:PATTERN[7]   RECHRG {2}|PREP|(of) {2}|#billvendor
GRM_BILL:PATTERN[12]  BILL PREP|(of) {4}|AMT PREPV|(for,towards) {1}|#billvendor
GRM_BILL:PATTERN[18]  DET {1}|#billvendor {2}|INS
GRM_BILL:PATTERN[19]  INSTRNO {2}|#billvendor {2}|AUX {2}|DUE
GRM_OFFERS:PATTERN[0] TRX AMT PREP {2}|#vendor
GRM_STOCKUPDATES:PATTERN[0] STOCKEXCHNG {0}|IDVAL {1}|#vendor AMT
GRM_DELIVERY:PATTERN[8]  ORDSTATUS PREPV|(for) {2}|#item
GRM_DELIVERY:PATTERN[9]  ORDSTATUS PREP|(with) {2}|#item
GRM_DELIVERY:PATTERN[13] PICKUP {3}|DET {1}|#item
GRM_DELIVERY:PATTERN[21] SAL {1}|PREPV|(for) USE {2}|#item
GRM_DELIVERY:PATTERN[22] BOOK {1}|PREP|(with) {2}|#item
GRM_DELIVERY:PATTERN[23] ORDSTATUS {2}|DET {1}|NUM {0}|#item
```

These entries name fields used by the dashboard, so enabling PATTERN could
materially change merchant, bill-vendor, item, and travel labels. However,
the earlier claim that this is likely the root cause of garbled labels is
withdrawn. Java does not execute these entries, and no Java capture result
has been reproduced from them. Any TS repair needs an explicit product
decision plus golden-message expectations.

### Other TS-interpreter observations

- **11 entries have more than one capture**, **45 entries end in a capture
  with no trailing anchor to bound it** (the TS capture logic handles this —
  it just consumes to the end of the token stream, filtered by the
  structural-token-type stoplist — but it does mean no anchor tests
  whether the capture over-consumed unrelated trailing text).
- **Zero adjacent capture pairs** (`#a #b` with nothing between) occur in
  the actual data, despite the parser having no special handling for that
  shape (worth knowing it's untested, not that it's broken).
- **2 PATTERN entries have a `{0}` skip clause** (`GRM_STOCKUPDATES:PATTERN[0]`,
  `GRM_DELIVERY:PATTERN[23]`) — by the code's own logic (`skipped < el.max`
  with `max=0`), these are permanent no-ops; harmless, but dead syntax
  wherever they appear.
- **`(literal)` as a standalone element (no preceding `TOKEN|`) never
  occurs** in the actual 111 entries, despite being valid, implemented
  syntax per the doc comment — untested code path, not necessarily broken.

## 5. `<N>` multiplier inventory

140 of 533 `GRMR` result-keys (26%) carry a `<N>` multiplier:

| N     | Count | Example                                     |
| ----- | ----- | ------------------------------------------- |
| `<2>` | 79    | `CASHBACKTOCARD[trx]<2>`, `UPITRX[trx]<2>`  |
| `<3>` | 50    | `AUTODBTSUCCES[trx]<3>`, `OTPIDVAL[otp]<3>` |
| `<4>` | 6     | `OTPNO[otp]<4>`, `MAKETXNSGETOFFER<4>`      |
| `<5>` | 5     | `TRCONV[conv]<5>`, `TRXDECLINE[decline]<5>` |

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

| Shape                       | Count | Example                                                |
| --------------------------- | ----- | ------------------------------------------------------ |
| plain phrase                | 784   | `debited`                                              |
| `phrase\|normalizedvalue`   | 380   | `dr\|debit`                                            |
| `phrase\|[a;b;c;d]`         | 2     | `expire\|[verb;past]`, `picked\|[pickedup;;past;verb]` |
| `phrase[a;b;c;d]` (no pipe) | 1     | `picked up[pickedup;;past;verb]`                       |

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

| Attr        | Keys using it | Example                                               |
| ----------- | ------------- | ----------------------------------------------------- |
| `_pos`      | 22            | `DET[_pos=det]`, `AUX[_pos=aux]`                      |
| `_tense`    | 10            | `TRX[type,_tense=past,_pos=verb,_negation=negatable]` |
| `_negation` | 7             | same `TRX`/`TRX1`/`TRX2`/`TRANS`/`ORDSTATUS5` family  |
| `_chunk`    | 2             | `COURIER[_chunk=true]`, `PRECODE[_chunk=true]`        |
| `_context`  | 1             | `SPNDLMT[_context=limit]`                             |

All five are parsed generically by `keyword-tokenizer.ts:37-40` (any
`_key=value` → `attrs[key] = value`, stripping the underscore) and get
merged into a matched token's `values` at match time. **None are read
anywhere downstream** — grepped `grammar-runner.ts`, `pattern-extractor.ts`,
`malana.ts`, `enrichment.ts` for `"pos"`, `"tense"`, `"negation"`,
`"chunk"`, `"context"` as read-sites (not just the string constants) and
found zero consumers.

Java differs for `_chunk`: `ra3.bar.d()` explicitly returns true for a token
whose attribute map contains `chunk=true` (and for `GDO_NONDET`). This proves
the Java token model preserves and interprets `_chunk`; the downstream effect
of that predicate still needs its call sites. No equivalent predicate exists
in the TS port.

**`_negation=negatable` on `TRX`/`TRX1`/`TRX2`/`TRANS` is the one most
worth flagging beyond the original two.** Those are the core transaction
verb tokens (`debited`, `credited`, etc.). A `_negation` marker on exactly
the transaction-verb token family strongly suggests the seed was designed
to let the Java engine recognize a negated transaction statement — "amount
was **not** debited", "transaction **failed** to complete" — and avoid
treating it as a real transaction.

**Confirmed at runtime, not just statically.** Ran the actual engine
against two negated messages:

```
"Rs.500 was not debited from A/c XX1234." -> trx: null, trxTypeRich: "EXPENSE"
"Rs.500 was not credited to your account." -> trx: null, trxTypeRich: "INCOME"
```

`trxTypeRich` is wrong in both cases — the negation is dropped and the
message is classified with a direction it doesn't have. **Practical impact
is narrower than it first looks, though:** `trx` stays `null` in both
cases (no amount pattern matches "not debited" the way it matches a real
debit), and `apps/native/lib/dashboard.ts`'s totals/Recent-list/subscription
logic all gate on `parseAmount(result.trx) !== null` before a message
contributes anything — so this specific case doesn't reach monthly totals
or the dashboard today. It's still semantically wrong at the parser layer
(a negated/failed-transaction SMS reporting `trxTypeRich` at all is
misleading for any future consumer, filter, or UI that trusts that field
directly), just not currently a demonstrated source of corrupted totals.
The metadata backs this up further: `seed.TOKENS` has a real
`NEGATION[_negation=negater]` key with keywords `could'nt, wouldn't,
couldnot, cannot, unable, not, don't, ...` — a dedicated negation-marker
token type sitting right alongside `TRX`'s `_negation=negatable`. Two
halves of a matched pair (`negater` finds a `negatable`) exist in the seed;
the TS engine parses both `_negation` values into token `values` (per §7's
opening) but nothing anywhere combines them.

## 9. Other JSON assets (12 files, non-`seeddata.json`)

Every JSON file in `src/malana/data/` besides `seeddata.json`, mechanically
inventoried by `scripts/dsl-audit/other_assets_inventory.py` — shape,
size, and TS consumer confirmed by grep (not assumed):

| File                            | Shape                                                                                                                                  | Consumer(s)                                                                                                                                                                          |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `categorizer.json` (502.5KB)    | `{probabilities: [3708 x {word, probability:[6]}], meta:[...], version}`                                                               | `enrichment.ts` — Naive Bayes spam classifier. `probability[2..5]`/`meta[2..9]` are training-corpus stats not used for inference (documented in-code, verified earlier this session) |
| `addr.json` (5.9KB)             | `{category: [sender IDs]}` × 6 categories                                                                                              | `enrichment.ts` `grammarForSender`                                                                                                                                                   |
| `airport.json` (2.0KB)          | `{city: IATA code}` × 101                                                                                                              | `enrichment.ts` city→IATA lookup                                                                                                                                                     |
| `bank.json` (1.6KB)             | `{bank name: [sender IDs]}` × 32                                                                                                       | `enrichment.ts` `detectBank`                                                                                                                                                         |
| **`blacklist.json` (1.6KB)**    | `{version, countries: [{country_code, shingles, ngrams, min_sim_score, patterns: [{type, subtype, threshold, sub-patterns: [...]}]}]}` | **NONE — confirmed via repo-wide grep across `packages/parser` and `apps/native`, zero references anywhere**                                                                         |
| `location.json` (68.1KB)        | `[4829 place names]`                                                                                                                   | `enrichment.ts` gazetteer membership set                                                                                                                                             |
| `offers.json` (3.6KB)           | `{category: [sender codes]}` × 8                                                                                                       | `enrichment.ts` promo sender→category                                                                                                                                                |
| `upi.json` (1.5KB)              | `{handles: [111 strings]}`                                                                                                             | `enrichment.ts` `detectUpiHandle`                                                                                                                                                    |
| `vendor_banks.json` (0.6KB)     | `{bank name: [aliases]}` × 13                                                                                                          | `enrichment.ts` `detectBank` fallback, `vendor-category-matcher.ts`                                                                                                                  |
| `vendor_brands.json` (3.3KB)    | `{brand: {tokens:[...], tags:[...]}}` × 38                                                                                             | `enrichment.ts` `detectBrand` (both fields consumed — checked every entry, no field beyond `tokens`/`tags` exists anywhere in the file)                                              |
| `vendor_operators.json` (0.7KB) | `[79 strings]`                                                                                                                         | `vendor-category-matcher.ts`                                                                                                                                                         |
| `vendor_seed.json` (5.6KB)      | `{category: [keywords]}` × 31                                                                                                          | `vendor-category-matcher.ts`                                                                                                                                                         |

**`blacklist.json` is a real, substantial, entirely unused asset** — a
shingle/n-gram fuzzy-similarity spam-detection configuration (per-country
thresholds, typed spam patterns like `rummy`/dating-scam templates with
example sub-pattern phrases) bundled into the package but never imported
by any TS file. This is a completely different spam-detection mechanism
from the one actually running (`categorizer.json`'s Naive Bayes
classifier in `enrichment.ts`'s `detectSpam`) — not a redundant duplicate,
a wholesale missing subsystem.

**Depth of this pass, stated precisely:** shape, size, and consumer are
confirmed for all 12 files (mechanical, exhaustive — every file, every
top-level key counted). Per-field semantic checks (duplicate/malformed
entries within each file, ordering-dependence, cross-file collisions
between e.g. `bank.json` and `vendor_banks.json`'s alias lists) were done
for `categorizer.json` and `vendor_brands.json` specifically (both
pre-existing findings from earlier this session, reconfirmed here) but
**not** exhaustively for the other 10 — that remains open scope, distinct
from "inventoried."

## 10. Reproducibility

Three scripts, committed alongside this document at
`packages/parser/scripts/dsl-audit/`, regenerate every number in this
report deterministically from `seeddata.json` and the `data/` directory —
prose totals are no longer the only record, given that two of them
contained modeling bugs in an earlier pass:

- `seed_grammar_inventory.py` — `TOKENS`/`GRMR`/`CLASSIFIER` analysis:
  dependency classification, required/ambiguous cross-category edges,
  SCCs, multi-producer symbols, corrected reachability, pair-map
  collisions, `<N>` multiplier counts, `TOKENS` bracket-annotation and
  underscore-attr inventories.
- `pattern_struct_inventory.py` — `PATTERN`/`STRUCT` JSON element-shape
  classification and the TS-only swallowed-capture observation (§4b). Java
  execution facts come from the separately supplied Java/smali trace.
- `other_assets_inventory.py` — shape/consumer inventory for the 12
  non-`seeddata.json` assets (§9), with an assertion that every file in
  `data/` is covered by some script.

Each script prints `[assertion]`-prefixed lines for every count that
matters and hard-`assert`s a few invariants directly (all 111
`PATTERN`+`STRUCT` entries accounted for; `TRANSINTENT`/`INTENT`
reachable, matching confirmed runtime behavior; every file in `data/`
covered by some script). Run with `python3 scripts/dsl-audit/<script>.py`
from `packages/parser/`; requires `networkx` for
`seed_grammar_inventory.py`'s SCC computation.

## 8. Summary table

| #   | Construct                                                        | TS status                                                                                                                                                                                                | Confidence                                                                                             |
| --- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 1   | `<N>` multiplier                                                 | Parsed, stored, never read (140/533 rules affected)                                                                                                                                                      | Confirmed                                                                                              |
| 2   | `phrase\|[a;b;c;d]` bracket annotation                           | Literal string, fields never decoded (2 entries)                                                                                                                                                         | Confirmed                                                                                              |
| 2b  | `phrase[a;b;c;d]` (no pipe)                                      | Entire string becomes unmatchable keyword (1 entry)                                                                                                                                                      | Confirmed                                                                                              |
| 3   | `_chunk`, `_context`, `_pos`, `_tense`, `_negation`              | TS parses all into `values` but reads none. Java `ra3.bar.d()` interprets `chunk=true`; downstream call sites remain open                                                                                | TS gap and Java predicate confirmed                                                                    |
| 4   | Cross-category grammar composition                               | 39 required + 18 ambiguous edges, 8-category SCC, 9 naive-merge collisions. Java passes all 13 categories to its per-message parser and can build combined GRMR/STRUCT roots                             | Configuration confirmed; runtime traversal/resolution still unconfirmed                                |
| 5   | `RECURR`/`SUBSCRPTN`/`AUTORENEW`/`EMANDATE`/`STNDNGINS`/`AUTDBT` | Only `RECURR` is grammar-unused; the rest are real seed-grammar inputs the TS engine doesn't specifically surface                                                                                        | Corrected this session — see below                                                                     |
| 6   | `PATTERN` versus `STRUCT` execution                              | Java loads but does not compile any of the 91 PATTERN entries; it compiles the 20 STRUCT entries as token edges plus `#capture`. TS concatenates and executes both tables through one richer interpreter | Java compilation and TS divergence confirmed; Java STRUCT traversal still open                         |
| 6b  | TS-only PATTERN matching                                         | 24 PATTERN entries produce zero captures because `{N}\|#name` is swallowed into a skip stop type. Fixing this would extend behavior beyond this APK, not restore parity                                  | Confirmed TS behavior; withdrawn as Java bug and merchant-label root cause                             |
| 7   | `CLASSIFIER.CLS_ID`                                              | Validated by schema, never read; plausibly the producer of `IDVAL` (4 of 37 unreachable symbols) — `URL` (21 of 37) is now the bigger, more concrete lead                                                | Confirmed unused; production-mechanism hypothesis unconfirmed, reduced scope after correction          |
| 8   | `URL` token type                                                 | No `TOKENS` entry, no regex-tokenizer rule — real bank/delivery/offer links in SMS have nowhere to match                                                                                                 | New this pass — concrete, checkable without bytecode                                                   |
| 9   | `TRX`/`NEGATION` negation pairing                                | Both halves exist in seed (`TRX[..._negation=negatable]`, `NEGATION[_negation=negater]`); TS parses both, combines neither. Runtime-confirmed: `trxTypeRich` set on a negated debit/credit SMS           | Confirmed both statically and at runtime; `trx` stays null so today's dashboard totals aren't affected |
| 10  | `blacklist.json`                                                 | Real shingle/n-gram spam-detection config, zero TS consumers — a wholesale missing subsystem, not a redundant duplicate of the working Naive Bayes classifier                                            | Confirmed unused                                                                                       |

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

Checked against the corrected reachability analysis (§4): `AUTOPAYRQSTAMNT`,
`AUTPAYEMNDT`, `DUEAMT`, and `RENTALBILL` are all **reachable** under the
global-merge hypothesis (none appear in the corrected 37-symbol
unreachable list) — the earlier framing here, written before the
reachability bug was found and fixed, incorrectly implied several of them
might not be. "The token is a real grammar input" and "the rule that
consumes it can currently fire in the TS engine today" remain two separate
questions in general (reachability here assumes a hypothetical global
merge that doesn't exist in the TS port yet — see §1's caution about the
8-category SCC), but for these four specific symbols the concern doesn't
apply.

---

## Appendix: full corrected 37-symbol unreachable list

Each symbol's _best_ (fewest-missing-dependency) alternative is shown —
i.e. even its most promising rule alternative still can't be satisfied
under the most generous global-merge hypothesis.

```
ACKNWLDGDLVRYURL     blocked on URL
AIRPORTS             blocked on AIRPORT
AVAILURL             blocked on URL
BAGTAGNUM            blocked on FLTIDVAL
BKNGID               blocked on IDVAL
BUSID                blocked on IDVAL
CABBKIG              blocked on VHRGID
CASHBCKURL           blocked on URL
CHECKTRXURL          blocked on MOREINFOURL
EMANDTTRXINTENT      blocked on EMANDTACTIV
EMANDTTRXINTENT2     blocked on EMANDTTRXINTENT
FEEDBACKURL          blocked on MOREINFOURL
FLTALERT             blocked on FLTIDVAL
GATALERT             blocked on FLTIDVAL
ITINERARY            blocked on LOCATION
JOINURL              blocked on URL
LINKADHRURL          blocked on URL
LOGINURL             blocked on URL
MANAGEDLVRYURL       blocked on URL
MANAGEURL            blocked on URL
MNGDATAURL           blocked on URL
MOREINFOURL          blocked on URL
NEWLOAN              blocked on INS3
ORDERURL             blocked on URL
OTPIDVAL             blocked on IDVAL
PAYLINK              blocked on URL
PAYURL               blocked on LOGINURL
RCHRGURL             blocked on URL
RECEIPTURL           blocked on URL
SEATNUMB             blocked on SEATNUM
SMSCDNO              blocked on SMSCODE
SMSTONO              blocked on SMSCODE
TICKETNUM            blocked on IDVAL
TRACKDLVRYURL        blocked on URL
TRACKMISSEDCALLSURL  blocked on URL
VIEWBRDINGPASSURL    blocked on URL
WBCHKURL             blocked on URL
```

21 of 37 (57%) trace to `URL` (18 directly, 3 transitively through
`MOREINFOURL`/`LOGINURL`). 4 trace to `IDVAL`. The remaining 12 are
scattered single-symbol dead ends (`AIRPORT`, `VHRGID`, `LOCATION`,
`INS3`, `SEATNUM`, `SMSCODE`, `FLTIDVAL`, `EMANDTACTIV` — each referenced
by 1-3 symbols, none individually as consequential as `URL` or `IDVAL`).
