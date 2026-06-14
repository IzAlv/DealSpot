import os
import uuid
import asyncio
from typing import Optional

from fastapi import APIRouter, Depends, UploadFile, File, Form
from dotenv import load_dotenv

from database import q_all, q_one, insert_document, update_document, delete_document, serialize_doc_row
from auth import require_roles
from config import UPLOAD_DIR

load_dotenv()

non_accountant = require_roles("admin", "user")

router = APIRouter(prefix="/api/business-cards", tags=["business-cards"])


async def extract_card_info(file_path: str) -> dict:
    """Use Gemini vision to extract business card info from image."""
    import json
    from google import genai

    api_key = os.environ.get("GOOGLE_API_KEY", "")
    if not api_key:
        return {}

    client = genai.Client(api_key=api_key)
    with open(file_path, "rb") as f:
        image_bytes = f.read()
    import mimetypes
    mime_type = mimetypes.guess_type(file_path)[0] or "image/jpeg"

    prompt = (
        "You are a business card OCR assistant. Extract all information from this business card image "
        "and return ONLY a JSON object with these fields: name, title, company, email, phone, mobile, website, address, city, country. "
        "IMPORTANT RULES: "
        "1) For city names, always use proper Title Case with correct Turkish characters (e.g. 'Gaziantep' not 'GAZİANTEP', 'İstanbul' not 'ISTANBUL'). "
        "2) For country, ALWAYS infer from address/city/phone prefix/language. Use the local language name first: 'Türkiye' for Turkey, 'Deutschland' for Germany, etc. "
        "3) Use Turkish special characters where appropriate (ç, ş, ğ, ı, ö, ü, İ). "
        "4) If a field is not found, use an empty string. "
        "Return ONLY valid JSON, no markdown."
    )

    response = await asyncio.to_thread(
        client.models.generate_content,
        model="gemini-2.5-flash",
        contents=[genai.types.Part.from_bytes(data=image_bytes, mime_type=mime_type), prompt],
    )
    text = response.text.strip()
    try:
        if text.startswith("```"):
            text = text.split("\n", 1)[1] if "\n" in text else text[3:]
            text = text.rsplit("```", 1)[0].strip()
        if text.startswith("json"):
            text = text[4:].strip()
        return json.loads(text)
    except Exception:
        return {"rawText": text}


@router.get("")
def list_business_cards(user=Depends(non_accountant)):
    return [serialize_doc_row(c) for c in q_all("SELECT * FROM business_cards ORDER BY created_at DESC")]


@router.post("")
async def create_business_card(
    file: Optional[UploadFile] = File(None),
    name: str = Form(""), title: str = Form(""), company: str = Form(""), email: str = Form(""),
    phone: str = Form(""), mobile: str = Form(""), website: str = Form(""), address: str = Form(""),
    city: str = Form(""), country: str = Form(""), keywords: str = Form(""), notes: str = Form(""),
    user=Depends(non_accountant),
):
    card = {
        "name": name, "title": title, "company": company, "email": email, "phone": phone, "mobile": mobile,
        "website": website, "address": address, "city": city, "country": country,
        "keywords": [k.strip() for k in keywords.split(",") if k.strip()],
        "notes": notes, "imageUrl": "", "uploadedBy": user.get("username", ""),
    }
    if file:
        file_id = str(uuid.uuid4())
        ext = os.path.splitext(file.filename)[1] if file.filename else ".jpg"
        saved_name = f"card_{file_id}{ext}"
        file_path = os.path.join(UPLOAD_DIR, saved_name)
        with open(file_path, "wb") as f:
            f.write(await file.read())
        card["imageUrl"] = f"/api/uploads/{saved_name}"
        try:
            extracted = await extract_card_info(file_path)
            if extracted:
                for field in ["name", "title", "company", "email", "phone", "mobile", "website", "address", "city", "country"]:
                    if not card.get(field) and extracted.get(field):
                        card[field] = extracted[field]
        except Exception as e:
            print(f"OCR extraction error: {e}")
    return serialize_doc_row(insert_document("business_cards", card))


@router.put("/{card_id}")
def update_business_card(card_id: str, data: dict, user=Depends(non_accountant)):
    if isinstance(data.get("keywords"), str):
        data["keywords"] = [k.strip() for k in data["keywords"].split(",") if k.strip()]
    return serialize_doc_row(update_document("business_cards", card_id, set_fields=data))


@router.post("/{card_id}/rescan")
async def rescan_business_card(card_id: str, user=Depends(non_accountant)):
    row = q_one("SELECT data FROM business_cards WHERE id = %s", (card_id,))
    if not row:
        return {"error": "Card not found"}
    image_url = (row.get("data") or {}).get("imageUrl", "")
    if not image_url:
        return {"error": "No image for this card"}
    file_path = os.path.join(UPLOAD_DIR, image_url.replace("/api/uploads/", ""))
    if not os.path.exists(file_path):
        return {"error": "Image file not found"}
    try:
        return await extract_card_info(file_path) or {}
    except Exception as e:
        return {"error": str(e)}


@router.delete("/{card_id}")
def delete_business_card(card_id: str, user=Depends(non_accountant)):
    row = q_one("SELECT data FROM business_cards WHERE id = %s", (card_id,))
    image_url = (row.get("data") or {}).get("imageUrl", "") if row else ""
    if image_url:
        path = os.path.join(UPLOAD_DIR, image_url.replace("/api/uploads/", ""))
        if os.path.exists(path):
            os.remove(path)
    delete_document("business_cards", card_id)
    return {"message": "Business card deleted"}
