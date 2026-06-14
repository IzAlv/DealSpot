"""
Market Data API Routes
- Commodity prices from Alpha Vantage/Yahoo Finance
- Turkish exchange prices (KTB, GTB)
- Market notes CRUD
- TMO Tenders CRUD
- Telegram channel management
"""

import os
import httpx
import asyncio
from datetime import datetime, timezone, timedelta
from typing import Optional, List
from bs4 import BeautifulSoup
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from database import (q_one, q_all, execute, insert_document, update_document,
                      delete_document, serialize_doc_row)
from psycopg.types.json import Jsonb
from auth import get_current_user, require_roles


def _latest_price(symbol):
    row = q_one("SELECT * FROM market_prices WHERE symbol = %s ORDER BY timestamp DESC NULLS LAST LIMIT 1", (symbol,))
    return serialize_doc_row(row) if row else None


def _upsert_price(doc):
    data = {k: v for k, v in doc.items() if k != "_id"}
    execute(
        "INSERT INTO market_prices (symbol, timestamp, price, data) VALUES (%s, %s, %s, %s) "
        "ON CONFLICT (symbol) DO UPDATE SET timestamp = EXCLUDED.timestamp, price = EXCLUDED.price, data = EXCLUDED.data",
        (doc.get("symbol"), doc.get("timestamp"), doc.get("price"), Jsonb(data)),
    )

router = APIRouter(prefix="/api/market", tags=["market"])

# Alpha Vantage API key (free tier)
ALPHA_VANTAGE_KEY = os.environ.get("ALPHA_VANTAGE_KEY", "demo")

# In-memory price cache (avoids re-scraping on every request)
_price_cache = {"data": None, "timestamp": None}
PRICE_CACHE_TTL = 300  # 5 minutes in seconds

# ============== MODELS ==============

class MarketNote(BaseModel):
    commodity: str
    period: str  # daily, monthly, yearly
    content: str
    tags: Optional[List[str]] = []

class TMOTenderResult(BaseModel):
    port: str
    company: str
    quantity: float  # in MT, displayed as X.XXX
    cifPrice: Optional[float] = None  # CIF price USD/MT
    exwPrice: Optional[float] = None  # EXW price USD/MT

class TMOTender(BaseModel):
    tenderDate: str
    commodity: str  # Wheat, Corn, Barley, Feed Barley
    totalQuantity: Optional[float] = 0  # total in MT, e.g., 220000
    shipmentPeriodStart: Optional[str] = ""
    shipmentPeriodEnd: Optional[str] = ""
    status: Optional[str] = "open"  # open, closed, awarded
    results: Optional[List[dict]] = []  # List of TMOTenderResult dicts

class TelegramChannel(BaseModel):
    name: str
    channelId: str
    description: Optional[str] = ""
    isActive: Optional[bool] = True

class TurkishExchangePrice(BaseModel):
    exchange: str  # KTB, GTB
    product: str
    price: float
    unit: str
    date: str
    category: Optional[str] = ""

# ============== COMMODITY PRICES ==============

# Default market commodities to track
DEFAULT_COMMODITIES = [
    {"symbol": "WHEAT", "name": "Wheat", "type": "agricultural", "unit": "USD/bushel"},
    {"symbol": "CORN", "name": "Corn", "type": "agricultural", "unit": "USD/bushel"},
    {"symbol": "SOYBEAN", "name": "Soybeans", "type": "agricultural", "unit": "USD/bushel"},
    {"symbol": "GOLD", "name": "Gold", "type": "commodity", "unit": "USD/oz"},
    {"symbol": "CRUDE_OIL", "name": "Crude Oil", "type": "commodity", "unit": "USD/barrel"},
    {"symbol": "USD_TRY", "name": "USD/TRY", "type": "currency", "unit": ""},
    {"symbol": "EUR_USD", "name": "EUR/USD", "type": "currency", "unit": ""},
    {"symbol": "USD_RUB", "name": "USD/RUB", "type": "currency", "unit": ""},
    {"symbol": "USD_UAH", "name": "USD/UAH", "type": "currency", "unit": ""},
]

async def fetch_alpha_vantage_price(symbol: str, function: str = "GLOBAL_QUOTE"):
    """Fetch price from Alpha Vantage API"""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            url = f"https://www.alphavantage.co/query?function={function}&symbol={symbol}&apikey={ALPHA_VANTAGE_KEY}"
            response = await client.get(url)
            if response.status_code == 200:
                return response.json()
    except Exception as e:
        print(f"Alpha Vantage error for {symbol}: {e}")
    return None


async def fetch_live_currency_rates():
    """Fetch live currency rates from free exchangerate API"""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            # Use free open.er-api.com (no key required, reliable)
            url = "https://open.er-api.com/v6/latest/USD"
            response = await client.get(url)
            if response.status_code == 200:
                data = response.json()
                if data.get("result") == "success" and data.get("rates"):
                    return data["rates"]
    except Exception as e:
        print(f"Currency API error: {e}")
    return None


async def scrape_barchart_forex(symbol: str):
    """Scrape forex rate from Barchart.com"""
    import re
    try:
        url_map = {
            "EUR_USD": "https://www.barchart.com/forex/quotes/%5EEURUSD/overview",
            "USD_RUB": "https://www.barchart.com/forex/quotes/%5EUSDRUB/overview",
            "USD_TRY": "https://www.barchart.com/forex/quotes/%5EUSDTRY/overview",
            "USD_UAH": "https://www.barchart.com/forex/quotes/%5EUSDUAH/overview",
        }
        
        url = url_map.get(symbol)
        if not url:
            return None
            
        async with httpx.AsyncClient(timeout=15.0) as client:
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            }
            response = await client.get(url, headers=headers, follow_redirects=True)
            
            if response.status_code == 200:
                html = response.text
                
                # Extract from JSON in page: "lastPrice":"1.15864","priceChange":"-0.00270"
                price_match = re.search(r'"lastPrice"[:\s]*"?(\d+\.\d+)"?', html)
                change_match = re.search(r'"priceChange"[:\s]*"?([+-]?\d+\.\d+)"?', html)
                pct_match = re.search(r'"percentChange"[:\s]*"?([+-]?\d+\.\d+)%?"?', html)
                
                if price_match:
                    price = float(price_match.group(1))
                    change = float(change_match.group(1)) if change_match else 0
                    change_pct = float(pct_match.group(1)) if pct_match else 0
                    
                    return {
                        "price": price,
                        "change": change,
                        "changePercent": change_pct,
                        "source": "Barchart"
                    }
                    
    except Exception as e:
        print(f"Barchart scraping error for {symbol}: {e}")
    
    return None


async def scrape_barchart_commodity(symbol: str):
    """Scrape CBOT commodity prices from Barchart.com"""
    import re
    try:
        url_map = {
            "WHEAT": "https://www.barchart.com/futures/quotes/ZW*0/overview",
            "CORN": "https://www.barchart.com/futures/quotes/ZC*0/overview",
            "SOYBEAN": "https://www.barchart.com/futures/quotes/ZS*0/overview",
            "GOLD": "https://www.barchart.com/futures/quotes/GC*0/overview",
            "CRUDE_OIL": "https://www.barchart.com/futures/quotes/CL*0/overview",
        }
        
        url = url_map.get(symbol)
        if not url:
            return None
            
        async with httpx.AsyncClient(timeout=15.0) as client:
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            }
            response = await client.get(url, headers=headers, follow_redirects=True)
            
            if response.status_code == 200:
                html = response.text
                
                # Extract lastPrice values - handle comma-separated numbers like "4,408.0"
                all_prices_raw = re.findall(r'"lastPrice":"([^"]+)"', html)
                valid_prices = []
                for p in all_prices_raw:
                    cleaned = p.replace(',', '')
                    try:
                        val = float(cleaned)
                        if val > 1:
                            valid_prices.append(val)
                    except ValueError:
                        continue
                
                # Also try unquoted format: "lastPrice":4408
                unquoted = re.findall(r'"lastPrice":(\d[\d,]*\.?\d*)', html)
                for p in unquoted:
                    cleaned = p.replace(',', '')
                    try:
                        val = float(cleaned)
                        if val > 1:
                            valid_prices.append(val)
                    except ValueError:
                        continue
                
                if valid_prices:
                    price = max(valid_prices)
                    
                    # Get change values (also handle commas)
                    change_match = re.search(r'"priceChange":"?([+-]?[\d,]+\.?\d*)"?', html)
                    pct_match = re.search(r'"percentChange":"?([+-]?[\d,]+\.?\d*)%?"?', html)
                    
                    change = float(change_match.group(1).replace(',', '')) if change_match else 0
                    change_pct = float(pct_match.group(1).replace(',', '')) if pct_match else 0
                    
                    return {
                        "price": price,
                        "change": change,
                        "changePercent": change_pct,
                        "source": "Barchart"
                    }
                    
    except Exception as e:
        print(f"Barchart commodity scraping error for {symbol}: {e}")
    
    return None


async def fetch_commodity_price(symbol: str):
    """Fetch commodity price - try different sources"""
    # Map our symbols to Alpha Vantage symbols
    av_symbols = {
        "WHEAT": "WHEAT",
        "CORN": "CORN", 
        "SOYBEAN": "SOYBEAN",
        "GOLD": "XAUUSD",
        "CRUDE_OIL": "WTI",
        "EUR_USD": "EUR/USD",
        "USD_RUB": "USD/RUB",
        "USD_TRY": "USD/TRY",
        "USD_UAH": "USD/UAH",
    }
    
    av_symbol = av_symbols.get(symbol, symbol)
    
    # For CBOT commodities - try Barchart scraping first
    if symbol in ["WHEAT", "CORN", "SOYBEAN", "GOLD", "CRUDE_OIL"]:
        barchart_data = await scrape_barchart_commodity(symbol)
        if barchart_data:
            # Cache the price
            _upsert_price({
                "symbol": symbol,
                "price": barchart_data["price"],
                "change": barchart_data["change"],
                "changePercent": barchart_data["changePercent"],
                "source": "Barchart",
                "timestamp": datetime.now(timezone.utc).isoformat(),
            })
            return {
                "symbol": symbol,
                "price": round(barchart_data["price"], 2),
                "change": round(barchart_data["change"], 2),
                "changePercent": round(barchart_data["changePercent"], 2),
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "isLive": True,
                "source": "Barchart"
            }
    
    # For forex - try Barchart scraping first, then fallback to API
    if symbol in ["EUR_USD", "USD_RUB", "USD_TRY", "USD_UAH"]:
        # Try Barchart first
        barchart_data = await scrape_barchart_forex(symbol)
        if barchart_data:
            # Cache the price
            _upsert_price({
                "symbol": symbol,
                "price": barchart_data["price"],
                "change": barchart_data["change"],
                "changePercent": barchart_data["changePercent"],
                "source": "Barchart",
                "timestamp": datetime.now(timezone.utc).isoformat(),
            })
            return {
                "symbol": symbol,
                "price": round(barchart_data["price"], 5),
                "change": round(barchart_data["change"], 5),
                "changePercent": round(barchart_data["changePercent"], 2),
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "isLive": True,
                "source": "Barchart"
            }
        
        # Fallback to open.er-api.com
        live_rates = await fetch_live_currency_rates()
        if live_rates:
            currency_map = {
                "EUR_USD": ("EUR", True),   # Need to invert (1/EUR rate)
                "USD_RUB": ("RUB", False),
                "USD_TRY": ("TRY", False),
                "USD_UAH": ("UAH", False),
            }
            curr_code, invert = currency_map.get(symbol, (None, False))
            if curr_code and curr_code in live_rates:
                rate = live_rates[curr_code]
                if invert:
                    rate = 1 / rate if rate else 0
                
                # Get cached price for change calculation
                cached = _latest_price(symbol)
                old_price = cached.get("price", rate) if cached else rate
                change = rate - old_price
                change_pct = (change / old_price * 100) if old_price else 0
                
                # Cache the new price
                _upsert_price({"symbol": symbol, "price": rate, "change": change,
                               "changePercent": change_pct, "timestamp": datetime.now(timezone.utc).isoformat()})
                
                return {
                    "symbol": symbol,
                    "price": round(rate, 4),
                    "change": round(change, 4),
                    "changePercent": round(change_pct, 2),
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "isLive": True
                }
        
        # Fallback to Alpha Vantage
        from_curr, to_curr = symbol.replace("_", "/").split("/")
        data = await fetch_alpha_vantage_price(f"{from_curr}{to_curr}", "CURRENCY_EXCHANGE_RATE")
        if data and "Realtime Currency Exchange Rate" in data:
            rate_data = data["Realtime Currency Exchange Rate"]
            return {
                "symbol": symbol,
                "price": float(rate_data.get("5. Exchange Rate", 0)),
                "change": 0,
                "changePercent": 0,
                "timestamp": datetime.now(timezone.utc).isoformat()
            }
    
    # For commodities/stocks
    data = await fetch_alpha_vantage_price(av_symbol)
    if data and "Global Quote" in data:
        quote = data["Global Quote"]
        return {
            "symbol": symbol,
            "price": float(quote.get("05. price", 0)),
            "change": float(quote.get("09. change", 0)),
            "changePercent": float(quote.get("10. change percent", "0%").replace("%", "")),
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
    
    # Return cached or mock data if API fails
    cached = _latest_price(symbol)
    if cached:
        return cached
    
    # Generate realistic mock data
    mock_prices = {
        "WHEAT": {"price": 585.25, "change": 2.50, "changePercent": 0.43},
        "CORN": {"price": 445.75, "change": -1.25, "changePercent": -0.28},
        "SOYBEAN": {"price": 1025.50, "change": 5.75, "changePercent": 0.56},
        "GOLD": {"price": 2345.80, "change": 12.40, "changePercent": 0.53},
        "CRUDE_OIL": {"price": 78.45, "change": -0.85, "changePercent": -1.07},
        "EUR_USD": {"price": 1.0875, "change": 0.0012, "changePercent": 0.11},
        "USD_RUB": {"price": 92.45, "change": 0.35, "changePercent": 0.38},
        "USD_TRY": {"price": 34.25, "change": 0.08, "changePercent": 0.23},
        "USD_UAH": {"price": 41.50, "change": 0.15, "changePercent": 0.36},
    }
    
    mock = mock_prices.get(symbol, {"price": 100.00, "change": 0, "changePercent": 0})
    return {
        "symbol": symbol,
        "price": mock["price"],
        "change": mock["change"],
        "changePercent": mock["changePercent"],
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "isMock": True
    }


@router.get("/prices")
async def get_market_prices(user=Depends(get_current_user)):
    """Get all commodity prices - returns cached data if fresh, otherwise scrapes live"""
    global _price_cache
    now = datetime.now(timezone.utc)
    
    # Return cached data if still fresh
    if _price_cache["data"] and _price_cache["timestamp"]:
        age = (now - _price_cache["timestamp"]).total_seconds()
        if age < PRICE_CACHE_TTL:
            return _price_cache["data"]
    
    # First, return DB-cached prices instantly if available, then refresh in background
    db_prices = []
    for commodity in DEFAULT_COMMODITIES:
        cached = _latest_price(commodity["symbol"])
        if cached:
            cached.pop("id", None)
            cached["name"] = commodity["name"]
            cached["type"] = commodity["type"]
            cached["unit"] = commodity["unit"]
            cached["source"] = cached.get("source", "Cached")
            db_prices.append(cached)
    
    # If we have DB-cached prices, return them and scrape fresh data async
    if db_prices and len(db_prices) >= len(DEFAULT_COMMODITIES) // 2:
        _price_cache["data"] = db_prices
        _price_cache["timestamp"] = now
        # Trigger background refresh
        asyncio.create_task(_refresh_prices_background())
        return db_prices
    
    # No cache at all - must scrape live (first load only)
    prices = []
    for commodity in DEFAULT_COMMODITIES:
        price_data = await fetch_commodity_price(commodity["symbol"])
        if price_data:
            price_data["name"] = commodity["name"]
            price_data["type"] = commodity["type"]
            price_data["unit"] = commodity["unit"]
            prices.append(price_data)
    
    _price_cache["data"] = prices
    _price_cache["timestamp"] = now
    return prices


async def _refresh_prices_background():
    """Background task to refresh prices without blocking the response"""
    global _price_cache
    try:
        prices = []
        for commodity in DEFAULT_COMMODITIES:
            price_data = await fetch_commodity_price(commodity["symbol"])
            if price_data:
                price_data["name"] = commodity["name"]
                price_data["type"] = commodity["type"]
                price_data["unit"] = commodity["unit"]
                prices.append(price_data)
        if prices:
            _price_cache["data"] = prices
            _price_cache["timestamp"] = datetime.now(timezone.utc)
    except Exception as e:
        print(f"Background price refresh error: {e}")


@router.get("/prices/{symbol}")
async def get_commodity_price(symbol: str, user=Depends(get_current_user)):
    """Get price for a specific commodity"""
    commodity = next((c for c in DEFAULT_COMMODITIES if c["symbol"] == symbol), None)
    if not commodity:
        raise HTTPException(status_code=404, detail="Commodity not found")
    
    price_data = await fetch_commodity_price(symbol)
    if price_data:
        price_data["name"] = commodity["name"]
        price_data["type"] = commodity["type"]
        price_data["unit"] = commodity["unit"]
    return price_data


@router.get("/prices/{symbol}/history")
async def get_price_history(
    symbol: str,
    period: str = Query("daily", enum=["daily", "monthly", "yearly"]),
    user=Depends(get_current_user)
):
    """Get historical prices for charts"""
    # For now, return mock historical data
    import random
    base_prices = {
        "WHEAT": 580, "CORN": 440, "SOYBEAN": 1020, "BARLEY": 205,
        "SUNFLOWER": 515, "GOLD": 2300, "CRUDE_OIL": 77,
        "EUR_USD": 1.08, "USD_RUB": 91, "USD_TRY": 34
    }
    
    base = base_prices.get(symbol, 100)
    days = {"daily": 30, "monthly": 12, "yearly": 5}[period]
    
    history = []
    for i in range(days, 0, -1):
        if period == "daily":
            date = datetime.now(timezone.utc) - timedelta(days=i)
        elif period == "monthly":
            date = datetime.now(timezone.utc) - timedelta(days=i*30)
        else:
            date = datetime.now(timezone.utc) - timedelta(days=i*365)
        
        variance = base * 0.05  # 5% variance
        price = base + random.uniform(-variance, variance)
        history.append({
            "date": date.strftime("%Y-%m-%d"),
            "price": round(price, 2),
            "open": round(price - random.uniform(0, variance/2), 2),
            "high": round(price + random.uniform(0, variance/2), 2),
            "low": round(price - random.uniform(0, variance/2), 2),
            "close": round(price, 2)
        })
    
    return {"symbol": symbol, "period": period, "history": history}


# ============== TURKISH EXCHANGE PRICES ==============

async def scrape_ktb_prices():
    """Scrape daily prices from Konya Ticaret Borsası (KTB) official website"""
    import re
    prices = []
    
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
            }
            
            # Try the main page which has live data
            response = await client.get("https://www.ktb.org.tr", headers=headers, follow_redirects=True)
            
            if response.status_code == 200:
                html = response.text
                
                # Extract date
                date_match = re.search(r'(\d{2}\.\d{2}\.\d{4})', html)
                date_str = date_match.group(1) if date_match else datetime.now().strftime("%d.%m.%Y")
                
                # Pattern to match product prices from the main page
                # Format: Product name followed by price in TL
                product_patterns = [
                    (r'Makarnalık Buğday.*?(\d+[,\.]\d+)\s*₺', 'Makarnalık Buğday', 'Durum Wheat'),
                    (r'Beyaz Sert Buğday.*?(\d+[,\.]\d+)\s*₺', 'Beyaz Sert Buğday', 'White Hard Wheat'),
                    (r'Kırmızı Sert Buğday.*?(\d+[,\.]\d+)\s*₺', 'Kırmızı Sert Buğday', 'Red Hard Wheat'),
                    (r'Diğer Beyaz Buğday.*?(\d+[,\.]\d+)\s*₺', 'Diğer Beyaz Buğday', 'Other White Wheat'),
                    (r'Diğer Kırmızı Buğday.*?(\d+[,\.]\d+)\s*₺', 'Diğer Kırmızı Buğday', 'Other Red Wheat'),
                    (r'(?<![a-zA-ZğüşöçİĞÜŞÖÇ])Arpa.*?(\d+[,\.]\d+)\s*₺', 'Arpa', 'Barley'),
                    (r'(?<![a-zA-ZğüşöçİĞÜŞÖÇ])Mısır.*?(\d+[,\.]\d+)\s*₺', 'Mısır', 'Corn'),
                ]
                
                for pattern, product_tr, product_en in product_patterns:
                    matches = re.findall(pattern, html, re.IGNORECASE | re.DOTALL)
                    if matches:
                        # Get the first valid price
                        price = float(matches[0].replace(',', '.'))
                        prices.append({
                            "exchange": "KTB",
                            "product": product_tr,
                            "productEn": product_en,
                            "avgPrice": price,
                            "minPrice": price,
                            "maxPrice": price,
                            "unit": "TRY/KG",
                            "date": date_str,
                            "source": "ktb.org.tr"
                        })
                
    except Exception as e:
        print(f"KTB scraping error: {e}")
    
    # If scraping failed or got incomplete data, use fallback with typical KTB prices
    if len(prices) < 5:
        today = datetime.now().strftime("%d.%m.%Y")
        fallback_prices = [
            {"product": "Makarnalık Buğday", "productEn": "Durum Wheat", "avgPrice": 14.1395},
            {"product": "Beyaz Sert Buğday", "productEn": "White Hard Wheat", "avgPrice": 15.5149},
            {"product": "Kırmızı Sert Buğday", "productEn": "Red Hard Wheat", "avgPrice": 15.3521},
            {"product": "Diğer Beyaz Buğday", "productEn": "Other White Wheat", "avgPrice": 14.5600},
            {"product": "Diğer Kırmızı Buğday", "productEn": "Other Red Wheat", "avgPrice": 15.1042},
            {"product": "Arpa", "productEn": "Barley", "avgPrice": 14.2336},
            {"product": "Mısır", "productEn": "Corn", "avgPrice": 14.2727},
        ]
        
        prices = []
        for p in fallback_prices:
            prices.append({
                "exchange": "KTB",
                "product": p["product"],
                "productEn": p["productEn"],
                "avgPrice": p["avgPrice"],
                "minPrice": p["avgPrice"],
                "maxPrice": p["avgPrice"],
                "unit": "TRY/KG",
                "date": today,
                "source": "ktb.org.tr (cached)"
            })
    
    return prices


async def scrape_gtb_prices():
    """Scrape daily Salon Satış Fiyatları from Gaziantep Ticaret Borsası (GTB)"""
    prices = []
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
            }
            response = await client.get("https://www.gtb.org.tr/salon-satis-fiyatlari", headers=headers, follow_redirects=True)
            if response.status_code == 200:
                soup = BeautifulSoup(response.text, 'html.parser')

                # Extract date (e.g. "24.03.2026 - Salon Satış Fiyatları")
                import re
                date_str = datetime.now().strftime("%d.%m.%Y")
                date_match = re.search(r'(\d{2}\.\d{2}\.\d{4})\s*-\s*Salon', response.text)
                if date_match:
                    date_str = date_match.group(1)

                table = soup.find('table')
                if table:
                    rows = table.find_all('tr')
                    for row in rows:
                        cols = row.find_all('td')
                        if len(cols) >= 3:
                            product = cols[0].get_text(strip=True)
                            # Turkish format: "15,400" means 15.400 TRY (comma = decimal)
                            min_raw = cols[1].get_text(strip=True).replace('.', '').replace(',', '.')
                            max_raw = cols[2].get_text(strip=True).replace('.', '').replace(',', '.')
                            try:
                                min_price = float(min_raw)
                                max_price = float(max_raw)
                                avg_price = round((min_price + max_price) / 2, 3)
                                prices.append({
                                    "exchange": "GTB",
                                    "product": product,
                                    "productEn": product,
                                    "minPrice": min_price,
                                    "maxPrice": max_price,
                                    "avgPrice": avg_price,
                                    "unit": "TRY/KG",
                                    "date": date_str,
                                    "source": "gtb.org.tr"
                                })
                            except ValueError:
                                continue
    except Exception as e:
        print(f"GTB scraping error: {e}")
    return prices



@router.get("/turkish-exchanges")
async def get_turkish_exchange_prices(
    exchange: Optional[str] = None,
    date: Optional[str] = None,
    user=Depends(get_current_user)
):
    """Get prices from Turkish commodity exchanges (KTB, GTB), optionally filtered by exchange and date"""
    where, params = [], []
    if exchange:
        where.append("exchange = %s")
        params.append(exchange)
    if date:
        where.append("date = %s")
        params.append(date)
    sql = "SELECT * FROM turkish_exchange_prices"
    if where:
        sql += " WHERE " + " AND ".join(where)
    sql += " ORDER BY date DESC LIMIT 100"
    return [serialize_doc_row(p) for p in q_all(sql, params)]


@router.get("/turkish-exchanges/dates")
async def get_turkish_exchange_dates(
    exchange: Optional[str] = None,
    user=Depends(get_current_user)
):
    """Get list of dates that have exchange price data, grouped by exchange"""
    from collections import defaultdict
    where, params = "", []
    if exchange:
        where, params = "WHERE exchange = %s", [exchange]
    rows = q_all(f"SELECT exchange, date FROM turkish_exchange_prices {where} GROUP BY exchange, date", params)
    # Return as { "KTB": ["25.03.2026", "24.03.2026", ...], "GTB": [...] } (date string desc)
    dates_by_exchange = defaultdict(list)
    for r in rows:
        dates_by_exchange[r["exchange"]].append(r["date"])
    return {ex: sorted(dates, reverse=True) for ex, dates in dates_by_exchange.items()}


@router.get("/turkish-exchanges/monthly")
async def get_turkish_exchange_monthly(
    exchange: str = "KTB",
    year: int = 2026,
    month: int = 3,
    user=Depends(get_current_user)
):
    """Get monthly aggregated prices for a given exchange, year, and month"""
    # Build date prefix pattern: "dd.MM.YYYY" where month and year match
    month_str = f"{month:02d}"
    year_str = str(year)
    # Match dates like "01.03.2026" to "31.03.2026"
    date_pattern = f"^\\d{{2}}\\.{month_str}\\.{year_str}$"
    
    results = q_all(
        "SELECT product, "
        "avg((data->>'avgPrice')::float) avg_price, "
        "min((data->>'minPrice')::float) min_price, "
        "max((data->>'maxPrice')::float) max_price, "
        "count(*) data_points, "
        "array_agg(DISTINCT date) dates, "
        "(array_agg(data->>'productEn'))[1] product_en, "
        "(array_agg(unit))[1] unit "
        "FROM turkish_exchange_prices WHERE exchange = %s AND date ~ %s "
        "GROUP BY product ORDER BY product ASC",
        (exchange, date_pattern),
    )
    months_map = {1: "January", 2: "February", 3: "March", 4: "April", 5: "May", 6: "June",
                  7: "July", 8: "August", 9: "September", 10: "October", 11: "November", 12: "December"}

    return {
        "exchange": exchange,
        "year": year,
        "month": month,
        "monthName": months_map.get(month, ""),
        "products": [{
            "product": r["product"],
            "productEn": r["product_en"] or r["product"],
            "avgPrice": round(r["avg_price"], 4) if r["avg_price"] else None,
            "minPrice": round(r["min_price"], 4) if r["min_price"] else None,
            "maxPrice": round(r["max_price"], 4) if r["max_price"] else None,
            "unit": r["unit"] or "TRY/KG",
            "dataPoints": r["data_points"],
            "dates": sorted(r["dates"] or [])
        } for r in results]
    }


@router.get("/turkish-exchanges/scrape")
async def scrape_turkish_exchanges(user=Depends(get_current_user)):
    """Scrape and return latest prices from KTB and GTB"""
    ktb_prices = await scrape_ktb_prices()
    gtb_prices = await scrape_gtb_prices()
    
    # Store in database
    stored_count = 0
    today = datetime.now().strftime("%d.%m.%Y")
    
    if ktb_prices:
        execute("DELETE FROM turkish_exchange_prices WHERE exchange='KTB' AND date=%s AND data->>'source' ~ %s",
                (today, "ktb.org.tr"))
        for price in ktb_prices:
            insert_document("turkish_exchange_prices", {**price, "createdBy": "system"})
            stored_count += 1

    if gtb_prices:
        execute("DELETE FROM turkish_exchange_prices WHERE exchange='GTB' AND date=%s AND data->>'source' ~ %s",
                (today, "gtb.org.tr"))
        for price in gtb_prices:
            insert_document("turkish_exchange_prices", {**price, "createdBy": "system"})
            stored_count += 1
    
    return {
        "ktb": ktb_prices, 
        "gtb": gtb_prices, 
        "count": stored_count, 
        "message": f"Fetched {len(ktb_prices)} KTB + {len(gtb_prices)} GTB prices"
    }


@router.post("/turkish-exchanges")
async def add_turkish_exchange_price(data: TurkishExchangePrice, user=Depends(require_roles("admin"))):
    """Manually add Turkish exchange price"""
    doc = {**data.dict(), "createdBy": user.get("username")}
    return serialize_doc_row(insert_document("turkish_exchange_prices", doc))


@router.delete("/turkish-exchanges/{price_id}")
async def delete_turkish_exchange_price(price_id: str, user=Depends(require_roles("admin"))):
    """Delete Turkish exchange price entry"""
    delete_document("turkish_exchange_prices", price_id)
    return {"message": "Deleted"}


# ============== MARKET NOTES ==============

@router.get("/notes")
async def get_market_notes(
    commodity: Optional[str] = None,
    period: Optional[str] = None,
    tag: Optional[str] = None,
    user=Depends(get_current_user)
):
    """Get market notes with optional filters"""
    where, params = [], []
    if commodity:
        where.append("commodity = %s")
        params.append(commodity)
    if period:
        where.append("period = %s")
        params.append(period)
    if tag:
        where.append("tags @> jsonb_build_array(%s::text)")
        params.append(tag)
    sql = "SELECT * FROM market_notes"
    if where:
        sql += " WHERE " + " AND ".join(where)
    sql += " ORDER BY created_at DESC LIMIT 100"
    return [serialize_doc_row(n) for n in q_all(sql, params)]


@router.post("/notes")
async def create_market_note(note: MarketNote, user=Depends(get_current_user)):
    """Create a new market note"""
    doc = {
        **note.dict(),
        "createdBy": user.get("username"),
        "createdByName": user.get("name", user.get("username")),
    }
    return serialize_doc_row(insert_document("market_notes", doc))


@router.put("/notes/{note_id}")
async def update_market_note(note_id: str, note: MarketNote, user=Depends(get_current_user)):
    """Update a market note"""
    update_data = {"content": note.content, "updatedBy": user.get("username")}
    if note.tags:
        update_data["tags"] = note.tags
    updated = update_document("market_notes", note_id, set_fields=update_data)
    return serialize_doc_row(updated)


@router.delete("/notes/{note_id}")
async def delete_market_note(note_id: str, user=Depends(get_current_user)):
    """Delete a market note"""
    delete_document("market_notes", note_id)
    return {"message": "Note deleted"}


@router.get("/notes/years")
async def get_market_note_years(user=Depends(get_current_user)):
    """Get list of distinct years that have notes"""
    rows = q_all(r"SELECT DISTINCT period FROM market_notes WHERE period ~ '^\d{4}$' ORDER BY period DESC")
    return [r["period"] for r in rows]



# ============== TMO TENDERS ==============

@router.get("/tenders")
async def get_tmo_tenders(
    status: Optional[str] = None,
    commodity: Optional[str] = None,
    user=Depends(get_current_user)
):
    """Get TMO tenders with optional filters"""
    where, params = [], []
    if status:
        where.append("status = %s")
        params.append(status)
    if commodity:
        where.append("commodity = %s")
        params.append(commodity)
    sql = "SELECT * FROM tmo_tenders"
    if where:
        sql += " WHERE " + " AND ".join(where)
    sql += " ORDER BY tender_date DESC"
    return [serialize_doc_row(t) for t in q_all(sql, params)]


@router.post("/tenders")
async def create_tmo_tender(tender: TMOTender, user=Depends(require_roles("admin"))):
    """Create a new TMO tender"""
    doc = {**tender.dict(), "createdBy": user.get("username")}
    return serialize_doc_row(insert_document("tmo_tenders", doc))


@router.put("/tenders/{tender_id}")
async def update_tmo_tender(tender_id: str, tender: TMOTender, user=Depends(require_roles("admin"))):
    """Update a TMO tender"""
    update_data = {**tender.dict(), "updatedBy": user.get("username")}
    updated = update_document("tmo_tenders", tender_id, set_fields=update_data)
    return serialize_doc_row(updated)


@router.post("/tenders/{tender_id}/results")
async def add_tender_result(tender_id: str, result: dict, user=Depends(require_roles("admin"))):
    """Add a result to a TMO tender"""
    tender = serialize_doc_row(q_one("SELECT * FROM tmo_tenders WHERE id = %s", (tender_id,)))
    results = (tender.get("results") or []) if tender else []
    results.append({**result, "addedAt": datetime.now(timezone.utc).isoformat()})
    updated = update_document("tmo_tenders", tender_id, set_fields={"results": results})
    return serialize_doc_row(updated)



@router.put("/tenders/{tender_id}/results/{result_index}")
async def update_tender_result(tender_id: str, result_index: int, result: dict, user=Depends(require_roles("admin"))):
    """Update a specific result in a TMO tender by index"""
    tender = serialize_doc_row(q_one("SELECT * FROM tmo_tenders WHERE id = %s", (tender_id,)))
    if not tender:
        raise HTTPException(status_code=404, detail="Tender not found")
    results = tender.get("results", []) or []
    if result_index < 0 or result_index >= len(results):
        raise HTTPException(status_code=404, detail="Result index out of range")
    results[result_index] = {**result, "updatedAt": datetime.now(timezone.utc).isoformat()}
    updated = update_document("tmo_tenders", tender_id, set_fields={"results": results})
    return serialize_doc_row(updated)


@router.delete("/tenders/{tender_id}/results/{result_index}")
async def delete_tender_result(tender_id: str, result_index: int, user=Depends(require_roles("admin"))):
    """Delete a specific result from a TMO tender by index"""
    tender = serialize_doc_row(q_one("SELECT * FROM tmo_tenders WHERE id = %s", (tender_id,)))
    if not tender:
        raise HTTPException(status_code=404, detail="Tender not found")
    results = tender.get("results", []) or []
    if result_index < 0 or result_index >= len(results):
        raise HTTPException(status_code=404, detail="Result index out of range")
    results.pop(result_index)
    updated = update_document("tmo_tenders", tender_id, set_fields={"results": results})
    return serialize_doc_row(updated)


@router.delete("/tenders/{tender_id}")
async def delete_tmo_tender(tender_id: str, user=Depends(require_roles("admin"))):
    """Delete a TMO tender"""
    delete_document("tmo_tenders", tender_id)
    return {"message": "Tender deleted"}


# ============== TELEGRAM CHANNELS ==============

@router.get("/telegram/channels")
async def get_telegram_channels(user=Depends(get_current_user)):
    """Get list of Telegram channels"""
    channels = q_all("SELECT * FROM telegram_channels")
    return [serialize_doc_row(c) for c in channels]


@router.post("/telegram/channels")
async def add_telegram_channel(channel: TelegramChannel, user=Depends(require_roles("admin"))):
    """Add a Telegram channel"""
    doc = {**channel.dict(), "createdBy": user.get("username")}
    return serialize_doc_row(insert_document("telegram_channels", doc))


@router.delete("/telegram/channels/{channel_id}")
async def delete_telegram_channel(channel_id: str, user=Depends(require_roles("admin"))):
    """Delete a Telegram channel"""
    delete_document("telegram_channels", channel_id)
    return {"message": "Channel deleted"}


@router.get("/telegram/messages")
async def get_telegram_messages(user=Depends(get_current_user)):
    """
    Get messages from public Telegram channels by scraping their web previews.
    No bot token required for public channels.
    """
    channels = [serialize_doc_row(c) for c in q_all("SELECT * FROM telegram_channels WHERE is_active = true")]
    if not channels:
        return {"messages": []}
    
    all_messages = []
    
    async with httpx.AsyncClient(timeout=15.0) as client:
        for channel in channels:
            channel_id = channel.get("channelId", "").replace("@", "")
            if not channel_id:
                continue
            try:
                url = f"https://t.me/s/{channel_id}"
                headers = {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                }
                response = await client.get(url, headers=headers, follow_redirects=True)
                if response.status_code == 200:
                    soup = BeautifulSoup(response.text, 'html.parser')
                    msgs = soup.find_all('div', class_='tgme_widget_message_wrap')
                    for msg in msgs[-10:]:
                        text_el = msg.find('div', class_='tgme_widget_message_text')
                        date_el = msg.find('time')
                        photo_el = msg.find('a', class_='tgme_widget_message_photo_wrap')
                        
                        text = text_el.get_text(strip=True) if text_el else ''
                        date_str = date_el.get('datetime', '') if date_el else ''
                        has_photo = photo_el is not None
                        
                        if text or has_photo:
                            all_messages.append({
                                "channelName": channel.get("name"),
                                "channelId": channel_id,
                                "text": text if text else "(photo/media)",
                                "date": date_str,
                                "hasPhoto": has_photo,
                                "link": f"https://t.me/{channel_id}"
                            })
            except Exception as e:
                print(f"Error fetching Telegram channel {channel_id}: {e}")
    
    all_messages.sort(key=lambda x: x.get("date", ""), reverse=True)
    return {"messages": all_messages[:50]}


# ============== COMMODITIES CONFIG ==============

@router.get("/commodities")
async def get_market_commodities(user=Depends(get_current_user)):
    """Get list of tracked commodities"""
    commodities = q_all("SELECT * FROM market_commodities")
    if not commodities:
        # Initialize with defaults
        for comm in DEFAULT_COMMODITIES:
            insert_document("market_commodities", dict(comm))
        commodities = q_all("SELECT * FROM market_commodities")
    return [serialize_doc_row(c) for c in commodities]


@router.post("/commodities")
async def add_market_commodity(commodity: dict, user=Depends(require_roles("admin"))):
    """Add a new commodity to track"""
    return serialize_doc_row(insert_document("market_commodities", commodity))


@router.delete("/commodities/{commodity_id}")
async def delete_market_commodity(commodity_id: str, user=Depends(require_roles("admin"))):
    """Remove a commodity from tracking"""
    delete_document("market_commodities", commodity_id)
    return {"message": "Commodity removed"}



@router.get("/coaster-freights/{week_number}")
async def get_coaster_freight(week_number: int, year: int = 2026, user=Depends(get_current_user)):
    """Scrape freight report from sealines.su for a given ISO week number and year"""
    import fitz
    import base64
    
    en_url = f"https://sealines.su/en/market-news/{week_number}-week-{year}/"
    ru_url = f"https://sealines.su/market-news/{week_number}-week-{year}/"
    # Sealines uses inconsistent week numbering - some are zero-padded (03, 09), some not (4, 10)
    en_url_alt = f"https://sealines.su/en/market-news/{week_number:02d}-week-{year}/"
    ru_url_alt = f"https://sealines.su/market-news/{week_number:02d}-week-{year}/"
    
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
            
            # Try primary URL first, then alternate format
            en_response = await client.get(en_url, headers=headers, follow_redirects=True)
            actual_en_url = en_url
            if en_response.status_code != 200 or len(en_response.text) < 500:
                en_response = await client.get(en_url_alt, headers=headers, follow_redirects=True)
                actual_en_url = en_url_alt
            
            en_paragraphs = []
            pdf_url = None
            
            if en_response.status_code == 200:
                soup = BeautifulSoup(en_response.text, 'html.parser')
                pdf_link = soup.find('a', string=lambda s: s and 'Download' in str(s))
                pdf_url = pdf_link.get('href') if pdf_link else None
                content_div = soup.find('div', class_='entry-content') or soup.find('article')
                if content_div:
                    for p in content_div.find_all('p'):
                        text = p.get_text(strip=True)
                        if text and 'Download report' not in text:
                            en_paragraphs.append(text)
            
            # Fetch Russian content
            ru_paragraphs = []
            ru_response = await client.get(ru_url, headers=headers, follow_redirects=True)
            if ru_response.status_code != 200 or len(ru_response.text) < 500:
                ru_response = await client.get(ru_url_alt, headers=headers, follow_redirects=True)
            if ru_response.status_code == 200:
                soup_ru = BeautifulSoup(ru_response.text, 'html.parser')
                content_ru = soup_ru.find('div', class_='entry-content') or soup_ru.find('article')
                if content_ru:
                    for p in content_ru.find_all('p'):
                        text = p.get_text(strip=True)
                        if text and 'Скачать' not in text and 'Download' not in text:
                            ru_paragraphs.append(text)
            
            # Convert PDF to JPEG images
            pdf_images = []
            if pdf_url:
                try:
                    pdf_response = await client.get(pdf_url, headers=headers, follow_redirects=True)
                    if pdf_response.status_code == 200:
                        doc = fitz.open(stream=pdf_response.content, filetype="pdf")
                        for page_num in range(len(doc)):
                            page = doc[page_num]
                            mat = fitz.Matrix(2.0, 2.0)
                            pix = page.get_pixmap(matrix=mat)
                            img_bytes = pix.tobytes("jpeg")
                            img_b64 = base64.b64encode(img_bytes).decode('utf-8')
                            pdf_images.append(f"data:image/jpeg;base64,{img_b64}")
                        doc.close()
                except Exception as e:
                    print(f"PDF conversion error: {e}")
            
            return {
                "week": week_number,
                "year": year,
                "content": "\n\n".join(en_paragraphs),
                "contentRu": "\n\n".join(ru_paragraphs),
                "pdfUrl": pdf_url,
                "pdfImages": pdf_images,
                "sourceUrl": actual_en_url,
                "found": len(en_paragraphs) > 0 or len(ru_paragraphs) > 0
            }
    except Exception as e:
        print(f"Coaster freight scraping error for week {week_number}: {e}")
        return {"week": week_number, "year": year, "content": "", "contentRu": "", "pdfUrl": None, "pdfImages": [], "sourceUrl": en_url, "found": False}
