from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends

from database import q_all, execute, serialize_doc_row
from auth import get_current_user

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


@router.get("")
def list_notifications(user=Depends(get_current_user)):
    one_week_ago = datetime.now(timezone.utc) - timedelta(days=7)
    rows = q_all(
        "SELECT * FROM notifications WHERE created_at >= %s ORDER BY created_at DESC LIMIT 50",
        (one_week_ago,),
    )
    return [serialize_doc_row(n) for n in rows]


@router.patch("/{notif_id}/read")
def mark_notification_read(notif_id: str, user=Depends(get_current_user)):
    # $addToSet readBy: append username if not already present (kept in data and the read_by column).
    execute(
        "UPDATE notifications SET data = jsonb_set(data, '{readBy}', "
        "(COALESCE(data->'readBy', '[]'::jsonb) || to_jsonb(%s::text))), "
        "read_by = (COALESCE(read_by, '[]'::jsonb) || to_jsonb(%s::text)) "
        "WHERE id = %s AND NOT (COALESCE(data->'readBy', '[]'::jsonb) ? %s)",
        (user["username"], user["username"], notif_id, user["username"]),
    )
    return {"message": "Marked read"}


@router.patch("/read-all")
def mark_all_read(user=Depends(get_current_user)):
    execute(
        "UPDATE notifications SET data = jsonb_set(data, '{readBy}', "
        "(COALESCE(data->'readBy', '[]'::jsonb) || to_jsonb(%s::text))), "
        "read_by = (COALESCE(read_by, '[]'::jsonb) || to_jsonb(%s::text)) "
        "WHERE NOT (COALESCE(data->'readBy', '[]'::jsonb) ? %s)",
        (user["username"], user["username"], user["username"]),
    )
    return {"message": "All marked read"}


@router.delete("")
def delete_all_notifications(user=Depends(get_current_user)):
    execute("DELETE FROM notifications")
    return {"message": "All notifications deleted"}
