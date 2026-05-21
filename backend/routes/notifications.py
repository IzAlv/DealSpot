from fastapi import APIRouter, Depends
from bson import ObjectId
from datetime import datetime, timezone, timedelta

from database import notifications_col, serialize_doc
from auth import get_current_user

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


@router.get("")
def list_notifications(user=Depends(get_current_user)):
    one_week_ago = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    return [serialize_doc(n) for n in notifications_col.find({"createdAt": {"$gte": one_week_ago}}).sort("createdAt", -1).limit(50)]


@router.patch("/{notif_id}/read")
def mark_notification_read(notif_id: str, user=Depends(get_current_user)):
    notifications_col.update_one({"_id": ObjectId(notif_id)}, {"$addToSet": {"readBy": user["username"]}})
    return {"message": "Marked read"}


@router.patch("/read-all")
def mark_all_read(user=Depends(get_current_user)):
    notifications_col.update_many({}, {"$addToSet": {"readBy": user["username"]}})
    return {"message": "All marked read"}


@router.delete("")
def delete_all_notifications(user=Depends(get_current_user)):
    notifications_col.delete_many({})
    return {"message": "All notifications deleted"}
