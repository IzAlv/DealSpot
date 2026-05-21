from datetime import datetime, timezone
from bson import ObjectId
from pymongo import MongoClient
from config import MONGO_URL, DB_NAME

client = MongoClient(MONGO_URL)
db = client[DB_NAME]

users_col = db["users"]
trades_col = db["trades"]
partners_col = db["partners"]
vessels_col = db["vessels"]
documents_col = db["documents"]
commodities_col = db["commodities"]
origins_col = db["origins"]
ports_col = db["ports"]
surveyors_col = db["surveyors"]
events_col = db["events"]
invoices_col = db["invoices"]
bank_statements_col = db["bank_statements"]
notifications_col = db["notifications"]
disport_agents_col = db["disport_agents"]
loadport_agents_col = db["loadport_agents"]
bank_accounts_col = db["bank_accounts"]
vendors_col = db["vendors"]
business_cards_col = db["business_cards"]

# Market Data Module Collections
market_prices_col = db["market_prices"]
market_notes_col = db["market_notes"]
tmo_tenders_col = db["tmo_tenders"]
telegram_channels_col = db["telegram_channels"]
market_commodities_col = db["market_commodities"]
turkish_exchange_prices_col = db["turkish_exchange_prices"]
app_config_col = db["app_config"]
doc_instructions_col = db["doc_instructions"]


def serialize_doc(doc):
    if doc is None:
        return None
    doc["id"] = str(doc.pop("_id"))
    for key, value in doc.items():
        if isinstance(value, datetime):
            if value.tzinfo is None:
                value = value.replace(tzinfo=timezone.utc)
            doc[key] = value.isoformat()
        elif isinstance(value, ObjectId):
            doc[key] = str(value)
    return doc


def create_notification(ntype, message, entity_ref=None, username=None, display_name=None):
    notifications_col.insert_one({
        "type": ntype,
        "message": message,
        "entityRef": entity_ref,
        "username": username or "system",
        "displayName": display_name or username or "system",
        "readBy": [],
        "createdAt": datetime.now(timezone.utc).isoformat()
    })
