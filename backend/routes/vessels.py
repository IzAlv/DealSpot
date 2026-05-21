from datetime import datetime, timezone
from typing import Optional
import os

from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from fastapi.responses import FileResponse
from bson import ObjectId

from database import vessels_col, serialize_doc, create_notification
from auth import require_roles
from models import VesselCreate

non_accountant = require_roles("admin", "user")

router = APIRouter(prefix="/api/vessels", tags=["vessels"])

CERT_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "uploads", "vessel_certs")
os.makedirs(CERT_DIR, exist_ok=True)


@router.get("")
def list_vessels(search: Optional[str] = None, user=Depends(non_accountant)):
    query = {}
    if search:
        query["$or"] = [{"name": {"$regex": search, "$options": "i"}}, {"imoNumber": {"$regex": search, "$options": "i"}}]
    return [serialize_doc(v) for v in vessels_col.find(query).sort("name", 1)]


@router.post("")
def create_vessel(vessel: VesselCreate, user=Depends(non_accountant)):
    data = vessel.dict()
    data["createdAt"] = datetime.utcnow()
    result = vessels_col.insert_one(data)
    data["_id"] = result.inserted_id
    create_notification("vessel", f"New vessel added: {data.get('name', '')}", str(result.inserted_id), user.get("username"))
    return serialize_doc(data)


@router.put("/{vessel_id}")
def update_vessel(vessel_id: str, vessel: VesselCreate, user=Depends(non_accountant)):
    data = vessel.dict()
    vessels_col.update_one({"_id": ObjectId(vessel_id)}, {"$set": data})
    updated = vessels_col.find_one({"_id": ObjectId(vessel_id)})
    create_notification("vessel", f"Vessel updated: {updated.get('name', '')}", vessel_id, user.get("username"))
    return serialize_doc(updated)


@router.delete("/{vessel_id}")
def delete_vessel(vessel_id: str, user=Depends(non_accountant)):
    v = vessels_col.find_one({"_id": ObjectId(vessel_id)})
    vessels_col.delete_one({"_id": ObjectId(vessel_id)})
    create_notification("vessel", f"Vessel deleted: {v.get('name', '') if v else vessel_id}", vessel_id, user.get("username"))
    return {"message": "Vessel deleted"}


@router.post("/{vessel_id}/certificates")
async def upload_certificate(vessel_id: str, file: UploadFile = File(...), user=Depends(non_accountant)):
    vessel = vessels_col.find_one({"_id": ObjectId(vessel_id)})
    if not vessel:
        raise HTTPException(status_code=404, detail="Vessel not found")
    file_bytes = await file.read()
    cert_id = str(ObjectId())
    ext = file.filename.rsplit(".", 1)[-1] if "." in file.filename else "pdf"
    stored_name = f"cert_{cert_id}.{ext}"
    with open(os.path.join(CERT_DIR, stored_name), "wb") as f:
        f.write(file_bytes)
    cert = {
        "id": cert_id,
        "fileName": file.filename,
        "storedName": stored_name,
        "uploadedAt": datetime.now(timezone.utc).isoformat(),
    }
    vessels_col.update_one({"_id": ObjectId(vessel_id)}, {"$push": {"certificates": cert}})
    return cert


@router.get("/{vessel_id}/certificates")
def list_certificates(vessel_id: str, user=Depends(non_accountant)):
    vessel = vessels_col.find_one({"_id": ObjectId(vessel_id)})
    if not vessel:
        raise HTTPException(status_code=404, detail="Vessel not found")
    return vessel.get("certificates", [])


@router.get("/{vessel_id}/certificates/{cert_id}/download")
def download_certificate(vessel_id: str, cert_id: str, user=Depends(non_accountant)):
    vessel = vessels_col.find_one({"_id": ObjectId(vessel_id)})
    if not vessel:
        raise HTTPException(status_code=404, detail="Vessel not found")
    cert = next((c for c in vessel.get("certificates", []) if c["id"] == cert_id), None)
    if not cert:
        raise HTTPException(status_code=404, detail="Certificate not found")
    path = os.path.join(CERT_DIR, cert["storedName"])
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(path, filename=cert["fileName"])


@router.delete("/{vessel_id}/certificates/{cert_id}")
def delete_certificate(vessel_id: str, cert_id: str, user=Depends(non_accountant)):
    vessel = vessels_col.find_one({"_id": ObjectId(vessel_id)})
    if not vessel:
        raise HTTPException(status_code=404, detail="Vessel not found")
    cert = next((c for c in vessel.get("certificates", []) if c["id"] == cert_id), None)
    if cert:
        path = os.path.join(CERT_DIR, cert["storedName"])
        if os.path.exists(path):
            os.remove(path)
    vessels_col.update_one({"_id": ObjectId(vessel_id)}, {"$pull": {"certificates": {"id": cert_id}}})
    return {"message": "Certificate deleted"}
