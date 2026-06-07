from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from bson import ObjectId
from io import BytesIO
from datetime import datetime
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Spacer, Paragraph, Image, HRFlowable
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_RIGHT, TA_CENTER
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from num2words import num2words
import os
import resend
import base64
import asyncio

from database import trades_col, partners_col, bank_accounts_col

# Register Liberation Sans fonts (free Arial equivalent, supports Turkish characters)
_FONTS_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'fonts')
pdfmetrics.registerFont(TTFont('FreeSans', os.path.join(_FONTS_DIR, 'LiberationSans-Regular.ttf')))
pdfmetrics.registerFont(TTFont('FreeSansBold', os.path.join(_FONTS_DIR, 'LiberationSans-Bold.ttf')))
pdfmetrics.registerFont(TTFont('FreeSansOblique', os.path.join(_FONTS_DIR, 'LiberationSans-Italic.ttf')))
pdfmetrics.registerFont(TTFont('FreeSansBoldOblique', os.path.join(_FONTS_DIR, 'LiberationSans-BoldItalic.ttf')))
pdfmetrics.registerFontFamily('FreeSans', normal='FreeSans', bold='FreeSansBold', italic='FreeSansOblique', boldItalic='FreeSansBoldOblique')
from auth import get_current_user

router = APIRouter(prefix="/api/commission-invoice", tags=["commission-invoice"])

BA_NAVY = colors.HexColor("#1A5276")
BA_NAVY_LIGHT = colors.HexColor("#EBF2F7")
BA_NAVY_MED = colors.HexColor("#C8DAE8")
DARK_TEXT = colors.HexColor("#1A1A1A")
GREY_TEXT = colors.HexColor("#666666")
LIGHT_BORDER = colors.HexColor("#D0D0D0")
LOGO_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "dealspot-logo.png")

BA_COMPANY = {
    "name": "BA TICARET LTD",
    "address": "Blv. Tsarigradsko Shosse No:73, Plovdiv/BULGARIA",
    "id_no": "206597892",
}

BA_BANK = {
    "beneficiary": "BA TICARET LTD",
    "bank": "UNICREDIT BULBANK",
    "address": "STR. IVAN VAZOV 31 Plovdiv/BULGARIA",
    "iban": "BG76UNCR70001525611113",
    "bic": "UNCRBGSF",
}


def amount_in_words(amount, currency="USD"):
    try:
        integer_part = int(amount)
        decimal_part = round((amount - integer_part) * 100)
        words = num2words(integer_part, lang='en').title()
        curr_word = "US Dollars" if currency == "USD" else currency
        if decimal_part > 0:
            cents_words = num2words(decimal_part, lang='en').title()
            return f"{words} and {cents_words}/100 {curr_word}."
        return f"{words} {curr_word} Only."
    except Exception:
        return str(amount)


def generate_invoice_pdf(trade, invoice_number, invoice_date, issued_to_name, issued_to_address, issued_to_tax_id, bank_accounts=None):
    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, leftMargin=18*mm, rightMargin=18*mm, topMargin=12*mm, bottomMargin=10*mm)

    elements = []
    W = 174*mm

    # --- Fonts ---
    F = 'FreeSans'
    FB = 'FreeSansBold'
    FI = 'FreeSansOblique'

    # --- Colors ---
    GREEN = BA_NAVY
    BG_LIGHT = BA_NAVY_LIGHT
    BG_MED = BA_NAVY_MED
    DARK = DARK_TEXT
    GREY = GREY_TEXT
    BORDER = colors.HexColor("#E0E0E0")

    # =====================================================
    # HEADER: Logo centered
    # =====================================================
    if os.path.exists(LOGO_PATH):
        logo_img = Image(LOGO_PATH, width=100*mm, height=50*mm)
        logo_tbl = Table([[logo_img]], colWidths=[W])
        logo_tbl.setStyle(TableStyle([('ALIGN', (0, 0), (-1, -1), 'CENTER')]))
        elements.append(logo_tbl)
    elements.append(Spacer(1, 2.5*mm))
    elements.append(Paragraph("Commission Invoice", ParagraphStyle('InvTitle', fontName=FB, fontSize=15, textColor=GREEN, alignment=TA_CENTER, leading=15, spaceAfter=-2*mm)))

    # =====================================================
    # TRADE DETAILS: Compact 2-column key-value grid
    # =====================================================
    contract_num = trade.get("sellerContractNumber") or trade.get("pirContractNumber") or trade.get("referenceNumber") or "-"
    vessel_name = trade.get("vesselName") or "-"
    bl_qty = trade.get("blQuantity") or trade.get("quantity") or 0
    loading_port = trade.get("loadingPortName") or trade.get("basePortName") or "-"
    loading_country = trade.get("loadingPortCountry") or ""
    loading_full = f"{loading_port}, {loading_country}" if loading_country else loading_port
    discharge_port = trade.get("dischargePortName") or "-"
    discharge_country = trade.get("dischargePortCountry") or ""
    discharge_full = f"{discharge_port}, {discharge_country}" if discharge_country else discharge_port
    commodity_name = trade.get("commodityName") or "-"
    crop_year = trade.get("cropYear") or ""
    prod_keywords = ["pellet", "husk", "bran", "meal", "pulp"]
    year_prefix = "Prod." if any(kw in commodity_name.lower() for kw in prod_keywords) else "Crop"
    commodity_display = f"{commodity_name}, {year_prefix} {crop_year}" if crop_year else commodity_name
    brokerage_per_mt = trade.get("brokeragePerMT") or 0
    brokerage_currency = trade.get("brokerageCurrency") or "USD"
    currency = brokerage_currency
    total_amount = round(bl_qty * brokerage_per_mt, 2)
    seller_name = trade.get("sellerName") or "-"
    buyer_name = trade.get("buyerName") or "-"
    origin = trade.get("originName") or "-"
    delivery_term = trade.get("deliveryTerm") or "-"
    delivery_term_full = f"{delivery_term} {discharge_full}" if delivery_term != "-" else "-"
    shipment_from = trade.get("shipmentWindowStart") or trade.get("shipmentFrom") or ""
    shipment_to = trade.get("shipmentWindowEnd") or trade.get("shipmentTo") or ""
    shipment_period = f"{shipment_from} - {shipment_to}" if shipment_from and shipment_to else "-"

    s_lbl = ParagraphStyle('DLbl', fontName=FB, fontSize=7, textColor=GREY, leading=9)
    s_dval = ParagraphStyle('DVal', fontName=F, fontSize=8, textColor=DARK, leading=11)

    # Format To address with line breaks
    to_lines = f"<b>{issued_to_name}</b>" if issued_to_name else "-"
    if issued_to_address:
        # Split address into lines for cleaner display
        addr = issued_to_address
        to_lines += f"<br/>{addr}"

    # "To:" row spans left half, right half empty
    to_row = [[
        Paragraph("To", s_lbl), Paragraph(to_lines, s_dval),
    ]]

    bl_date = trade.get("blDate") or "-"
    contract_date = trade.get("contractDate") or "-"

    def fmt_date(d):
        """Convert date to DD-MM-YYYY format."""
        if not d or d == "-":
            return "-"
        d = d.replace(".", "-").replace("/", "-")
        parts = d.split("-")
        if len(parts) == 3 and len(parts[0]) == 4:
            return f"{parts[2]}-{parts[1]}-{parts[0]}"
        return d

    bl_date = fmt_date(bl_date)
    contract_date = fmt_date(contract_date)
    invoice_date = fmt_date(invoice_date)

    detail_pairs = [
        ("Invoice No", invoice_number, "Invoice Date", invoice_date),
        ("Contract No", contract_num, "Contract Date", contract_date),
        ("Commodity", commodity_display, "Origin", origin),
        ("Seller", seller_name, "Buyer", buyer_name),
        ("Delivery Term", delivery_term_full, "Vessel", vessel_name),
        ("Bill of Lading (B/L) No", trade.get("blNumber") or "-", "Bill of Lading (B/L) Date", bl_date),
        ("Load Port", loading_full, "Discharge Port", discharge_full),
    ]

    # Build "To" table (left half width with box frame)
    lbl_w = 22*mm
    val_w = (W - 2*lbl_w) / 2
    to_tbl = Table(to_row, colWidths=[lbl_w, val_w])
    to_tbl.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ('LEFTPADDING', (0, 0), (-1, -1), 4),
        ('RIGHTPADDING', (0, 0), (-1, -1), 4),
        ('BOX', (0, 0), (-1, -1), 0.4, BORDER),
        ('LINEAFTER', (0, 0), (0, -1), 0.4, BORDER),
    ]))
    # Wrap: To table on left, empty on right
    to_wrapper = Table([[to_tbl, ""]], colWidths=[lbl_w + val_w, lbl_w + val_w])
    to_wrapper.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('TOPPADDING', (0, 0), (-1, -1), 0),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
    ]))
    # Gray line above "To" box
    to_sep = Table([[""]], colWidths=[W])
    to_sep.setStyle(TableStyle([
        ('LINEBELOW', (0, 0), (-1, 0), 0.5, BORDER),
        ('TOPPADDING', (0, 0), (-1, -1), 0),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
    ]))
    elements.append(to_sep)
    elements.append(Spacer(1, 3*mm))
    elements.append(to_wrapper)
    elements.append(Spacer(1, 4*mm))

    # Build detail rows (4 columns)
    detail_rows = []
    for lbl1, val1, lbl2, val2 in detail_pairs:
        detail_rows.append([
            Paragraph(lbl1, s_lbl), Paragraph(str(val1), s_dval),
            Paragraph(lbl2, s_lbl), Paragraph(str(val2), s_dval),
        ])

    d_tbl = Table(detail_rows, colWidths=[lbl_w, val_w, lbl_w, val_w])
    d_tbl.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 2.5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2.5),
        ('LEFTPADDING', (0, 0), (-1, -1), 4),
        ('RIGHTPADDING', (0, 0), (-1, -1), 4),
        ('BOX', (0, 0), (-1, -1), 0.4, BORDER),
        ('INNERGRID', (0, 0), (-1, -1), 0.4, BORDER),
    ]))
    elements.append(d_tbl)
    elements.append(Spacer(1, 3*mm))

    # =====================================================
    # COMMISSION TABLE: Green header, clean rows
    # =====================================================
    curr_symbol = "$" if currency == "USD" else currency + " "

    s_th = ParagraphStyle('TH', fontName=FB, fontSize=7.5, textColor=colors.white, alignment=TA_CENTER, leading=10)
    s_th_l = ParagraphStyle('THL', fontName=FB, fontSize=7.5, textColor=colors.white, alignment=TA_LEFT, leading=10)
    s_td_l = ParagraphStyle('TDL', fontName=F, fontSize=8, textColor=DARK, leading=11)
    s_td_c = ParagraphStyle('TDC', fontName=F, fontSize=8, textColor=DARK, alignment=TA_CENTER, leading=11)
    s_td_cb = ParagraphStyle('TDCB', fontName=FB, fontSize=8.5, textColor=DARK, alignment=TA_CENTER, leading=11)

    calc_header = [
        Paragraph("DESCRIPTION", s_th),
        Paragraph("B/L QTY (Mts)", s_th),
        Paragraph(f"RATE ({currency}/MT)", s_th),
        Paragraph(f"AMOUNT ({currency})", s_th),
    ]
    desc_text = f"Brokerage Commission for <b>{vessel_name}</b>"
    s_td_c_desc = ParagraphStyle('TDCDesc', fontName=F, fontSize=8, textColor=DARK, alignment=TA_CENTER, leading=11)
    calc_row = [
        Paragraph(desc_text, s_td_c_desc),
        Paragraph(f"{bl_qty:,.3f}" if bl_qty else "-", s_td_c),
        Paragraph(f"{brokerage_per_mt:,.2f}", s_td_c),
        Paragraph(f"{curr_symbol}{total_amount:,.2f}", s_td_cb),
    ]

    calc_cw = [W*0.42, W*0.18, W*0.18, W*0.22]
    calc_tbl = Table([calc_header, calc_row], colWidths=calc_cw)
    calc_tbl.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), GREEN),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, 0), 5),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 5),
        ('TOPPADDING', (0, 1), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 1), (-1, -1), 5),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
        ('GRID', (0, 1), (-1, -1), 0.5, BORDER),
        ('LINEBELOW', (0, 0), (-1, 0), 1, GREEN),
    ]))
    elements.append(calc_tbl)
    # Gray line below commission table
    calc_sep = Table([[""]], colWidths=[W])
    calc_sep.setStyle(TableStyle([
        ('LINEBELOW', (0, 0), (-1, 0), 0.5, BORDER),
        ('TOPPADDING', (0, 0), (-1, -1), 0),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
    ]))
    elements.append(Spacer(1, 2*mm))
    elements.append(calc_sep)
    elements.append(Spacer(1, 2*mm))

    # =====================================================
    # TOTAL AMOUNT: Highlighted green box, right-aligned
    # =====================================================
    s_total_lbl = ParagraphStyle('TotLbl', fontName=FB, fontSize=9, textColor=DARK, alignment=TA_RIGHT, leading=12)
    s_total_val = ParagraphStyle('TotVal', fontName=FB, fontSize=12, textColor=GREEN, alignment=TA_CENTER, leading=16)

    total_row = Table(
        [[Paragraph("TOTAL AMOUNT:", s_total_lbl), Paragraph(f"{curr_symbol}{total_amount:,.2f}", s_total_val)]],
        colWidths=[W*0.60, W*0.40]
    )
    total_row.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('BACKGROUND', (1, 0), (1, 0), BG_LIGHT),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ('ALIGN', (1, 0), (1, 0), 'CENTER'),
        ('ROUNDEDCORNERS', [0, 4, 4, 0]),
        ('BOX', (1, 0), (1, 0), 0.5, BG_MED),
    ]))
    elements.append(total_row)
    elements.append(Spacer(1, 1*mm))

    # Amount in words - right-aligned to edge of green box
    words = amount_in_words(total_amount, currency)
    words_tbl = Table(
        [["", Paragraph(f"<i>{words}</i>", ParagraphStyle('AW', fontName=FI, fontSize=7, textColor=GREY, alignment=TA_RIGHT))]],
        colWidths=[W*0.20, W*0.80]
    )
    words_tbl.setStyle(TableStyle([
        ('TOPPADDING', (0, 0), (-1, -1), 0),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
    ]))
    elements.append(words_tbl)
    elements.append(Spacer(1, 4*mm))

    # =====================================================
    # BANK DETAILS: Card style
    # =====================================================
    bank_header_tbl = Table(
        [[Paragraph("BANK DETAILS", ParagraphStyle('BankSec', fontName=FB, fontSize=9, textColor=GREEN, alignment=TA_LEFT))]],
        colWidths=[W]
    )
    bank_header_tbl.setStyle(TableStyle([
        ('LINEABOVE', (0, 0), (-1, 0), 0.5, BORDER),
        ('TOPPADDING', (0, 0), (-1, -1), 3*mm),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2*mm),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
    ]))
    elements.append(bank_header_tbl)

    accounts_to_show = bank_accounts if bank_accounts else [BA_BANK]
    s_bk_lbl = ParagraphStyle('BkL', fontName=FB, fontSize=7, textColor=GREY, leading=9)
    s_bk_val = ParagraphStyle('BkV', fontName=F, fontSize=8, textColor=DARK, leading=11)
    s_bk_val_b = ParagraphStyle('BkVB', fontName=FB, fontSize=8, textColor=DARK, leading=11)

    for idx, acct in enumerate(accounts_to_show):
        if idx > 0:
            elements.append(Spacer(1, 3*mm))
        beneficiary = acct.get("beneficiary", acct.get("accountName", ""))
        bank_name = acct.get("bank", acct.get("bankName", ""))
        address = acct.get("address", acct.get("bankAddress", ""))
        iban = acct.get("iban", "")
        bic = acct.get("bic", acct.get("swift", ""))
        currency_label = acct.get("currency", "")

        bank_rows = []
        iban_label = f"{currency_label} IBAN" if currency_label else "IBAN"
        # Format IBAN with spaces every 4 characters
        iban_formatted = " ".join([iban[i:i+4] for i in range(0, len(iban), 4)]) if iban else ""
        bank_rows += [
            [Paragraph("Beneficiary", s_bk_lbl), Paragraph(beneficiary, s_bk_val_b)],
            [Paragraph("Bank", s_bk_lbl), Paragraph(bank_name, s_bk_val)],
            [Paragraph("Address", s_bk_lbl), Paragraph(address, s_bk_val)],
            [Paragraph(iban_label, s_bk_lbl), Paragraph(iban_formatted, s_bk_val)],
            [Paragraph("BIC/SWIFT", s_bk_lbl), Paragraph(bic, s_bk_val)],
        ]

        b_tbl = Table(bank_rows, colWidths=[22*mm, W - 22*mm])
        b_tbl.setStyle(TableStyle([
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('TOPPADDING', (0, 0), (-1, -1), 1.5),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 1.5),
            ('LEFTPADDING', (0, 0), (-1, -1), 5),
            ('RIGHTPADDING', (0, 0), (-1, -1), 5),
            ('BACKGROUND', (0, 0), (0, -1), BG_LIGHT),
            ('BACKGROUND', (1, 0), (1, -1), colors.HexColor("#FAFAFA")),
            ('LINEBELOW', (0, 0), (-1, -2), 0.3, BORDER),
            ('ROUNDEDCORNERS', [3, 3, 3, 3]),
            ('BOX', (0, 0), (-1, -1), 0.5, BORDER),
        ]))
        elements.append(b_tbl)

    elements.append(Spacer(1, 1*mm))

    # =====================================================
    # SIGNATURE with stamp image
    # =====================================================
    STAMP_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "pir-signature.jpg")
    sig_line = ParagraphStyle('SigLine', fontName=F, fontSize=8, alignment=TA_CENTER, textColor=GREY)
    sig_name = ParagraphStyle('SigName', fontName=FB, fontSize=7, alignment=TA_CENTER, textColor=DARK, leading=10)

    sig_rows = []
    if os.path.exists(STAMP_PATH):
        sig_rows.append(["", Image(STAMP_PATH, width=40*mm, height=25*mm)])
    sig_rows.append(["", Paragraph("_______________________________", sig_line)])
    sig_rows.append(["", Paragraph("<b>Authorized Signature</b><br/>IZZET ALEV<br/>DealSpot Ltd", sig_name)])

    sig_tbl = Table(sig_rows, colWidths=[W*0.55, W*0.45], rowHeights=None)
    style_cmds = [
        ('VALIGN', (0, 0), (-1, -1), 'BOTTOM'),
        ('ALIGN', (1, 0), (1, -1), 'CENTER'),
        ('TOPPADDING', (0, 0), (-1, -1), 0),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
    ]
    if os.path.exists(STAMP_PATH):
        style_cmds.append(('BOTTOMPADDING', (1, 0), (1, 0), -4))
    sig_tbl.setStyle(TableStyle(style_cmds))
    elements.append(sig_tbl)
    elements.append(Spacer(1, 1*mm))

    # =====================================================
    # FOOTER
    # =====================================================
    elements.append(HRFlowable(width="100%", thickness=1, color=GREEN, spaceAfter=2*mm))
    elements.append(Paragraph(
        "Please mention the invoice number in the payment details. Thank you for your business!",
        ParagraphStyle('Foot', fontName=F, fontSize=7, textColor=GREY, alignment=TA_CENTER)
    ))

    doc.build(elements)
    buffer.seek(0)
    return buffer


def generate_ci_pdf(trade):
    """Generate Commission Invoice PDF and return BytesIO buffer."""
    trade_id = str(trade["_id"])
    contract_num = trade.get("sellerContractNumber") or trade.get("pirContractNumber") or trade.get("referenceNumber") or trade_id
    brokerage_account = trade.get("brokerageAccount") or "seller"

    if brokerage_account == "buyer":
        partner_id = trade.get("buyerId")
    else:
        partner_id = trade.get("sellerId")

    issued_to_name = ""
    issued_to_address = ""
    issued_to_tax_id = ""

    if partner_id:
        try:
            partner = partners_col.find_one({"_id": ObjectId(partner_id)})
            if partner:
                issued_to_name = partner.get("companyName", "")
                addr_parts = [partner.get("address", ""), partner.get("city", ""), partner.get("country", "")]
                issued_to_address = ", ".join([p for p in addr_parts if p])
                issued_to_tax_id = partner.get("taxId", partner.get("taxNumber", ""))
        except Exception:
            pass

    if not issued_to_name:
        issued_to_name = trade.get("buyerName" if brokerage_account == "buyer" else "sellerName", "-")

    invoice_number = f"COMM-{contract_num}"
    buyer_payment_date = trade.get("buyerPaymentDate")
    if buyer_payment_date:
        invoice_date = buyer_payment_date.replace("/", ".")
    else:
        invoice_date = datetime.utcnow().strftime("%d.%m.%Y")

    return generate_invoice_pdf(
        trade=trade,
        invoice_number=invoice_number,
        invoice_date=invoice_date,
        issued_to_name=issued_to_name,
        issued_to_address=issued_to_address,
        issued_to_tax_id=issued_to_tax_id,
    )


@router.get("/{trade_id}")
def get_commission_invoice_pdf(trade_id: str, account: str = "seller", bankIds: str = "", user=Depends(get_current_user)):
    trade = trades_col.find_one({"_id": ObjectId(trade_id)})
    if not trade:
        raise HTTPException(status_code=404, detail="Trade not found")

    contract_num = trade.get("sellerContractNumber") or trade.get("pirContractNumber") or trade.get("referenceNumber") or trade_id
    brokerage_account = account or trade.get("brokerageAccount") or "seller"

    if brokerage_account == "buyer":
        partner_id = trade.get("buyerId")
    else:
        partner_id = trade.get("sellerId")

    issued_to_name = ""
    issued_to_address = ""
    issued_to_tax_id = ""

    if partner_id:
        try:
            partner = partners_col.find_one({"_id": ObjectId(partner_id)})
            if partner:
                issued_to_name = partner.get("companyName", "")
                addr_parts = [partner.get("address", ""), partner.get("city", ""), partner.get("country", "")]
                issued_to_address = ", ".join([p for p in addr_parts if p])
                issued_to_tax_id = partner.get("taxId", partner.get("taxNumber", ""))
        except Exception:
            pass

    if not issued_to_name:
        issued_to_name = trade.get("buyerName" if brokerage_account == "buyer" else "sellerName", "-")

    # Fetch selected bank accounts
    selected_banks = []
    if bankIds:
        for bid in bankIds.split(","):
            bid = bid.strip()
            if bid:
                try:
                    bank = bank_accounts_col.find_one({"_id": ObjectId(bid)})
                    if bank:
                        bank.pop("_id", None)
                        selected_banks.append(bank)
                except Exception:
                    pass

    invoice_number = f"COMM-{contract_num}"
    # Use buyer payment date if available, otherwise current date
    buyer_payment_date = trade.get("buyerPaymentDate")
    if buyer_payment_date:
        # Convert dd/MM/yyyy to dd.MM.yyyy
        invoice_date = buyer_payment_date.replace("/", ".")
    else:
        invoice_date = datetime.utcnow().strftime("%d.%m.%Y")

    pdf_buffer = generate_invoice_pdf(
        trade=trade,
        invoice_number=invoice_number,
        invoice_date=invoice_date,
        issued_to_name=issued_to_name,
        issued_to_address=issued_to_address,
        issued_to_tax_id=issued_to_tax_id,
        bank_accounts=selected_banks if selected_banks else None,
    )

    filename = f"Commission_Invoice_{contract_num}.pdf"
    return StreamingResponse(
        pdf_buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


class SendCommissionInvoiceRequest(BaseModel):
    tradeId: str
    toEmail: str = ""
    ccEmails: list = []


@router.post("/send-email")
async def send_commission_invoice_email(req: SendCommissionInvoiceRequest, user=Depends(get_current_user)):
    resend.api_key = os.environ.get("RESEND_API_KEY", "")
    SENDER_EMAIL = os.environ.get("SENDER_EMAIL", "DealSpot Ltd <noreply@baticaret.com>")

    trade = trades_col.find_one({"_id": ObjectId(req.tradeId)})
    if not trade:
        raise HTTPException(status_code=404, detail="Trade not found")

    # Generate PDF
    pdf_buffer = generate_ci_pdf(trade)
    pdf_bytes = pdf_buffer.read()

    contract_num = trade.get("sellerContractNumber") or trade.get("pirContractNumber") or trade.get("referenceNumber") or req.tradeId
    brokerage_account = trade.get("brokerageAccount") or "seller"

    # Get recipient name
    recipient_name = ""
    partner_id = trade.get("buyerId") if brokerage_account == "buyer" else trade.get("sellerId")
    if partner_id:
        try:
            partner = partners_col.find_one({"_id": ObjectId(partner_id)})
            if partner:
                recipient_name = partner.get("companyName", "")
        except Exception:
            pass
    if not recipient_name:
        recipient_name = trade.get("buyerName" if brokerage_account == "buyer" else "sellerName", "")

    # Use email from dialog or fail
    to_email = req.toEmail
    if not to_email:
        raise HTTPException(status_code=400, detail=f"No email provided for {recipient_name or 'recipient'}")

    vessel_name = trade.get("vesselName") or "-"
    bl_qty = trade.get("blQuantity") or trade.get("quantity") or 0
    commodity_display = trade.get("commodityDisplayName") or trade.get("commodityName") or ""
    qty_str = f"{bl_qty:,.3f}" if bl_qty else ""
    subject = f"Commission Invoice - {contract_num} - {qty_str} Mts {commodity_display} - {vessel_name}"

    # Load logo as CID inline attachment (base64 data URI blocked by most email clients)
    logo_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "dealspot-logo.png")
    attachments = []
    logo_html = ""
    if os.path.exists(logo_path):
        with open(logo_path, "rb") as f:
            logo_b64 = base64.b64encode(f.read()).decode()
        attachments.append({"filename": "logo.png", "content": logo_b64, "content_type": "image/png", "content_id": "pirlogo"})
        logo_html = '<img src="cid:pirlogo" style="max-width:300px;height:auto;display:block;margin:0 auto;" />'

    html_body = f"""
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="text-align: center; margin: 0; padding: 0; line-height: 0;">{logo_html}</div>
        <p style="margin-top: 2px;">Dear {recipient_name},</p>
        <p>Please find attached the Commission Invoice for contract <b>{contract_num}</b>, vessel <b>{vessel_name}</b>.</p>
        <p>We also take this opportunity to thank you for your continued business and cooperation.</p>
        <p style="margin-top:8px;">Best Regards,</p>
        <p><b>DealSpot Ltd</b></p>
    </div>
    """

    # Add PDF attachment
    attachments.append({
        "filename": f"Commission_Invoice_{contract_num}.pdf",
        "content": base64.b64encode(pdf_bytes).decode(),
        "content_type": "application/pdf",
    })

    params = {
        "from": SENDER_EMAIL,
        "to": [to_email],
        "subject": subject,
        "html": html_body,
        "attachments": attachments,
    }
    if req.ccEmails:
        params["cc"] = req.ccEmails

    try:
        await asyncio.to_thread(resend.Emails.send, params)
        return {"message": f"Commission invoice sent to {recipient_name}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to send email: {str(e)}")
