"""
Market Data API Tests
- Tests for commodity prices (Gold fix verification)
- Tests for TMO Tenders CRUD with new fields (port, company, quantity, cifPrice, exwPrice)
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestMarketPrices:
    """Tests for /api/market/prices endpoint - Gold price fix verification"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token for all tests"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "salih.karagoz",
            "password": "salih123"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        self.token = response.json()["token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_get_market_prices_returns_all_commodities(self):
        """Test that /api/market/prices returns all expected commodities"""
        response = requests.get(f"{BASE_URL}/api/market/prices", headers=self.headers)
        assert response.status_code == 200
        
        prices = response.json()
        symbols = [p["symbol"] for p in prices]
        
        # Verify all expected commodities are present
        expected_symbols = ["WHEAT", "CORN", "SOYBEAN", "GOLD", "CRUDE_OIL", 
                          "USD_TRY", "EUR_USD", "USD_RUB", "USD_UAH"]
        for symbol in expected_symbols:
            assert symbol in symbols, f"Missing commodity: {symbol}"
    
    def test_gold_price_is_correct_range(self):
        """Test that Gold price is in correct range (~$4000+, not $4)"""
        response = requests.get(f"{BASE_URL}/api/market/prices", headers=self.headers)
        assert response.status_code == 200
        
        prices = response.json()
        gold = next((p for p in prices if p["symbol"] == "GOLD"), None)
        
        assert gold is not None, "Gold not found in prices"
        assert gold["price"] > 3000, f"Gold price too low: ${gold['price']} (expected > $3000)"
        assert gold["price"] < 10000, f"Gold price too high: ${gold['price']} (expected < $10000)"
        print(f"Gold price verified: ${gold['price']}")
    
    def test_all_commodities_have_live_badge(self):
        """Test that all commodities have isLive=True and source=Barchart"""
        response = requests.get(f"{BASE_URL}/api/market/prices", headers=self.headers)
        assert response.status_code == 200
        
        prices = response.json()
        for price in prices:
            assert price.get("isLive") == True, f"{price['symbol']} is not live"
            assert price.get("source") == "Barchart", f"{price['symbol']} source is not Barchart"
    
    def test_price_data_structure(self):
        """Test that price data has all required fields"""
        response = requests.get(f"{BASE_URL}/api/market/prices", headers=self.headers)
        assert response.status_code == 200
        
        prices = response.json()
        required_fields = ["symbol", "price", "change", "changePercent", "timestamp", "name", "type", "unit"]
        
        for price in prices:
            for field in required_fields:
                assert field in price, f"Missing field '{field}' in {price['symbol']}"


class TestTMOTenders:
    """Tests for TMO Tenders CRUD with new fields"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token for all tests"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "salih.karagoz",
            "password": "salih123"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        self.token = response.json()["token"]
        self.headers = {"Authorization": f"Bearer {self.token}", "Content-Type": "application/json"}
        self.created_tender_ids = []
    
    @pytest.fixture(autouse=True)
    def cleanup(self):
        """Cleanup created tenders after tests"""
        yield
        for tender_id in self.created_tender_ids:
            try:
                requests.delete(f"{BASE_URL}/api/market/tenders/{tender_id}", headers=self.headers)
            except:
                pass
    
    def test_create_tender(self):
        """Test creating a new TMO tender"""
        tender_data = {
            "tenderDate": "2026-03-25",
            "commodity": "Feed Barley",
            "totalQuantity": 220000,
            "shipmentPeriodStart": "01/02",
            "shipmentPeriodEnd": "15/03/2026",
            "status": "open",
            "results": []
        }
        
        response = requests.post(f"{BASE_URL}/api/market/tenders", 
                                headers=self.headers, json=tender_data)
        assert response.status_code == 200
        
        tender = response.json()
        self.created_tender_ids.append(tender["id"])
        
        assert tender["tenderDate"] == "2026-03-25"
        assert tender["commodity"] == "Feed Barley"
        assert tender["status"] == "open"
        assert tender["shipmentPeriodStart"] == "01/02"
        assert tender["shipmentPeriodEnd"] == "15/03/2026"
        print(f"Created tender: {tender['id']}")
    
    def test_add_result_with_new_fields(self):
        """Test adding a result with new fields (port, company, quantity, cifPrice, exwPrice)"""
        # First create a tender
        tender_data = {
            "tenderDate": "2026-03-26",
            "commodity": "Wheat",
            "totalQuantity": 150000,
            "shipmentPeriodStart": "15/02",
            "shipmentPeriodEnd": "28/02/2026",
            "status": "awarded",
            "results": []
        }
        
        create_response = requests.post(f"{BASE_URL}/api/market/tenders", 
                                       headers=self.headers, json=tender_data)
        assert create_response.status_code == 200
        tender = create_response.json()
        self.created_tender_ids.append(tender["id"])
        
        # Add a result with new fields
        result_data = {
            "port": "Iskenderun",
            "company": "Arion",
            "quantity": 25,
            "cifPrice": 326.70,
            "exwPrice": 329.50
        }
        
        result_response = requests.post(
            f"{BASE_URL}/api/market/tenders/{tender['id']}/results",
            headers=self.headers, json=result_data
        )
        assert result_response.status_code == 200
        
        updated_tender = result_response.json()
        assert len(updated_tender["results"]) == 1
        
        result = updated_tender["results"][0]
        assert result["port"] == "Iskenderun"
        assert result["company"] == "Arion"
        assert result["quantity"] == 25
        assert result["cifPrice"] == 326.70
        assert result["exwPrice"] == 329.50
        print(f"Added result to tender: {tender['id']}")
    
    def test_add_result_with_partial_prices(self):
        """Test adding a result with only CIF price (no EXW)"""
        # Create a tender
        tender_data = {
            "tenderDate": "2026-03-27",
            "commodity": "Corn",
            "status": "open",
            "results": []
        }
        
        create_response = requests.post(f"{BASE_URL}/api/market/tenders", 
                                       headers=self.headers, json=tender_data)
        assert create_response.status_code == 200
        tender = create_response.json()
        self.created_tender_ids.append(tender["id"])
        
        # Add result with only CIF price
        result_data = {
            "port": "Mersin",
            "company": "Bunge",
            "quantity": 30,
            "cifPrice": 328.50,
            "exwPrice": None
        }
        
        result_response = requests.post(
            f"{BASE_URL}/api/market/tenders/{tender['id']}/results",
            headers=self.headers, json=result_data
        )
        assert result_response.status_code == 200
        
        updated_tender = result_response.json()
        result = updated_tender["results"][0]
        assert result["cifPrice"] == 328.50
        assert result["exwPrice"] is None
    
    def test_delete_tender(self):
        """Test deleting a TMO tender"""
        # Create a tender
        tender_data = {
            "tenderDate": "2026-03-28",
            "commodity": "Barley",
            "status": "open",
            "results": []
        }
        
        create_response = requests.post(f"{BASE_URL}/api/market/tenders", 
                                       headers=self.headers, json=tender_data)
        assert create_response.status_code == 200
        tender = create_response.json()
        tender_id = tender["id"]
        
        # Delete the tender
        delete_response = requests.delete(
            f"{BASE_URL}/api/market/tenders/{tender_id}",
            headers=self.headers
        )
        assert delete_response.status_code == 200
        
        # Verify it's deleted
        get_response = requests.get(f"{BASE_URL}/api/market/tenders", headers=self.headers)
        tenders = get_response.json()
        tender_ids = [t["id"] for t in tenders]
        assert tender_id not in tender_ids, "Tender was not deleted"
        print(f"Deleted tender: {tender_id}")
    
    def test_get_tenders(self):
        """Test getting all tenders"""
        response = requests.get(f"{BASE_URL}/api/market/tenders", headers=self.headers)
        assert response.status_code == 200
        
        tenders = response.json()
        assert isinstance(tenders, list)
        print(f"Found {len(tenders)} tenders")
    
    def test_tender_requires_auth(self):
        """Test that tender endpoints require authentication"""
        response = requests.get(f"{BASE_URL}/api/market/tenders")
        assert response.status_code == 401 or response.status_code == 403


class TestMarketPricesAuth:
    """Test authentication requirements for market prices"""
    
    def test_prices_require_auth(self):
        """Test that /api/market/prices requires authentication"""
        response = requests.get(f"{BASE_URL}/api/market/prices")
        assert response.status_code == 401 or response.status_code == 403


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
