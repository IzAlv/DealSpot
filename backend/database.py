"""
PostgreSQL access layer (psycopg3) — replaces the old PyMongo layer.

Hybrid model (see backend/schema.sql):
  * The FULL document body lives in `data` jsonb (minus _id / createdAt / updatedAt),
    so serialize_doc_row() returns it verbatim and the frozen API contract is preserved.
  * Promoted + FK columns are WRITE-ONLY MIRRORS, extracted from `data` via PROMOTED on every
    write, used only for WHERE / ORDER BY / JOIN / FK. They are never read back for serialization.
  * created_at / updated_at are the only fields pulled OUT of data into typed columns; the
    serializer re-emits them as createdAt / updatedAt via .isoformat().
  * `mongo_id` (original ObjectId) is for migration FK remapping only and is never serialized.
"""
import atexit
import os
from contextlib import contextmanager
from datetime import datetime, timezone

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb
from psycopg_pool import ConnectionPool

from config import DATABASE_URL

# ─── Connection pool ─────────────────────────────────────────────────────────
# Pin the session timezone to UTC so timestamptz round-trips match the old contract.
pool = ConnectionPool(
    DATABASE_URL,
    min_size=1,
    max_size=10,
    kwargs={"row_factory": dict_row, "options": "-c timezone=UTC"},
    open=True,
)
atexit.register(pool.close)


@contextmanager
def get_conn():
    with pool.connection() as conn:
        yield conn


def q_all(sql, params=None):
    with pool.connection() as conn, conn.cursor() as cur:
        cur.execute(sql, params or ())
        return cur.fetchall()


def q_one(sql, params=None):
    with pool.connection() as conn, conn.cursor() as cur:
        cur.execute(sql, params or ())
        return cur.fetchone()


def execute(sql, params=None):
    with pool.connection() as conn, conn.cursor() as cur:
        cur.execute(sql, params or ())
        return cur.rowcount


# ─── Value casters (data value -> SQL column type) ───────────────────────────
def _to_ts(v):
    """Parse an ISO-ish string or pass a datetime; return tz-aware datetime or None."""
    if v in (None, ""):
        return None
    if isinstance(v, datetime):
        return v if v.tzinfo else v.replace(tzinfo=timezone.utc)
    try:
        d = datetime.fromisoformat(str(v).replace("Z", "+00:00"))
        return d if d.tzinfo else d.replace(tzinfo=timezone.utc)
    except (ValueError, TypeError):
        return None


def _to_uuid(v):
    """Pass a UUID string through (psycopg adapts str->uuid); empty/invalid -> None."""
    if v in (None, ""):
        return None
    return str(v)


def _to_jsonb(v):
    return Jsonb(v) if v is not None else None


def _to_float(v):
    try:
        return float(v) if v not in (None, "") else None
    except (ValueError, TypeError):
        return None


def _to_int(v):
    try:
        return int(v) if v not in (None, "") else None
    except (ValueError, TypeError):
        return None


def _to_bool(v):
    if v is None:
        return None
    return bool(v)


def _text(v):
    return v


# ─── Promoted-column registry ────────────────────────────────────────────────
# table -> list of (column_name, data_key, caster). The data_key is the original
# (camelCase) document key; the column mirrors it for querying. Single source of truth
# for the column<->data mapping used by split_document() and the Phase-3 migration.
T, U, J, F, I, B, TS = _text, _to_uuid, _to_jsonb, _to_float, _to_int, _to_bool, _to_ts

PROMOTED = {
    "users": [("username", "username", T), ("password", "password", T), ("role", "role", T),
              ("name", "name", T), ("email", "email", T), ("whatsapp", "whatsapp", T),
              ("mobile", "mobile", T), ("status", "status", T)],
    "commodities": [("name", "name", T), ("code", "code", T), ("group", "group", T),
                    ("hs_code", "hsCode", T), ("description", "description", T),
                    ("specs", "specs", T), ("documents", "documents", J)],
    "origins": [("name", "name", T), ("adjective", "adjective", T), ("code", "code", T)],
    "ports": [("name", "name", T), ("type", "type", T), ("country", "country", T),
              ("country_code", "countryCode", T)],
    "surveyors": [("name", "name", T), ("contact", "contact", T),
                  ("countries_served", "countriesServed", J)],
    "loadport_agents": [("name", "name", T), ("port", "port", T), ("contact", "contact", T),
                        ("email", "email", T), ("tel", "tel", T), ("whatsapp", "whatsapp", T),
                        ("address", "address", T)],
    "disport_agents": [("name", "name", T), ("port", "port", T), ("contact", "contact", T),
                       ("email", "email", T), ("tel", "tel", T), ("whatsapp", "whatsapp", T),
                       ("address", "address", T)],
    "vessels": [("name", "name", T), ("imo_number", "imoNumber", T), ("flag", "flag", T),
                ("built_year", "builtYear", I), ("vessel_type", "vesselType", T)],
    "partners": [("company_name", "companyName", T), ("kind", "kind", T), ("type", "type", J),
                 ("company_code", "companyCode", T), ("contact_person", "contactPerson", T),
                 ("email", "email", T), ("company_domain", "companyDomain", T),
                 ("hubspot_id", "hubspotId", T)],
    "trades": [("status", "status", T), ("seller_id", "sellerId", U), ("buyer_id", "buyerId", U),
               ("broker_id", "brokerId", U), ("co_broker_id", "coBrokerId", U),
               ("commodity_id", "commodityId", U), ("origin_id", "originId", U),
               ("loading_port_id", "loadingPortId", U), ("discharge_port_id", "dischargePortId", U),
               ("base_port_id", "basePortId", U), ("surveyor_id", "surveyorId", U)],
    "invoices": [("invoice_number", "invoiceNumber", T), ("vendor_name", "vendorName", T),
                 ("vendor_code", "vendorCode", T), ("amount", "amount", F), ("currency", "currency", T),
                 ("invoice_date", "invoiceDate", T), ("due_date", "dueDate", T),
                 ("payment_date", "paymentDate", T), ("category", "category", T),
                 ("description", "description", T), ("status", "status", T),
                 ("direction", "direction", T), ("trade_id", "tradeId", U),
                 ("auto_generated", "autoGenerated", B)],
    "bank_statements": [("month", "month", I), ("year", "year", I), ("description", "description", T),
                        ("bank_account_id", "bankAccountId", T), ("file_name", "fileName", T),
                        ("stored_file_name", "storedFileName", T)],
    "bank_accounts": [],
    "vendors": [("name", "name", T)],
    "documents": [("file_name", "fileName", T), ("saved_name", "savedName", T),
                  ("file_url", "fileUrl", T), ("file_size", "fileSize", I),
                  ("doc_type", "docType", T), ("doc_name", "docName", T),
                  ("trade_id", "tradeId", T), ("trade_ref", "tradeRef", T),
                  ("uploaded_by", "uploadedBy", T)],
    "business_cards": [("name", "name", T), ("title", "title", T), ("company", "company", T),
                       ("email", "email", T), ("phone", "phone", T), ("mobile", "mobile", T),
                       ("website", "website", T), ("address", "address", T), ("city", "city", T),
                       ("country", "country", T), ("keywords", "keywords", J), ("notes", "notes", T),
                       ("image_url", "imageUrl", T), ("uploaded_by", "uploadedBy", T)],
    "events": [("title", "title", T), ("date", "date", T), ("date_to", "dateTo", T),
               ("type", "type", T), ("description", "description", T), ("trade_id", "tradeId", U),
               ("partner_id", "partnerId", U), ("payment_due_date", "paymentDueDate", T)],
    "notifications": [("type", "type", T), ("message", "message", T), ("entity_ref", "entityRef", T),
                      ("username", "username", T), ("display_name", "displayName", T),
                      ("read_by", "readBy", J)],
    "doc_instructions": [("trade_id", "tradeId", U)],
    "market_prices": [("symbol", "symbol", T), ("timestamp", "timestamp", TS), ("price", "price", F)],
    "turkish_exchange_prices": [("exchange", "exchange", T), ("product", "product", T),
                                ("price", "price", F), ("unit", "unit", T), ("date", "date", T),
                                ("category", "category", T)],
    "market_notes": [("commodity", "commodity", T), ("period", "period", T),
                     ("content", "content", T), ("tags", "tags", J)],
    "tmo_tenders": [("tender_date", "tenderDate", T), ("commodity", "commodity", T),
                    ("total_quantity", "totalQuantity", F),
                    ("shipment_period_start", "shipmentPeriodStart", T),
                    ("shipment_period_end", "shipmentPeriodEnd", T), ("status", "status", T),
                    ("results", "results", J)],
    "telegram_channels": [("name", "name", T), ("channel_id", "channelId", T),
                          ("description", "description", T), ("is_active", "isActive", B)],
    "market_commodities": [("name", "name", T), ("symbol", "symbol", T)],
}

# Tables that carry created_at / updated_at columns (pull them out of data on write).
# market_prices uses `timestamp` (not created_at); market_commodities has neither — for both,
# any createdAt in the doc simply rides inside `data`.
HAS_CREATED_AT = set(PROMOTED) - {"market_commodities", "market_prices"}
HAS_UPDATED_AT = {"partners", "trades", "bank_statements", "bank_accounts", "vendors",
                  "business_cards", "doc_instructions"}

_META_KEYS = {"_id", "id", "createdAt", "updatedAt"}


# ─── Serialization (row -> JSON, reimplements serialize_doc) ──────────────────
def _iso(v):
    # Always emit UTC (+00:00), matching the old serialize_doc contract. psycopg returns
    # timestamptz in the session's local zone, so normalize before formatting.
    if isinstance(v, datetime):
        v = v.replace(tzinfo=timezone.utc) if v.tzinfo is None else v.astimezone(timezone.utc)
        return v.isoformat()
    return v


def serialize_doc_row(row, include_id=True):
    """Convert a hybrid table row (with a `data` jsonb column) to the exact JSON the
    frontend expects: the verbatim document body + id + createdAt/updatedAt."""
    if row is None:
        return None
    out = dict(row.get("data") or {})
    if include_id and row.get("id") is not None:
        out["id"] = str(row["id"])
    if row.get("created_at") is not None:
        out["createdAt"] = _iso(row["created_at"])
    if row.get("updated_at") is not None:
        out["updatedAt"] = _iso(row["updated_at"])
    return out


# ─── Write helpers (used by Phase-3 migration and Phase-4 routes) ─────────────
def split_document(table, doc):
    """Given a full document dict, return (column_values, created_at, updated_at, data_jsonb).
    `data` keeps every field except _id/createdAt/updatedAt (promoted keys stay in data)."""
    data = {k: v for k, v in doc.items() if k not in _META_KEYS}
    cols = {col: cast(data.get(key)) for col, key, cast in PROMOTED.get(table, [])}
    created_at = _to_ts(doc.get("createdAt")) if table in HAS_CREATED_AT else None
    updated_at = _to_ts(doc.get("updatedAt")) if table in HAS_UPDATED_AT else None
    return cols, created_at, updated_at, Jsonb(data)


def insert_document(table, doc, mongo_id=None):
    """Insert a document; returns the new row (dict_row). Mirrors columns from data."""
    cols, created_at, updated_at, data = split_document(table, doc)
    fields, values = [], []
    for c, v in cols.items():
        fields.append(c)
        values.append(v)
    if table in HAS_CREATED_AT:
        fields.append("created_at")
        values.append(created_at or datetime.now(timezone.utc))
    if table in HAS_UPDATED_AT:
        fields.append("updated_at")
        values.append(updated_at or datetime.now(timezone.utc))
    if mongo_id is not None:
        fields.append("mongo_id")
        values.append(str(mongo_id))
    fields.append("data")
    values.append(data)
    placeholders = ", ".join(["%s"] * len(values))
    collist = ", ".join(f'"{f}"' for f in fields)
    return q_one(f'INSERT INTO "{table}" ({collist}) VALUES ({placeholders}) RETURNING *', values)


def update_document(table, row_id, set_fields=None, unset_fields=None):
    """Read-modify-write a row's data jsonb ($set/$unset semantics), re-derive mirror
    columns, bump updated_at. Returns the updated row or None if not found."""
    current = q_one(f'SELECT data FROM "{table}" WHERE id = %s', (row_id,))
    if current is None:
        return None
    data = dict(current.get("data") or {})
    for k, v in (set_fields or {}).items():
        if k not in _META_KEYS:
            data[k] = v
    for k in (unset_fields or []):
        data.pop(k, None)
    cols = {col: cast(data.get(key)) for col, key, cast in PROMOTED.get(table, [])}
    assigns, values = [], []
    for c, v in cols.items():
        assigns.append(f'"{c}" = %s')
        values.append(v)
    if table in HAS_UPDATED_AT:
        assigns.append('updated_at = now()')
    assigns.append('data = %s')
    values.append(Jsonb(data))
    values.append(row_id)
    return q_one(f'UPDATE "{table}" SET {", ".join(assigns)} WHERE id = %s RETURNING *', values)


def delete_document(table, row_id):
    return execute(f'DELETE FROM "{table}" WHERE id = %s', (row_id,))


# ─── Notifications (preserves the old create_notification contract) ──────────
def create_notification(ntype, message, entity_ref=None, username=None, display_name=None):
    doc = {
        "type": ntype,
        "message": message,
        "entityRef": entity_ref,
        "username": username or "system",
        "displayName": display_name or username or "system",
        "readBy": [],
    }
    try:
        insert_document("notifications", doc)
    except Exception as e:  # never let a notification failure break the main operation
        print(f"WARNING: create_notification failed ({e})", flush=True)
