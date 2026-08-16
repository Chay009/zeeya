#!/usr/bin/env python3
"""
Inventories every PATTERN and STRUCT entry in seeddata.json, classifies every
space-separated element by syntactic shape, and cross-checks each shape
against pattern-extractor.ts's parsePatternString()/tryMatchAt() (ported
faithfully below, mirroring the actual TS logic line for line).

Read-only. Companion to seed_grammar_inventory.py and
other_assets_inventory.py. See MALANA_DSL_COMPLIANCE_INVENTORY.md for the
narrative writeup this feeds, in particular the "swallowed capture" finding
below (24 of 111 entries never produce any capture at all).

Run: python3 scripts/dsl-audit/pattern_struct_inventory.py
"""
import json
import re
from collections import defaultdict, Counter
from pathlib import Path

SEED_PATH = Path(__file__).parent.parent.parent / "src/malana/data/seeddata.json"


def load_seed():
    with open(SEED_PATH) as f:
        return json.load(f)


# ---- Faithful port of pattern-extractor.ts's parsePatternString ----
def parse_pattern_string(pat: str):
    els = []
    parts = [p for p in re.split(r"\s+", pat.strip()) if p]
    for part in parts:
        if part.startswith("#"):
            els.append({"kind": "capture", "name": part[1:]})
            continue
        if part.startswith("{"):
            close = part.find("}")
            inner = part[1:] if close == -1 else part[1:close]
            after = part[close + 1 :] if close != -1 else ""
            try:
                mx = int(inner)
            except ValueError:
                mx = 0
            stop_type = after[1:] if after.startswith("|") else None
            els.append({"kind": "skip", "max": mx, "stopType": stop_type})
            continue
        pipe_idx = part.find("|(")
        if pipe_idx != -1:
            typ = part[:pipe_idx]
            lit = part[pipe_idx + 2 : -1] if part.endswith(")") else part[pipe_idx + 2 :]
            els.append({"kind": "tok", "type": typ, "literal": lit})
        elif part.startswith("(") and part.endswith(")"):
            els.append({"kind": "tok", "type": "", "literal": part[1:-1]})
        else:
            els.append({"kind": "tok", "type": part, "literal": None})
    return els


def classify_element(el):
    if el["kind"] == "capture":
        return "capture (#name)"
    if el["kind"] == "skip":
        if el["stopType"]:
            if el["stopType"].startswith("#"):
                return "skip-with-SWALLOWED-capture ({N}|#name, no space -- BUG)"
            return "skip-with-stop ({N}|TOKEN)"
        return "skip ({N})"
    if el["type"] and el["literal"] is not None:
        return "token-or-literal-alternatives (TOKEN|(a,b,c))" if "," in el["literal"] else "token-or-literal (TOKEN|(literal))"
    if not el["type"] and el["literal"] is not None:
        return "literal-only-alternatives ((a,b,c))" if "," in el["literal"] else "literal-only ((literal))"
    return "bare-token (TOKEN)"


def main():
    seed = load_seed()
    grammar = seed["GRAMMAR"]

    shape_counts = Counter()
    shape_examples = defaultdict(list)
    per_section_counts = {"PATTERN": 0, "STRUCT": 0}
    entries_seen = 0
    all_entries = []
    broken_no_capture = []
    multi_capture = 0
    end_in_capture = 0
    adjacent_captures = 0
    zero_max_skip = []

    for cat, entry in grammar.items():
        for section in ("PATTERN", "STRUCT"):
            values = entry.get(section, [])
            per_section_counts[section] += len(values)
            for i, raw in enumerate(values):
                entries_seen += 1
                els = parse_pattern_string(raw)
                all_entries.append((cat, section, i, raw, els))
                for el in els:
                    shape = classify_element(el)
                    shape_counts[shape] += 1
                    if len(shape_examples[shape]) < 3:
                        shape_examples[shape].append(f"{cat}:{section}[{i}] `{raw}`")
                    if el["kind"] == "skip" and el["max"] == 0:
                        zero_max_skip.append((cat, section, i, raw))

                n_captures = sum(1 for e in els if e["kind"] == "capture")
                if n_captures == 0:
                    broken_no_capture.append((cat, section, i, raw))
                if n_captures > 1:
                    multi_capture += 1
                cap_positions = [idx for idx, e in enumerate(els) if e["kind"] == "capture"]
                if cap_positions and cap_positions[-1] == len(els) - 1:
                    end_in_capture += 1
                for a, b in zip(cap_positions, cap_positions[1:]):
                    if b == a + 1:
                        adjacent_captures += 1

    print(f"[assertion] Total PATTERN entries: {per_section_counts['PATTERN']} (expected 91)")
    print(f"[assertion] Total STRUCT entries: {per_section_counts['STRUCT']} (expected 20)")
    print(f"[assertion] Total entries inventoried: {entries_seen} (expected 111)")
    assert per_section_counts["PATTERN"] == 91
    assert per_section_counts["STRUCT"] == 20
    assert entries_seen == 111
    print()
    print("[assertion] Element shape inventory (every space-separated element, all 111 entries):")
    for shape, count in shape_counts.most_common():
        print(f"    {shape}: {count}")
    print()
    print(f"[assertion] Entries producing ZERO captures ever (dead pattern, name='unknown'): {len(broken_no_capture)}")
    for b in broken_no_capture:
        print(f"    {b[0]}:{b[1]}[{b[2]}] `{b[3]}`")
    print()
    print(f"[assertion] Entries with >1 capture: {multi_capture}")
    print(f"[assertion] Entries ending in a capture (no trailing anchor to bound it): {end_in_capture}")
    print(f"[assertion] Adjacent capture pairs (#a #b, nothing between): {adjacent_captures}")
    print(f"[assertion] {{0}} zero-max skip clauses (always a no-op skip): {len(zero_max_skip)}")
    for z in zero_max_skip:
        print(f"    {z[0]}:{z[1]}[{z[2]}] `{z[3]}`")

    with open(Path(__file__).parent / "pattern_struct_raw.json", "w") as f:
        json.dump(
            [{"category": c, "section": s, "index": i, "raw": r, "elements": e} for c, s, i, r, e in all_entries],
            f,
            indent=2,
        )

    print()
    print("=== pattern_struct_inventory.py: COMPLETE ===")


if __name__ == "__main__":
    main()
