import os

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "pir_grain_pulses")
SECRET_KEY = os.environ.get("SECRET_KEY", "pir-grain-pulses-secret-key-2024")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 168
UPLOAD_DIR = "/app/backend/uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

TRADE_STATUSES = [
    "confirmation", "draft-contract", "nomination-sent", "di-sent",
    "drafts-confirmation", "appropriation", "dox", "pmt", "disch",
    "shortage", "demurrage", "dispatch", "brokerage",
    "completed", "cancelled", "washout"
]
