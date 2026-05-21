from datetime import datetime
from fastapi import APIRouter, Depends
from bson import ObjectId

from database import bank_accounts_col, serialize_doc
from auth import require_roles

non_accountant = require_roles("admin", "user")
any_role = require_roles("admin", "user", "accountant")

router = APIRouter(prefix="/api/bank-accounts", tags=["bank-accounts"])


@router.get("")
def list_bank_accounts(user=Depends(any_role)):
    return [serialize_doc(b) for b in bank_accounts_col.find().sort("createdAt", -1)]


@router.post("")
def create_bank_account(data: dict, user=Depends(non_accountant)):
    data["createdAt"] = datetime.utcnow()
    result = bank_accounts_col.insert_one(data)
    data["_id"] = result.inserted_id
    return serialize_doc(data)


@router.put("/{account_id}")
def update_bank_account(account_id: str, data: dict, user=Depends(non_accountant)):
    data.pop("id", None)
    data.pop("_id", None)
    data["updatedAt"] = datetime.utcnow()
    bank_accounts_col.update_one({"_id": ObjectId(account_id)}, {"$set": data})
    return serialize_doc(bank_accounts_col.find_one({"_id": ObjectId(account_id)}))


@router.delete("/{account_id}")
def delete_bank_account(account_id: str, user=Depends(non_accountant)):
    bank_accounts_col.delete_one({"_id": ObjectId(account_id)})
    return {"message": "Bank account deleted"}
