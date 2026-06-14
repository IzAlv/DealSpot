#!/usr/bin/env python3
"""
migrate_mongo_to_postgres.py — one-shot, idempotent MongoDB -> PostgreSQL data migration.

Strategy
  * Topological order: reference targets (partners, vessels, reference data, ...) are migrated
    BEFORE the tables that reference them, so foreign keys resolve and in-`data` references can
    be remapped to the new UUIDs.
  * Idempotent: every row carries its original ObjectId in `mongo_id` (UNIQUE). On re-run, rows
    already present (by mongo_id) are skipped and their existing id is reused for remapping.
  * Reference remap: a global old-ObjectId-hex -> new-UUID map is built as rows are inserted.
    FK references (trades.sellerId, invoices.tradeId, ...) are remapped to the new UUID, or set
    NULL if the target is missing (Mongo tolerated dangling refs). Soft refs that live only in
    `data` (vesselId, portVariations[].portId, notifications.entityRef, ...) are remapped when
    known and left as-is otherwise (the target-mode orphan scan is the post-migration gate).

Run (needs pymongo + psycopg in the same env):
  MONGO_URL=...  DATABASE_URL=...  DB_NAME=dealspot  python scripts/migrate_mongo_to_postgres.py
"""
import os
import re
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from bson import ObjectId
from pymongo import MongoClient
import database as db

OBJECTID_RE = re.compile(r"^[0-9a-f]{24}$")

# Migrate in dependency order: targets first, referrers later, notifications last.
TOPO_ORDER = [
    # base / reference targets (no outgoing references)
    "users", "commodities", "origins", "ports", "surveyors",
    "loadport_agents", "disport_agents", "vessels", "partners",
    "market_prices", "market_notes", "turkish_exchange_prices", "tmo_tenders",
    "telegram_channels", "market_commodities", "bank_accounts", "vendors",
    "business_cards", "bank_statements",
    # referrers
    "trades", "invoices", "events", "doc_instructions", "documents",
    # last: entityRef can point at anything
    "notifications",
]

# FK-column references: must be a valid new UUID or NULL (no dangling allowed in a uuid FK col).
FK_REF_PATHS = {
    "trades": ["sellerId", "buyerId", "brokerId", "coBrokerId", "commodityId",
               "originId", "loadingPortId", "dischargePortId", "basePortId", "surveyorId"],
    "invoices": ["tradeId"],
    "events": ["tradeId", "partnerId"],
    "doc_instructions": ["tradeId"],
}
# Soft references (live in data / text columns): remap when known, else leave as-is.
SOFT_REF_PATHS = {
    "trades": ["vesselId", "portVariations[].portId", "excludedDisports[]", "excludedSurveyors[]"],
    "doc_instructions": ["consigneeBuyerId", "notifyBuyerId", "agentId"],
    "documents": ["tradeId"],
    "notifications": ["entityRef"],
}
SPECIAL_TABLES = {"app_config", "port_lineups", "monthly_lineups"}  # bespoke shapes; handled if present


def clean(v):
    """Recursively convert Mongo types to JSON-safe values (ObjectId->str, datetime->UTC iso)."""
    if isinstance(v, ObjectId):
        return str(v)
    if isinstance(v, datetime):
        v = v.replace(tzinfo=timezone.utc) if v.tzinfo is None else v.astimezone(timezone.utc)
        return v.isoformat()
    if isinstance(v, dict):
        return {k: clean(x) for k, x in v.items()}
    if isinstance(v, list):
        return [clean(x) for x in v]
    return v


def _remap_value(val, idmap, drop_if_missing):
    if isinstance(val, str) and OBJECTID_RE.match(val):
        new = idmap.get(val)
        if new:
            return new
        return None if drop_if_missing else val
    return val


def _apply_path(doc, path, idmap, drop_if_missing):
    """Remap a single declared reference path in-place. Supports a[].b and a[] and a."""
    if "[]" in path:
        head, _, tail = path.partition("[]")
        head = head.rstrip(".")
        arr = doc.get(head)
        if not isinstance(arr, list):
            return
        sub = tail.lstrip(".")
        for i, item in enumerate(arr):
            if sub:  # array of objects: a[].b
                if isinstance(item, dict) and sub in item:
                    item[sub] = _remap_value(item[sub], idmap, drop_if_missing)
            else:    # array of scalars: a[]
                arr[i] = _remap_value(item, idmap, drop_if_missing)
    elif path in doc:
        doc[path] = _remap_value(doc[path], idmap, drop_if_missing)


def remap_references(table, doc, idmap):
    for path in FK_REF_PATHS.get(table, []):
        _apply_path(doc, path, idmap, drop_if_missing=True)
    for path in SOFT_REF_PATHS.get(table, []):
        _apply_path(doc, path, idmap, drop_if_missing=False)
    return doc


def main():
    mongo_uri = os.environ.get("MONGO_URL") or os.environ.get("MONGODB_URL")
    if not mongo_uri:
        sys.exit("ERROR: set MONGO_URL to the source MongoDB.")
    dbname = os.environ.get("DB_NAME", "dealspot")
    src = MongoClient(mongo_uri, serverSelectionTimeoutMS=8000)[dbname]
    present = set(src.list_collection_names())
    print(f"Source db '{dbname}': {len(present)} collections present\n")

    # Preload existing mongo_id -> new id map (idempotency).
    idmap = {}
    for table in TOPO_ORDER:
        try:
            for r in db.q_all(f'SELECT mongo_id, id FROM "{table}" WHERE mongo_id IS NOT NULL'):
                idmap[r["mongo_id"]] = str(r["id"])
        except Exception:
            pass

    inserted = skipped = 0
    summary = []
    for table in TOPO_ORDER:
        if table not in present:
            continue
        if table in SPECIAL_TABLES:
            print(f"  SKIP {table} (bespoke shape — handle separately)")
            continue
        n_ins = n_skip = 0
        for doc in src[table].find({}):
            hex_id = str(doc["_id"])
            if hex_id in idmap:
                n_skip += 1
                continue
            cleaned = clean(dict(doc))
            cleaned = remap_references(table, cleaned, idmap)
            row = db.insert_document(table, cleaned, mongo_id=hex_id)
            idmap[hex_id] = str(row["id"])
            n_ins += 1
        mongo_ct = src[table].estimated_document_count()
        pg_ct = db.q_one(f'SELECT count(*) c FROM "{table}"')["c"]
        ok = "OK " if pg_ct == mongo_ct else "!! "
        summary.append((ok, table, mongo_ct, pg_ct, n_ins, n_skip))
        inserted += n_ins
        skipped += n_skip

    print("  status table                    mongo    pg   inserted  skipped")
    for ok, t, m, p, ins, sk in summary:
        print(f"  {ok}    {t:24} {m:5} {p:5}     {ins:5}   {sk:5}")
    print(f"\nTotal inserted={inserted} skipped(existing)={skipped}")

    # Integrity gate. A leftover ObjectId-shaped entity_ref is only a BUG if that id was
    # actually migrated (present in idmap) — i.e. a mappable reference we failed to rewrite.
    # A leftover that maps to nothing was already a dangling ref in Mongo (e.g. a notification
    # about a since-deleted partner); we preserve it verbatim, exactly as the old API did.
    hex_refs = db.q_all(
        "SELECT entity_ref FROM notifications WHERE entity_ref ~ '^[0-9a-f]{24}$'"
    )
    bug = [r["entity_ref"] for r in hex_refs if r["entity_ref"] in idmap]
    dangling = [r["entity_ref"] for r in hex_refs if r["entity_ref"] not in idmap]
    print(f"entity_ref: {len(dangling)} pre-existing dangling ref(s) preserved (deleted entities), "
          f"{len(bug)} mappable-but-missed")
    print("MIGRATION:", "PASS ✅" if not bug else "FAIL ❌ (missed mappable references: %s)" % bug[:5])
    return 0 if not bug else 1


if __name__ == "__main__":
    sys.exit(main())
