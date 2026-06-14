from fastapi import APIRouter, Depends, HTTPException

from database import q_one
from auth import pwd_context, create_access_token, get_current_user
from models import LoginRequest

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login")
def login(req: LoginRequest):
    user = q_one("SELECT * FROM users WHERE username = %s", (req.username,))
    if not user or not pwd_context.verify(req.password, user["password"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = create_access_token({"sub": user["username"]})
    return {
        "token": token,
        "user": {
            "id": str(user["id"]),
            "username": user["username"],
            "role": user.get("role", "user"),
            "name": user.get("name", user["username"]),
            "email": user.get("email", "") or "",
        },
    }


@router.get("/me")
def get_me(user=Depends(get_current_user)):
    user.pop("password", None)
    return user
