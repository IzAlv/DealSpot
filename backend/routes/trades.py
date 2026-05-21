from datetime import datetime, timedelta, timezone
from typing import Optional
import random
import string
import os
import base64

from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from bson import ObjectId

from database import (
    trades_col, partners_col, commodities_col, origins_col, ports_col,
    invoices_col, serialize_doc, create_notification
)
from auth import get_current_user, require_roles
from models import TradeCreate, TradeStatusUpdate
from config import TRADE_STATUSES

non_accountant = require_roles("admin", "user")


def generate_ref():
    year = datetime.now().strftime("%y")
    num = random.randint(1000, 9999)
    letters = ''.join(random.choices(string.ascii_uppercase, k=2))
    return f"PIR-{year}-{letters}{num}"


router = APIRouter(prefix="/api/trades", tags=["trades"])


@router.get("")
def list_trades(status: Optional[str] = None, search: Optional[str] = None, user=Depends(non_accountant)):
    query = {}
    if status and status != "all":
        query["status"] = status
    if search:
        query["$or"] = [
            {"pirContractNumber": {"$regex": search, "$options": "i"}},
            {"referenceNumber": {"$regex": search, "$options": "i"}},
            {"buyerName": {"$regex": search, "$options": "i"}},
            {"sellerName": {"$regex": search, "$options": "i"}},
            {"commodityName": {"$regex": search, "$options": "i"}},
            {"vesselName": {"$regex": search, "$options": "i"}},
        ]
    return [serialize_doc(t) for t in trades_col.find(query).sort("createdAt", -1)]


@router.post("")
def create_trade(trade: TradeCreate, user=Depends(non_accountant)):
    data = trade.dict()
    data["referenceNumber"] = data.get("contractNumber") or generate_ref()
    data["createdAt"] = datetime.utcnow()
    data["updatedAt"] = datetime.utcnow()
    for field, col, name_field, code_field in [
        ("buyerId", partners_col, "buyerName", "buyerCode"),
        ("sellerId", partners_col, "sellerName", "sellerCode"),
        ("brokerId", partners_col, "brokerName", "brokerCode"),
        ("coBrokerId", partners_col, "coBrokerName", "coBrokerCode"),
        ("commodityId", commodities_col, "commodityName", None),
        ("originId", origins_col, "originName", None),
        ("basePortId", ports_col, "basePortName", None),
        ("loadingPortId", ports_col, "loadingPortName", None),
        ("dischargePortId", ports_col, "dischargePortName", None),
    ]:
        if data.get(field):
            try:
                doc = col.find_one({"_id": ObjectId(data[field])})
                if doc:
                    data[name_field] = doc.get("companyName", doc.get("name", ""))
                    if code_field:
                        data[code_field] = doc.get("companyCode", "")
                    # Store port country
                    if "Port" in name_field and doc.get("country"):
                        data[name_field.replace("Name", "Country")] = doc.get("country", "")
            except Exception:
                pass
    # Compose commodity display name with origin adjective and crop year
    if data.get("originId"):
        try:
            origin_doc = origins_col.find_one({"_id": ObjectId(data["originId"])})
            if origin_doc and origin_doc.get("adjective"):
                data["originAdjective"] = origin_doc["adjective"]
        except Exception:
            pass
    adj = data.get("originAdjective") or ""
    cname = data.get("commodityName") or ""
    cyear = data.get("cropYear") or ""
    # Production commodities use "Prod." instead of "Crop"
    prod_keywords = ["pellet", "husk", "bran", "meal", "pulp"]
    year_prefix = "Prod." if any(kw in cname.lower() for kw in prod_keywords) else "Crop"
    if adj and cname and cyear:
        data["commodityDisplayName"] = f"{adj} {cname}, {year_prefix} {cyear}"
    elif adj and cname:
        data["commodityDisplayName"] = f"{adj} {cname}"
    else:
        data["commodityDisplayName"] = cname
    qty = data.get("quantity") or 0
    brok = data.get("brokeragePerMT") or 0
    data["totalCommission"] = round(qty * brok, 2)
    result = trades_col.insert_one(data)
    data["_id"] = result.inserted_id
    create_notification("trade", f"New trade created: {data.get('referenceNumber', '')}", str(result.inserted_id), user.get("username"), user.get("name"))
    return serialize_doc(data)


@router.get("/stats/overview")
def trade_stats(user=Depends(non_accountant)):
    total = trades_col.count_documents({})
    completed = trades_col.count_documents({"status": "completed"})
    cancelled = trades_col.count_documents({"status": {"$in": ["cancelled", "washout"]}})
    active_trades = list(trades_col.find({"status": {"$nin": ["completed", "cancelled", "washout"]}}))
    ongoing = sum(1 for t in active_trades if t.get("vesselName"))
    pending = sum(1 for t in active_trades if not t.get("vesselName"))
    pipeline = [{"$group": {"_id": "$status", "count": {"$sum": 1}}}]
    status_dist = {item["_id"]: item["count"] for item in trades_col.aggregate(pipeline)}
    return {
        "totalTrades": total,
        "activeTrades": ongoing,
        "pendingTrades": pending,
        "completedTrades": completed,
        "completionRate": round((completed / total * 100) if total > 0 else 0, 1),
        "statusDistribution": status_dist
    }


@router.get("/{trade_id}")
def get_trade(trade_id: str, user=Depends(non_accountant)):
    trade = trades_col.find_one({"_id": ObjectId(trade_id)})
    if not trade:
        raise HTTPException(status_code=404, detail="Trade not found")
    return serialize_doc(trade)


@router.put("/{trade_id}")
def update_trade(trade_id: str, body: dict, user=Depends(non_accountant)):
    # Separate null fields (to unset) from non-null fields (to set)
    fields_to_unset = {k: "" for k, v in body.items() if v is None}
    data = {k: v for k, v in body.items() if v is not None}
    data["updatedAt"] = datetime.utcnow()
    for field, col, name_field, code_field in [
        ("buyerId", partners_col, "buyerName", "buyerCode"),
        ("sellerId", partners_col, "sellerName", "sellerCode"),
        ("brokerId", partners_col, "brokerName", "brokerCode"),
        ("coBrokerId", partners_col, "coBrokerName", "coBrokerCode"),
        ("commodityId", commodities_col, "commodityName", None),
        ("originId", origins_col, "originName", None),
        ("basePortId", ports_col, "basePortName", None),
        ("loadingPortId", ports_col, "loadingPortName", None),
        ("dischargePortId", ports_col, "dischargePortName", None),
    ]:
        if data.get(field):
            try:
                doc = col.find_one({"_id": ObjectId(data[field])})
                if doc:
                    data[name_field] = doc.get("companyName", doc.get("name", ""))
                    if code_field:
                        data[code_field] = doc.get("companyCode", "")
                    # Store port country
                    if "Port" in name_field and doc.get("country"):
                        data[name_field.replace("Name", "Country")] = doc.get("country", "")
            except Exception:
                pass
    # Compose commodity display name with origin adjective and crop year on update
    if data.get("originId") or data.get("commodityId") or data.get("cropYear"):
        existing_t = trades_col.find_one({"_id": ObjectId(trade_id)}) or {}
        if data.get("originId"):
            try:
                origin_doc = origins_col.find_one({"_id": ObjectId(data["originId"])})
                if origin_doc and origin_doc.get("adjective"):
                    data["originAdjective"] = origin_doc["adjective"]
            except Exception:
                pass
        adj = data.get("originAdjective") or existing_t.get("originAdjective") or ""
        cname = data.get("commodityName") or existing_t.get("commodityName") or ""
        cyear = data.get("cropYear") or existing_t.get("cropYear") or ""
        prod_keywords = ["pellet", "husk", "bran", "meal", "pulp"]
        year_prefix = "Prod." if any(kw in cname.lower() for kw in prod_keywords) else "Crop"
        if adj and cname and cyear:
            data["commodityDisplayName"] = f"{adj} {cname}, {year_prefix} {cyear}"
        elif adj and cname:
            data["commodityDisplayName"] = f"{adj} {cname}"
        else:
            data["commodityDisplayName"] = cname
    if "quantity" in data or "brokeragePerMT" in data:
        existing = trades_col.find_one({"_id": ObjectId(trade_id)})
        qty = data.get("quantity", existing.get("quantity", 0) if existing else 0) or 0
        brok = data.get("brokeragePerMT", existing.get("brokeragePerMT", 0) if existing else 0) or 0
        data["totalCommission"] = round(qty * brok, 2)
    # Keep pirContractNumber, contractNumber, and referenceNumber in sync
    if data.get("pirContractNumber"):
        data["contractNumber"] = data["pirContractNumber"]
        data["referenceNumber"] = data["pirContractNumber"]
    elif data.get("contractNumber"):
        data["pirContractNumber"] = data["contractNumber"]
        data["referenceNumber"] = data["contractNumber"]
    old_trade = trades_col.find_one({"_id": ObjectId(trade_id)})
    old_status = old_trade.get("status") if old_trade else None

    # Validate completion requirements
    if data.get("status") == "completed" and old_status != "completed":
        check_trade = {**old_trade, **data} if old_trade else data
        if not check_trade.get("buyerPaymentDate"):
            raise HTTPException(status_code=400, detail="Cannot complete: Payment Date From Buyer is required")
        if not check_trade.get("swiftFilePath"):
            raise HTTPException(status_code=400, detail="Cannot complete: SWIFT Copy upload is required")

    update_ops = {"$set": data}
    if fields_to_unset:
        update_ops["$unset"] = fields_to_unset
    trades_col.update_one({"_id": ObjectId(trade_id)}, update_ops)
    updated = trades_col.find_one({"_id": ObjectId(trade_id)})
    create_notification("trade", f"Trade updated: {updated.get('pirContractNumber') or updated.get('referenceNumber', trade_id)}", trade_id, user.get("username"), user.get("name"))

    # Auto-create commission invoice when trade is completed via PUT
    if data.get("status") == "completed" and old_status != "completed":
        existing_inv = invoices_col.find_one({"tradeId": trade_id, "autoGenerated": True})
        if not existing_inv:
            brokerage_per_mt = updated.get("brokeragePerMT") or 0
            quantity = updated.get("quantity") or 0
            commission_amount = brokerage_per_mt * quantity
            contract_num = updated.get("pirContractNumber") or updated.get("referenceNumber") or trade_id
            broker_name = updated.get("brokerName") or "Broker"
            commodity_name = updated.get("commodityName") or ""
            currency = updated.get("currency") or "USD"
            seller_name = updated.get("sellerName") or ""
            buyer_name = updated.get("buyerName") or ""
            seller_code = updated.get("sellerCode") or ""
            buyer_code = updated.get("buyerCode") or ""
            brokerage_account = updated.get("brokerageAccount") or "seller"
            payer_name = buyer_name if brokerage_account == "buyer" else seller_name
            payer_id = updated.get("buyerId") if brokerage_account == "buyer" else updated.get("sellerId")
            payer_code = ""
            if payer_id:
                partner = partners_col.find_one({"_id": ObjectId(payer_id)})
                if partner:
                    payer_code = partner.get("companyCode", "")
            buyer_payment_date = updated.get("buyerPaymentDate") or ""
            invoice_data = {
                "invoiceNumber": f"COMM-{contract_num}",
                "vendorName": payer_code or seller_code or seller_name or payer_name or broker_name,
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
                "createdAt": datetime.utcnow(),
            }
            invoices_col.insert_one(invoice_data)
            create_notification("accounting", f"Commission invoice auto-created for trade {contract_num}", trade_id, user.get("username"), user.get("name"))

    # Sync buyerPaymentDate to accounting invoice
    if "buyerPaymentDate" in data:
        payment_date = data["buyerPaymentDate"]
        inv_update = {"invoiceDate": payment_date}
        if payment_date:
            inv_update["status"] = "paid"
        else:
            inv_update["status"] = "pending"
            inv_update["invoiceDate"] = ""
        invoices_col.update_many(
            {"tradeId": trade_id, "autoGenerated": True},
            {"$set": inv_update}
        )

    return serialize_doc(updated)


@router.patch("/{trade_id}/status")
def update_trade_status(trade_id: str, body: TradeStatusUpdate, user=Depends(non_accountant)):
    old_trade = trades_col.find_one({"_id": ObjectId(trade_id)})
    old_status = old_trade.get("status") if old_trade else None

    # Validate completion requirements
    if body.status == "completed" and old_status != "completed":
        if not old_trade.get("buyerPaymentDate"):
            raise HTTPException(status_code=400, detail="Cannot complete: Payment Date From Buyer is required")
        if not old_trade.get("swiftFilePath"):
            raise HTTPException(status_code=400, detail="Cannot complete: SWIFT Copy upload is required")

    trades_col.update_one({"_id": ObjectId(trade_id)}, {"$set": {"status": body.status, "updatedAt": datetime.utcnow()}})
    t = trades_col.find_one({"_id": ObjectId(trade_id)})
    create_notification("trade", f"Trade {t.get('referenceNumber', trade_id)} status changed to {body.status}", trade_id, user.get("username"), user.get("name"))

    # Auto-create commission invoice when trade is completed
    if body.status == "completed" and old_status != "completed":
        existing = invoices_col.find_one({"tradeId": trade_id, "autoGenerated": True})
        if not existing:
            brokerage_per_mt = t.get("brokeragePerMT") or 0
            quantity = t.get("quantity") or 0
            commission_amount = brokerage_per_mt * quantity
            contract_num = t.get("pirContractNumber") or t.get("referenceNumber") or trade_id
            broker_name = t.get("brokerName") or "Broker"
            commodity_name = t.get("commodityName") or ""
            currency = t.get("currency") or "USD"
            seller_name = t.get("sellerName") or ""
            buyer_name = t.get("buyerName") or ""
            seller_code = t.get("sellerCode") or ""
            buyer_code = t.get("buyerCode") or ""
            brokerage_account = t.get("brokerageAccount") or "seller"
            payer_name = buyer_name if brokerage_account == "buyer" else seller_name
            payer_id = t.get("buyerId") if brokerage_account == "buyer" else t.get("sellerId")
            payer_code = ""
            if payer_id:
                partner = partners_col.find_one({"_id": ObjectId(payer_id)})
                if partner:
                    payer_code = partner.get("companyCode", "")

            buyer_payment_date = t.get("buyerPaymentDate") or ""
            invoice_data = {
                "invoiceNumber": f"COMM-{contract_num}",
                "vendorName": payer_code or seller_code or seller_name or payer_name or broker_name,
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
                "createdAt": datetime.utcnow(),
            }
            invoices_col.insert_one(invoice_data)
            create_notification("accounting", f"Commission invoice auto-created for trade {contract_num}", trade_id, user.get("username"), user.get("name"))

    return serialize_doc(t)


@router.delete("/{trade_id}")
def delete_trade(trade_id: str, user=Depends(non_accountant)):
    t = trades_col.find_one({"_id": ObjectId(trade_id)})
    result = trades_col.delete_one({"_id": ObjectId(trade_id)})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Trade not found")
    create_notification("trade", f"Trade deleted: {t.get('referenceNumber', trade_id) if t else trade_id}", trade_id, user.get("username"), user.get("name"))
    return {"message": "Trade deleted"}


UPLOAD_DIR = "/app/backend/uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)


@router.post("/{trade_id}/upload-di")
async def upload_di_document(trade_id: str, file: UploadFile = File(...), user=Depends(non_accountant)):
    if not file.filename.lower().endswith(('.pdf', '.doc', '.docx')):
        raise HTTPException(status_code=400, detail="Only PDF and Word documents are allowed")
    ext = file.filename.rsplit('.', 1)[-1]
    filename = f"di_{trade_id}.{ext}"
    filepath = os.path.join(UPLOAD_DIR, filename)
    content = await file.read()
    with open(filepath, "wb") as f:
        f.write(content)
    trades_col.update_one(
        {"_id": ObjectId(trade_id)},
        {"$set": {"diDocumentFilename": file.filename, "diDocumentPath": filename}}
    )
    return {"filename": file.filename, "path": filename}


@router.get("/{trade_id}/download-di")
def download_di_document(trade_id: str, user=Depends(non_accountant)):
    from fastapi.responses import FileResponse
    trade = trades_col.find_one({"_id": ObjectId(trade_id)})
    if not trade or not trade.get("diDocumentPath"):
        raise HTTPException(status_code=404, detail="No DI document found")
    filepath = os.path.join(UPLOAD_DIR, trade["diDocumentPath"])
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(filepath, filename=trade.get("diDocumentFilename", "di_document"), media_type="application/octet-stream")


@router.delete("/{trade_id}/upload-di")
def delete_di_document(trade_id: str, user=Depends(non_accountant)):
    trade = trades_col.find_one({"_id": ObjectId(trade_id)})
    if not trade or not trade.get("diDocumentPath"):
        raise HTTPException(status_code=404, detail="No DI document found")
    filepath = os.path.join(UPLOAD_DIR, trade["diDocumentPath"])
    if os.path.exists(filepath):
        os.remove(filepath)
    trades_col.update_one(
        {"_id": ObjectId(trade_id)},
        {"$unset": {"diDocumentFilename": "", "diDocumentPath": ""}, "$set": {"diReceived": False}}
    )
    return {"message": "DI document deleted"}


@router.post("/{trade_id}/upload-swift")
async def upload_swift_copy(trade_id: str, file: UploadFile = File(...), user=Depends(non_accountant)):
    ext = os.path.splitext(file.filename)[1]
    filename = f"swift_{trade_id}{ext}"
    filepath = os.path.join(UPLOAD_DIR, filename)
    content = await file.read()
    with open(filepath, "wb") as f:
        f.write(content)
    trades_col.update_one(
        {"_id": ObjectId(trade_id)},
        {"$set": {"swiftFileName": file.filename, "swiftFilePath": filename}}
    )
    return serialize_doc(trades_col.find_one({"_id": ObjectId(trade_id)}))


@router.get("/{trade_id}/download-swift")
def download_swift_copy(trade_id: str, user=Depends(non_accountant)):
    from fastapi.responses import FileResponse
    trade = trades_col.find_one({"_id": ObjectId(trade_id)})
    if not trade or not trade.get("swiftFilePath"):
        raise HTTPException(status_code=404, detail="No SWIFT copy found")
    filepath = os.path.join(UPLOAD_DIR, trade["swiftFilePath"])
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(filepath, filename=trade.get("swiftFileName", "swift_copy"), media_type="application/octet-stream")


@router.delete("/{trade_id}/upload-swift")
def delete_swift_copy(trade_id: str, user=Depends(non_accountant)):
    trade = trades_col.find_one({"_id": ObjectId(trade_id)})
    if not trade or not trade.get("swiftFilePath"):
        raise HTTPException(status_code=404, detail="No SWIFT copy found")
    filepath = os.path.join(UPLOAD_DIR, trade["swiftFilePath"])
    if os.path.exists(filepath):
        os.remove(filepath)
    trades_col.update_one(
        {"_id": ObjectId(trade_id)},
        {"$unset": {"swiftFileName": "", "swiftFilePath": ""}}
    )
    return {"message": "SWIFT copy deleted"}


# --- Shortage Document Upload/Download/Delete ---
@router.post("/{trade_id}/upload-shortage-doc")
async def upload_shortage_doc(trade_id: str, file: UploadFile = File(...), user=Depends(non_accountant)):
    ext = os.path.splitext(file.filename)[1]
    filename = f"shortage_doc_{trade_id}{ext}"
    filepath = os.path.join(UPLOAD_DIR, filename)
    content = await file.read()
    with open(filepath, "wb") as f:
        f.write(content)
    trades_col.update_one({"_id": ObjectId(trade_id)}, {"$set": {"shortageDocFileName": file.filename, "shortageDocFilePath": filename}})
    return serialize_doc(trades_col.find_one({"_id": ObjectId(trade_id)}))

@router.get("/{trade_id}/download-shortage-doc")
def download_shortage_doc(trade_id: str, user=Depends(non_accountant)):
    from fastapi.responses import FileResponse
    trade = trades_col.find_one({"_id": ObjectId(trade_id)})
    if not trade or not trade.get("shortageDocFilePath"):
        raise HTTPException(status_code=404, detail="No shortage document found")
    filepath = os.path.join(UPLOAD_DIR, trade["shortageDocFilePath"])
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(filepath, filename=trade.get("shortageDocFileName", "shortage_doc"), media_type="application/octet-stream")

@router.delete("/{trade_id}/upload-shortage-doc")
def delete_shortage_doc(trade_id: str, user=Depends(non_accountant)):
    trade = trades_col.find_one({"_id": ObjectId(trade_id)})
    if not trade or not trade.get("shortageDocFilePath"):
        raise HTTPException(status_code=404, detail="No shortage document found")
    filepath = os.path.join(UPLOAD_DIR, trade["shortageDocFilePath"])
    if os.path.exists(filepath):
        os.remove(filepath)
    trades_col.update_one({"_id": ObjectId(trade_id)}, {"$unset": {"shortageDocFileName": "", "shortageDocFilePath": ""}})
    return {"message": "Shortage document deleted"}


# --- Shortage Invoice Upload/Download/Delete ---
@router.post("/{trade_id}/upload-shortage-invoice")
async def upload_shortage_invoice(trade_id: str, file: UploadFile = File(...), user=Depends(non_accountant)):
    ext = os.path.splitext(file.filename)[1]
    filename = f"shortage_inv_{trade_id}{ext}"
    filepath = os.path.join(UPLOAD_DIR, filename)
    content = await file.read()
    with open(filepath, "wb") as f:
        f.write(content)
    trades_col.update_one({"_id": ObjectId(trade_id)}, {"$set": {"shortageInvFileName": file.filename, "shortageInvFilePath": filename}})
    return serialize_doc(trades_col.find_one({"_id": ObjectId(trade_id)}))

@router.get("/{trade_id}/download-shortage-invoice")
def download_shortage_invoice(trade_id: str, user=Depends(non_accountant)):
    from fastapi.responses import FileResponse
    trade = trades_col.find_one({"_id": ObjectId(trade_id)})
    if not trade or not trade.get("shortageInvFilePath"):
        raise HTTPException(status_code=404, detail="No shortage invoice found")
    filepath = os.path.join(UPLOAD_DIR, trade["shortageInvFilePath"])
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(filepath, filename=trade.get("shortageInvFileName", "shortage_invoice"), media_type="application/octet-stream")

@router.delete("/{trade_id}/upload-shortage-invoice")
def delete_shortage_invoice(trade_id: str, user=Depends(non_accountant)):
    trade = trades_col.find_one({"_id": ObjectId(trade_id)})
    if not trade or not trade.get("shortageInvFilePath"):
        raise HTTPException(status_code=404, detail="No shortage invoice found")
    filepath = os.path.join(UPLOAD_DIR, trade["shortageInvFilePath"])
    if os.path.exists(filepath):
        os.remove(filepath)
    trades_col.update_one({"_id": ObjectId(trade_id)}, {"$unset": {"shortageInvFileName": "", "shortageInvFilePath": ""}})
    return {"message": "Shortage invoice deleted"}


# --- Shortage Payment Date ---
@router.put("/{trade_id}/shortage-payment-date")
async def update_shortage_payment_date(trade_id: str, body: dict, user=Depends(non_accountant)):
    date_val = body.get("shortagePaymentDate", "")
    trades_col.update_one({"_id": ObjectId(trade_id)}, {"$set": {"shortagePaymentDate": date_val}})
    return serialize_doc(trades_col.find_one({"_id": ObjectId(trade_id)}))


@router.get("/{trade_id}/draft-documents")
def get_draft_documents(trade_id: str, user=Depends(non_accountant)):
    trade = trades_col.find_one({"_id": ObjectId(trade_id)})
    if not trade:
        raise HTTPException(status_code=404, detail="Trade not found")
    return trade.get("draftDocuments", [])


@router.post("/{trade_id}/draft-documents")
async def upload_draft_document(trade_id: str, file: UploadFile = File(...), docName: str = "", user=Depends(non_accountant)):
    trade = trades_col.find_one({"_id": ObjectId(trade_id)})
    if not trade:
        raise HTTPException(status_code=404, detail="Trade not found")
    draft_dir = os.path.join(UPLOAD_DIR, "drafts", trade_id)
    os.makedirs(draft_dir, exist_ok=True)
    ext = os.path.splitext(file.filename)[1]
    import uuid
    stored_name = f"{uuid.uuid4().hex[:8]}{ext}"
    path = os.path.join(draft_dir, stored_name)
    with open(path, "wb") as f:
        f.write(await file.read())
    doc_entry = {
        "docName": docName,
        "fileName": file.filename,
        "storedPath": path,
        "uploadedAt": datetime.now(timezone.utc).isoformat()
    }
    trades_col.update_one(
        {"_id": ObjectId(trade_id)},
        {"$push": {"draftDocuments": doc_entry}}
    )
    return trades_col.find_one({"_id": ObjectId(trade_id)}).get("draftDocuments", [])


@router.delete("/{trade_id}/draft-documents/{doc_index}")
def delete_draft_document(trade_id: str, doc_index: int, user=Depends(non_accountant)):
    trade = trades_col.find_one({"_id": ObjectId(trade_id)})
    if not trade:
        raise HTTPException(status_code=404, detail="Trade not found")
    drafts = trade.get("draftDocuments", [])
    if doc_index < 0 or doc_index >= len(drafts):
        raise HTTPException(status_code=404, detail="Document not found")
    doc = drafts[doc_index]
    path = doc.get("storedPath", "")
    if path and os.path.exists(path):
        os.remove(path)
    drafts.pop(doc_index)
    trades_col.update_one({"_id": ObjectId(trade_id)}, {"$set": {"draftDocuments": drafts}})
    return drafts


@router.get("/{trade_id}/draft-documents/{doc_index}/download")
def download_draft_document(trade_id: str, doc_index: int, user=Depends(non_accountant)):
    from fastapi.responses import FileResponse
    import mimetypes
    trade = trades_col.find_one({"_id": ObjectId(trade_id)})
    if not trade:
        raise HTTPException(status_code=404, detail="Trade not found")
    drafts = trade.get("draftDocuments", [])
    if doc_index < 0 or doc_index >= len(drafts):
        raise HTTPException(status_code=404, detail="Document not found")
    doc = drafts[doc_index]
    path = doc.get("storedPath", "")
    if not path or not os.path.exists(path):
        raise HTTPException(status_code=404, detail="File not found on disk")
    filename = doc.get("fileName", "document")
    content_type, _ = mimetypes.guess_type(filename)
    if not content_type:
        content_type = "application/octet-stream"
    return FileResponse(path, filename=filename, media_type=content_type)


@router.put("/{trade_id}/draft-documents/{doc_index}/reassign")
def reassign_draft_document(trade_id: str, doc_index: int, body: dict, user=Depends(non_accountant)):
    trade = trades_col.find_one({"_id": ObjectId(trade_id)})
    if not trade:
        raise HTTPException(status_code=404, detail="Trade not found")
    drafts = trade.get("draftDocuments", [])
    if doc_index < 0 or doc_index >= len(drafts):
        raise HTTPException(status_code=404, detail="Document not found")
    new_name = body.get("docName", "_unassigned")
    drafts[doc_index]["docName"] = new_name
    trades_col.update_one({"_id": ObjectId(trade_id)}, {"$set": {"draftDocuments": drafts}})
    return drafts




@router.post("/{trade_id}/buyer-payment")
def set_buyer_payment(trade_id: str, body: dict, user=Depends(non_accountant)):
    payment_date = body.get("paymentDate", "")
    trade = trades_col.find_one({"_id": ObjectId(trade_id)})
    if not trade:
        raise HTTPException(status_code=404, detail="Trade not found")

    def calc_due_date(date_str):
        """15 days from date, skip to Monday if falls on Sat/Sun (Turkey weekends)"""
        try:
            d, m, y = date_str.split('/')
            base = datetime(int(y), int(m), int(d))
        except Exception:
            return ""
        due = base + timedelta(days=15)
        # Saturday=5, Sunday=6
        if due.weekday() == 5:
            due += timedelta(days=2)
        elif due.weekday() == 6:
            due += timedelta(days=1)
        return due.strftime('%d/%m/%Y')

    if payment_date:
        inv_no = trade.get("invoiceNo") or f"COMM-{trade.get('pirContractNumber') or trade.get('referenceNumber') or ''}"
        trades_col.update_one(
            {"_id": ObjectId(trade_id)},
            {"$set": {
                "buyerPaymentDate": payment_date,
                "invoiceDate": payment_date,
                "invoiceNo": inv_no,
                "status": "completed",
                "invoicePaid": True,
            }}
        )
        commission = (trade.get("blQuantity") or trade.get("quantity") or 0) * (trade.get("brokeragePerMT") or 0)
        currency = trade.get("invoiceCurrency") or trade.get("brokerageCurrency") or "USD"
        if trade.get("invoiceCurrency") == "EUR" and trade.get("exchangeRate"):
            commission = commission * trade["exchangeRate"]
        due_date = calc_due_date(payment_date)
        existing = invoices_col.find_one({"tradeId": trade_id, "autoGenerated": True, "direction": "incoming"})
        invoice_data = {
            "paymentDate": payment_date,
            "invoiceDate": payment_date,
            "dueDate": due_date,
            "status": "paid",
            "amount": commission,
            "currency": currency,
            "invoiceNumber": inv_no,
        }
        if existing:
            invoices_col.update_one({"_id": existing["_id"]}, {"$set": invoice_data})
        else:
            invoices_col.insert_one({
                **invoice_data,
                "vendorName": trade.get("buyerName") or trade.get("buyerCode") or "",
                "vendorCode": trade.get("buyerCode") or "",
                "direction": "incoming",
                "category": "Commission Payment",
                "tradeId": trade_id,
                "autoGenerated": True,
                "description": f"Commission for {trade.get('pirContractNumber') or trade.get('referenceNumber') or trade_id}",
                "createdAt": datetime.utcnow(),
            })
        create_notification("trade", f"Buyer payment received for {trade.get('pirContractNumber', '')}", trade_id, user.get("username"))
    else:
        trades_col.update_one(
            {"_id": ObjectId(trade_id)},
            {"$set": {
                "buyerPaymentDate": "",
                "invoiceDate": "",
                "status": "ongoing",
                "invoicePaid": False,
            }}
        )
        invoices_col.delete_many({"tradeId": trade_id, "autoGenerated": True, "direction": "incoming"})

    updated = trades_col.find_one({"_id": ObjectId(trade_id)})
    return serialize_doc(updated)
