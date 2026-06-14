import os
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, UploadFile, File, Form

from database import q_all, q_one, insert_document, update_document, delete_document, serialize_doc_row
from auth import require_roles
from config import UPLOAD_DIR

non_accountant = require_roles("admin", "user")

router = APIRouter(prefix="/api/documents", tags=["documents"])


@router.get("")
def list_documents(tradeId: Optional[str] = None, user=Depends(non_accountant)):
    if tradeId:
        rows = q_all("SELECT * FROM documents WHERE trade_id = %s ORDER BY created_at DESC", (tradeId,))
    else:
        rows = q_all("SELECT * FROM documents ORDER BY created_at DESC")
    return [serialize_doc_row(d) for d in rows]


@router.post("")
async def upload_document(file: UploadFile = File(...), tradeId: str = Form(""), tradeRef: str = Form(""),
                          docType: str = Form("other"), docName: str = Form(""), user=Depends(non_accountant)):
    file_id = str(uuid.uuid4())
    ext = os.path.splitext(file.filename)[1] if file.filename else ""
    saved_name = f"{file_id}{ext}"
    content = await file.read()
    with open(os.path.join(UPLOAD_DIR, saved_name), "wb") as f:
        f.write(content)
    doc = {
        "fileName": file.filename, "savedName": saved_name, "fileUrl": f"/api/uploads/{saved_name}",
        "fileSize": len(content), "docType": docType, "docName": docName, "tradeId": tradeId, "tradeRef": tradeRef,
        "uploadedBy": user.get("username", ""),
    }
    return serialize_doc_row(insert_document("documents", doc))


@router.delete("/{doc_id}")
def delete_document_endpoint(doc_id: str, user=Depends(non_accountant)):
    row = q_one("SELECT data FROM documents WHERE id = %s", (doc_id,))
    if row:
        file_path = os.path.join(UPLOAD_DIR, (row.get("data") or {}).get("savedName", ""))
        if os.path.exists(file_path):
            os.remove(file_path)
    delete_document("documents", doc_id)
    return {"message": "Document deleted"}


@router.put("/{doc_id}/assign")
def assign_document(doc_id: str, body: dict, user=Depends(non_accountant)):
    new_doc_name = body.get("docName", "")
    update_document("documents", doc_id, set_fields={"docName": new_doc_name})
    return {"message": "Document reassigned", "docName": new_doc_name}
