import os
import asyncio
import base64
import resend
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from bson import ObjectId
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()

from database import trades_col, partners_col, documents_col, db, vessels_col
from auth import get_current_user
from config import UPLOAD_DIR

CERT_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "uploads", "vessel_certs")

router = APIRouter(prefix="/api", tags=["email"])

resend.api_key = os.environ.get("RESEND_API_KEY", "")
SENDER_EMAIL = os.environ.get("SENDER_EMAIL", "DealSpot - Execution <noreply@baticaret.com>")
def get_cc_emails():
    """Load CC emails from admin users in the database."""
    from database import db
    users = db.users.find({"role": {"$in": ["admin", "accountant"]}})
    return [u["email"] for u in users if u.get("email")]

LOGO_PATH = os.path.join(os.path.dirname(__file__), "..", "dealspot-logo-transparent-sm.png")
LOGO_B64 = ""
if os.path.exists(LOGO_PATH):
    with open(LOGO_PATH, "rb") as f:
        LOGO_B64 = base64.b64encode(f.read()).decode()



class EmailSendRequest(BaseModel):
    trade_id: str
    doc_type: str
    seller_email: Optional[str] = ""
    buyer_email: Optional[str] = ""
    seller_cc: Optional[list] = []
    buyer_cc: Optional[list] = []
    subject: Optional[str] = ""


def fmt_qty(val):
    try:
        return f"{float(val):,.0f}"
    except:
        return str(val or "-")


def fmt_price(val, currency="USD"):
    try:
        return f"{float(val):,.2f} {currency}"
    except:
        return str(val or "-")


def fmt_date_ddmmyyyy(d):
    """Format date to DD-MM-YYYY. Handles ISO (2025-07-01), slash (01/07/2025), and datetime."""
    if not d or d == "-":
        return "-"
    import re
    # ISO format: 2025-07-01 or 2025-07-01T...
    m = re.match(r'^(\d{4})-(\d{2})-(\d{2})', str(d))
    if m:
        return f"{m.group(3)}-{m.group(2)}-{m.group(1)}"
    # dd/MM/yyyy
    m = re.match(r'^(\d{2})/(\d{2})/(\d{4})$', str(d))
    if m:
        return f"{m.group(1)}-{m.group(2)}-{m.group(3)}"
    # dd.MM.yyyy
    m = re.match(r'^(\d{2})\.(\d{2})\.(\d{4})$', str(d))
    if m:
        return f"{m.group(1)}-{m.group(2)}-{m.group(3)}"
    try:
        from datetime import datetime as dt_cls
        parsed = dt_cls.fromisoformat(str(d).replace('Z', '+00:00'))
        return parsed.strftime('%d-%m-%Y')
    except Exception:
        return str(d)


def row_html(label, value):
    return f'<tr><td style="padding: 10px 14px; border: 1px solid #e0e0e0; background: #E8F5E9; font-weight: 600; width: 200px; color: #1B7A3D;">{label}</td><td style="padding: 10px 14px; border: 1px solid #e0e0e0;">{value}</td></tr>'


def get_partner_email(partner_id):
    if not partner_id:
        return ""
    try:
        partner = partners_col.find_one({"_id": ObjectId(partner_id)})
        if partner:
            email = partner.get("email") or ""
            if email:
                return email
            for key in ["tradeContacts", "executionContacts", "contacts"]:
                for c in (partner.get(key) or []):
                    if c.get("email"):
                        return c["email"]
    except:
        pass
    return ""


def get_partner_all_emails(partner_id):
    """Get all emails for a partner: main + trade + execution contacts."""
    emails = []
    if not partner_id:
        return emails
    try:
        partner = partners_col.find_one({"_id": ObjectId(partner_id)})
        if not partner:
            return emails
        if partner.get("email"):
            emails.append(partner["email"])
        for key in ["tradeContacts", "executionContacts"]:
            for c in (partner.get(key) or []):
                if c.get("email") and c["email"] not in emails:
                    emails.append(c["email"])
    except:
        pass
    return emails


def get_bl_documents(trade_id):
    """Fetch Bill of Ladings documents for a trade."""
    attachments = []
    try:
        # Find documents with docName containing "Bill of Lading" (case insensitive)
        import re
        bl_docs = documents_col.find({
            "tradeId": trade_id,
            "docName": re.compile(r"bill.*lading", re.IGNORECASE)
        })
        
        for doc in bl_docs:
            saved_name = doc.get("savedName", "")
            file_name = doc.get("fileName", saved_name)
            file_path = os.path.join(UPLOAD_DIR, saved_name)
            
            if os.path.exists(file_path):
                with open(file_path, "rb") as f:
                    content = f.read()
                    b64_content = base64.b64encode(content).decode("utf-8")
                    
                    # Determine content type
                    ext = os.path.splitext(file_name)[1].lower()
                    content_type_map = {
                        '.pdf': 'application/pdf',
                        '.jpg': 'image/jpeg',
                        '.jpeg': 'image/jpeg',
                        '.png': 'image/png',
                        '.doc': 'application/msword',
                        '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
                    }
                    content_type = content_type_map.get(ext, 'application/octet-stream')
                    
                    attachments.append({
                        "filename": file_name,
                        "content": b64_content,
                        "content_type": content_type
                    })
    except Exception as e:
        print(f"Error fetching BL documents: {e}")
    
    return attachments


def get_vessel_certificates(vessel_name):
    """Fetch certificates for a vessel by name."""
    attachments = []
    if not vessel_name:
        return attachments
    try:
        vessel = vessels_col.find_one({"name": vessel_name})
        if not vessel:
            return attachments
        for cert in vessel.get("certificates", []):
            file_path = os.path.join(CERT_DIR, cert.get("storedName", ""))
            if os.path.exists(file_path):
                with open(file_path, "rb") as f:
                    content = f.read()
                    b64_content = base64.b64encode(content).decode("utf-8")
                    ext = os.path.splitext(cert.get("fileName", ""))[1].lower()
                    ct_map = {'.pdf': 'application/pdf', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.doc': 'application/msword', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'}
                    attachments.append({"filename": cert.get("fileName", "certificate"), "content": b64_content, "content_type": ct_map.get(ext, "application/octet-stream")})
    except Exception as e:
        print(f"Error fetching vessel certificates: {e}")
    return attachments



def build_email_body(trade, doc_name, recipient_name, recipient_role):
    ref = trade.get("referenceNumber") or ""
    seller_contract = trade.get("sellerContractNumber") or ""
    contract_label = seller_contract or ref
    commodity = trade.get("commodityName") or ""
    seller = trade.get("sellerName") or ""
    buyer = trade.get("buyerName") or ""
    quantity = trade.get("quantity") or 0
    bl_quantity = trade.get("blQuantity") or quantity
    price = trade.get("pricePerMT") or trade.get("price") or 0
    currency = trade.get("currency") or "USD"
    tolerance = trade.get("tolerance") or ""
    origin = trade.get("originName") or trade.get("origin") or ""
    origin_adj = trade.get("originAdjective") or ""
    load_port = trade.get("loadingPortName") or trade.get("basePortName") or ""
    load_country = trade.get("loadingPortCountry") or ""
    discharge_port = trade.get("dischargePortName") or ""
    discharge_country = trade.get("dischargePortCountry") or ""
    vessel = trade.get("vesselName") or "-"
    bl_date = trade.get("blDate") or "-"
    payment_terms = trade.get("paymentTerms") or "-"
    contract_date = trade.get("contractDate") or "-"
    commodity_specs = trade.get("commoditySpecs") or ""
    gafta_term = trade.get("gaftaTerm") or "-"
    broker_name = trade.get("brokerName") or "-"
    brokerage_per_mt = trade.get("brokeragePerMT") or 0
    brokerage_currency = trade.get("brokerageCurrency") or "USD"
    discharge_rate = trade.get("dischargeRate") or ""
    demurrage_rate = trade.get("demurrageRate") or ""
    crop_year = trade.get("cropYear") or ""
    delivery_term = trade.get("deliveryTerm") or ""
    commodity_display = trade.get("commodityDisplayName") or commodity

    load_port_full = f"{load_port}, {load_country}" if load_country else load_port
    discharge_port_full = f"{discharge_port}, {discharge_country}" if discharge_country else discharge_port
    specs_html = commodity_specs.replace("\n", "<br/>") if commodity_specs else "-"

    # Build commodity display with origin adjective: "Ukrainian Yellow Corn, Crop 2025"
    commodity_with_crop = f"{origin_adj} {commodity}".strip() if origin_adj else commodity
    if crop_year:
        commodity_with_crop = f"{commodity_with_crop}, Crop {crop_year}"

    # Format date as DD-MM-YYYY
    formatted_date = fmt_date_ddmmyyyy(contract_date)

    # Format shipment dates as DD-MM-YYYY
    shipment_start = fmt_date_ddmmyyyy(trade.get("shipmentWindowStart", ""))
    shipment_end = fmt_date_ddmmyyyy(trade.get("shipmentWindowEnd", ""))

    # Build price with delivery term and base port
    base_port = trade.get("basePortName") or discharge_port
    base_port_country = trade.get("basePortCountry") or ""
    base_port_full = f"{base_port}, {base_port_country}" if base_port_country else base_port
    price_display = f"{currency} {float(price):,.2f}/MT {delivery_term} {base_port_full}".strip() if price else "-"

    logo_html = ""
    if LOGO_B64:
        logo_html = f'''
            <table style="width: 100%;" cellpadding="0" cellspacing="0"><tr>
                <td style="text-align: center; padding: 10px 0;">
                    <img src="cid:dealspotlogo" style="height: 50px; vertical-align: middle;" alt="DealSpot" />
                    <span style="color: #ffffff; font-size: 22px; font-weight: bold; vertical-align: middle; margin-left: 12px;">DealSpot Ltd</span>
                </td>
            </tr></table>'''

    if doc_name == "Business Confirmation":
        rows = "".join([
            row_html("DATE", formatted_date),
            row_html("CONTRACT NO", contract_label),
            row_html("BA TICARET REF. NO", ref),
            row_html("SELLERS", seller),
            row_html("BUYERS", buyer),
            row_html("BROKER", broker_name),
            row_html("COMMODITY", commodity_with_crop),
            row_html("SPECIFICATIONS", specs_html),
            row_html("QUANTITY", f"{fmt_qty(quantity)} MT{(' +/- ' + tolerance + ' at Sellers option') if tolerance else ''}"),
            row_html("PRICE", price_display),
            row_html("ORIGIN", origin),
            row_html("SHIPMENT", f"{shipment_start}<br/>{shipment_end}" if shipment_start != "-" else "-"),
            row_html("DISCHARGE RATE", f"{fmt_qty(discharge_rate)} Mts/Day" if discharge_rate else "-"),
            row_html("DEMURRAGE RATE", f"{currency} {float(demurrage_rate):,.2f}/Day" if demurrage_rate else "-"),
            row_html("PAYMENT", payment_terms),
            row_html("GAFTA RULE", gafta_term),
        ])
        closing = "A draft contract will be shared shortly. Thank you for the business."

    elif doc_name == "Shipment Appropriation":
        # Get buyer address for "To:" line
        buyer_doc = None
        if trade.get("buyerId"):
            try:
                buyer_doc = partners_col.find_one({"_id": ObjectId(trade["buyerId"])})
            except:
                pass
        buyer_addr_parts = []
        if buyer_doc:
            if buyer_doc.get("address"): buyer_addr_parts.append(buyer_doc["address"])
            city_c = buyer_doc.get("city", "")
            country_c = buyer_doc.get("country", "")
            if city_c and country_c: buyer_addr_parts.append(f"{city_c} - {country_c}")
            elif city_c: buyer_addr_parts.append(city_c)
            elif country_c: buyer_addr_parts.append(country_c)
        buyer_addr = " / ".join(buyer_addr_parts) if buyer_addr_parts else ""
        
        sa_date_str = bl_date if bl_date != "-" else formatted_date
        invoice_value = (bl_quantity or quantity or 0) * (float(price) if price else 0)
        bl_number = trade.get("blNumber") or "-"
        
        # Build SA email matching PDF layout
        sa_rows = "".join([
            f'<tr><td style="padding:8px 12px;background:#E8F5E9;font-weight:600;width:160px;color:#1B7A3D;border:1px solid #e0e0e0;font-size:13px;">B/L No.</td><td style="padding:8px 12px;border:1px solid #e0e0e0;font-weight:700;font-size:13px;">{bl_number}</td>'
            f'<td style="padding:8px 12px;background:#E8F5E9;font-weight:600;width:160px;color:#1B7A3D;border:1px solid #e0e0e0;font-size:13px;">B/L Date</td><td style="padding:8px 12px;border:1px solid #e0e0e0;font-weight:700;font-size:13px;">{sa_date_str}</td></tr>',
            f'<tr><td style="padding:8px 12px;background:#E8F5E9;font-weight:600;color:#1B7A3D;border:1px solid #e0e0e0;font-size:13px;">B/L Quantity</td><td style="padding:8px 12px;border:1px solid #e0e0e0;font-weight:700;font-size:13px;">{fmt_qty(bl_quantity)} MT Gross/Nett</td>'
            f'<td style="padding:8px 12px;background:#E8F5E9;font-weight:600;color:#1B7A3D;border:1px solid #e0e0e0;font-size:13px;">Vessel</td><td style="padding:8px 12px;border:1px solid #e0e0e0;font-weight:700;font-size:13px;">{vessel}</td></tr>',
            f'<tr><td style="padding:8px 12px;background:#E8F5E9;font-weight:600;color:#1B7A3D;border:1px solid #e0e0e0;font-size:13px;">Port of Loading</td><td style="padding:8px 12px;border:1px solid #e0e0e0;font-weight:700;font-size:13px;">{load_port_full}</td>'
            f'<td style="padding:8px 12px;background:#E8F5E9;font-weight:600;color:#1B7A3D;border:1px solid #e0e0e0;font-size:13px;">Port of Discharge</td><td style="padding:8px 12px;border:1px solid #e0e0e0;font-weight:700;font-size:13px;">{discharge_port_full}</td></tr>',
        ])
        
        # Custom SA body matching PDF
        return f"""
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 680px; margin: 0 auto; border: 1px solid #e0e0e0;">
        <div style="padding: 0 28px; background-color: #fafaf8;">
            <div style="text-align: center;">
                <img src="cid:dealspotlogo" style="height: 180px; display: block; margin: 0 auto;" alt="DealSpot" />
            </div>
            <h2 style="text-align:center;color:#1B7A3D;font-size:18px;margin:0 0 16px 0;border-bottom:2px solid #1B7A3D;padding-bottom:8px;">Shipment Appropriation</h2>
            
            <table style="width:100%;margin-bottom:16px;font-size:14px;"><tr>
                <td style="color:#333;"><strong>To:</strong> {buyer}<br/>{f'&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;{buyer_addr}' if buyer_addr else ''}</td>
                <td style="text-align:right;color:#333;"><strong>Date:</strong> {sa_date_str}</td>
            </tr></table>
            
            <p style="font-size:14px;color:#333;"><strong>Ref:</strong> Appropriation of Contract No. <strong>{contract_label}</strong> dated <strong>{formatted_date}</strong> covering <strong>{fmt_qty(quantity)} MT</strong> of <strong>{commodity_display}</strong>.</p>
            
            <p style="font-size:14px;color:#333;">We hereby appropriate on behalf of Seller, under the usual reserves, in full fulfilment of the above-mentioned Contract No. <strong>{contract_label}</strong> dated <strong>{formatted_date}</strong> the quantity of <strong>{fmt_qty(bl_quantity)} MT Gross/Nett</strong>.</p>
            
            <p style="font-size:14px;color:#333;"><strong>{commodity_display}</strong>, in bulk, shipped as per <strong>"{vessel}"</strong> under the following details:</p>
            
            <table style="width:100%;border-collapse:collapse;margin:16px 0;border:1px solid #1B7A3D;border-radius:4px;">
                {sa_rows}
            </table>
            
            <table style="width:100%;margin:16px 0;"><tr>
                <td style="text-align:right;font-size:14px;color:#333;font-weight:600;">Invoice Value:</td>
                <td style="text-align:right;width:200px;font-size:16px;font-weight:700;color:#1B7A3D;background:#E8F5E9;padding:8px 12px;border:1px solid #D4E8DA;border-radius:4px;">{currency} {invoice_value:,.2f}</td>
            </tr></table>
            
            <p style="font-size:14px;color:#555;">Please find attached the set of B/Ls. We will revert with the balance documents as soon as possible.</p>
            <p style="font-size:14px;color:#333;">Best Regards,<br/><strong>DealSpot Ltd</strong></p>
        </div>
    </div>
    """

    elif doc_name == "Commission Invoice":
        commission_total = brokerage_per_mt * (bl_quantity or quantity or 0)
        rows = "".join([
            row_html("INVOICE NO", f"COMM-{contract_label}"),
            row_html("CONTRACT NO", contract_label),
            row_html("BA TICARET REF. NO", ref),
            row_html("SELLER", seller),
            row_html("BUYER", buyer),
            row_html("COMMODITY", commodity_display),
            row_html("B/L QUANTITY", f"{fmt_qty(bl_quantity)} MT"),
            row_html("BROKERAGE RATE", f"{brokerage_per_mt} {brokerage_currency}/MT"),
            row_html("COMMISSION AMOUNT", f"<strong>{fmt_price(commission_total, brokerage_currency)}</strong>"),
            row_html("VESSEL", vessel),
            row_html("B/L DATE", bl_date),
        ])
        closing = "Please arrange payment at your earliest convenience."

    elif doc_name == "Vessel Nomination":
        # Look up vessel details from vessels collection
        vessel_doc = None
        if trade.get("vesselId"):
            try:
                vessel_doc = db.vessels.find_one({"_id": ObjectId(trade["vesselId"])})
            except:
                pass
        if not vessel_doc and trade.get("vesselName"):
            vessel_doc = db.vessels.find_one({"name": trade["vesselName"]})
        vessel_imo = (vessel_doc or {}).get("imoNumber") or trade.get("vesselIMO") or "-"
        vessel_flag = (vessel_doc or {}).get("flag") or trade.get("vesselFlag") or "-"
        vessel_built = (vessel_doc or {}).get("builtYear") or trade.get("vesselBuilt") or "-"
        surveyor_name = trade.get("sellerSurveyor") or trade.get("surveyorName") or "-"
        origin_country = trade.get("originName") or trade.get("originCountry") or ""
        if surveyor_name != "-" and origin_country:
            surveyor_name = f"{surveyor_name} {origin_country}"
        # Look up load port agent full details
        lpa_name = trade.get("loadportAgent") or ""
        lpa_details = "-"
        if lpa_name:
            lpa_doc = db.loadport_agents.find_one({"name": lpa_name})
            if not lpa_doc:
                import re
                lpa_doc = db.loadport_agents.find_one({"name": re.compile(f"^{re.escape(lpa_name)}", re.IGNORECASE)})
            if lpa_doc:
                parts = [f"<strong>{lpa_doc.get('name', '')}</strong>"]
                if lpa_doc.get('contact'): parts.append(f"Contact: {lpa_doc['contact']}")
                if lpa_doc.get('tel'): parts.append(f"Tel: {lpa_doc['tel']}")
                if lpa_doc.get('email'): parts.append(f"Email: {lpa_doc['email']}")
                if lpa_doc.get('address'): parts.append(lpa_doc['address'])
                lpa_details = "<br/>".join(parts)
            else:
                lpa_details = lpa_name
        rows = "".join([
            row_html("CONTRACT NO", contract_label),
            row_html("BA TICARET REF. NO", ref),
            row_html("SELLER", seller),
            row_html("BUYER", buyer),
            row_html("COMMODITY", commodity_with_crop),
            row_html("QUANTITY", f"{fmt_qty(quantity)} MT"),
            row_html("VESSEL NAME", f"<strong>{vessel}</strong>"),
            row_html("IMO NUMBER", str(vessel_imo)),
            row_html("FLAG", str(vessel_flag)),
            row_html("BUILT", str(vessel_built)),
            row_html("LOADING PORT", load_port_full),
            row_html("LOAD PORT AGENT", lpa_details),
            row_html("SELLER SURVEYOR", surveyor_name),
        ])
        closing = "Please find the vessel certificates attached and confirm your acceptance of the vessel nomination."

    else:
        rows = ""
        closing = ""

    return f"""
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 680px; margin: 0 auto; border: 1px solid #e0e0e0;">
        <div style="padding: 0 28px; background-color: #fafaf8;">
            <div style="text-align: center;">
                <img src="cid:dealspotlogo" style="height: 180px; display: block; margin: 0 auto;" alt="DealSpot" />
            </div>
            <p style="font-size: 15px; color: #333; margin-top: 0;">Dear {recipient_name},</p>
            {"<p style='font-size: 15px; color: #333;'>Please find below the vessel nomination details for the subject contract.</p>" if doc_name == "Vessel Nomination" else f"<p style='font-size: 15px; color: #333;'>Please find below the <strong>{doc_name}</strong> details:</p>"}

            <table style="width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 14px;">
                {rows}
            </table>

            <p style="font-size: 14px; color: #555; margin-top: 24px;">{closing}</p>
            <p style="font-size: 14px; color: #333; margin-top: 20px;">Best Regards,<br/><strong>DealSpot Ltd</strong></p>
        </div>
    </div>
    """



@router.get("/email-prefill/{trade_id}")
def get_email_prefill(trade_id: str, user=Depends(get_current_user)):
    """Get pre-filled email addresses for a trade."""
    trade = trades_col.find_one({"_id": ObjectId(trade_id)})
    if not trade:
        raise HTTPException(status_code=404, detail="Trade not found")
    seller_emails = get_partner_all_emails(trade.get("sellerId"))
    buyer_emails = get_partner_all_emails(trade.get("buyerId"))
    ba_emails = get_cc_emails()
    return {
        "sellerEmails": seller_emails,
        "buyerEmails": buyer_emails,
        "BAemails": ba_emails,
        "sellerName": trade.get("sellerCode") or trade.get("sellerName") or "",
        "buyerName": trade.get("buyerCode") or trade.get("buyerName") or "",
    }


@router.post("/send-document-email")
async def send_document_email(req: EmailSendRequest, user=Depends(get_current_user)):
    trade = trades_col.find_one({"_id": ObjectId(req.trade_id)})
    if not trade:
        raise HTTPException(status_code=404, detail="Trade not found")

    ref = trade.get("referenceNumber") or ""
    seller_contract = trade.get("sellerContractNumber") or ""
    contract_label = seller_contract or ref
    commodity = trade.get("commodityName") or ""
    seller_name = trade.get("sellerName") or ""
    buyer_name = trade.get("buyerName") or ""

    # Resolve emails
    seller_email = req.seller_email or get_partner_email(trade.get("sellerId"))
    buyer_email = req.buyer_email or get_partner_email(trade.get("buyerId"))

    # Generate the PDF (skip for business_confirmation and vessel_nomination)
    attachment = None
    attachments_list = []  # For multiple attachments (like BL documents)
    
    if req.doc_type == "business_confirmation":
        doc_name = "Business Confirmation"
        filename = None
    elif req.doc_type == "vessel_nomination":
        doc_name = "Vessel Nomination"
        filename = None
        # Attach vessel certificates
        vessel_certs = get_vessel_certificates(trade.get("vesselName"))
        attachments_list.extend(vessel_certs)
    elif req.doc_type == "shipment_appropriation":
        doc_name = "Shipment Appropriation"
        filename = None
        # Fetch Bill of Ladings documents for this trade
        bl_attachments = get_bl_documents(req.trade_id)
        attachments_list.extend(bl_attachments)
        # Also attach vessel certificates
        vessel_certs = get_vessel_certificates(trade.get("vesselName"))
        attachments_list.extend(vessel_certs)
    elif req.doc_type == "commission_invoice":
        from routes.commission_invoice import generate_ci_pdf
        pdf_buf = generate_ci_pdf(trade)
        doc_name = "Commission Invoice"
        filename = f"Commission_Invoice_{contract_label}.pdf"
    else:
        raise HTTPException(status_code=400, detail="Invalid document type")

    # Build subject line
    if req.doc_type == "vessel_nomination":
        origin_adj_sub = trade.get("originAdjective") or ""
        commodity_sub = trade.get("commodityName") or ""
        commodity_full = f"{origin_adj_sub} {commodity_sub}".strip() if origin_adj_sub else commodity_sub
        qty = trade.get("quantity") or 0
        vessel_name = trade.get("vesselName") or ""
        subject = req.subject or f"Vessel Nomination - {contract_label} - {fmt_qty(qty)} Mts {commodity_full} - {vessel_name}"
    else:
        subject = req.subject or f"{doc_name} - {contract_label} ({commodity})"

    if filename and req.doc_type not in ("business_confirmation", "vessel_nomination"):
        pdf_bytes = pdf_buf.getvalue()
        pdf_b64 = base64.b64encode(pdf_bytes).decode("utf-8")
        attachment = {"filename": filename, "content": pdf_b64, "content_type": "application/pdf"}
    
    # Combine single attachment with attachments list
    if attachment:
        attachments_list.insert(0, attachment)

    # Add inline logo attachment for CID reference in email body
    if LOGO_B64:
        attachments_list.append({
            "filename": "dealspot-logo.png",
            "content": LOGO_B64,
            "content_type": "image/png",
            "content_id": "dealspotlogo",
        })

    sent_to = []
    errors = []

    # For CIF/CFR vessel nominations, skip seller (buyer is responsible for vessel)
    delivery_term = trade.get("deliveryTerm") or ""
    skip_seller = req.doc_type == "vessel_nomination" and delivery_term.upper().startswith(("CIF", "CFR"))

    # Send to seller (separate email - no buyer info in CC)
    if seller_email and not skip_seller:
        seller_body = build_email_body(trade, doc_name, seller_name, "seller")
        cc_emails = list(set(get_cc_emails() + (req.seller_cc or [])))
        seller_cc = [e for e in cc_emails if e != seller_email]
        try:
            params = {
                "from": SENDER_EMAIL,
                "to": [seller_email],
                "cc": seller_cc,
                "subject": subject,
                "html": seller_body,
            }
            if attachments_list:
                params["attachments"] = attachments_list
            await asyncio.to_thread(resend.Emails.send, params)
            sent_to.append(f"Seller: {seller_email}")
        except Exception as e:
            # Retry without CC (Resend test mode restriction)
            try:
                params.pop("cc", None)
                await asyncio.to_thread(resend.Emails.send, params)
                sent_to.append(f"Seller: {seller_email} (without CC)")
            except Exception as e2:
                errors.append(f"Seller ({seller_email}): {str(e2)}")

    # Send to buyer (separate email - no seller info in CC)
    if buyer_email:
        buyer_body = build_email_body(trade, doc_name, buyer_name, "buyer")
        cc_emails = list(set(get_cc_emails() + (req.buyer_cc or [])))
        buyer_cc = [e for e in cc_emails if e != buyer_email]
        try:
            params = {
                "from": SENDER_EMAIL,
                "to": [buyer_email],
                "cc": buyer_cc,
                "subject": subject,
                "html": buyer_body,
            }
            if attachments_list:
                params["attachments"] = attachments_list
            await asyncio.to_thread(resend.Emails.send, params)
            sent_to.append(f"Buyer: {buyer_email}")
        except Exception as e:
            try:
                params.pop("cc", None)
                await asyncio.to_thread(resend.Emails.send, params)
                sent_to.append(f"Buyer: {buyer_email} (without CC)")
            except Exception as e2:
                errors.append(f"Buyer ({buyer_email}): {str(e2)}")

    # If no emails provided, send to CC only
    if not seller_email and not buyer_email:
        body = build_email_body(trade, doc_name, "Team", "internal")
        try:
            params = {
                "from": SENDER_EMAIL,
                "to": get_cc_emails(),
                "subject": subject,
                "html": body,
            }
            if attachments_list:
                params["attachments"] = attachments_list
            await asyncio.to_thread(resend.Emails.send, params)
            sent_to.append(f"Internal: {', '.join(get_cc_emails())}")
        except Exception as e:
            errors.append(f"Internal: {str(e)}")

    # Track sent status
    sent_field = f"{req.doc_type}Sent"
    trades_col.update_one(
        {"_id": ObjectId(req.trade_id)},
        {"$set": {
            sent_field: True,
            f"{sent_field}At": datetime.utcnow().isoformat() + "Z",
            f"{sent_field}By": user.get("username") or user.get("name") or "",
            f"{sent_field}SentTo": sent_to,
        }}
    )

    if errors and not sent_to:
        raise HTTPException(status_code=500, detail=f"Failed to send: {'; '.join(errors)}")

    return {
        "status": "success",
        "sent_to": sent_to,
        "errors": errors if errors else None,
        "message": f"{doc_name} sent to {', '.join(sent_to)}" + (f" (errors: {'; '.join(errors)})" if errors else ""),
    }
