from fastapi import APIRouter, HTTPException, Depends

from database import q_all, q_one, insert_document, update_document, delete_document, serialize_doc_row
from auth import require_roles, pwd_context
from models import UserCreate
from config import TRADE_STATUSES

non_accountant = require_roles("admin", "user")
admin_only = require_roles("admin")

router = APIRouter(prefix="/api", tags=["users"])


@router.get("/users")
def list_users(user=Depends(non_accountant)):
    out = []
    for u in q_all("SELECT * FROM users ORDER BY created_at"):
        d = serialize_doc_row(u)
        d.pop("password", None)  # old list_users strips the hash before returning
        out.append(d)
    return out


@router.post("/users")
def create_user(u: UserCreate, user=Depends(admin_only)):
    if q_one("SELECT 1 FROM users WHERE username = %s", (u.username,)):
        raise HTTPException(status_code=400, detail="Username already exists")
    data = u.dict()
    data["password"] = pwd_context.hash(data["password"])
    data["status"] = "active"
    row = insert_document("users", data)
    out = serialize_doc_row(row)
    out.pop("password", None)
    return out


@router.delete("/users/{user_id}")
def delete_user(user_id: str, user=Depends(admin_only)):
    delete_document("users", user_id)
    return {"message": "Deleted"}


@router.put("/users/{user_id}")
def update_user(user_id: str, body: dict, user=Depends(admin_only)):
    update_fields = {}
    for field in ["name", "email", "whatsapp", "role", "username"]:
        if field in body and body[field] is not None:
            update_fields[field] = body[field]
    if body.get("password"):
        update_fields["password"] = pwd_context.hash(body["password"])
    if update_fields:
        update_document("users", user_id, set_fields=update_fields)
    doc = q_one("SELECT * FROM users WHERE id = %s", (user_id,))
    out = serialize_doc_row(doc)
    if out:
        out.pop("password", None)
    return out


@router.get("/trade-statuses")
def get_trade_statuses(user=Depends(non_accountant)):
    return TRADE_STATUSES
