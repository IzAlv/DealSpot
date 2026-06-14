"""Documentary Instructions CRUD and email endpoints"""
import os
import asyncio
import json
import base64
from datetime import datetime, timezone
from typing import Optional
from dotenv import load_dotenv
load_dotenv()
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from database import q_one, q_all, insert_document, update_document, delete_document, serialize_doc_row
from auth import get_current_user


def _get(table, _id):
    if not _id:
        return None
    row = q_one(f'SELECT * FROM "{table}" WHERE id = %s', (_id,))
    return serialize_doc_row(row) if row else None

try:
    import resend
    resend.api_key = os.environ.get("RESEND_API_KEY", "")
    SENDER_EMAIL = os.environ.get("SENDER_EMAIL", "DealSpot <noreply@baticaret.com>")
except ImportError:
    resend = None
    SENDER_EMAIL = ""

UPLOAD_DIR = "/app/backend/uploads"
router = APIRouter(prefix="/api/doc-instructions", tags=["doc-instructions"])


class DocInstructionCreate(BaseModel):
    tradeId: str
    dischargePort: str = ""
    agentId: str = ""
    agentName: str = ""
    agentPhone: str = ""
    agentFax: str = ""
    agentMobile: str = ""
    agentEmail: str = ""
    agentWeb: str = ""
    agentAddress: str = ""
    surveyor: str = ""
    sellerSurveyor: str = ""
    originalDocsAddress: str = ""
    consigneeOption: str = "to_order"
    consigneeCustom: str = ""
    consigneeBuyerId: str = ""
    notifyOption: str = "buyer_details"
    notifyCustom: str = ""
    notifyBuyerId: str = ""
    requiredDocuments: list = []


class DocInstructionUpdate(BaseModel):
    dischargePort: Optional[str] = None
    agentId: Optional[str] = None
    agentName: Optional[str] = None
    agentPhone: Optional[str] = None
    agentFax: Optional[str] = None
    agentMobile: Optional[str] = None
    agentEmail: Optional[str] = None
    agentWeb: Optional[str] = None
    agentAddress: Optional[str] = None
    surveyor: Optional[str] = None
    sellerSurveyor: Optional[str] = None
    originalDocsAddress: Optional[str] = None
    consigneeOption: Optional[str] = None
    consigneeCustom: Optional[str] = None
    consigneeBuyerId: Optional[str] = None
    notifyOption: Optional[str] = None
    notifyCustom: Optional[str] = None
    notifyBuyerId: Optional[str] = None
    requiredDocuments: Optional[list] = None


def get_buyer_display(buyer_id):
    """Get buyer company details for display"""
    if not buyer_id:
        return ""
    try:
        buyer = _get("partners", buyer_id)
        if buyer:
            lines = [buyer.get("companyName", "")]
            if buyer.get("address"):
                lines.append(buyer["address"])
            return "\n".join(lines)
    except Exception:
        pass
    return ""


@router.get("/")
async def list_doc_instructions(tradeId: Optional[str] = None, user=Depends(get_current_user)):
    if tradeId:
        rows = q_all("SELECT * FROM doc_instructions WHERE trade_id = %s ORDER BY created_at DESC", (tradeId,))
    else:
        rows = q_all("SELECT * FROM doc_instructions ORDER BY created_at DESC")
    return [serialize_doc_row(d) for d in rows]


@router.get("/{di_id}")
async def get_doc_instruction(di_id: str, user=Depends(get_current_user)):
    doc = q_one("SELECT * FROM doc_instructions WHERE id = %s", (di_id,))
    if not doc:
        raise HTTPException(status_code=404, detail="Documentary Instruction not found")
    return serialize_doc_row(doc)


@router.post("/")
async def create_doc_instruction(data: DocInstructionCreate, user=Depends(get_current_user)):
    # Verify trade exists
    trade = _get("trades", data.tradeId)
    if not trade:
        raise HTTPException(status_code=404, detail="Contract not found")

    doc = data.dict()
    doc["createdBy"] = user.get("username")
    doc["createdByName"] = user.get("name", user.get("username"))

    # Auto-populate seller surveyor from trade if not provided
    if not doc.get("sellerSurveyor"):
        doc["sellerSurveyor"] = trade.get("sellerSurveyor", "")

    # Store resolved buyer details
    if data.consigneeBuyerId:
        doc["consigneeBuyerText"] = get_buyer_display(data.consigneeBuyerId)
    if data.notifyBuyerId:
        doc["notifyBuyerText"] = get_buyer_display(data.notifyBuyerId)

    return serialize_doc_row(insert_document("doc_instructions", doc))


@router.put("/{di_id}")
async def update_doc_instruction(di_id: str, data: DocInstructionUpdate, user=Depends(get_current_user)):
    updates = {k: v for k, v in data.dict().items() if v is not None}
    updates["updatedBy"] = user.get("username")

    if data.consigneeBuyerId:
        updates["consigneeBuyerText"] = get_buyer_display(data.consigneeBuyerId)
    if data.notifyBuyerId:
        updates["notifyBuyerText"] = get_buyer_display(data.notifyBuyerId)

    doc = update_document("doc_instructions", di_id, set_fields=updates)
    if doc is None:
        raise HTTPException(status_code=404, detail="Documentary Instruction not found")
    return serialize_doc_row(doc)


@router.delete("/{di_id}")
async def delete_doc_instruction(di_id: str, user=Depends(get_current_user)):
    if delete_document("doc_instructions", di_id) == 0:
        raise HTTPException(status_code=404, detail="Documentary Instruction not found")
    return {"message": "Deleted"}


class DiSendEmailRequest(BaseModel):
    toEmail: str = ""
    toEmails: list = []
    ccEmails: list = []

@router.post("/{di_id}/send-email")
async def send_di_email(di_id: str, req: DiSendEmailRequest = DiSendEmailRequest(), user=Depends(get_current_user)):
    """Send the DI to the seller via email"""
    doc = serialize_doc_row(q_one("SELECT * FROM doc_instructions WHERE id = %s", (di_id,)))
    if not doc:
        raise HTTPException(status_code=404, detail="Documentary Instruction not found")

    trade = _get("trades", doc["tradeId"])
    if not trade:
        raise HTTPException(status_code=404, detail="Contract not found")

    # Use emails from dialog
    to_emails = req.toEmails if req.toEmails else ([req.toEmail] if req.toEmail else [])
    if not to_emails:
        raise HTTPException(status_code=400, detail="No recipient email provided")

    seller_email = to_emails[0]
    cc_emails = req.ccEmails if req.ccEmails else []
    contract_num = trade.get("BAContractNumber", "N/A")

    # Build consignee/notify text
    consignee_text = "TO ORDER"
    if doc.get("consigneeOption") == "buyer_details":
        consignee_text = doc.get("consigneeBuyerText") or get_buyer_display(doc.get("consigneeBuyerId", "")) or "BUYER DETAILS"
    elif doc.get("consigneeOption") == "other":
        consignee_text = doc.get("consigneeCustom", "—")

    notify_text = doc.get("notifyBuyerText") or get_buyer_display(doc.get("notifyBuyerId", "")) or "BUYER DETAILS"
    if doc.get("notifyOption") == "other":
        notify_text = doc.get("notifyCustom", "—")

    # Build title
    qty = trade.get("quantity", "")
    qty_str = f"{int(float(qty)):,}" if qty else ""
    commodity_name = (trade.get("commodityName", "") or "").upper()
    vessel_name = (trade.get("vesselName", "") or "").upper()
    title_parts = ["DOCUMENTARY INSTRUCTIONS FOR"]
    if qty_str:
        title_parts.append(f"{qty_str} MTS")
    if commodity_name:
        title_parts.append(commodity_name)
    if vessel_name:
        title_parts.append(f"- {vessel_name}")
    di_title = " ".join(title_parts)

    # Resolve loading port
    loading_port_display = "—"
    lp_id = trade.get("loadingPortId") or trade.get("basePortId")
    if lp_id:
        try:
            lp = _get("ports", lp_id)
            if lp:
                loading_port_display = f"{lp.get('name', '')}, {lp.get('country', '')}"
        except Exception:
            pass

    # Load logo for CID inline attachment
    logo_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "dealspot-logo.png")
    attachments = []
    logo_html = ""
    if os.path.exists(logo_path):
        with open(logo_path, "rb") as f:
            logo_b64 = base64.b64encode(f.read()).decode()
        attachments.append({"filename": "logo.png", "content": logo_b64, "content_type": "image/png", "content_id": "dealspotlogo"})
        logo_html = '<img src="cid:dealspotlogo" style="max-width:300px;height:auto;display:block;margin:0 auto;" />'

    # Build shipper text
    shipper_text = doc.get("shipperText", "")
    if not shipper_text:
        seller_name_val = trade.get("sellerName", "")
        shipper_text = f".................... on behalf of {seller_name_val}" if seller_name_val else "—"

    # Build description of goods
    description_of_goods = doc.get("descriptionOfGoods", "")
    if not description_of_goods:
        origin_adj = trade.get("originAdjective", "")
        commodity = trade.get("commodityName", "")
        crop_year = trade.get("cropYear", "")
        parts = [p for p in [origin_adj, commodity, "IN BULK"] if p]
        description_of_goods = " ".join(parts).upper()
        if crop_year:
            description_of_goods += f", CROP {crop_year}"
    description_of_goods = description_of_goods.upper()

    # Build HTML email
    html = f"""
    <html><body style="font-family: Arial, sans-serif; font-size: 13px; color: #111; padding: 20px;">
    <div style="text-align: center; margin-bottom: 10px;">{logo_html}</div>
    <h3 style="text-align: center; color: #1A5276; margin-top: 4px;">{di_title}</h3>
    <p style="text-align: center; color: #666;">Contract Reference: {contract_num}</p>

    <h3 style="color: #1A5276; border-bottom: 2px solid #1A5276; padding-bottom: 4px;">Shipper & Consignee & Notify Party:</h3>
    <table style="width: 100%; border-collapse: collapse; margin-bottom: 16px;">
      <tr><th style="border: 1px solid #ccc; padding: 8px; background: #f3f4f6; width: 200px; text-align: left; vertical-align: top;">Shipper</th><td style="border: 1px solid #ccc; padding: 8px; white-space: pre-wrap;">{shipper_text}</td></tr>
      <tr><th style="border: 1px solid #ccc; padding: 8px; background: #f3f4f6; text-align: left; vertical-align: top;">Consignee</th><td style="border: 1px solid #ccc; padding: 8px; white-space: pre-wrap;">{consignee_text}</td></tr>
      <tr><th style="border: 1px solid #ccc; padding: 8px; background: #f3f4f6; text-align: left; vertical-align: top;">Notify Party</th><td style="border: 1px solid #ccc; padding: 8px; white-space: pre-wrap;">{notify_text}</td></tr>
      <tr><th style="border: 1px solid #ccc; padding: 8px; background: #f3f4f6; text-align: left; vertical-align: top;">Description of Goods</th><td style="border: 1px solid #ccc; padding: 8px; white-space: pre-wrap; text-transform: uppercase;">{description_of_goods}</td></tr>
    </table>

    <h3 style="color: #1A5276; border-bottom: 2px solid #1A5276; padding-bottom: 4px;">1. Shipment & Port Details</h3>
    <table style="width: 100%; border-collapse: collapse; margin-bottom: 16px;">
      <tr><th style="border: 1px solid #ccc; padding: 8px; background: #f3f4f6; width: 200px; text-align: left;">Loading Port</th><td style="border: 1px solid #ccc; padding: 8px;">{loading_port_display}</td></tr>
      <tr><th style="border: 1px solid #ccc; padding: 8px; background: #f3f4f6; text-align: left;">Discharge Port</th><td style="border: 1px solid #ccc; padding: 8px;">{doc.get('dischargePort', '—')}</td></tr>
      <tr><th style="border: 1px solid #ccc; padding: 8px; background: #f3f4f6; text-align: left; vertical-align: top;">Discharge Port Agent</th><td style="border: 1px solid #ccc; padding: 8px;">{doc.get('agentName', '—')}<br>Tel: {doc.get('agentPhone', '—')}{f" &bull; Fax: {doc.get('agentFax')}" if doc.get('agentFax') else ''}{f" &bull; Mob: {doc.get('agentMobile')}" if doc.get('agentMobile') else ''}<br>{doc.get('agentEmail', '')}{f" &bull; {doc.get('agentWeb')}" if doc.get('agentWeb') else ''}</td></tr>
      <tr><th style="border: 1px solid #ccc; padding: 8px; background: #f3f4f6; text-align: left;">Buyer Surveyor</th><td style="border: 1px solid #ccc; padding: 8px;">{doc.get('surveyor', '—')}</td></tr>
      <tr><th style="border: 1px solid #ccc; padding: 8px; background: #f3f4f6; text-align: left;">Seller Surveyor</th><td style="border: 1px solid #ccc; padding: 8px;">{doc.get('sellerSurveyor', '') or trade.get('sellerSurveyor', '—')}</td></tr>
    </table>

    <h3 style="color: #1A5276; border-bottom: 2px solid #1A5276; padding-bottom: 4px;">Required Documents:</h3>
    <table style="width: 100%; border-collapse: collapse;">
      <tr><th style="border: 1px solid #ccc; padding: 6px; background: #f3f4f6; width: 30px; text-align: center;">#</th><th style="border: 1px solid #ccc; padding: 6px; background: #f3f4f6; text-align: left;">Document</th><th style="border: 1px solid #ccc; padding: 6px; background: #f3f4f6; text-align: center;">Originals</th><th style="border: 1px solid #ccc; padding: 6px; background: #f3f4f6; text-align: center;">Copies</th></tr>
    """
    req_docs = doc.get("requiredDocuments", [])
    if not req_docs:
        req_docs = [
            {"name": "Signed Commercial Invoice", "originals": 1, "copies": 0},
            {"name": 'Bill of Lading (Clean on Board, Freight Prepaid)', "originals": 3, "copies": 0},
            {"name": "Certificate of Origin", "originals": 1, "copies": 2},
            {"name": "Phytosanitary Certificate", "originals": 1, "copies": 2},
            {"name": "Non-Radiation Certificate (CS134 & CS137 < 370 Bq/Kg)", "originals": 1, "copies": 0},
            {"name": "Fumigation Certificate (if any)", "originals": 1, "copies": 0},
            {"name": "Quality Certificate (GAFTA Approved Surveyor)", "originals": 1, "copies": 0},
            {"name": "Weight Certificate (GAFTA Approved Surveyor)", "originals": 1, "copies": 0},
            {"name": "Holds Cleanliness Certificate (GAFTA Approved Surveyor)", "originals": 1, "copies": 0},
            {"name": "Holds Sealing Certificate (GAFTA Approved Surveyor)", "originals": 1, "copies": 0},
            {"name": "Insurance Certificate (GAFTA - 102% of value)", "originals": 1, "copies": 0},
            {"name": "Master's Receipt", "originals": 1, "copies": 0},
            {"name": "Non-Dioxin Analysis + GAFTA Non-Dioxin Certificate", "originals": 1, "copies": 0},
        ]
    for i, rd in enumerate(req_docs, 1):
        html += f'<tr><td style="border: 1px solid #ccc; padding: 6px; text-align: center; font-weight: 600;">{i}</td><td style="border: 1px solid #ccc; padding: 6px; font-weight: 500;">{rd.get("name","")}</td><td style="border: 1px solid #ccc; padding: 6px; text-align: center;">{rd.get("originals",0)}</td><td style="border: 1px solid #ccc; padding: 6px; text-align: center;">{rd.get("copies",0)}</td></tr>'

    html += f"""</table>

    <h3 style="color: #1A5276; border-bottom: 2px solid #1A5276; padding-bottom: 4px;">Address for Original Documents:</h3>
    <div style="border: 1px solid #ccc; padding: 10px; background: #f9fafb; white-space: pre-wrap; margin-bottom: 16px;">{doc.get('originalDocsAddress', '') or 'To be advised later.'}</div>

    <br><p style="font-size: 11px; color: #999;">This email was sent from DealSpot.</p>
    </body></html>"""

    if not resend or not resend.api_key:
        raise HTTPException(status_code=500, detail="Email service not configured")

    try:
        params = {
            "from": SENDER_EMAIL,
            "to": to_emails,
            "subject": f"Documentary Instructions - Contract {contract_num} - {qty_str} Mts {trade.get('commodityName', '')} - {trade.get('vesselName', '')}",
            "html": html,
        }
        if attachments:
            params["attachments"] = attachments
        if cc_emails:
            params["cc"] = cc_emails
        await asyncio.to_thread(resend.Emails.send, params)

        # Mark as sent
        update_document("doc_instructions", di_id, set_fields={
            "sentAt": datetime.now(timezone.utc).isoformat(), "sentTo": seller_email})
        return {"message": f"Email sent to {seller_email}", "sentTo": seller_email}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to send email: {str(e)}")


@router.post("/extract-from-pdf/{trade_id}")
async def extract_di_from_pdf(trade_id: str, user=Depends(get_current_user)):
    """Extract Documentary Instruction fields from uploaded DI PDF using AI"""
    from google import genai

    trade = _get("trades", trade_id)
    if not trade:
        raise HTTPException(status_code=404, detail="Trade not found")

    di_path = trade.get("diDocumentPath")
    if not di_path:
        raise HTTPException(status_code=404, detail="No DI document uploaded for this trade")

    filepath = os.path.join(UPLOAD_DIR, di_path)
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="DI file not found on disk")

    api_key = os.environ.get("GOOGLE_API_KEY", "")
    if not api_key:
        raise HTTPException(status_code=500, detail="GOOGLE_API_KEY not configured")

    client = genai.Client(api_key=api_key)

    seller_name = trade.get("sellerName", "")
    buyer_name = trade.get("buyerName", "")
    vessel_name = trade.get("vesselName", "")
    commodity = trade.get("commodityDisplayName") or trade.get("commodityName", "")

    prompt = f"""Extract the following fields from this Documentary Instruction PDF document.
Return ONLY valid JSON with these keys (use empty string if not found):

{{
  "dischargePort": "the discharge/destination port name",
  "agentName": "the discharge port agent company name",
  "agentPhone": "agent phone number",
  "agentFax": "agent fax number",
  "agentMobile": "agent mobile number",
  "agentEmail": "agent email address",
  "agentWeb": "agent website",
  "agentAddress": "agent full address",
  "surveyor": "discharge surveyor name/company",
  "sellerSurveyor": "load port surveyor name/company",
  "originalDocsAddress": "address where original documents should be sent",
  "consigneeText": "the consignee field text (e.g. 'To Order', 'To Order of Bank X', or company name)",
  "notifyPartyText": "the notify party field text with full address",
  "shipperText": "the shipper name and address",
  "requiredDocuments": [
    {{"name": "document name", "originals": number_of_originals, "copies": number_of_copies}}
  ]
}}

Context: Seller={seller_name}, Buyer={buyer_name}, Vessel={vessel_name}, Commodity={commodity}
Extract ALL document requirements listed. Return ONLY the JSON, no markdown, no explanation."""

    try:
        with open(filepath, "rb") as f:
            pdf_bytes = f.read()

        response = await asyncio.to_thread(
            client.models.generate_content,
            model="gemini-2.5-flash",
            contents=[
                genai.types.Part.from_bytes(data=pdf_bytes, mime_type="application/pdf"),
                prompt,
            ],
        )

        text = response.text.strip()
        if text.startswith("```"):
            text = text.split("\n", 1)[1] if "\n" in text else text[3:]
            if text.endswith("```"):
                text = text[:-3]
            text = text.strip()
        if text.startswith("json"):
            text = text[4:].strip()

        extracted = json.loads(text)
        return extracted

    except json.JSONDecodeError:
        raise HTTPException(status_code=500, detail="AI returned invalid JSON. Please try again.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Extraction failed: {str(e)}")
