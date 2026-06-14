from datetime import datetime, timedelta, timezone
from typing import Optional
import random
import string
import os

from fastapi import APIRouter, HTTPException, Depends, UploadFile, File

from database import (q_all, q_one, insert_document, update_document, delete_document,
                      execute, serialize_doc_row, create_notification)
from auth import get_current_user, require_roles
from models import TradeCreate, TradeStatusUpdate
from config import TRADE_STATUSES

non_accountant = require_roles("admin", "user")

PROD_KEYWORDS = ["pellet", "husk", "bran", "meal", "pulp"]

# (data_field, ref_table, name_field, code_field)
_REF_FIELDS = [
    ("buyerId", "partners", "buyerName", "buyerCode"),
    ("sellerId", "partners", "sellerName", "sellerCode"),
    ("brokerId", "partners", "brokerName", "brokerCode"),
    ("coBrokerId", "partners", "coBrokerName", "coBrokerCode"),
    ("commodityId", "commodities", "commodityName", None),
    ("originId", "origins", "originName", None),
    ("basePortId", "ports", "basePortName", None),
    ("loadingPortId", "ports", "loadingPortName", None),
    ("dischargePortId", "ports", "dischargePortName", None),
]


def generate_ref():
    year = datetime.now().strftime("%y")
    num = random.randint(1000, 9999)
    letters = ''.join(random.choices(string.ascii_uppercase, k=2))
    return f"PIR-{year}-{letters}{num}"


def _ref_data(table, ref_id):
    if not ref_id:
        return None
    row = q_one(f'SELECT data FROM "{table}" WHERE id = %s', (ref_id,))
    return (row.get("data") or {}) if row else None


def _resolve_ref_names(data):
    """Populate cached *Name/*Code/*Country fields from the referenced rows (mirrors old logic)."""
    for field, table, name_field, code_field in _REF_FIELDS:
        if data.get(field):
            doc = _ref_data(table, data[field])
            if doc:
                data[name_field] = doc.get("companyName", doc.get("name", ""))
                if code_field:
                    data[code_field] = doc.get("companyCode", "")
                if "Port" in name_field and doc.get("country"):
                    data[name_field.replace("Name", "Country")] = doc.get("country", "")
    if data.get("originId"):
        origin = _ref_data("origins", data["originId"])
        if origin and origin.get("adjective"):
            data["originAdjective"] = origin["adjective"]


def _compose_display_name(adj, cname, cyear):
    year_prefix = "Prod." if any(kw in (cname or "").lower() for kw in PROD_KEYWORDS) else "Crop"
    if adj and cname and cyear:
        return f"{adj} {cname}, {year_prefix} {cyear}"
    if adj and cname:
        return f"{adj} {cname}"
    return cname or ""


router = APIRouter(prefix="/api/trades", tags=["trades"])


@router.get("")
def list_trades(status: Optional[str] = None, search: Optional[str] = None, user=Depends(non_accountant)):
    where, params = [], []
    if status and status != "all":
        where.append("status = %s")
        params.append(status)
    if search:
        like = f"%{search}%"
        fields = ["BAContractNumber", "referenceNumber", "buyerName", "sellerName", "commodityName", "vesselName"]
        where.append("(" + " OR ".join([f"data->>'{f}' ILIKE %s" for f in fields]) + ")")
        params += [like] * len(fields)
    sql = "SELECT * FROM trades"
    if where:
        sql += " WHERE " + " AND ".join(where)
    sql += " ORDER BY created_at DESC"
    return [serialize_doc_row(t) for t in q_all(sql, params)]


@router.post("")
def create_trade(trade: TradeCreate, user=Depends(non_accountant)):
    data = trade.dict()
    data["referenceNumber"] = data.get("contractNumber") or generate_ref()
    _resolve_ref_names(data)
    data["commodityDisplayName"] = _compose_display_name(
        data.get("originAdjective") or "", data.get("commodityName") or "", data.get("cropYear") or "")
    data["totalCommission"] = round((data.get("quantity") or 0) * (data.get("brokeragePerMT") or 0), 2)
    row = insert_document("trades", data)
    create_notification("trade", f"New trade created: {data.get('referenceNumber', '')}",
                        str(row["id"]), user.get("username"), user.get("name"))
    return serialize_doc_row(row)


@router.get("/stats/overview")
def trade_stats(user=Depends(non_accountant)):
    total = q_one("SELECT count(*) c FROM trades")["c"]
    completed = q_one("SELECT count(*) c FROM trades WHERE status = 'completed'")["c"]
    active = q_all("SELECT data FROM trades WHERE status NOT IN ('completed','cancelled','washout')")
    ongoing = sum(1 for t in active if (t.get("data") or {}).get("vesselName"))
    pending = sum(1 for t in active if not (t.get("data") or {}).get("vesselName"))
    status_dist = {r["status"]: r["c"] for r in q_all("SELECT status, count(*) c FROM trades GROUP BY status")}
    return {
        "totalTrades": total,
        "activeTrades": ongoing,
        "pendingTrades": pending,
        "completedTrades": completed,
        "completionRate": round((completed / total * 100) if total > 0 else 0, 1),
        "statusDistribution": status_dist,
    }


@router.get("/{trade_id}")
def get_trade(trade_id: str, user=Depends(non_accountant)):
    row = q_one("SELECT * FROM trades WHERE id = %s", (trade_id,))
    if not row:
        raise HTTPException(status_code=404, detail="Trade not found")
    return serialize_doc_row(row)


def _auto_create_commission_invoice(t, trade_id, user):
    """t = trade data dict. Mirrors the old auto-generated commission invoice logic."""
    if q_one("SELECT 1 FROM invoices WHERE trade_id = %s AND auto_generated = true", (trade_id,)):
        return
    brokerage_per_mt = t.get("brokeragePerMT") or 0
    quantity = t.get("quantity") or 0
    commission_amount = brokerage_per_mt * quantity
    contract_num = t.get("BAContractNumber") or t.get("referenceNumber") or trade_id
    currency = t.get("currency") or "USD"
    seller_name = t.get("sellerName") or ""
    buyer_name = t.get("buyerName") or ""
    seller_code = t.get("sellerCode") or ""
    brokerage_account = t.get("brokerageAccount") or "seller"
    payer_name = buyer_name if brokerage_account == "buyer" else seller_name
    payer_id = t.get("buyerId") if brokerage_account == "buyer" else t.get("sellerId")
    payer_code = ""
    if payer_id:
        partner = _ref_data("partners", payer_id)
        if partner:
            payer_code = partner.get("companyCode", "")
    buyer_payment_date = t.get("buyerPaymentDate") or ""
    commodity_name = t.get("commodityName") or ""
    insert_document("invoices", {
        "invoiceNumber": f"COMM-{contract_num}",
        "vendorName": payer_code or seller_code or seller_name or payer_name or (t.get("brokerName") or "Broker"),
        "vendorCode": payer_code or seller_code,
        "amount": commission_amount,
        "currency": currency,
        "invoiceDate": buyer_payment_date,
        "dueDate": "",
        "category": "Commission Payment",
        "description": f"Brokerage commission for {commodity_name} trade {contract_num} ({seller_name} -> {buyer_name}). Qty: {quantity:,.0f} MT x {brokerage_per_mt} {currency}/MT",
        "status": "paid" if buyer_payment_date else "pending",
        "direction": "incoming",
        "tradeId": trade_id,
        "autoGenerated": True,
    })
    create_notification("accounting", f"Commission invoice auto-created for trade {contract_num}",
                        trade_id, user.get("username"), user.get("name"))


@router.put("/{trade_id}")
def update_trade(trade_id: str, body: dict, user=Depends(non_accountant)):
    old = q_one("SELECT data FROM trades WHERE id = %s", (trade_id,))
    old_data = (old.get("data") or {}) if old else {}
    old_status = old_data.get("status")

    unset_fields = [k for k, v in body.items() if v is None]
    data = {k: v for k, v in body.items() if v is not None}
    _resolve_ref_names(data)

    if data.get("originId") or data.get("commodityId") or data.get("cropYear"):
        adj = data.get("originAdjective") or old_data.get("originAdjective") or ""
        cname = data.get("commodityName") or old_data.get("commodityName") or ""
        cyear = data.get("cropYear") or old_data.get("cropYear") or ""
        data["commodityDisplayName"] = _compose_display_name(adj, cname, cyear)
    if "quantity" in data or "brokeragePerMT" in data:
        qty = data.get("quantity", old_data.get("quantity", 0)) or 0
        brok = data.get("brokeragePerMT", old_data.get("brokeragePerMT", 0)) or 0
        data["totalCommission"] = round(qty * brok, 2)
    if data.get("BAContractNumber"):
        data["contractNumber"] = data["BAContractNumber"]
        data["referenceNumber"] = data["BAContractNumber"]
    elif data.get("contractNumber"):
        data["BAContractNumber"] = data["contractNumber"]
        data["referenceNumber"] = data["contractNumber"]

    if data.get("status") == "completed" and old_status != "completed":
        check = {**old_data, **data}
        if not check.get("buyerPaymentDate"):
            raise HTTPException(status_code=400, detail="Cannot complete: Payment Date From Buyer is required")
        if not check.get("swiftFilePath"):
            raise HTTPException(status_code=400, detail="Cannot complete: SWIFT Copy upload is required")

    update_document("trades", trade_id, set_fields=data, unset_fields=unset_fields)
    updated_row = q_one("SELECT * FROM trades WHERE id = %s", (trade_id,))
    updated = updated_row.get("data") or {}
    create_notification("trade", f"Trade updated: {updated.get('BAContractNumber') or updated.get('referenceNumber', trade_id)}",
                        trade_id, user.get("username"), user.get("name"))

    if data.get("status") == "completed" and old_status != "completed":
        _auto_create_commission_invoice(updated, trade_id, user)

    if "buyerPaymentDate" in data:
        payment_date = data["buyerPaymentDate"]
        if payment_date:
            execute("UPDATE invoices SET data = data || %s::jsonb, invoice_date = %s, status = 'paid' "
                    "WHERE trade_id = %s AND auto_generated = true",
                    ('{"status":"paid"}', payment_date, trade_id))
            execute("UPDATE invoices SET data = jsonb_set(data, '{invoiceDate}', to_jsonb(%s::text)) "
                    "WHERE trade_id = %s AND auto_generated = true", (payment_date, trade_id))
        else:
            execute("UPDATE invoices SET status = 'pending', invoice_date = '', "
                    "data = jsonb_set(jsonb_set(data, '{status}', '\"pending\"'), '{invoiceDate}', '\"\"') "
                    "WHERE trade_id = %s AND auto_generated = true", (trade_id,))

    return serialize_doc_row(updated_row)


@router.patch("/{trade_id}/status")
def update_trade_status(trade_id: str, body: TradeStatusUpdate, user=Depends(non_accountant)):
    old = q_one("SELECT data FROM trades WHERE id = %s", (trade_id,))
    old_data = (old.get("data") or {}) if old else {}
    old_status = old_data.get("status")

    if body.status == "completed" and old_status != "completed":
        if not old_data.get("buyerPaymentDate"):
            raise HTTPException(status_code=400, detail="Cannot complete: Payment Date From Buyer is required")
        if not old_data.get("swiftFilePath"):
            raise HTTPException(status_code=400, detail="Cannot complete: SWIFT Copy upload is required")

    update_document("trades", trade_id, set_fields={"status": body.status})
    t = (q_one("SELECT data FROM trades WHERE id = %s", (trade_id,)).get("data") or {})
    create_notification("trade", f"Trade {t.get('referenceNumber', trade_id)} status changed to {body.status}",
                        trade_id, user.get("username"), user.get("name"))

    if body.status == "completed" and old_status != "completed":
        _auto_create_commission_invoice(t, trade_id, user)

    return serialize_doc_row(q_one("SELECT * FROM trades WHERE id = %s", (trade_id,)))


@router.delete("/{trade_id}")
def delete_trade(trade_id: str, user=Depends(non_accountant)):
    existing = q_one("SELECT data FROM trades WHERE id = %s", (trade_id,))
    if existing is None:
        raise HTTPException(status_code=404, detail="Trade not found")
    ref = (existing.get("data") or {}).get("referenceNumber", trade_id)
    delete_document("trades", trade_id)
    create_notification("trade", f"Trade deleted: {ref}", trade_id, user.get("username"), user.get("name"))
    return {"message": "Trade deleted"}


# ─── File uploads ────────────────────────────────────────────────────────────
UPLOAD_DIR = os.environ.get("UPLOAD_DIR", "/app/backend/uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)


def _require_trade(trade_id):
    row = q_one("SELECT * FROM trades WHERE id = %s", (trade_id,))
    if not row:
        raise HTTPException(status_code=404, detail="Trade not found")
    return row


async def _save_upload(file, filename):
    filepath = os.path.join(UPLOAD_DIR, filename)
    with open(filepath, "wb") as f:
        f.write(await file.read())
    return filepath


@router.post("/{trade_id}/upload-di")
async def upload_di_document(trade_id: str, file: UploadFile = File(...), user=Depends(non_accountant)):
    if not file.filename.lower().endswith(('.pdf', '.doc', '.docx')):
        raise HTTPException(status_code=400, detail="Only PDF and Word documents are allowed")
    ext = file.filename.rsplit('.', 1)[-1]
    filename = f"di_{trade_id}.{ext}"
    await _save_upload(file, filename)
    update_document("trades", trade_id, set_fields={"diDocumentFilename": file.filename, "diDocumentPath": filename})
    return {"filename": file.filename, "path": filename}


@router.get("/{trade_id}/download-di")
def download_di_document(trade_id: str, user=Depends(non_accountant)):
    from fastapi.responses import FileResponse
    t = _require_trade(trade_id).get("data") or {}
    if not t.get("diDocumentPath"):
        raise HTTPException(status_code=404, detail="No DI document found")
    filepath = os.path.join(UPLOAD_DIR, t["diDocumentPath"])
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(filepath, filename=t.get("diDocumentFilename", "di_document"), media_type="application/octet-stream")


@router.delete("/{trade_id}/upload-di")
def delete_di_document(trade_id: str, user=Depends(non_accountant)):
    t = _require_trade(trade_id).get("data") or {}
    if not t.get("diDocumentPath"):
        raise HTTPException(status_code=404, detail="No DI document found")
    filepath = os.path.join(UPLOAD_DIR, t["diDocumentPath"])
    if os.path.exists(filepath):
        os.remove(filepath)
    update_document("trades", trade_id, set_fields={"diReceived": False},
                    unset_fields=["diDocumentFilename", "diDocumentPath"])
    return {"message": "DI document deleted"}


def _make_file_endpoints(kind, name_field, path_field, prefix):
    @router.post(f"/{{trade_id}}/upload-{kind}")
    async def _upload(trade_id: str, file: UploadFile = File(...), user=Depends(non_accountant)):
        ext = os.path.splitext(file.filename)[1]
        filename = f"{prefix}_{trade_id}{ext}"
        await _save_upload(file, filename)
        update_document("trades", trade_id, set_fields={name_field: file.filename, path_field: filename})
        return serialize_doc_row(q_one("SELECT * FROM trades WHERE id = %s", (trade_id,)))

    @router.get(f"/{{trade_id}}/download-{kind}")
    def _download(trade_id: str, user=Depends(non_accountant)):
        from fastapi.responses import FileResponse
        t = _require_trade(trade_id).get("data") or {}
        if not t.get(path_field):
            raise HTTPException(status_code=404, detail=f"No {kind} found")
        filepath = os.path.join(UPLOAD_DIR, t[path_field])
        if not os.path.exists(filepath):
            raise HTTPException(status_code=404, detail="File not found")
        return FileResponse(filepath, filename=t.get(name_field, kind), media_type="application/octet-stream")

    @router.delete(f"/{{trade_id}}/upload-{kind}")
    def _delete(trade_id: str, user=Depends(non_accountant)):
        t = _require_trade(trade_id).get("data") or {}
        if not t.get(path_field):
            raise HTTPException(status_code=404, detail=f"No {kind} found")
        filepath = os.path.join(UPLOAD_DIR, t[path_field])
        if os.path.exists(filepath):
            os.remove(filepath)
        update_document("trades", trade_id, set_fields={}, unset_fields=[name_field, path_field])
        return {"message": f"{kind} deleted"}
    return _upload, _download, _delete


_make_file_endpoints("swift", "swiftFileName", "swiftFilePath", "swift")
_make_file_endpoints("shortage-doc", "shortageDocFileName", "shortageDocFilePath", "shortage_doc")
_make_file_endpoints("shortage-invoice", "shortageInvFileName", "shortageInvFilePath", "shortage_inv")


@router.put("/{trade_id}/shortage-payment-date")
async def update_shortage_payment_date(trade_id: str, body: dict, user=Depends(non_accountant)):
    update_document("trades", trade_id, set_fields={"shortagePaymentDate": body.get("shortagePaymentDate", "")})
    return serialize_doc_row(q_one("SELECT * FROM trades WHERE id = %s", (trade_id,)))


# ─── Draft documents (nested array) ──────────────────────────────────────────
@router.get("/{trade_id}/draft-documents")
def get_draft_documents(trade_id: str, user=Depends(non_accountant)):
    return (_require_trade(trade_id).get("data") or {}).get("draftDocuments", [])


@router.post("/{trade_id}/draft-documents")
async def upload_draft_document(trade_id: str, file: UploadFile = File(...), docName: str = "", user=Depends(non_accountant)):
    t = _require_trade(trade_id).get("data") or {}
    draft_dir = os.path.join(UPLOAD_DIR, "drafts", trade_id)
    os.makedirs(draft_dir, exist_ok=True)
    import uuid
    ext = os.path.splitext(file.filename)[1]
    path = os.path.join(draft_dir, f"{uuid.uuid4().hex[:8]}{ext}")
    with open(path, "wb") as f:
        f.write(await file.read())
    drafts = t.get("draftDocuments", []) or []
    drafts.append({"docName": docName, "fileName": file.filename, "storedPath": path,
                   "uploadedAt": datetime.now(timezone.utc).isoformat()})
    update_document("trades", trade_id, set_fields={"draftDocuments": drafts})
    return drafts


@router.delete("/{trade_id}/draft-documents/{doc_index}")
def delete_draft_document(trade_id: str, doc_index: int, user=Depends(non_accountant)):
    drafts = (_require_trade(trade_id).get("data") or {}).get("draftDocuments", []) or []
    if doc_index < 0 or doc_index >= len(drafts):
        raise HTTPException(status_code=404, detail="Document not found")
    path = drafts[doc_index].get("storedPath", "")
    if path and os.path.exists(path):
        os.remove(path)
    drafts.pop(doc_index)
    update_document("trades", trade_id, set_fields={"draftDocuments": drafts})
    return drafts


@router.get("/{trade_id}/draft-documents/{doc_index}/download")
def download_draft_document(trade_id: str, doc_index: int, user=Depends(non_accountant)):
    from fastapi.responses import FileResponse
    import mimetypes
    drafts = (_require_trade(trade_id).get("data") or {}).get("draftDocuments", []) or []
    if doc_index < 0 or doc_index >= len(drafts):
        raise HTTPException(status_code=404, detail="Document not found")
    doc = drafts[doc_index]
    path = doc.get("storedPath", "")
    if not path or not os.path.exists(path):
        raise HTTPException(status_code=404, detail="File not found on disk")
    filename = doc.get("fileName", "document")
    content_type = mimetypes.guess_type(filename)[0] or "application/octet-stream"
    return FileResponse(path, filename=filename, media_type=content_type)


@router.put("/{trade_id}/draft-documents/{doc_index}/reassign")
def reassign_draft_document(trade_id: str, doc_index: int, body: dict, user=Depends(non_accountant)):
    drafts = (_require_trade(trade_id).get("data") or {}).get("draftDocuments", []) or []
    if doc_index < 0 or doc_index >= len(drafts):
        raise HTTPException(status_code=404, detail="Document not found")
    drafts[doc_index]["docName"] = body.get("docName", "_unassigned")
    update_document("trades", trade_id, set_fields={"draftDocuments": drafts})
    return drafts


@router.post("/{trade_id}/buyer-payment")
def set_buyer_payment(trade_id: str, body: dict, user=Depends(non_accountant)):
    payment_date = body.get("paymentDate", "")
    t = (_require_trade(trade_id).get("data") or {})

    def calc_due_date(date_str):
        try:
            d, m, y = date_str.split('/')
            base = datetime(int(y), int(m), int(d))
        except Exception:
            return ""
        due = base + timedelta(days=15)
        if due.weekday() == 5:
            due += timedelta(days=2)
        elif due.weekday() == 6:
            due += timedelta(days=1)
        return due.strftime('%d/%m/%Y')

    if payment_date:
        inv_no = t.get("invoiceNo") or f"COMM-{t.get('BAContractNumber') or t.get('referenceNumber') or ''}"
        update_document("trades", trade_id, set_fields={
            "buyerPaymentDate": payment_date, "invoiceDate": payment_date, "invoiceNo": inv_no,
            "status": "completed", "invoicePaid": True})
        commission = (t.get("blQuantity") or t.get("quantity") or 0) * (t.get("brokeragePerMT") or 0)
        currency = t.get("invoiceCurrency") or t.get("brokerageCurrency") or "USD"
        if t.get("invoiceCurrency") == "EUR" and t.get("exchangeRate"):
            commission = commission * t["exchangeRate"]
        due_date = calc_due_date(payment_date)
        existing = q_one("SELECT id FROM invoices WHERE trade_id = %s AND auto_generated = true AND direction = 'incoming'", (trade_id,))
        inv_fields = {"paymentDate": payment_date, "invoiceDate": payment_date, "dueDate": due_date,
                      "status": "paid", "amount": commission, "currency": currency, "invoiceNumber": inv_no}
        if existing:
            update_document("invoices", existing["id"], set_fields=inv_fields)
        else:
            insert_document("invoices", {
                **inv_fields,
                "vendorName": t.get("buyerName") or t.get("buyerCode") or "",
                "vendorCode": t.get("buyerCode") or "",
                "direction": "incoming", "category": "Commission Payment", "tradeId": trade_id,
                "autoGenerated": True,
                "description": f"Commission for {t.get('BAContractNumber') or t.get('referenceNumber') or trade_id}"})
        create_notification("trade", f"Buyer payment received for {t.get('BAContractNumber', '')}", trade_id, user.get("username"))
    else:
        update_document("trades", trade_id, set_fields={
            "buyerPaymentDate": "", "invoiceDate": "", "status": "ongoing", "invoicePaid": False})
        execute("DELETE FROM invoices WHERE trade_id = %s AND auto_generated = true AND direction = 'incoming'", (trade_id,))

    return serialize_doc_row(q_one("SELECT * FROM trades WHERE id = %s", (trade_id,)))
