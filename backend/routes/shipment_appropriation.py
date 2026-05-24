from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from bson import ObjectId
from io import BytesIO
from datetime import datetime
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Spacer, Paragraph, Image, HRFlowable, Table, TableStyle
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
import os, re

from database import trades_col, partners_col
from auth import get_current_user

# Register Liberation Sans fonts (free Arial equivalent, supports Turkish characters)
_FONTS_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'fonts')
pdfmetrics.registerFont(TTFont('FreeSans', os.path.join(_FONTS_DIR, 'LiberationSans-Regular.ttf')))
pdfmetrics.registerFont(TTFont('FreeSansBold', os.path.join(_FONTS_DIR, 'LiberationSans-Bold.ttf')))
pdfmetrics.registerFont(TTFont('FreeSansOblique', os.path.join(_FONTS_DIR, 'LiberationSans-Italic.ttf')))
pdfmetrics.registerFontFamily('FreeSans', normal='FreeSans', bold='FreeSansBold', italic='FreeSansOblique')

router = APIRouter(prefix="/api/shipment-appropriation", tags=["shipment-appropriation"])

F = 'FreeSans'
FB = 'FreeSansBold'
FI = 'FreeSansOblique'
GREEN = colors.HexColor("#1B7A3D")
GREEN_LIGHT = colors.HexColor("#F0F7F2")
GREEN_MED = colors.HexColor("#D4E8DA")
DARK = colors.HexColor("#1A1A1A")
GREY = colors.HexColor("#666666")
BORDER = colors.HexColor("#E0E0E0")
LOGO_PATH = os.path.join(os.path.dirname(__file__), "..", "ba-ticaret-logo.png")
STAMP_PATH = os.path.join(os.path.dirname(__file__), "..", "pir-stamp-signature.png")


def fmt_num(v):
    if v is None:
        return "-"
    try:
        return f"{float(v):,.3f}"
    except (ValueError, TypeError):
        return str(v)


def parse_date(d):
    """Parse various date formats to datetime object"""
    if not d:
        return None
    m = re.match(r'^(\d{2})/(\d{2})/(\d{4})$', str(d))
    if m:
        try:
            return datetime(int(m.group(3)), int(m.group(2)), int(m.group(1)))
        except Exception:
            pass
    try:
        return datetime.fromisoformat(str(d).replace('Z', '+00:00'))
    except Exception:
        return None


def fmt_date_nice(d):
    """Format as '15 May 2025'"""
    dt = parse_date(d)
    if not dt:
        return str(d) if d else "-"
    return dt.strftime('%-d %B %Y')


def fmt_date_dot(d):
    """Format as dd.MM.yyyy"""
    dt = parse_date(d)
    if not dt:
        return str(d) if d else "-"
    return dt.strftime('%d.%m.%Y')


def generate_sa_pdf(trade):
    """Generate Shipment Appropriation PDF and return BytesIO buffer."""
    buyer = None
    if trade.get("buyerId"):
        buyer = partners_col.find_one({"_id": ObjectId(trade["buyerId"])})

    buyer_name = trade.get("buyerName") or (buyer.get("companyName") if buyer else "-")
    # Address: "Merkez / Çorum - Türkiye"
    buyer_addr_line = ""
    if buyer:
        parts = []
        if buyer.get("address"):
            parts.append(buyer["address"])
        city = buyer.get("city", "")
        country = buyer.get("country", "")
        if city and country:
            parts.append(f"{city} - {country}")
        elif city:
            parts.append(city)
        elif country:
            parts.append(country)
        buyer_addr_line = " / ".join(parts) if parts else ""

    contract_no = trade.get("sellerContractNumber") or trade.get("pirContractNumber") or trade.get("contractNumber") or trade.get("referenceNumber") or "-"
    contract_date = fmt_date_dot(trade.get("contractDate"))
    quantity = trade.get("quantity") or 0
    commodity = trade.get("commodityName") or "-"
    commodity_display = trade.get("commodityDisplayName") or commodity
    origin_adj = trade.get("originAdjective") or trade.get("originName") or "-"
    bl_number = trade.get("blNumber") or "-"
    bl_date = fmt_date_dot(trade.get("blDate"))
    bl_quantity = trade.get("blQuantity") or quantity
    vessel = trade.get("vesselName") or "-"
    load_port = trade.get("loadingPortName") or trade.get("basePortName") or "-"
    load_country = trade.get("loadingPortCountry") or ""
    discharge_port = trade.get("dischargePortName") or "-"
    discharge_country = trade.get("dischargePortCountry") or ""
    price = trade.get("pricePerMT") or 0
    currency = trade.get("currency") or "USD"
    sa_date = fmt_date_nice(trade.get("blDate") or trade.get("contractDate"))

    load_port_full = f"{load_port}, {load_country}" if load_country else load_port
    discharge_port_full = f"{discharge_port}, {discharge_country}" if discharge_country else discharge_port
    invoice_value = bl_quantity * price if bl_quantity and price else quantity * price

    buf = BytesIO()
    W_page = A4[0]
    margin = 18 * mm
    W = W_page - 2 * margin
    doc = SimpleDocTemplate(buf, pagesize=A4, topMargin=12 * mm, bottomMargin=12 * mm, leftMargin=margin, rightMargin=margin)
    story = []

    # ========== HEADER: Logo left + meta right ==========
    logo_cell = []
    if os.path.exists(LOGO_PATH):
        logo_cell.append(Image(LOGO_PATH, width=38 * mm, height=17 * mm))
    else:
        logo_cell.append(Paragraph("DealSpot", ParagraphStyle('FL', fontName=FB, fontSize=14, textColor=GREEN)))

    header_tbl = Table([[logo_cell, ""]], colWidths=[W * 0.50, W * 0.50])
    header_tbl.setStyle(TableStyle([('VALIGN', (0, 0), (-1, -1), 'MIDDLE')]))
    story.append(header_tbl)
    story.append(Spacer(1, 4 * mm))

    # Title
    story.append(Paragraph("Shipment Appropriation", ParagraphStyle('Title', fontName=FB, fontSize=16, textColor=GREEN, alignment=TA_CENTER, leading=20)))
    story.append(Spacer(1, 1.5 * mm))
    story.append(HRFlowable(width="100%", thickness=1.5, color=GREEN, spaceAfter=4 * mm))

    # ========== TO + DATE on same row ==========
    s_lbl = ParagraphStyle('Lbl', fontName=FB, fontSize=9, textColor=DARK, leading=13)
    s_val = ParagraphStyle('Val', fontName=F, fontSize=9, textColor=DARK, leading=13)

    to_text = f"<b>To:</b> {buyer_name}"
    if buyer_addr_line:
        to_text += f"<br/>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;{buyer_addr_line}"

    to_date_tbl = Table([
        [Paragraph(to_text, s_val), Paragraph(f"<b>Date:</b> {sa_date}", ParagraphStyle('DtR', fontName=F, fontSize=9, textColor=DARK, alignment=TA_RIGHT, leading=13))],
    ], colWidths=[W * 0.65, W * 0.35])
    to_date_tbl.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('TOPPADDING', (0, 0), (-1, -1), 0),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
    ]))
    story.append(to_date_tbl)
    story.append(Spacer(1, 4 * mm))

    # ========== REF ==========
    s_body = ParagraphStyle('Body', fontName=F, fontSize=9, textColor=DARK, leading=14, spaceAfter=4)
    ref_text = (
        f"<b>Ref:</b> Appropriation of Contract No. <b>{contract_no}</b> "
        f"dated <b>{contract_date}</b> covering <b>{fmt_num(quantity)} MT</b> "
        f"of <b>{commodity_display}</b>."
    )
    story.append(Paragraph(ref_text, s_body))
    story.append(Spacer(1, 2 * mm))

    # ========== BODY ==========
    body1 = (
        f"We hereby appropriate on behalf of Seller, under the usual reserves, "
        f"in full fulfilment of the above-mentioned Contract No. <b>{contract_no}</b> "
        f"dated <b>{contract_date}</b> the quantity of "
        f"<b>{fmt_num(bl_quantity)} MT Gross/Nett</b>."
    )
    story.append(Paragraph(body1, s_body))

    body2 = (
        f"<b>{commodity_display}</b>, in bulk, "
        f'shipped as per <b>"{vessel}"</b> under the following details:'
    )
    story.append(Paragraph(body2, s_body))
    story.append(Spacer(1, 3 * mm))

    # ========== DETAILS TABLE (framed) ==========
    s_det_lbl = ParagraphStyle('DetL', fontName=FB, fontSize=8, textColor=GREY, leading=11)
    s_det_val = ParagraphStyle('DetV', fontName=F, fontSize=9, textColor=DARK, leading=12)
    s_det_val_b = ParagraphStyle('DetVB', fontName=FB, fontSize=9, textColor=DARK, leading=12)

    details_data = [
        [Paragraph("B/L No.", s_det_lbl), Paragraph(f"<b>{bl_number}</b>", s_det_val_b),
         Paragraph("B/L Date", s_det_lbl), Paragraph(f"<b>{bl_date}</b>", s_det_val_b)],
        [Paragraph("B/L Quantity", s_det_lbl), Paragraph(f"<b>{fmt_num(bl_quantity)} MT Gross/Nett</b>", s_det_val_b),
         Paragraph("Vessel", s_det_lbl), Paragraph(f"<b>{vessel}</b>", s_det_val_b)],
        [Paragraph("Port of Loading", s_det_lbl), Paragraph(f"<b>{load_port_full}</b>", s_det_val_b),
         Paragraph("Port of Discharge", s_det_lbl), Paragraph(f"<b>{discharge_port_full}</b>", s_det_val_b)],
    ]

    lbl_w = 24 * mm
    val_w = (W - 2 * lbl_w) / 2
    det_tbl = Table(details_data, colWidths=[lbl_w, val_w, lbl_w, val_w])
    det_tbl.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('LEFTPADDING', (0, 0), (-1, -1), 5),
        ('RIGHTPADDING', (0, 0), (-1, -1), 5),
        ('BACKGROUND', (0, 0), (0, -1), GREEN_LIGHT),
        ('BACKGROUND', (2, 0), (2, -1), GREEN_LIGHT),
        ('LINEBELOW', (0, 0), (-1, -1), 0.4, BORDER),
        ('BOX', (0, 0), (-1, -1), 0.8, GREEN),
        ('ROUNDEDCORNERS', [3, 3, 3, 3]),
    ]))
    story.append(det_tbl)
    story.append(Spacer(1, 4 * mm))

    # ========== INVOICE VALUE (highlighted) ==========
    inv_tbl = Table([
        [Paragraph("Invoice Value:", ParagraphStyle('IVL', fontName=FB, fontSize=10, textColor=DARK, alignment=TA_RIGHT, leading=13)),
         Paragraph(f"<b>{currency} {invoice_value:,.2f}</b>", ParagraphStyle('IVV', fontName=FB, fontSize=12, textColor=GREEN, alignment=TA_RIGHT, leading=15))],
    ], colWidths=[W * 0.55, W * 0.45])
    inv_tbl.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('BACKGROUND', (1, 0), (1, 0), GREEN_LIGHT),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ('RIGHTPADDING', (1, 0), (1, 0), 8),
        ('BOX', (1, 0), (1, 0), 0.5, GREEN_MED),
        ('ROUNDEDCORNERS', [0, 3, 3, 0]),
    ]))
    story.append(inv_tbl)
    story.append(Spacer(1, 5 * mm))

    # ========== CLOSING ==========
    s_close = ParagraphStyle('Close', fontName=F, fontSize=9, textColor=DARK, leading=14, spaceAfter=3)
    story.append(Paragraph(
        "Please find attached the set of B/Ls. We will revert with the balance documents as soon as possible.",
        s_close
    ))
    story.append(Spacer(1, 3 * mm))
    story.append(Paragraph("Best regards,", s_close))

    # ========== SIGNATURE with stamp ==========
    sig_line = ParagraphStyle('SigLine', fontName=F, fontSize=8, alignment=TA_CENTER, textColor=GREY)
    sig_name = ParagraphStyle('SigName', fontName=FB, fontSize=7, alignment=TA_CENTER, textColor=DARK, leading=10)

    sig_rows = []
    if os.path.exists(STAMP_PATH):
        sig_rows.append(["", Image(STAMP_PATH, width=28 * mm, height=28 * mm)])
    sig_rows.append(["", Paragraph("_______________________________", sig_line)])
    sig_rows.append(["", Paragraph("<b>Authorized Signature</b><br/>IZZET ALEV<br/>DealSpot Ltd", sig_name)])

    sig_tbl = Table(sig_rows, colWidths=[W * 0.55, W * 0.45])
    style_cmds = [
        ('VALIGN', (0, 0), (-1, -1), 'BOTTOM'),
        ('ALIGN', (1, 0), (1, -1), 'CENTER'),
        ('TOPPADDING', (0, 0), (-1, -1), 0),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
    ]
    if os.path.exists(STAMP_PATH):
        style_cmds.append(('BOTTOMPADDING', (1, 0), (1, 0), -4))
    sig_tbl.setStyle(TableStyle(style_cmds))
    story.append(sig_tbl)
    story.append(Spacer(1, 3 * mm))

    # ========== FOOTER ==========
    story.append(HRFlowable(width="100%", thickness=1, color=GREEN, spaceAfter=2 * mm))
    story.append(Paragraph(
        "DealSpot Ltd.",
        ParagraphStyle('Foot', fontName=F, fontSize=7, textColor=GREY, alignment=TA_CENTER)
    ))

    doc.build(story)
    buf.seek(0)
    return buf


@router.get("/{trade_id}/pdf")
def generate_shipment_appropriation_pdf(trade_id: str, user=Depends(get_current_user)):
    trade = trades_col.find_one({"_id": ObjectId(trade_id)})
    if not trade:
        raise HTTPException(status_code=404, detail="Trade not found")

    buf = generate_sa_pdf(trade)
    contract_no = trade.get("sellerContractNumber") or trade.get("pirContractNumber") or trade.get("contractNumber") or trade.get("referenceNumber") or "-"
    trade_id_str = str(trade["_id"])
    filename = f"Shipment_Appropriation_{contract_no}_{trade_id_str[-6:]}.pdf"
    return StreamingResponse(
        buf,
        media_type="application/pdf",
        headers={"Content-Disposition": f"inline; filename={filename}"}
    )
