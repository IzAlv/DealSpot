from fastapi import APIRouter, Depends

from database import q_all, q_one, insert_document, update_document, delete_document, serialize_doc_row, create_notification
from auth import require_roles
from models import CommodityCreate, OriginCreate, PortCreate, SurveyorCreate, DisportAgentCreate

non_accountant = require_roles("admin", "user")

router = APIRouter(prefix="/api", tags=["reference_data"])


def _list(table):
    return [serialize_doc_row(r) for r in q_all(f'SELECT * FROM "{table}" ORDER BY name ASC')]


def _create(table, data, label, user):
    row = insert_document(table, data)
    create_notification("settings", f"{label} added: {data.get('name', '')}", str(row["id"]), user.get("username"))
    return serialize_doc_row(row)


def _update(table, item_id, data, label, user):
    row = update_document(table, item_id, set_fields=data)
    create_notification("settings", f"{label} updated: {data.get('name', '')}", item_id, user.get("username"))
    return serialize_doc_row(row)


def _delete(table, item_id, label, user):
    existing = q_one(f'SELECT data FROM "{table}" WHERE id = %s', (item_id,))
    name = (existing.get("data") or {}).get("name", "") if existing else item_id
    delete_document(table, item_id)
    create_notification("settings", f"{label} deleted: {name}", item_id, user.get("username"))
    return {"message": "Deleted"}


# ─── Commodities ─────────────────────────────────────────────
@router.get("/commodities")
def list_commodities(user=Depends(non_accountant)):
    return _list("commodities")


@router.post("/commodities")
def create_commodity(item: CommodityCreate, user=Depends(non_accountant)):
    return _create("commodities", item.dict(), "Commodity", user)


@router.put("/commodities/{item_id}")
def update_commodity(item_id: str, item: CommodityCreate, user=Depends(non_accountant)):
    return _update("commodities", item_id, item.dict(), "Commodity", user)


@router.delete("/commodities/{item_id}")
def delete_commodity(item_id: str, user=Depends(non_accountant)):
    return _delete("commodities", item_id, "Commodity", user)


# ─── Origins ─────────────────────────────────────────────────
@router.get("/origins")
def list_origins(user=Depends(non_accountant)):
    return _list("origins")


@router.post("/origins")
def create_origin(item: OriginCreate, user=Depends(non_accountant)):
    return _create("origins", item.dict(), "Origin", user)


@router.put("/origins/{item_id}")
def update_origin(item_id: str, item: OriginCreate, user=Depends(non_accountant)):
    return _update("origins", item_id, item.dict(), "Origin", user)


@router.delete("/origins/{item_id}")
def delete_origin(item_id: str, user=Depends(non_accountant)):
    return _delete("origins", item_id, "Origin", user)


# ─── Ports ───────────────────────────────────────────────────
@router.get("/ports")
def list_ports(user=Depends(non_accountant)):
    return _list("ports")


@router.post("/ports")
def create_port(item: PortCreate, user=Depends(non_accountant)):
    return _create("ports", item.dict(), "Port", user)


@router.put("/ports/{item_id}")
def update_port(item_id: str, item: PortCreate, user=Depends(non_accountant)):
    return _update("ports", item_id, item.dict(), "Port", user)


@router.delete("/ports/{item_id}")
def delete_port(item_id: str, user=Depends(non_accountant)):
    return _delete("ports", item_id, "Port", user)


# ─── Surveyors ───────────────────────────────────────────────
@router.get("/surveyors")
def list_surveyors(user=Depends(non_accountant)):
    return _list("surveyors")


@router.post("/surveyors")
def create_surveyor(item: SurveyorCreate, user=Depends(non_accountant)):
    return _create("surveyors", item.dict(), "Surveyor", user)


@router.put("/surveyors/{item_id}")
def update_surveyor(item_id: str, item: SurveyorCreate, user=Depends(non_accountant)):
    return _update("surveyors", item_id, item.dict(), "Surveyor", user)


@router.delete("/surveyors/{item_id}")
def delete_surveyor(item_id: str, user=Depends(non_accountant)):
    return _delete("surveyors", item_id, "Surveyor", user)


# ─── Load Port Agents ─────────────────────────────────────────
@router.get("/loadport-agents")
def list_loadport_agents(user=Depends(non_accountant)):
    return _list("loadport_agents")


@router.post("/loadport-agents")
def create_loadport_agent(item: DisportAgentCreate, user=Depends(non_accountant)):
    return _create("loadport_agents", item.dict(), "Load Port Agent", user)


@router.put("/loadport-agents/{item_id}")
def update_loadport_agent(item_id: str, item: DisportAgentCreate, user=Depends(non_accountant)):
    return _update("loadport_agents", item_id, item.dict(), "Load Port Agent", user)


@router.delete("/loadport-agents/{item_id}")
def delete_loadport_agent(item_id: str, user=Depends(non_accountant)):
    return _delete("loadport_agents", item_id, "Load Port Agent", user)


# ─── Disport Agents ──────────────────────────────────────────
@router.get("/disport-agents")
def list_disport_agents(user=Depends(non_accountant)):
    return _list("disport_agents")


@router.post("/disport-agents")
def create_disport_agent(item: DisportAgentCreate, user=Depends(non_accountant)):
    return _create("disport_agents", item.dict(), "Disport Agent", user)


@router.put("/disport-agents/{item_id}")
def update_disport_agent(item_id: str, item: DisportAgentCreate, user=Depends(non_accountant)):
    return _update("disport_agents", item_id, item.dict(), "Disport Agent", user)


@router.delete("/disport-agents/{item_id}")
def delete_disport_agent(item_id: str, user=Depends(non_accountant)):
    return _delete("disport_agents", item_id, "Disport Agent", user)
