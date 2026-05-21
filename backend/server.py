import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import Response

from config import UPLOAD_DIR
from seed import seed_data
from routes.auth_routes import router as auth_router
from routes.trades import router as trades_router
from routes.partners import router as partners_router
from routes.vessels import router as vessels_router
from routes.documents import router as documents_router
from routes.reference_data import router as reference_data_router
from routes.events import router as events_router
from routes.accounting import router as accounting_router
from routes.notifications import router as notifications_router
from routes.users import router as users_router
from routes.commission_invoice import router as commission_invoice_router
from routes.shipment_appropriation import router as shipment_appropriation_router
from routes.business_confirmation import router as business_confirmation_router
from routes.bank_accounts import router as bank_accounts_router
from routes.vendors import router as vendors_router
from routes.business_cards import router as business_cards_router
from routes.email_sender import router as email_sender_router
from routes.port_lineups import router as port_lineups_router
from routes.market_data import router as market_data_router
from routes.doc_instructions import router as doc_instructions_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    seed_data()
    yield

app = FastAPI(title="PIR Grain & Pulses API", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])
app.mount("/api/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")
app.mount("/api/static", StaticFiles(directory=os.path.join(os.path.dirname(__file__), "static")), name="static")

app.include_router(auth_router)

# Public logo endpoint for emails (no auth)
@app.get("/api/public/logo")
async def get_public_logo():
    import requests as req_lib
    try:
        STORAGE_URL = "https://integrations.emergentagent.com/objstore/api/v1/storage"
        key = os.environ.get("EMERGENT_LLM_KEY", "")
        init_resp = req_lib.post(f"{STORAGE_URL}/init", json={"emergent_key": key}, timeout=10)
        init_resp.raise_for_status()
        sk = init_resp.json()["storage_key"]
        resp = req_lib.get(f"{STORAGE_URL}/objects/pir-grain/assets/pir-logo.jpeg", headers={"X-Storage-Key": sk}, timeout=15)
        resp.raise_for_status()
        return Response(content=resp.content, media_type="image/jpeg", headers={"Cache-Control": "public, max-age=86400"})
    except:
        return Response(content=b"", status_code=404)
app.include_router(trades_router)
app.include_router(partners_router)
app.include_router(vessels_router)
app.include_router(documents_router)
app.include_router(reference_data_router)
app.include_router(events_router)
app.include_router(accounting_router)
app.include_router(notifications_router)
app.include_router(users_router)
app.include_router(commission_invoice_router)
app.include_router(shipment_appropriation_router)
app.include_router(business_confirmation_router)
app.include_router(bank_accounts_router)
app.include_router(vendors_router)
app.include_router(business_cards_router)
app.include_router(email_sender_router)
app.include_router(port_lineups_router)
app.include_router(market_data_router)
app.include_router(doc_instructions_router)


@app.get("/api/health")
def health():
    return {"status": "healthy", "app": "PIR Grain & Pulses"}


@app.get("/api/config/active-url")
def get_active_url():
    """Public endpoint - returns the current active app URL"""
    from database import app_config_col
    config = app_config_col.find_one({"key": "active_url"}, {"_id": 0})
    if config:
        return {"activeUrl": config.get("value", "")}
    # If no active URL set yet, auto-initialize from APP_URL env
    app_url = os.environ.get("APP_URL", "").rstrip("/")
    if app_url:
        app_config_col.update_one(
            {"key": "active_url"},
            {"$set": {"key": "active_url", "value": app_url}},
            upsert=True
        )
    return {"activeUrl": app_url}


@app.put("/api/config/active-url")
def update_active_url(body: dict):
    """Admin endpoint - updates the active app URL"""
    from database import app_config_col
    from auth import get_current_user
    new_url = body.get("activeUrl", "").rstrip("/")
    if not new_url:
        return {"error": "activeUrl is required"}
    app_config_col.update_one(
        {"key": "active_url"},
        {"$set": {"key": "active_url", "value": new_url}},
        upsert=True
    )
    return {"activeUrl": new_url}
