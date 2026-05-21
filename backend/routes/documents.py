import os
import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, UploadFile, File, Form
from bson import ObjectId

from database import documents_col, serialize_doc
from auth import require_roles
from config import UPLOAD_DIR

non_accountant = require_roles("admin", "user")

router = APIRouter(prefix="/api/documents", tags=["documents"])

ALLOWED_EXTENSIONS = {'.pdf', '.jpg', '.jpeg', '.png', '.doc', '.docx'}


@router.get("")
def list_documents(tradeId: Optional[str] = None, user=Depends(non_accountant)):
    query = {}
    if tradeId:
        query["tradeId"] = tradeId
    return [serialize_doc(d) for d in documents_col.find(query).sort("createdAt", -1)]


@router.post("")
async def upload_document(file: UploadFile = File(...), tradeId: str = Form(""), tradeRef: str = Form(""), docType: str = Form("other"), docName: str = Form(""), user=Depends(non_accountant)):
    file_id = str(uuid.uuid4())
    ext = os.path.splitext(file.filename)[1] if file.filename else ""
    saved_name = f"{file_id}{ext}"
    file_path = os.path.join(UPLOAD_DIR, saved_name)
    content = await file.read()
    with open(file_path, "wb") as f:
        f.write(content)
    doc = {
        "fileName": file.filename, "savedName": saved_name, "fileUrl": f"/api/uploads/{saved_name}",
        "fileSize": len(content), "docType": docType, "docName": docName, "tradeId": tradeId, "tradeRef": tradeRef,
        "uploadedBy": user.get("username", ""), "createdAt": datetime.utcnow()
    }
    result = documents_col.insert_one(doc)
    doc["_id"] = result.inserted_id
    return serialize_doc(doc)


@router.delete("/{doc_id}")
def delete_document(doc_id: str, user=Depends(non_accountant)):
    doc = documents_col.find_one({"_id": ObjectId(doc_id)})
    if doc:
        file_path = os.path.join(UPLOAD_DIR, doc.get("savedName", ""))
        if os.path.exists(file_path):
            os.remove(file_path)
    documents_col.delete_one({"_id": ObjectId(doc_id)})
    return {"message": "Document deleted"}


@router.put("/{doc_id}/assign")
def assign_document(doc_id: str, body: dict, user=Depends(non_accountant)):
    new_doc_name = body.get("docName", "")
    documents_col.update_one({"_id": ObjectId(doc_id)}, {"$set": {"docName": new_doc_name}})
    return {"message": "Document reassigned", "docName": new_doc_name}
