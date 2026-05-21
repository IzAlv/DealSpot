"""
Export all Broker-App MongoDB collections to a single Excel workbook.
Each collection → one sheet.

Usage:
    python export_to_excel.py                            # default: localhost:27017
    MONGO_URL=mongodb://host:port python export_to_excel.py
    python export_to_excel.py --out broker_export.xlsx
"""

import os
import sys
import json
import argparse
from datetime import datetime, timezone
from bson import ObjectId
from pymongo import MongoClient
import pandas as pd


MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "pir_grain_pulses")

COLLECTIONS = [
    "trades",
    "partners",
    "vessels",
    "commodities",
    "origins",
    "ports",
    "surveyors",
    "events",
    "invoices",
    "bank_statements",
    "disport_agents",
    "loadport_agents",
    "bank_accounts",
    "vendors",
    "business_cards",
    "users",
    "market_prices",
    "market_notes",
    "tmo_tenders",
    "market_commodities",
    "turkish_exchange_prices",
]

# Fields to drop from users sheet for security
USER_SENSITIVE_FIELDS = {"password", "hashed_password"}


def serialize_value(v):
    """Convert MongoDB types to Excel-friendly values."""
    if isinstance(v, ObjectId):
        return str(v)
    if isinstance(v, datetime):
        if v.tzinfo is None:
            v = v.replace(tzinfo=timezone.utc)
        return v.isoformat()
    if isinstance(v, (dict, list)):
        return json.dumps(v, default=str, ensure_ascii=False)
    return v


def flatten_doc(doc):
    """Serialize all values in a MongoDB document."""
    return {k: serialize_value(v) for k, v in doc.items()}


def collection_to_df(col_obj, drop_fields=None):
    docs = list(col_obj.find({}))
    if not docs:
        return pd.DataFrame()
    rows = []
    for doc in docs:
        row = flatten_doc(doc)
        # Rename _id → id
        if "_id" in row:
            row["id"] = str(row.pop("_id"))
        # Drop sensitive fields
        if drop_fields:
            for f in drop_fields:
                row.pop(f, None)
        rows.append(row)
    df = pd.DataFrame(rows)
    # Put id first
    cols = ["id"] + [c for c in df.columns if c != "id"]
    return df[[c for c in cols if c in df.columns]]


def main():
    parser = argparse.ArgumentParser(description="Export Broker-App MongoDB data to Excel")
    parser.add_argument("--out", default="broker_app_export.xlsx", help="Output file path")
    parser.add_argument("--mongo-url", default=MONGO_URL, help="MongoDB connection URL")
    parser.add_argument("--db", default=DB_NAME, help="Database name")
    args = parser.parse_args()

    print(f"Connecting to {args.mongo_url} / {args.db} ...")
    try:
        client = MongoClient(args.mongo_url, serverSelectionTimeoutMS=5000)
        client.server_info()  # Will raise if can't connect
    except Exception as e:
        print(f"ERROR: Cannot connect to MongoDB: {e}")
        sys.exit(1)

    db = client[args.db]
    output_path = args.out

    print(f"Exporting to {output_path} ...")
    with pd.ExcelWriter(output_path, engine="openpyxl") as writer:
        for name in COLLECTIONS:
            col = db[name]
            drop = USER_SENSITIVE_FIELDS if name == "users" else None
            df = collection_to_df(col, drop_fields=drop)
            count = len(df)
            # Sheet names max 31 chars
            sheet_name = name[:31]
            if df.empty:
                pd.DataFrame({"(no data)": []}).to_excel(writer, sheet_name=sheet_name, index=False)
            else:
                df.to_excel(writer, sheet_name=sheet_name, index=False)
                # Auto-width columns
                ws = writer.sheets[sheet_name]
                for col_idx, col_name in enumerate(df.columns, 1):
                    max_len = max(
                        len(str(col_name)),
                        df[col_name].astype(str).str.len().max() if count > 0 else 0
                    )
                    ws.column_dimensions[ws.cell(row=1, column=col_idx).column_letter].width = min(max_len + 2, 60)
            print(f"  ✓ {name}: {count} rows")

    print(f"\nDone. File saved to: {os.path.abspath(output_path)}")


if __name__ == "__main__":
    main()
