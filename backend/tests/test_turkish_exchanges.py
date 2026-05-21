"""
Turkish Exchanges API Tests
- Tests for /api/market/turkish-exchanges endpoint
- Tests for /api/market/turkish-exchanges/dates endpoint (new)
- Tests for /api/market/turkish-exchanges/monthly endpoint (new)
- Tests for /api/market/turkish-exchanges/scrape endpoint
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestTurkishExchanges:
    """Tests for Turkish Exchange endpoints"""
    
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
    
    def test_get_turkish_exchanges(self):
        """Test GET /api/market/turkish-exchanges returns prices"""
        response = requests.get(f"{BASE_URL}/api/market/turkish-exchanges", headers=self.headers)
        assert response.status_code == 200
        
        prices = response.json()
        assert isinstance(prices, list)
        print(f"Found {len(prices)} Turkish exchange prices")
    
    def test_get_turkish_exchanges_by_date(self):
        """Test GET /api/market/turkish-exchanges with date filter"""
        # First get available dates
        dates_response = requests.get(f"{BASE_URL}/api/market/turkish-exchanges/dates", headers=self.headers)
        assert dates_response.status_code == 200
        
        dates_data = dates_response.json()
        # Get first available date from KTB or GTB
        test_date = None
        if dates_data.get("KTB") and len(dates_data["KTB"]) > 0:
            test_date = dates_data["KTB"][0]
        elif dates_data.get("GTB") and len(dates_data["GTB"]) > 0:
            test_date = dates_data["GTB"][0]
        
        if test_date:
            response = requests.get(f"{BASE_URL}/api/market/turkish-exchanges?date={test_date}", headers=self.headers)
            assert response.status_code == 200
            prices = response.json()
            # All prices should be for the requested date
            for price in prices:
                assert price["date"] == test_date, f"Price date {price['date']} doesn't match requested {test_date}"
            print(f"Found {len(prices)} prices for date {test_date}")
        else:
            print("No dates available for testing - skipping date filter test")
    
    def test_get_available_dates(self):
        """Test GET /api/market/turkish-exchanges/dates returns dates grouped by exchange"""
        response = requests.get(f"{BASE_URL}/api/market/turkish-exchanges/dates", headers=self.headers)
        assert response.status_code == 200
        
        dates_data = response.json()
        assert isinstance(dates_data, dict)
        
        # Should have KTB and/or GTB keys
        print(f"Available exchanges: {list(dates_data.keys())}")
        
        for exchange, dates in dates_data.items():
            assert exchange in ["KTB", "GTB"], f"Unexpected exchange: {exchange}"
            assert isinstance(dates, list), f"Dates for {exchange} should be a list"
            print(f"{exchange}: {len(dates)} dates available")
    
    def test_get_monthly_aggregated_data(self):
        """Test GET /api/market/turkish-exchanges/monthly returns aggregated data"""
        # Test with current year and month
        response = requests.get(
            f"{BASE_URL}/api/market/turkish-exchanges/monthly?exchange=KTB&year=2026&month=3",
            headers=self.headers
        )
        assert response.status_code == 200
        
        data = response.json()
        assert "exchange" in data
        assert data["exchange"] == "KTB"
        assert "year" in data
        assert data["year"] == 2026
        assert "month" in data
        assert data["month"] == 3
        assert "monthName" in data
        assert data["monthName"] == "March"
        assert "products" in data
        assert isinstance(data["products"], list)
        
        print(f"Monthly data for KTB March 2026: {len(data['products'])} products")
        
        # Verify product structure if data exists
        if data["products"]:
            product = data["products"][0]
            assert "product" in product
            assert "avgPrice" in product
            assert "minPrice" in product
            assert "maxPrice" in product
            assert "dataPoints" in product
            print(f"Sample product: {product['product']} - Avg: {product['avgPrice']}")
    
    def test_get_monthly_data_gtb(self):
        """Test GET /api/market/turkish-exchanges/monthly for GTB"""
        response = requests.get(
            f"{BASE_URL}/api/market/turkish-exchanges/monthly?exchange=GTB&year=2026&month=3",
            headers=self.headers
        )
        assert response.status_code == 200
        
        data = response.json()
        assert data["exchange"] == "GTB"
        print(f"Monthly data for GTB March 2026: {len(data['products'])} products")
    
    def test_scrape_turkish_exchanges(self):
        """Test GET /api/market/turkish-exchanges/scrape triggers scraping"""
        response = requests.get(f"{BASE_URL}/api/market/turkish-exchanges/scrape", headers=self.headers)
        assert response.status_code == 200
        
        data = response.json()
        assert "ktb" in data
        assert "gtb" in data
        assert "count" in data
        assert "message" in data
        
        print(f"Scraped: {len(data['ktb'])} KTB + {len(data['gtb'])} GTB prices")
    
    def test_turkish_exchanges_require_auth(self):
        """Test that Turkish exchange endpoints require authentication"""
        endpoints = [
            "/api/market/turkish-exchanges",
            "/api/market/turkish-exchanges/dates",
            "/api/market/turkish-exchanges/monthly?exchange=KTB&year=2026&month=3",
            "/api/market/turkish-exchanges/scrape"
        ]
        
        for endpoint in endpoints:
            response = requests.get(f"{BASE_URL}{endpoint}")
            assert response.status_code in [401, 403], f"{endpoint} should require auth"


class TestMarketNotes:
    """Tests for Market Notes (Indications) endpoints"""
    
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
        self.created_note_ids = []
    
    @pytest.fixture(autouse=True)
    def cleanup(self):
        """Cleanup created notes after tests"""
        yield
        for note_id in self.created_note_ids:
            try:
                requests.delete(f"{BASE_URL}/api/market/notes/{note_id}", headers=self.headers)
            except:
                pass
    
    def test_get_market_notes(self):
        """Test GET /api/market/notes returns notes"""
        response = requests.get(f"{BASE_URL}/api/market/notes", headers=self.headers)
        assert response.status_code == 200
        
        notes = response.json()
        assert isinstance(notes, list)
        print(f"Found {len(notes)} market notes")
    
    def test_get_notes_by_commodity(self):
        """Test GET /api/market/notes with commodity filter"""
        response = requests.get(f"{BASE_URL}/api/market/notes?commodity=Wheat", headers=self.headers)
        assert response.status_code == 200
        
        notes = response.json()
        for note in notes:
            assert note["commodity"] == "Wheat"
        print(f"Found {len(notes)} Wheat notes")
    
    def test_create_and_delete_note(self):
        """Test POST /api/market/notes creates a note"""
        note_data = {
            "commodity": "Wheat",
            "period": "25_Mar_2026",
            "content": "TEST_Note: Market is bullish today",
            "tags": ["test"]
        }
        
        response = requests.post(f"{BASE_URL}/api/market/notes", headers=self.headers, json=note_data)
        assert response.status_code == 200
        
        note = response.json()
        self.created_note_ids.append(note["id"])
        
        assert note["commodity"] == "Wheat"
        assert note["content"] == "TEST_Note: Market is bullish today"
        print(f"Created note: {note['id']}")
        
        # Delete the note
        delete_response = requests.delete(f"{BASE_URL}/api/market/notes/{note['id']}", headers=self.headers)
        assert delete_response.status_code == 200
        self.created_note_ids.remove(note["id"])
    
    def test_get_note_years(self):
        """Test GET /api/market/notes/years returns years"""
        response = requests.get(f"{BASE_URL}/api/market/notes/years", headers=self.headers)
        assert response.status_code == 200
        
        years = response.json()
        assert isinstance(years, list)
        print(f"Archive years: {years}")


class TestCoasterFreights:
    """Tests for Coaster Freights endpoint"""
    
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
    
    def test_get_coaster_freight(self):
        """Test GET /api/market/coaster-freights/{week} returns freight data"""
        # Test with week 1 of 2026
        response = requests.get(f"{BASE_URL}/api/market/coaster-freights/1?year=2026", headers=self.headers)
        assert response.status_code == 200
        
        data = response.json()
        assert "week" in data
        assert data["week"] == 1
        assert "year" in data
        assert data["year"] == 2026
        assert "found" in data
        print(f"Freight report week 1: found={data['found']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
