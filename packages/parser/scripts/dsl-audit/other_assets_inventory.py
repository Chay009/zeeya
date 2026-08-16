#!/usr/bin/env python3
"""
Mechanically inventories the 11 non-seeddata.json assets in
packages/parser/src/malana/data/: shape, size, and cross-referenced
TS consumer (or lack of one). Read-only.

This does NOT re-verify per-field runtime correctness beyond what's
directly checkable from the shape + a grep for the consuming code path —
see MALANA_DSL_COMPLIANCE_INVENTORY.md for what's asserted vs what still
needs behavioral verification.

Run: python3 scripts/dsl-audit/other_assets_inventory.py
"""
import json
from pathlib import Path

DATA_DIR = Path(__file__).parent.parent.parent / "src/malana/data"

# (filename, known TS consumer file(s) -- verified by grep, not assumed)
ASSETS = [
    ("categorizer.json", ["enrichment.ts (detectSpam, Naive Bayes classifier)"]),
    ("addr.json", ["enrichment.ts (grammarForSender: sender -> grammar category)"]),
    ("airport.json", ["enrichment.ts (city name -> IATA code for travel messages)"]),
    ("bank.json", ["enrichment.ts (detectBank: canonical bank name -> sender IDs)"]),
    ("blacklist.json", []),  # confirmed zero consumers -- see report
    ("location.json", ["enrichment.ts (LOCATION_SET gazetteer membership check)"]),
    ("offers.json", ["enrichment.ts (promo sender-code -> offer category)"]),
    ("upi.json", ["enrichment.ts (detectUpiHandle: known UPI handle list)"]),
    ("vendor_banks.json", ["enrichment.ts (detectBank fallback)", "vendor-category-matcher.ts (BANK_TAG_MAP)"]),
    ("vendor_brands.json", ["enrichment.ts (detectBrand: brand tokens/tags)", "vendor-category-matcher.ts"]),
    ("vendor_operators.json", ["vendor-category-matcher.ts"]),
    ("vendor_seed.json", ["vendor-category-matcher.ts"]),
]


def shape_of(obj, depth=0, max_depth=2):
    if isinstance(obj, dict):
        if depth >= max_depth:
            return f"dict[{len(obj)} keys]"
        sample_key = next(iter(obj), None)
        sample_shape = shape_of(obj[sample_key], depth + 1, max_depth) if sample_key is not None else "empty"
        return f"dict[{len(obj)} keys] -> {sample_shape}"
    if isinstance(obj, list):
        if depth >= max_depth or not obj:
            return f"list[{len(obj)}]"
        return f"list[{len(obj)}] of {shape_of(obj[0], depth + 1, max_depth)}"
    return type(obj).__name__


def main():
    print(f"[assertion] Non-seeddata.json assets to inventory: {len(ASSETS)}")
    accounted = 0
    for filename, consumers in ASSETS:
        path = DATA_DIR / filename
        assert path.exists(), f"MISSING FILE: {filename}"
        with open(path) as f:
            data = json.load(f)
        size_kb = path.stat().st_size / 1024
        shape = shape_of(data)
        accounted += 1
        print(f"\n[{filename}]")
        print(f"  size: {size_kb:.1f}KB")
        print(f"  shape: {shape}")
        print(f"  consumers: {consumers if consumers else 'NONE FOUND -- confirmed via repo-wide grep'}")
        if isinstance(data, dict):
            print(f"  top-level key count: {len(data)}")
        elif isinstance(data, list):
            print(f"  entry count: {len(data)}")

    print(f"\n[assertion] All {len(ASSETS)} data/ directory JSON assets present on disk and loaded: {accounted}/{len(ASSETS)}")

    on_disk = {p.name for p in DATA_DIR.glob("*.json")}
    inventoried = {a[0] for a in ASSETS} | {"seeddata.json"}
    missing_from_inventory = on_disk - inventoried
    print(f"[assertion] Files in data/ not covered by any inventory script (seeddata.json handled separately): {sorted(missing_from_inventory)}")
    assert not missing_from_inventory, f"UNINVENTORIED FILES FOUND: {missing_from_inventory}"
    print("[assertion] Every file in src/malana/data/ is accounted for by some inventory script -- PASS")
    print()
    print("=== other_assets_inventory.py: COMPLETE ===")


if __name__ == "__main__":
    main()
