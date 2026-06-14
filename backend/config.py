import os

# PostgreSQL connection. Railway exposes DATABASE_URL for its Postgres plugin.
DATABASE_URL = (
    os.environ.get("DATABASE_URL")
    or os.environ.get("POSTGRES_URL")
    or os.environ.get("DATABASE_PUBLIC_URL")
    or "postgresql://localhost:5432/dealspot"
)
SECRET_KEY = os.environ.get("SECRET_KEY", "pir-grain-pulses-secret-key-2024")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 168
UPLOAD_DIR = os.environ.get("UPLOAD_DIR", "/app/backend/uploads")
try:
    os.makedirs(UPLOAD_DIR, exist_ok=True)
except OSError:
    # /app may not exist off-Docker (local dev); don't crash on import.
    pass

TRADE_STATUSES = [
    "confirmation", "draft-contract", "nomination-sent", "di-sent",
    "drafts-confirmation", "appropriation", "dox", "pmt", "disch",
    "shortage", "demurrage", "dispatch", "brokerage",
    "completed", "cancelled", "washout"
]
