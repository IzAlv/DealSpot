import os
import uuid
import base64
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, UploadFile, File, Form
from bson import ObjectId
from dotenv import load_dotenv

from database import business_cards_col, serialize_doc
from auth import require_roles
from config import UPLOAD_DIR

load_dotenv()

non_accountant = require_roles("admin", "user")

router = APIRouter(prefix="/api/business-cards", tags=["business-cards"])


async def extract_card_info(file_path: str) -> dict:
    """Use GPT-4o vision to extract business card info from image."""
    from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent
    import base64

    api_key = os.environ.get("EMERGENT_LLM_KEY", "")
    if not api_key:
        return {}

    with open(file_path, "rb") as f:
        img_b64 = base64.b64encode(f.read()).decode("utf-8")

    chat = LlmChat(
        api_key=api_key,
        session_id=f"card-ocr-{uuid.uuid4()}",
        system_message=(
            "You are a business card OCR assistant. Extract all information from the business card image "
            "and return ONLY a JSON object with these fields: name, title, company, email, phone, mobile, website, address, city, country. "
            "IMPORTANT RULES: "
            "1) For city names, always use proper Title Case with correct Turkish characters (e.g. 'Gaziantep' not 'GAZİANTEP', 'İstanbul' not 'ISTANBUL'). "
            "2) For country, ALWAYS infer from address/city/phone prefix/language. Use the local language name first: 'Türkiye' for Turkey, 'Deutschland' for Germany, etc. "
            "3) Use Turkish special characters where appropriate (ç, ş, ğ, ı, ö, ü, İ). "
            "4) If a field is not found, use an empty string. "
            "Return ONLY valid JSON, no markdown."
        )
    ).with_model("openai", "gpt-4o")

    image_content = ImageContent(image_base64=img_b64)
    user_msg = UserMessage(
        text="Extract all contact information from this business card image. Return only a JSON object.",
        file_contents=[image_content]
    )

    response = await chat.send_message(user_msg)

    import json
    try:
        clean = response.strip()
        if clean.startswith("```"):
            clean = clean.split("\n", 1)[1] if "\n" in clean else clean[3:]
            clean = clean.rsplit("```", 1)[0]
        return json.loads(clean)
    except Exception:
        return {"rawText": response}


@router.get("")
def list_business_cards(user=Depends(non_accountant)):
    return [serialize_doc(c) for c in business_cards_col.find().sort("createdAt", -1)]


@router.post("")
async def create_business_card(
    file: Optional[UploadFile] = File(None),
    name: str = Form(""),
    title: str = Form(""),
    company: str = Form(""),
    email: str = Form(""),
    phone: str = Form(""),
    mobile: str = Form(""),
    website: str = Form(""),
    address: str = Form(""),
    city: str = Form(""),
    country: str = Form(""),
    keywords: str = Form(""),
    notes: str = Form(""),
    user=Depends(non_accountant)
):
    card = {
        "name": name, "title": title, "company": company, "email": email,
        "phone": phone, "mobile": mobile, "website": website,
        "address": address, "city": city, "country": country,
        "keywords": [k.strip() for k in keywords.split(",") if k.strip()],
        "notes": notes, "imageUrl": "",
        "uploadedBy": user.get("username", ""),
        "createdAt": datetime.utcnow(),
    }

    if file:
        file_id = str(uuid.uuid4())
        ext = os.path.splitext(file.filename)[1] if file.filename else ".jpg"
        saved_name = f"card_{file_id}{ext}"
        file_path = os.path.join(UPLOAD_DIR, saved_name)
        content = await file.read()
        with open(file_path, "wb") as f:
            f.write(content)
        card["imageUrl"] = f"/api/uploads/{saved_name}"

        # OCR extraction
        try:
            extracted = await extract_card_info(file_path)
            if extracted:
                for field in ["name", "title", "company", "email", "phone", "mobile", "website", "address", "city", "country"]:
                    if not card.get(field) and extracted.get(field):
                        card[field] = extracted[field]
        except Exception as e:
            print(f"OCR extraction error: {e}")

    result = business_cards_col.insert_one(card)
    card["_id"] = result.inserted_id
    return serialize_doc(card)


@router.put("/{card_id}")
def update_business_card(card_id: str, data: dict, user=Depends(non_accountant)):
    data.pop("id", None)
    data.pop("_id", None)
    if isinstance(data.get("keywords"), str):
        data["keywords"] = [k.strip() for k in data["keywords"].split(",") if k.strip()]
    data["updatedAt"] = datetime.utcnow()
    business_cards_col.update_one({"_id": ObjectId(card_id)}, {"$set": data})
    return serialize_doc(business_cards_col.find_one({"_id": ObjectId(card_id)}))


@router.post("/{card_id}/rescan")
async def rescan_business_card(card_id: str, user=Depends(non_accountant)):
    """Re-extract data from existing business card image using AI."""
    card = business_cards_col.find_one({"_id": ObjectId(card_id)})
    if not card:
        return {"error": "Card not found"}
    image_url = card.get("imageUrl", "")
    if not image_url:
        return {"error": "No image for this card"}
    saved_name = image_url.replace("/api/uploads/", "")
    file_path = os.path.join(UPLOAD_DIR, saved_name)
    if not os.path.exists(file_path):
        return {"error": "Image file not found"}
    try:
        extracted = await extract_card_info(file_path)
        return extracted or {}
    except Exception as e:
        return {"error": str(e)}


@router.delete("/{card_id}")
def delete_business_card(card_id: str, user=Depends(non_accountant)):
    card = business_cards_col.find_one({"_id": ObjectId(card_id)})
    if card and card.get("imageUrl"):
        saved = card["imageUrl"].replace("/api/uploads/", "")
        path = os.path.join(UPLOAD_DIR, saved)
        if os.path.exists(path):
            os.remove(path)
    business_cards_col.delete_one({"_id": ObjectId(card_id)})
    return {"message": "Business card deleted"}
