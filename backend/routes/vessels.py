from datetime import datetime, timezone
from typing import Optional
import os

from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from fastapi.responses import FileResponse

from database import (q_all, q_one, insert_document, update_document, delete_document,
                      serialize_doc_row, create_notification)
from auth import require_roles
from models import VesselCreate

non_accountant = require_roles("admin", "user")

router = APIRouter(prefix="/api/vessels", tags=["vessels"])

CERT_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "uploads", "vessel_certs")
os.makedirs(CERT_DIR, exist_ok=True)


@router.get("")
def list_vessels(search: Optional[str] = None, user=Depends(non_accountant)):
    if search:
        like = f"%{search}%"
        rows = q_all("SELECT * FROM vessels WHERE name ILIKE %s OR imo_number ILIKE %s ORDER BY name ASC",
                     (like, like))
    else:
        rows = q_all("SELECT * FROM vessels ORDER BY name ASC")
    return [serialize_doc_row(v) for v in rows]


@router.post("")
def create_vessel(vessel: VesselCreate, user=Depends(non_accountant)):
    row = insert_document("vessels", vessel.dict())
    create_notification("vessel", f"New vessel added: {vessel.name}", str(row["id"]), user.get("username"))
    return serialize_doc_row(row)


@router.put("/{vessel_id}")
def update_vessel(vessel_id: str, vessel: VesselCreate, user=Depends(non_accountant)):
    row = update_document("vessels", vessel_id, set_fields=vessel.dict())
    create_notification("vessel", f"Vessel updated: {vessel.name}", vessel_id, user.get("username"))
    return serialize_doc_row(row)


@router.delete("/{vessel_id}")
def delete_vessel(vessel_id: str, user=Depends(non_accountant)):
    existing = q_one("SELECT data FROM vessels WHERE id = %s", (vessel_id,))
    name = (existing.get("data") or {}).get("name", "") if existing else vessel_id
    delete_document("vessels", vessel_id)
    create_notification("vessel", f"Vessel deleted: {name}", vessel_id, user.get("username"))
    return {"message": "Vessel deleted"}


def _certs(vessel_id):
    row = q_one("SELECT data FROM vessels WHERE id = %s", (vessel_id,))
    if row is None:
        raise HTTPException(status_code=404, detail="Vessel not found")
    return row["data"].get("certificates", []) if row.get("data") else []


@router.post("/{vessel_id}/certificates")
async def upload_certificate(vessel_id: str, file: UploadFile = File(...), user=Depends(non_accountant)):
    certs = _certs(vessel_id)
    file_bytes = await file.read()
    import uuid
    cert_id = uuid.uuid4().hex[:24]
    ext = file.filename.rsplit(".", 1)[-1] if "." in file.filename else "pdf"
    stored_name = f"cert_{cert_id}.{ext}"
    with open(os.path.join(CERT_DIR, stored_name), "wb") as f:
        f.write(file_bytes)
    cert = {"id": cert_id, "fileName": file.filename, "storedName": stored_name,
            "uploadedAt": datetime.now(timezone.utc).isoformat()}
    update_document("vessels", vessel_id, set_fields={"certificates": certs + [cert]})
    return cert


@router.get("/{vessel_id}/certificates")
def list_certificates(vessel_id: str, user=Depends(non_accountant)):
    return _certs(vessel_id)


@router.get("/{vessel_id}/certificates/{cert_id}/download")
def download_certificate(vessel_id: str, cert_id: str, user=Depends(non_accountant)):
    cert = next((c for c in _certs(vessel_id) if c["id"] == cert_id), None)
    if not cert:
        raise HTTPException(status_code=404, detail="Certificate not found")
    path = os.path.join(CERT_DIR, cert["storedName"])
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(path, filename=cert["fileName"])


@router.delete("/{vessel_id}/certificates/{cert_id}")
def delete_certificate(vessel_id: str, cert_id: str, user=Depends(non_accountant)):
    certs = _certs(vessel_id)
    cert = next((c for c in certs if c["id"] == cert_id), None)
    if cert:
        path = os.path.join(CERT_DIR, cert["storedName"])
        if os.path.exists(path):
            os.remove(path)
    update_document("vessels", vessel_id, set_fields={"certificates": [c for c in certs if c["id"] != cert_id]})
    return {"message": "Certificate deleted"}
