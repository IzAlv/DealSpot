#!/usr/bin/env python3
"""
HubSpot -> DealSpot classifier.

Reads out/hubspot/companies.json (produced by hubspot_export.py) and
writes a CSV with a suggested kind/type per company plus the signals
(activity counts, industry, lifecycle) so the user can review and
override before import.

Self-records (BA Ticaret, DealSpot, PIR Grain) are marked kind=skip.

Output:
    out/hubspot/classification.csv

Columns:
    hubspotId, companyName, domain, industry, country, lifecycleStage,
    contactCount, notes, calls, emails, meetings, tasks, activityTotal,
    suggestedKind, suggestedType, userKind, userType

Edit userKind / userType in a spreadsheet to override. Leave blank to
accept the suggestion. Set userKind=skip to drop a row from import.
"""

import csv
import json
import re
import sys
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "out" / "hubspot"

# Earliest matching substring wins. Keep service patterns first so
# things like "Food and Logistics" land under service/logistics, which
# is almost always the safer default.
INDUSTRY_MAP = [
    ("maritime",            "service", "shipping_agent"),
    ("shipping",            "service", "shipping_agent"),
    ("transportation",      "service", "logistics"),
    ("trucking",            "service", "logistics"),
    ("railroad",            "service", "logistics"),
    ("logistics",           "service", "logistics"),
    ("supply chain",        "service", "logistics"),
    ("banking",             "service", "bank"),
    ("financial",           "service", "bank"),
    ("capital markets",     "service", "bank"),
    ("insurance",           "service", "insurance"),
    ("legal",               "service", "lawyer"),
    ("law practice",        "service", "lawyer"),
    ("food production",     "trading", "seller"),
    ("food",                "trading", "buyer"),
    ("beverage",            "trading", "buyer"),
    ("farming",             "trading", "seller"),
    ("agriculture",         "trading", "seller"),
    ("international trade", "trading", "buyer"),
    ("wholesale",           "trading", "buyer"),
    ("retail",              "trading", "buyer"),
]

SELF_NAMES = {
    "ba ticaret", "ba ticaret ltd", "ba ticaret ltd.",
    "dealspot", "dealspot ltd",
    "pir grain", "pir grain & pulses", "pir grain & pulses ltd",
    "pir grain and pulses", "pir grain and pulses ltd",
}


def normalize_name(s):
    return re.sub(r"[^\w\s&]", "", (s or "").lower()).strip()


def classify(industry):
    if not industry:
        return "network", "other"
    ind = industry.lower()
    for substr, kind, type_ in INDUSTRY_MAP:
        if substr in ind:
            return kind, type_
    return "network", "other"


def main():
    src = OUT / "companies.json"
    if not src.exists():
        sys.exit(f"missing {src} - run hubspot_export.py first")
    companies = json.loads(src.read_text())
    if not companies:
        sys.exit("companies.json is empty")

    rows = []
    for c in companies:
        props = c.get("properties") or {}
        name = props.get("name") or ""
        normalized = normalize_name(name)

        activities = c.get("_activities") or []
        by_kind = {"notes": 0, "calls": 0, "emails": 0, "meetings": 0, "tasks": 0}
        for a in activities:
            k = a.get("kind")
            if k in by_kind:
                by_kind[k] += 1
        contact_count = len(((c.get("associations") or {}).get("contacts") or {}).get("results") or [])

        if normalized in SELF_NAMES:
            kind, type_ = "skip", "skip"
        else:
            kind, type_ = classify(props.get("industry"))

        rows.append({
            "hubspotId": c["id"],
            "companyName": name,
            "domain": props.get("domain") or "",
            "industry": props.get("industry") or "",
            "country": props.get("country") or "",
            "lifecycleStage": props.get("lifecyclestage") or "",
            "contactCount": contact_count,
            "notes": by_kind["notes"],
            "calls": by_kind["calls"],
            "emails": by_kind["emails"],
            "meetings": by_kind["meetings"],
            "tasks": by_kind["tasks"],
            "activityTotal": sum(by_kind.values()),
            "suggestedKind": kind,
            "suggestedType": type_,
            "userKind": "",
            "userType": "",
        })

    rows.sort(key=lambda r: (-r["activityTotal"], r["companyName"].lower()))

    out_path = OUT / "classification.csv"
    with out_path.open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)

    breakdown = {}
    for r in rows:
        breakdown[r["suggestedKind"]] = breakdown.get(r["suggestedKind"], 0) + 1
    type_breakdown = {}
    for r in rows:
        if r["suggestedKind"] == "skip":
            continue
        key = f"{r['suggestedKind']}/{r['suggestedType']}"
        type_breakdown[key] = type_breakdown.get(key, 0) + 1

    print(f"Wrote {out_path} ({len(rows)} rows)")
    print()
    print("Suggested kind breakdown:")
    for k, v in sorted(breakdown.items(), key=lambda kv: -kv[1]):
        print(f"  {k:10s} {v}")
    print()
    print("Suggested kind/type breakdown:")
    for k, v in sorted(type_breakdown.items(), key=lambda kv: -kv[1]):
        print(f"  {k:32s} {v}")
    print()
    print("Edit userKind / userType columns to override. Leave blank to accept.")
    print("Set userKind=skip on any row you want to drop from the import.")


if __name__ == "__main__":
    main()
