from fastapi import APIRouter, Depends

from database import q_all, insert_document, update_document, delete_document, serialize_doc_row
from auth import require_roles

non_accountant = require_roles("admin", "user")
any_role = require_roles("admin", "user", "accountant")

router = APIRouter(prefix="/api/vendors", tags=["vendors"])


@router.get("")
def list_vendors(user=Depends(any_role)):
    return [serialize_doc_row(v) for v in q_all("SELECT * FROM vendors ORDER BY name ASC")]


@router.post("")
def create_vendor(data: dict, user=Depends(non_accountant)):
    return serialize_doc_row(insert_document("vendors", data))


@router.put("/{vendor_id}")
def update_vendor(vendor_id: str, data: dict, user=Depends(non_accountant)):
    return serialize_doc_row(update_document("vendors", vendor_id, set_fields=data))


@router.delete("/{vendor_id}")
def delete_vendor(vendor_id: str, user=Depends(non_accountant)):
    delete_document("vendors", vendor_id)
    return {"message": "Vendor deleted"}
