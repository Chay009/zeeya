# Notes for Claude

## Open investigation: Truecaller's real category-resolution rules table

`g40.d0.N()` — a ~956-line decompiled Java method from the real Truecaller
APK (`Truecaller.apk` at repo root) — is the actual per-message category
resolution logic the real app uses (which of `GRM_BANK`/`GRM_TRAVEL`/
`GRM_OFFERS`/etc. wins for a given message). Traced and read partially this
session (roughly lines 280-540 of the decompiled method); the rest hasn't
been read yet.

Source, already decompiled, no need to re-run jadx/apktool:
`/tmp/jadx-out2/sources/g40/d0.java` (pre-existing in this sandbox before
any session touched it).

**Standing decision: do not port this table verbatim.** It's Truecaller's
own proprietary business logic (hardcoded sender IDs like `HDFCBK`/
`BOBTXN`/`IPAYTM`/`INSIDR`, hardcoded message-substring checks) — not
portable grammar semantics. Read-only reference to *inform* our own
category-composition design (tracked as GitHub issue #13 — "Parser:
compose multiple Malana categories without double-counting money"), not
something to copy into `packages/parser`.

See task "Inspect g40.d0.N() rules table" for the follow-up to finish
reading it.
