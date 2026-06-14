from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Depends

from database import (q_all, q_one, insert_document, update_document, delete_document,
                      serialize_doc_row, create_notification)
from auth import require_roles
from models import PartnerCreate, PartnerNoteCreate, PartnerPromoteRequest

non_accountant = require_roles("admin", "user")

router = APIRouter(prefix="/api/partners", tags=["partners"])


@router.get("")
def list_partners(type: str = None, search: str = None, user=Depends(non_accountant)):
    where, params = [], []
    if type and type != "all":
        # `type` is scalar string for some rows, array for others — match both shapes.
        where.append("(type = to_jsonb(%s::text) OR type @> jsonb_build_array(%s::text))")
        params += [type, type]
    if search:
        like = f"%{search}%"
        where.append("(company_name ILIKE %s OR contact_person ILIKE %s OR email ILIKE %s OR company_code ILIKE %s)")
        params += [like, like, like, like]
    sql = "SELECT * FROM partners"
    if where:
        sql += " WHERE " + " AND ".join(where)
    sql += ' ORDER BY company_name COLLATE "tr-TR-x-icu" ASC'
    return [serialize_doc_row(p) for p in q_all(sql, params)]


@router.post("")
def create_partner(partner: PartnerCreate, user=Depends(non_accountant)):
    row = insert_document("partners", partner.dict())
    create_notification("partner", f"New counterparty added: {partner.companyName}", str(row["id"]), user.get("username"))
    return serialize_doc_row(row)


@router.get("/{partner_id}")
def get_partner(partner_id: str, user=Depends(non_accountant)):
    row = q_one("SELECT * FROM partners WHERE id = %s", (partner_id,))
    if not row:
        raise HTTPException(status_code=404, detail="Partner not found")
    return serialize_doc_row(row)


@router.put("/{partner_id}")
def update_partner(partner_id: str, partner: PartnerCreate, user=Depends(non_accountant)):
    row = update_document("partners", partner_id, set_fields=partner.dict())
    if row is None:
        raise HTTPException(status_code=404, detail="Partner not found")
    create_notification("partner", f"Counterparty updated: {partner.companyName}", partner_id, user.get("username"))
    return serialize_doc_row(row)


@router.post("/{partner_id}/notes")
def add_partner_note(partner_id: str, note: PartnerNoteCreate, user=Depends(non_accountant)):
    text = note.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Note text is required")
    existing = q_one("SELECT data FROM partners WHERE id = %s", (partner_id,))
    if existing is None:
        raise HTTPException(status_code=404, detail="Partner not found")
    timeline = (existing.get("data") or {}).get("notesTimeline", []) or []
    timeline.append({
        "ts": datetime.now(timezone.utc).isoformat(),
        "source": "manual",
        "author": user.get("displayName") or user.get("username") or "DealSpot",
        "text": text,
    })
    row = update_document("partners", partner_id, set_fields={"notesTimeline": timeline})
    create_notification("partner", f"Note added: {(row.get('data') or {}).get('companyName', '')}", partner_id, user.get("username"))
    return serialize_doc_row(row)


@router.post("/{partner_id}/promote")
def promote_partner(partner_id: str, req: PartnerPromoteRequest, user=Depends(non_accountant)):
    valid_types = ("seller", "buyer", "co-broker")
    if req.type not in valid_types:
        raise HTTPException(status_code=400, detail=f"type must be one of: {', '.join(valid_types)}")
    existing = q_one("SELECT data FROM partners WHERE id = %s", (partner_id,))
    if existing is None:
        raise HTTPException(status_code=404, detail="Partner not found")
    data = existing.get("data") or {}
    prev_kind = data.get("kind") or "trading"
    timeline = data.get("notesTimeline", []) or []
    timeline.append({
        "ts": datetime.now(timezone.utc).isoformat(),
        "source": "manual",
        "author": user.get("displayName") or user.get("username") or "DealSpot",
        "text": f"Promoted from {prev_kind} to trading/{req.type}",
    })
    row = update_document("partners", partner_id,
                          set_fields={"kind": "trading", "type": [req.type], "notesTimeline": timeline})
    create_notification("partner", f"Promoted to {req.type}: {(row.get('data') or {}).get('companyName', '')}",
                        partner_id, user.get("username"))
    return serialize_doc_row(row)


@router.delete("/{partner_id}")
def delete_partner(partner_id: str, user=Depends(non_accountant)):
    existing = q_one("SELECT data FROM partners WHERE id = %s", (partner_id,))
    name = (existing.get("data") or {}).get("companyName", "") if existing else partner_id
    delete_document("partners", partner_id)
    create_notification("partner", f"Counterparty deleted: {name}", partner_id, user.get("username"))
    return {"message": "Partner deleted"}
