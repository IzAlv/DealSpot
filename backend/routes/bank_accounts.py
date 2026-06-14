from fastapi import APIRouter, Depends

from database import q_all, insert_document, update_document, delete_document, serialize_doc_row
from auth import require_roles

non_accountant = require_roles("admin", "user")
any_role = require_roles("admin", "user", "accountant")

router = APIRouter(prefix="/api/bank-accounts", tags=["bank-accounts"])


@router.get("")
def list_bank_accounts(user=Depends(any_role)):
    return [serialize_doc_row(b) for b in q_all("SELECT * FROM bank_accounts ORDER BY created_at DESC")]


@router.post("")
def create_bank_account(data: dict, user=Depends(non_accountant)):
    return serialize_doc_row(insert_document("bank_accounts", data))


@router.put("/{account_id}")
def update_bank_account(account_id: str, data: dict, user=Depends(non_accountant)):
    return serialize_doc_row(update_document("bank_accounts", account_id, set_fields=data))


@router.delete("/{account_id}")
def delete_bank_account(account_id: str, user=Depends(non_accountant)):
    delete_document("bank_accounts", account_id)
    return {"message": "Bank account deleted"}
