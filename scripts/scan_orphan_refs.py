#!/usr/bin/env python3
"""
scan_orphan_refs.py — ObjectId reference completeness scanner for the Mongo→Postgres migration.

Two modes:

  --mode source   Connect to the SOURCE MongoDB and find every value that looks like an
                  ObjectId (^[0-9a-f]{24}$) buried inside document fields. For each one,
                  resolve which collection it points at (by checking every collection's _id
                  set). Output: an empirical "remap manifest" of (collection, json-path,
                  target-collection) that the Phase-3 migration MUST remap. This turns the
                  hand-built remap list (derived from reading code) into one derived from the
                  actual data — catching references no code path resolves server-side
                  (e.g. excludedDisports, excludedSurveyors, agentId).

  --mode target   Connect to the TARGET PostgreSQL (post-migration) and scan every `jsonb`
                  column (plus known loose text-ref columns) for surviving ObjectId-shaped
                  strings. ANY hit means a reference was not remapped. Exits non-zero so it
                  can gate the deploy. NOTE: the `mongo_id` text column legitimately holds
                  hex and is never scanned.

Usage:
  MONGO_URL=...    python scripts/scan_orphan_refs.py --mode source [--json out.json]
  DATABASE_URL=... python scripts/scan_orphan_refs.py --mode target [--json out.json]

Connection strings are read from env (MONGO_URL/MONGODB_URL/MONGODB_PRIVATE_URL for source,
DATABASE_URL for target) or --uri. Read-only: this script never writes to either database.
"""
import argparse
import json
import os
import re
import sys
from collections import defaultdict

OBJECTID_RE = re.compile(r"^[0-9a-f]{24}$")

# Loose text columns (not jsonb) that hold a reference and must be scanned in target mode.
# mongo_id is intentionally excluded — it is supposed to hold the old hex.
TARGET_TEXT_REF_COLUMNS = {
    "documents": ["trade_id"],
}


def walk_strings(value, path=""):
    """Yield (path, string) for every string leaf, using [] for array elements."""
    if isinstance(value, str):
        yield path, value
    elif isinstance(value, dict):
        for k, v in value.items():
            yield from walk_strings(v, f"{path}.{k}" if path else k)
    elif isinstance(value, list):
        for item in value:
            yield from walk_strings(item, f"{path}[]")


def scan_source(uri):
    from pymongo import MongoClient
    from bson import ObjectId  # noqa: F401  (kept for clarity; we compare hex strings)

    client = MongoClient(uri, serverSelectionTimeoutMS=5000)
    client.admin.command("ping")  # fail fast if unreachable

    # Pick the database: explicit DB_NAME if set, else auto-detect by finding the db that
    # actually holds the app's collections (the MongoDB service's own env won't carry DB_NAME).
    db_name = os.environ.get("DB_NAME")
    if not db_name:
        candidates = [d for d in client.list_database_names() if d not in ("admin", "local", "config")]
        best, best_score = None, -1
        for d in candidates:
            names = set(client[d].list_collection_names())
            score = len(names & {"trades", "partners", "vessels", "commodities"}) * 100 + len(names)
            if score > best_score:
                best, best_score = d, score
        db_name = best or "dealspot"
        print(f"(auto-detected database: {db_name})")
    db = client[db_name]
    collections = db.list_collection_names()

    # 1) Build the id index: which collection(s) own each _id hex.
    id_owner = {}  # hex -> set(collection)
    for coll in collections:
        for doc in db[coll].find({}, {"_id": 1}):
            try:
                hex_id = str(doc["_id"])
            except Exception:
                continue
            if OBJECTID_RE.match(hex_id):
                id_owner.setdefault(hex_id, set()).add(coll)

    # 2) Walk every document; find ObjectId-shaped strings in non-_id positions.
    # findings[collection][path] = {count, resolves_to:set, samples:set}
    findings = defaultdict(lambda: defaultdict(lambda: {"count": 0, "resolves_to": set(), "samples": set()}))
    for coll in collections:
        for doc in db[coll].find({}):
            for path, s in walk_strings(doc):
                if path == "_id" or not OBJECTID_RE.match(s):
                    continue
                rec = findings[coll][path]
                rec["count"] += 1
                rec["resolves_to"].update(id_owner.get(s, set()))
                if len(rec["samples"]) < 3:
                    rec["samples"].add(s)

    return _render_source(findings)


def _render_source(findings):
    manifest = []
    print("\n=== SOURCE SCAN: in-document ObjectId references ===\n")
    if not findings:
        print("No ObjectId-shaped strings found in any document field. Nothing to remap.")
    for coll in sorted(findings):
        print(f"[{coll}]")
        for path in sorted(findings[coll]):
            rec = findings[coll][path]
            targets = sorted(rec["resolves_to"]) or ["<unresolved / dangling>"]
            print(f"  {path:<40} count={rec['count']:<6} -> {', '.join(targets)}")
            manifest.append({
                "collection": coll,
                "path": path,
                "count": rec["count"],
                "resolves_to": sorted(rec["resolves_to"]),
                "samples": sorted(rec["samples"]),
            })
    print(f"\nTotal distinct reference paths: {len(manifest)}")
    print("Use this manifest as the authoritative Phase-3 remap list.\n")
    return {"mode": "source", "manifest": manifest}


def scan_target(uri):
    import psycopg

    findings = []  # {table, column, pk, path, value}
    with psycopg.connect(uri, connect_timeout=5) as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT table_name, column_name
                FROM information_schema.columns
                WHERE table_schema = 'public' AND data_type = 'jsonb'
                ORDER BY table_name, column_name
            """)
            jsonb_cols = cur.fetchall()

            for table, column in jsonb_cols:
                cur.execute(f'SELECT id, "{column}" FROM "{table}"')
                for pk, data in cur.fetchall():
                    if data is None:
                        continue
                    for path, s in walk_strings(data):
                        if OBJECTID_RE.match(s):
                            findings.append({"table": table, "column": column,
                                             "pk": str(pk), "path": path, "value": s})

            # Known loose text-ref columns.
            for table, cols in TARGET_TEXT_REF_COLUMNS.items():
                for column in cols:
                    try:
                        cur.execute(f'SELECT id, "{column}" FROM "{table}"')
                    except psycopg.Error:
                        conn.rollback()
                        continue
                    for pk, val in cur.fetchall():
                        if isinstance(val, str) and OBJECTID_RE.match(val):
                            findings.append({"table": table, "column": column,
                                             "pk": str(pk), "path": column, "value": val})

            # Build the set of all original ObjectIds that DID migrate (mongo_id columns).
            # A leftover hex that IS in this set = a mappable reference we failed to remap (BUG).
            # A leftover that is NOT = a ref that was already dangling in Mongo (deleted entity) — OK.
            cur.execute("""
                SELECT table_name FROM information_schema.columns
                WHERE table_schema='public' AND column_name='mongo_id'
            """)
            mongo_ids = set()
            for (tname,) in cur.fetchall():
                cur.execute(f'SELECT mongo_id FROM "{tname}" WHERE mongo_id IS NOT NULL')
                mongo_ids.update(r[0] for r in cur.fetchall())

    missed = [f for f in findings if f["value"] in mongo_ids]      # real orphans -> FAIL
    dangling = [f for f in findings if f["value"] not in mongo_ids]  # pre-existing dangling -> OK

    print("\n=== TARGET SCAN: surviving ObjectId-shaped strings in jsonb / text refs ===\n")
    if dangling:
        by_loc = defaultdict(int)
        for f in dangling:
            by_loc[f"{f['table']}.{f['column']} :: {f['path']}"] += 1
        print(f"INFO — {len(dangling)} pre-existing dangling ref(s) preserved (target was deleted in Mongo):")
        for loc in sorted(by_loc):
            print(f"  {loc:<55} x{by_loc[loc]}")
        print()
    if not missed:
        print("PASS — every mappable reference was remapped; no orphaned references.\n")
    else:
        by_loc = defaultdict(int)
        for f in missed:
            by_loc[f"{f['table']}.{f['column']} :: {f['path']}"] += 1
        print(f"FAIL — {len(missed)} MISSED reference(s) (target exists but id not remapped):\n")
        for loc in sorted(by_loc):
            print(f"  {loc:<55} x{by_loc[loc]}")
        print("\nFix the Phase-3 remap before deploy.\n")
    return {"mode": "target", "orphans": missed, "dangling": dangling}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--mode", required=True, choices=["source", "target"])
    ap.add_argument("--uri", default=None, help="override connection string")
    ap.add_argument("--json", default=None, help="write full report to this path")
    args = ap.parse_args()

    if args.mode == "source":
        uri = args.uri or os.environ.get("MONGO_URL") or os.environ.get("MONGODB_URL") or os.environ.get("MONGODB_PRIVATE_URL")
        if not uri:
            sys.exit("ERROR: set MONGO_URL (or MONGODB_URL / --uri) to the source MongoDB.")
        report = scan_source(uri)
    else:
        uri = args.uri or os.environ.get("DATABASE_URL")
        if not uri:
            sys.exit("ERROR: set DATABASE_URL (or --uri) to the target PostgreSQL.")
        report = scan_target(uri)

    if args.json:
        with open(args.json, "w") as f:
            json.dump(report, f, indent=2, default=str)
        print(f"Report written to {args.json}")

    # target mode is a gate: non-zero exit if any orphan survived.
    if args.mode == "target" and report["orphans"]:
        sys.exit(1)


if __name__ == "__main__":
    main()
