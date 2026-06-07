from datetime import datetime
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends
from bson import ObjectId

from database import partners_col, serialize_doc, create_notification
from auth import require_roles
from models import PartnerCreate, PartnerNoteCreate, PartnerPromoteRequest

from pymongo import collation as pymongo_collation

non_accountant = require_roles("admin", "user")
turkish_collation = pymongo_collation.Collation("tr")

router = APIRouter(prefix="/api/partners", tags=["partners"])


@router.get("")
def list_partners(type: Optional[str] = None, search: Optional[str] = None, user=Depends(non_accountant)):
    query = {}
    if type and type != "all":
        query["type"] = type
    if search:
        query["$or"] = [
            {"companyName": {"$regex": search, "$options": "i"}},
            {"contactPerson": {"$regex": search, "$options": "i"}},
            {"email": {"$regex": search, "$options": "i"}},
            {"companyCode": {"$regex": search, "$options": "i"}},
        ]
    return [serialize_doc(p) for p in partners_col.find(query).sort("companyName", 1).collation(turkish_collation)]


@router.post("")
def create_partner(partner: PartnerCreate, user=Depends(non_accountant)):
    data = partner.dict()
    data["createdAt"] = datetime.utcnow()
    data["updatedAt"] = datetime.utcnow()
    result = partners_col.insert_one(data)
    data["_id"] = result.inserted_id
    create_notification("partner", f"New counterparty added: {data.get('companyName', '')}", str(result.inserted_id), user.get("username"))
    return serialize_doc(data)


@router.get("/{partner_id}")
def get_partner(partner_id: str, user=Depends(non_accountant)):
    partner = partners_col.find_one({"_id": ObjectId(partner_id)})
    if not partner:
        raise HTTPException(status_code=404, detail="Partner not found")
    return serialize_doc(partner)


@router.put("/{partner_id}")
def update_partner(partner_id: str, partner: PartnerCreate, user=Depends(non_accountant)):
    data = partner.dict()
    data["updatedAt"] = datetime.utcnow()
    partners_col.update_one({"_id": ObjectId(partner_id)}, {"$set": data})
    updated = partners_col.find_one({"_id": ObjectId(partner_id)})
    create_notification("partner", f"Counterparty updated: {updated.get('companyName', '')}", partner_id, user.get("username"))
    return serialize_doc(updated)


@router.post("/{partner_id}/notes")
def add_partner_note(partner_id: str, note: PartnerNoteCreate, user=Depends(non_accountant)):
    text = note.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Note text is required")

    entry = {
        "ts": datetime.utcnow().isoformat(),
        "source": "manual",
        "author": user.get("displayName") or user.get("username") or "DealSpot",
        "text": text,
    }
    result = partners_col.update_one(
        {"_id": ObjectId(partner_id)},
        {"$push": {"notesTimeline": entry}, "$set": {"updatedAt": datetime.utcnow()}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Partner not found")

    updated = partners_col.find_one({"_id": ObjectId(partner_id)})
    create_notification("partner", f"Note added: {updated.get('companyName', '')}", partner_id, user.get("username"))
    return serialize_doc(updated)


@router.post("/{partner_id}/promote")
def promote_partner(partner_id: str, req: PartnerPromoteRequest, user=Depends(non_accountant)):
    """Promote a 'network' partner to a trading counterparty.

    Sets kind='trading' and type=[chosen]. Idempotent — re-promoting just
    overwrites the type. Records the change as a manual entry on the
    notesTimeline so the lifecycle is visible in the detail view.
    """
    valid_types = ("seller", "buyer", "co-broker")
    if req.type not in valid_types:
        raise HTTPException(status_code=400, detail=f"type must be one of: {', '.join(valid_types)}")

    partner = partners_col.find_one({"_id": ObjectId(partner_id)})
    if not partner:
        raise HTTPException(status_code=404, detail="Partner not found")

    prev_kind = partner.get("kind") or "trading"
    author = user.get("displayName") or user.get("username") or "DealSpot"
    timeline_entry = {
        "ts": datetime.utcnow().isoformat(),
        "source": "manual",
        "author": author,
        "text": f"Promoted from {prev_kind} to trading/{req.type}",
    }
    partners_col.update_one(
        {"_id": ObjectId(partner_id)},
        {
            "$set": {
                "kind": "trading",
                "type": [req.type],
                "updatedAt": datetime.utcnow(),
            },
            "$push": {"notesTimeline": timeline_entry},
        },
    )

    updated = partners_col.find_one({"_id": ObjectId(partner_id)})
    create_notification(
        "partner",
        f"Promoted to {req.type}: {updated.get('companyName', '')}",
        partner_id,
        user.get("username"),
    )
    return serialize_doc(updated)


@router.delete("/{partner_id}")
def delete_partner(partner_id: str, user=Depends(non_accountant)):
    p = partners_col.find_one({"_id": ObjectId(partner_id)})
    partners_col.delete_one({"_id": ObjectId(partner_id)})
    create_notification("partner", f"Counterparty deleted: {p.get('companyName', '') if p else partner_id}", partner_id, user.get("username"))
    return {"message": "Partner deleted"}
