from datetime import datetime

from fastapi import APIRouter, Depends
from bson import ObjectId

from database import (
    commodities_col, origins_col, ports_col, surveyors_col,
    disport_agents_col, loadport_agents_col, serialize_doc, create_notification
)
from auth import require_roles
from models import CommodityCreate, OriginCreate, PortCreate, SurveyorCreate, DisportAgentCreate

non_accountant = require_roles("admin", "user")

router = APIRouter(prefix="/api", tags=["reference_data"])


# ─── Commodities ─────────────────────────────────────────────
@router.get("/commodities")
def list_commodities(user=Depends(non_accountant)):
    return [serialize_doc(i) for i in commodities_col.find().sort("name", 1)]


@router.post("/commodities")
def create_commodity(item: CommodityCreate, user=Depends(non_accountant)):
    data = item.dict()
    data["createdAt"] = datetime.utcnow()
    result = commodities_col.insert_one(data)
    data["_id"] = result.inserted_id
    create_notification("settings", f"Commodity added: {data.get('name', '')}", str(result.inserted_id), user.get("username"))
    return serialize_doc(data)


@router.put("/commodities/{item_id}")
def update_commodity(item_id: str, item: CommodityCreate, user=Depends(non_accountant)):
    commodities_col.update_one({"_id": ObjectId(item_id)}, {"$set": item.dict()})
    create_notification("settings", f"Commodity updated: {item.name}", item_id, user.get("username"))
    return serialize_doc(commodities_col.find_one({"_id": ObjectId(item_id)}))


@router.delete("/commodities/{item_id}")
def delete_commodity(item_id: str, user=Depends(non_accountant)):
    c = commodities_col.find_one({"_id": ObjectId(item_id)})
    commodities_col.delete_one({"_id": ObjectId(item_id)})
    create_notification("settings", f"Commodity deleted: {c.get('name', '') if c else item_id}", item_id, user.get("username"))
    return {"message": "Deleted"}


# ─── Origins ─────────────────────────────────────────────────
@router.get("/origins")
def list_origins(user=Depends(non_accountant)):
    return [serialize_doc(i) for i in origins_col.find().sort("name", 1)]


@router.post("/origins")
def create_origin(item: OriginCreate, user=Depends(non_accountant)):
    data = item.dict()
    data["createdAt"] = datetime.utcnow()
    result = origins_col.insert_one(data)
    data["_id"] = result.inserted_id
    create_notification("settings", f"Origin added: {data.get('name', '')}", str(result.inserted_id), user.get("username"))
    return serialize_doc(data)


@router.put("/origins/{item_id}")
def update_origin(item_id: str, item: OriginCreate, user=Depends(non_accountant)):
    origins_col.update_one({"_id": ObjectId(item_id)}, {"$set": item.dict()})
    create_notification("settings", f"Origin updated: {item.name}", item_id, user.get("username"))
    return serialize_doc(origins_col.find_one({"_id": ObjectId(item_id)}))


@router.delete("/origins/{item_id}")
def delete_origin(item_id: str, user=Depends(non_accountant)):
    o = origins_col.find_one({"_id": ObjectId(item_id)})
    origins_col.delete_one({"_id": ObjectId(item_id)})
    create_notification("settings", f"Origin deleted: {o.get('name', '') if o else item_id}", item_id, user.get("username"))
    return {"message": "Deleted"}


# ─── Ports ───────────────────────────────────────────────────
@router.get("/ports")
def list_ports(user=Depends(non_accountant)):
    return [serialize_doc(i) for i in ports_col.find().sort("name", 1)]


@router.post("/ports")
def create_port(item: PortCreate, user=Depends(non_accountant)):
    data = item.dict()
    data["createdAt"] = datetime.utcnow()
    result = ports_col.insert_one(data)
    data["_id"] = result.inserted_id
    create_notification("settings", f"Port added: {data.get('name', '')}", str(result.inserted_id), user.get("username"))
    return serialize_doc(data)


@router.put("/ports/{item_id}")
def update_port(item_id: str, item: PortCreate, user=Depends(non_accountant)):
    ports_col.update_one({"_id": ObjectId(item_id)}, {"$set": item.dict()})
    create_notification("settings", f"Port updated: {item.name}", item_id, user.get("username"))
    return serialize_doc(ports_col.find_one({"_id": ObjectId(item_id)}))


@router.delete("/ports/{item_id}")
def delete_port(item_id: str, user=Depends(non_accountant)):
    p = ports_col.find_one({"_id": ObjectId(item_id)})
    ports_col.delete_one({"_id": ObjectId(item_id)})
    create_notification("settings", f"Port deleted: {p.get('name', '') if p else item_id}", item_id, user.get("username"))
    return {"message": "Deleted"}


# ─── Surveyors ───────────────────────────────────────────────
@router.get("/surveyors")
def list_surveyors(user=Depends(non_accountant)):
    return [serialize_doc(i) for i in surveyors_col.find().sort("name", 1)]


@router.post("/surveyors")
def create_surveyor(item: SurveyorCreate, user=Depends(non_accountant)):
    data = item.dict()
    data["createdAt"] = datetime.utcnow()
    result = surveyors_col.insert_one(data)
    data["_id"] = result.inserted_id
    create_notification("settings", f"Surveyor added: {data.get('name', '')}", str(result.inserted_id), user.get("username"))
    return serialize_doc(data)


@router.put("/surveyors/{item_id}")
def update_surveyor(item_id: str, item: SurveyorCreate, user=Depends(non_accountant)):
    surveyors_col.update_one({"_id": ObjectId(item_id)}, {"$set": item.dict()})
    create_notification("settings", f"Surveyor updated: {item.name}", item_id, user.get("username"))
    return serialize_doc(surveyors_col.find_one({"_id": ObjectId(item_id)}))


@router.delete("/surveyors/{item_id}")
def delete_surveyor(item_id: str, user=Depends(non_accountant)):
    s = surveyors_col.find_one({"_id": ObjectId(item_id)})
    surveyors_col.delete_one({"_id": ObjectId(item_id)})
    create_notification("settings", f"Surveyor deleted: {s.get('name', '') if s else item_id}", item_id, user.get("username"))
    return {"message": "Deleted"}



# ─── Load Port Agents ─────────────────────────────────────────
@router.get("/loadport-agents")
def list_loadport_agents(user=Depends(non_accountant)):
    return [serialize_doc(i) for i in loadport_agents_col.find().sort("name", 1)]


@router.post("/loadport-agents")
def create_loadport_agent(item: DisportAgentCreate, user=Depends(non_accountant)):
    data = item.dict()
    data["createdAt"] = datetime.utcnow()
    result = loadport_agents_col.insert_one(data)
    data["_id"] = result.inserted_id
    create_notification("settings", f"Load Port Agent added: {data.get('name', '')}", str(result.inserted_id), user.get("username"))
    return serialize_doc(data)


@router.put("/loadport-agents/{item_id}")
def update_loadport_agent(item_id: str, item: DisportAgentCreate, user=Depends(non_accountant)):
    loadport_agents_col.update_one({"_id": ObjectId(item_id)}, {"$set": item.dict()})
    create_notification("settings", f"Load Port Agent updated: {item.name}", item_id, user.get("username"))
    return serialize_doc(loadport_agents_col.find_one({"_id": ObjectId(item_id)}))


@router.delete("/loadport-agents/{item_id}")
def delete_loadport_agent(item_id: str, user=Depends(non_accountant)):
    a = loadport_agents_col.find_one({"_id": ObjectId(item_id)})
    loadport_agents_col.delete_one({"_id": ObjectId(item_id)})
    create_notification("settings", f"Load Port Agent deleted: {a.get('name', '') if a else item_id}", item_id, user.get("username"))
    return {"message": "Deleted"}


# ─── Disport Agents ──────────────────────────────────────────
@router.get("/disport-agents")
def list_disport_agents(user=Depends(non_accountant)):
    return [serialize_doc(i) for i in disport_agents_col.find().sort("name", 1)]


@router.post("/disport-agents")
def create_disport_agent(item: DisportAgentCreate, user=Depends(non_accountant)):
    data = item.dict()
    data["createdAt"] = datetime.utcnow()
    result = disport_agents_col.insert_one(data)
    data["_id"] = result.inserted_id
    create_notification("settings", f"Disport Agent added: {data.get('name', '')}", str(result.inserted_id), user.get("username"))
    return serialize_doc(data)


@router.put("/disport-agents/{item_id}")
def update_disport_agent(item_id: str, item: DisportAgentCreate, user=Depends(non_accountant)):
    disport_agents_col.update_one({"_id": ObjectId(item_id)}, {"$set": item.dict()})
    create_notification("settings", f"Disport Agent updated: {item.name}", item_id, user.get("username"))
    return serialize_doc(disport_agents_col.find_one({"_id": ObjectId(item_id)}))


@router.delete("/disport-agents/{item_id}")
def delete_disport_agent(item_id: str, user=Depends(non_accountant)):
    a = disport_agents_col.find_one({"_id": ObjectId(item_id)})
    disport_agents_col.delete_one({"_id": ObjectId(item_id)})
    create_notification("settings", f"Disport Agent deleted: {a.get('name', '') if a else item_id}", item_id, user.get("username"))
    return {"message": "Deleted"}
