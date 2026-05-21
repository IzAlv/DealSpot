from datetime import datetime

from fastapi import APIRouter, Depends
from bson import ObjectId

from database import events_col, serialize_doc, create_notification
from auth import require_roles
from models import EventCreate

non_accountant = require_roles("admin", "user")

router = APIRouter(prefix="/api/events", tags=["events"])


@router.get("")
def list_events(user=Depends(non_accountant)):
    return [serialize_doc(e) for e in events_col.find().sort("date", 1)]


@router.post("")
def create_event(event: EventCreate, user=Depends(non_accountant)):
    data = event.dict()
    data["createdAt"] = datetime.utcnow()
    result = events_col.insert_one(data)
    data["_id"] = result.inserted_id
    create_notification("event", f"New event: {data.get('title', '')}", str(result.inserted_id), user.get("username"))
    return serialize_doc(data)


@router.put("/{event_id}")
def update_event(event_id: str, event: EventCreate, user=Depends(non_accountant)):
    data = event.dict()
    events_col.update_one({"_id": ObjectId(event_id)}, {"$set": data})
    updated = events_col.find_one({"_id": ObjectId(event_id)})
    create_notification("event", f"Event updated: {data.get('title', '')}", event_id, user.get("username"))
    return serialize_doc(updated)


@router.delete("/{event_id}")
def delete_event(event_id: str, user=Depends(non_accountant)):
    e = events_col.find_one({"_id": ObjectId(event_id)})
    events_col.delete_one({"_id": ObjectId(event_id)})
    create_notification("event", f"Event deleted: {e.get('title', '') if e else event_id}", event_id, user.get("username"))
    return {"message": "Deleted"}
