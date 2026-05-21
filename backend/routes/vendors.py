from datetime import datetime
from fastapi import APIRouter, Depends
from bson import ObjectId

from database import vendors_col, serialize_doc
from auth import require_roles

non_accountant = require_roles("admin", "user")
any_role = require_roles("admin", "user", "accountant")

router = APIRouter(prefix="/api/vendors", tags=["vendors"])


@router.get("")
def list_vendors(user=Depends(any_role)):
    return [serialize_doc(v) for v in vendors_col.find().sort("name", 1)]


@router.post("")
def create_vendor(data: dict, user=Depends(non_accountant)):
    data["createdAt"] = datetime.utcnow()
    result = vendors_col.insert_one(data)
    data["_id"] = result.inserted_id
    return serialize_doc(data)


@router.put("/{vendor_id}")
def update_vendor(vendor_id: str, data: dict, user=Depends(non_accountant)):
    data.pop("id", None)
    data.pop("_id", None)
    data["updatedAt"] = datetime.utcnow()
    vendors_col.update_one({"_id": ObjectId(vendor_id)}, {"$set": data})
    return serialize_doc(vendors_col.find_one({"_id": ObjectId(vendor_id)}))


@router.delete("/{vendor_id}")
def delete_vendor(vendor_id: str, user=Depends(non_accountant)):
    vendors_col.delete_one({"_id": ObjectId(vendor_id)})
    return {"message": "Vendor deleted"}
