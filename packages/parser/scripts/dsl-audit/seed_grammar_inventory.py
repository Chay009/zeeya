#!/usr/bin/env python3
"""
Static compliance inventory for seeddata.json's TOKENS/GRMR/CLASSIFIER
sections, cross-checked against the current TS implementation
(grammar-compiler.ts, keyword-tokenizer.ts, grammar-runner.ts,
regex-tokenizer.ts). Read-only — computes numbers, does not modify
production code. Companion to pattern_struct_inventory.py (PATTERN/STRUCT)
and other_assets_inventory.py (the 11 non-seeddata.json assets).

This is the corrected version of the analysis: an earlier pass had two
modeling bugs (cross-category edges counted even when a local producer
existed; reachability required ALL alternatives to work instead of ANY
one), both fixed here. See MALANA_DSL_COMPLIANCE_INVENTORY.md for the
narrative writeup this script's output feeds.

Run: python3 scripts/dsl-audit/seed_grammar_inventory.py
"""
import json
import re
from collections import defaultdict, Counter
from pathlib import Path

SEED_PATH = Path(__file__).parent.parent.parent / "src/malana/data/seeddata.json"

REGEX_TOKENIZER_TYPES = {
    "NUM", "TAGNUM", "AMT", "PCT", "DST", "WGT", "INSTRNO", "TYP", "RATE", "DATE",
    "TIME", "TIMES", "TIMERANGE", "NUMRANGE", "STR", "PHN", "DATA", "MLTPL", "VPD",
    "USSD", "NUM_MINS", "DATERANGE", "CALLFORWARD", "MANDATEID", "URL",
}

P1 = re.compile(r"^\{([^}]*)\}(.*)$")
P2 = re.compile(r"^(.*)<(.*)>(.*)$")
P3 = re.compile(r"^(.*)\[(.*)\]$")


def strongly_connected_components(nodes, edges):
    adjacency = {node: [] for node in nodes}
    for source, target in edges:
        adjacency[source].append(target)

    index = 0
    indices = {}
    lowlinks = {}
    stack = []
    on_stack = set()
    components = []

    def visit(node):
        nonlocal index
        indices[node] = index
        lowlinks[node] = index
        index += 1
        stack.append(node)
        on_stack.add(node)

        for neighbor in adjacency[node]:
            if neighbor not in indices:
                visit(neighbor)
                lowlinks[node] = min(lowlinks[node], lowlinks[neighbor])
            elif neighbor in on_stack:
                lowlinks[node] = min(lowlinks[node], indices[neighbor])

        if lowlinks[node] == indices[node]:
            component = set()
            while True:
                member = stack.pop()
                on_stack.remove(member)
                component.add(member)
                if member == node:
                    break
            components.append(component)

    for node in nodes:
        if node not in indices:
            visit(node)
    return components


def base_type_from_tokens_key(key: str) -> str:
    b = key.split("[")[0]
    return re.sub(r"\d+$", "", b)


def parse_result_key(key: str):
    s = key
    multiplier = 1
    m2 = P2.match(s)
    if m2:
        s = ((m2.group(1) or "") + (m2.group(3) or "")).strip()
        try:
            multiplier = int(m2.group(2))
        except ValueError:
            multiplier = 1
    m3 = P3.match(s)
    attrs = {}
    if m3:
        s = (m3.group(1) or "").strip()
        for attr in (m3.group(2) or "").split(","):
            t = attr.strip()
            if not t:
                continue
            if "=" in t:
                k2, v2 = t.split("=", 1)
                attrs[k2.strip()] = v2.strip()
            else:
                attrs["_tag"] = t
    return s.strip(), attrs, multiplier


def parse_rhs_alt(alt: str):
    parts = [p for p in re.split(r"\s+", alt.strip()) if p]
    chain = []
    for part in parts:
        m = P1.match(part)
        if m:
            skip_spec = m.group(1)
            next_token = m.group(2)
            allowed = None
            if ":" in skip_spec:
                _, type_str = skip_spec.split(":", 1)
                allowed = [t.strip() for t in type_str.split(";") if t.strip()] or None
            if next_token:
                chain.append((next_token, allowed))
        elif part:
            chain.append((part, None))
    return chain


def main():
    with open(SEED_PATH, encoding="utf-8") as f:
        seed = json.load(f)
    grammar = seed["GRAMMAR"]
    tokens = seed["TOKENS"]
    categories = list(grammar.keys())

    tokens_base_types = set(base_type_from_tokens_key(k) for k in tokens.keys())
    terminals = tokens_base_types | REGEX_TOKENIZER_TYPES

    # ---- Build per-resultType alternative dep-sets, and symbol_defs ----
    symbol_defs = defaultdict(list)  # resultType -> [(cat, layer, rawKey)]
    resultType_alternatives = defaultdict(list)  # resultType -> [dep_set, ...]
    alt_rules = []  # {category, layer, resultType, deps} one per alternative

    total_grmr_keys = 0
    total_alternatives = 0
    for cat in categories:
        for li, layer in enumerate(grammar[cat].get("GRMR", [])):
            for raw_key, rules_str in layer.items():
                total_grmr_keys += 1
                result_type, _attrs, _mult = parse_result_key(raw_key)
                symbol_defs[result_type].append((cat, li, raw_key))
                for alt in rules_str.split(","):
                    total_alternatives += 1
                    chain = parse_rhs_alt(alt)
                    dep_set = set()
                    for tok, allowed in chain:
                        dep_set.add(tok)
                        if allowed:
                            dep_set.update(allowed)
                    dep_set.discard(result_type)
                    alt_rules.append(dict(category=cat, layer=li, resultType=result_type, deps=dep_set))
                    resultType_alternatives[result_type].append(dep_set)

    print(f"[assertion] GRMR result-keys inventoried: {total_grmr_keys}")
    print(f"[assertion] GRMR rule alternatives inventoried: {total_alternatives}")
    print(f"[assertion] Distinct resultTypes: {len(symbol_defs)}")
    print(f"[assertion] Terminal token types (TOKENS base + regex-tokenizer): {len(terminals)}")
    print()

    producer_cats_of = defaultdict(set)
    for sym, defs in symbol_defs.items():
        for c, _, _ in defs:
            producer_cats_of[sym].add(c)

    # ---- Corrected classification: local producer excludes an edge ----
    required_edges = defaultdict(set)
    ambiguous_edges = defaultdict(set)
    undefined_refs = defaultdict(set)
    classification_counts = Counter()
    seen_pairs = set()
    for ar in alt_rules:
        cat = ar["category"]
        for dep in ar["deps"]:
            key = (cat, dep)
            if key in seen_pairs:
                continue
            seen_pairs.add(key)
            if dep in terminals:
                classification_counts["terminal"] += 1
                continue
            prod_cats = producer_cats_of.get(dep, set())
            if not prod_cats:
                classification_counts["undefined"] += 1
                undefined_refs[dep].add((cat, ar["resultType"]))
                continue
            if cat in prod_cats:
                classification_counts["local"] += 1
                continue
            if len(prod_cats) == 1:
                classification_counts["required_external"] += 1
                required_edges[(cat, next(iter(prod_cats)))].add(dep)
            else:
                classification_counts["ambiguous_external"] += 1
                for pc in prod_cats:
                    ambiguous_edges[(cat, pc)].add(dep)

    print("[assertion] Dependency classification (per unique category x dep-symbol pair):")
    for k, v in classification_counts.items():
        print(f"    {k}: {v}")
    print(f"[assertion] Required cross-category edges: {sum(len(v) for v in required_edges.values())} symbol instances, {len(required_edges)} category pairs")
    print(f"[assertion] Ambiguous cross-category edges: {sum(len(v) for v in ambiguous_edges.values())} symbol instances, {len(ambiguous_edges)} category pairs")
    print()

    sccs = sorted(strongly_connected_components(categories, required_edges), key=len, reverse=True)
    big_scc = [s for s in sccs if len(s) > 1]
    print(f"[assertion] SCCs from required-only edges: {[sorted(s) for s in big_scc]}")
    print()

    # ---- Multi-producer symbols ----
    multi = {s: d for s, d in symbol_defs.items() if len(set(c for c, _, _ in d)) > 1 or len(d) > 1}
    print(f"[assertion] Multi-producer symbols: {len(multi)}")
    print()

    # ---- Corrected reachability: OR across alternatives ----
    reachable = set(terminals)
    changed = True
    while changed:
        changed = False
        for sym, alts in resultType_alternatives.items():
            if sym in reachable:
                continue
            if any(alt.issubset(reachable) for alt in alts):
                reachable.add(sym)
                changed = True
    all_syms = set(resultType_alternatives.keys())
    unreachable = sorted(all_syms - reachable)
    print(f"[assertion] Reachable resultTypes (global-merge, any-alternative): {len(all_syms & reachable)} / {len(all_syms)}")
    print(f"[assertion] Unreachable resultTypes: {len(unreachable)}")
    for s in ("TRANSINTENT", "INTENT"):
        assert s in reachable, f"{s} MUST be reachable (confirmed at runtime) — reachability logic is broken if this fails"
    print("[assertion] TRANSINTENT and INTENT confirmed reachable (matches runtime behavior) -- PASS")
    print()

    # ---- Pair-map collisions (layer 0, naive merge) ----
    def compile_layer(layer):
        pair_map = {}
        for result_key, rules_str in layer.items():
            result_type, _attrs, _mult = parse_result_key(result_key)
            for rule in rules_str.split(","):
                parts = [p for p in re.split(r"\s+", rule.strip()) if p]
                if len(parts) < 2:
                    continue
                prev = ""
                i = 0
                while i < len(parts):
                    part = parts[i]
                    if part.startswith("{"):
                        m = P1.match(part)
                        if not m:
                            i += 1
                            continue
                        next_token = m.group(2)
                        if prev and next_token:
                            k = f"{prev}-{next_token}"
                            if k not in pair_map:
                                pair_map[k] = (result_type, result_key)
                        prev = next_token
                        i += 1
                    elif part:
                        if prev:
                            k = f"{prev}-{part}"
                            if k not in pair_map:
                                pair_map[k] = (result_type, result_key)
                        prev = part
                        i += 1
        return pair_map

    key_owners = defaultdict(list)
    for cat in categories:
        layers = grammar[cat].get("GRMR", [])
        if not layers:
            continue
        for k, (rt, raw) in compile_layer(layers[0]).items():
            key_owners[k].append((cat, rt, raw))
    collisions = {k: v for k, v in key_owners.items() if len(set(rt for _, rt, _ in v)) > 1}
    print(f"[assertion] Layer-0 pair-map keys total: {len(key_owners)}")
    print(f"[assertion] Layer-0 pair-map collisions (naive merge): {len(collisions)}")
    for k, v in sorted(collisions.items()):
        print(f"    {k}: {v}")
    print()

    # ---- Multiplier inventory ----
    mult_counter = Counter()
    for cat in categories:
        for layer in grammar[cat].get("GRMR", []):
            for k in layer.keys():
                m = P2.match(k)
                if m:
                    mult_counter[m.group(2)] += 1
    print(f"[assertion] GRMR keys with a <N> multiplier: {sum(mult_counter.values())} / {total_grmr_keys}")
    for n, c in sorted(mult_counter.items()):
        print(f"    <{n}>: {c}")
    print()

    # ---- TOKENS value-side bracket-annotation inventory ----
    shapes = Counter()
    total_entries = 0
    for _rawKey, rawValues in tokens.items():
        for entry in rawValues.split(","):
            e = entry.strip()
            if not e:
                continue
            total_entries += 1
            has_bracket = "[" in e and e.endswith("]")
            pipe_idx = e.find("|")
            if has_bracket:
                if pipe_idx != -1 and pipe_idx < e.find("["):
                    shapes["pipe+bracket"] += 1
                else:
                    shapes["bracket-no-pipe"] += 1
            elif pipe_idx != -1:
                shapes["pipe-normalized"] += 1
            else:
                shapes["plain"] += 1
    print(f"[assertion] TOKENS keyword-phrase entries inventoried: {total_entries}")
    for k, v in shapes.items():
        print(f"    {k}: {v}")
    print()

    # ---- TOKENS key-side underscore-attr inventory ----
    attr_counts = Counter()
    for key in tokens.keys():
        bidx = key.find("[")
        if bidx == -1:
            continue
        attr_str = key[bidx + 1 : -1] if key.endswith("]") else key[bidx + 1 : key.rfind("]")]
        for raw_part in attr_str.split(","):
            part = raw_part.strip()
            if part.startswith("_"):
                eq = part.find("=")
                name = part[1 : eq] if eq != -1 else part[1:]
                attr_counts[f"_{name}"] += 1
    print("[assertion] TOKENS key underscore-attr inventory:")
    for k, v in attr_counts.most_common():
        print(f"    {k}: {v}")
    print()

    print(f"[assertion] CLASSIFIER.CLS_ID entries: {len(seed['CLASSIFIER']['CLS_ID'])}: {seed['CLASSIFIER']['CLS_ID']}")
    print()
    print("=== seed_grammar_inventory.py: COMPLETE ===")


if __name__ == "__main__":
    main()
