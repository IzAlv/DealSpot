from fastapi import APIRouter, Depends

from database import q_all, q_one, insert_document, update_document, delete_document, serialize_doc_row, create_notification
from auth import require_roles
from models import EventCreate

non_accountant = require_roles("admin", "user")

router = APIRouter(prefix="/api/events", tags=["events"])


@router.get("")
def list_events(user=Depends(non_accountant)):
    return [serialize_doc_row(e) for e in q_all("SELECT * FROM events ORDER BY date ASC")]


@router.post("")
def create_event(event: EventCreate, user=Depends(non_accountant)):
    row = insert_document("events", event.dict())
    create_notification("event", f"New event: {event.title}", str(row["id"]), user.get("username"))
    return serialize_doc_row(row)


@router.put("/{event_id}")
def update_event(event_id: str, event: EventCreate, user=Depends(non_accountant)):
    row = update_document("events", event_id, set_fields=event.dict())
    create_notification("event", f"Event updated: {event.title}", event_id, user.get("username"))
    return serialize_doc_row(row)


@router.delete("/{event_id}")
def delete_event(event_id: str, user=Depends(non_accountant)):
    existing = q_one("SELECT data FROM events WHERE id = %s", (event_id,))
    title = (existing.get("data") or {}).get("title", "") if existing else event_id
    delete_document("events", event_id)
    create_notification("event", f"Event deleted: {title}", event_id, user.get("username"))
    return {"message": "Deleted"}
