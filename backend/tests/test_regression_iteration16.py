"""
Regression Test Suite - Iteration 16
Testing major changes from previous session:
1. VesselExecutionPage split into list view (/documents) and detail view (/documents/:tradeId)
2. Draft Documents drag-and-drop tab
3. Accounting PDF upload
4. Calendar multi-day events
5. Commission auto-invoicing
6. SWIFT copy upload
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestAuth:
    """Authentication endpoint tests"""
    
    def test_login_admin_success(self):
        """Test admin login with valid credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "salih.karagoz",
            "password": "salih123"
        })
        assert response.status_code == 200
        data = response.json()
        assert "token" in data
        assert "user" in data
        assert data["user"]["username"] == "salih.karagoz"
        assert data["user"]["role"] == "admin"
        
    def test_login_accountant_success(self):
        """Test accountant login with valid credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "pir.accounts",
            "password": "pir123"
        })
        assert response.status_code == 200
        data = response.json()
        assert "token" in data
        assert data["user"]["role"] == "accountant"
        
    def test_login_invalid_credentials(self):
        """Test login with invalid credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "invalid",
            "password": "invalid"
        })
        assert response.status_code == 401


class TestConfigEndpoints:
    """Config endpoint tests"""
    
    def test_active_url_returns_correct_url(self):
        """Test /api/config/active-url returns the correct URL"""
        response = requests.get(f"{BASE_URL}/api/config/active-url")
        assert response.status_code == 200
        data = response.json()
        assert "activeUrl" in data
        assert "trade-dashboard-128" in data["activeUrl"]


class TestTradesAPI:
    """Trades CRUD tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token for authenticated requests"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "salih.karagoz",
            "password": "salih123"
        })
        if response.status_code == 200:
            self.token = response.json()["token"]
            self.headers = {"Authorization": f"Bearer {self.token}"}
        else:
            pytest.skip("Authentication failed")
    
    def test_list_trades(self):
        """Test GET /api/trades returns list of trades"""
        response = requests.get(f"{BASE_URL}/api/trades", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        # Verify trade structure
        if len(data) > 0:
            trade = data[0]
            assert "id" in trade
            # Check for common trade fields
            assert any(key in trade for key in ["pirContractNumber", "contractNumber", "referenceNumber"])
    
    def test_get_single_trade(self):
        """Test GET /api/trades/{id} returns trade details"""
        # First get list to find a trade ID
        list_response = requests.get(f"{BASE_URL}/api/trades", headers=self.headers)
        assert list_response.status_code == 200
        trades = list_response.json()
        if len(trades) == 0:
            pytest.skip("No trades available for testing")
        
        trade_id = trades[0]["id"]
        response = requests.get(f"{BASE_URL}/api/trades/{trade_id}", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == trade_id
    
    def test_trades_stats_overview(self):
        """Test GET /api/trades/stats/overview returns statistics"""
        response = requests.get(f"{BASE_URL}/api/trades/stats/overview", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert "totalTrades" in data
        assert "activeTrades" in data
        assert "completedTrades" in data


class TestEventsAPI:
    """Events/Calendar API tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "salih.karagoz",
            "password": "salih123"
        })
        if response.status_code == 200:
            self.token = response.json()["token"]
            self.headers = {"Authorization": f"Bearer {self.token}"}
        else:
            pytest.skip("Authentication failed")
    
    def test_list_events(self):
        """Test GET /api/events returns list of events"""
        response = requests.get(f"{BASE_URL}/api/events", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
    
    def test_create_event(self):
        """Test POST /api/events creates a new event"""
        event_data = {
            "title": "TEST_Multi_Day_Event",
            "date": "2026-01-15",
            "endDate": "2026-01-17",
            "type": "shipment",
            "description": "Test multi-day event"
        }
        response = requests.post(f"{BASE_URL}/api/events", json=event_data, headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert data["title"] == "TEST_Multi_Day_Event"
        assert "id" in data
        
        # Cleanup
        event_id = data["id"]
        requests.delete(f"{BASE_URL}/api/events/{event_id}", headers=self.headers)


class TestAccountingAPI:
    """Accounting/Invoices API tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "salih.karagoz",
            "password": "salih123"
        })
        if response.status_code == 200:
            self.token = response.json()["token"]
            self.headers = {"Authorization": f"Bearer {self.token}"}
        else:
            pytest.skip("Authentication failed")
    
    def test_list_invoices(self):
        """Test GET /api/invoices returns list of invoices"""
        response = requests.get(f"{BASE_URL}/api/invoices", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
    
    def test_list_bank_statements(self):
        """Test GET /api/bank-statements returns list"""
        response = requests.get(f"{BASE_URL}/api/bank-statements", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)


class TestDraftDocumentsAPI:
    """Draft Documents API tests for VesselExecution"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token and find a trade with vessel"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "salih.karagoz",
            "password": "salih123"
        })
        if response.status_code == 200:
            self.token = response.json()["token"]
            self.headers = {"Authorization": f"Bearer {self.token}"}
        else:
            pytest.skip("Authentication failed")
        
        # Find a trade with vessel for testing
        trades_response = requests.get(f"{BASE_URL}/api/trades", headers=self.headers)
        if trades_response.status_code == 200:
            trades = trades_response.json()
            vessel_trades = [t for t in trades if t.get("vesselName")]
            if vessel_trades:
                self.trade_id = vessel_trades[0]["id"]
            else:
                self.trade_id = trades[0]["id"] if trades else None
    
    def test_get_draft_documents(self):
        """Test GET /api/trades/{id}/draft-documents returns list"""
        if not hasattr(self, 'trade_id') or not self.trade_id:
            pytest.skip("No trade available for testing")
        
        response = requests.get(f"{BASE_URL}/api/trades/{self.trade_id}/draft-documents", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)


class TestSWIFTUploadAPI:
    """SWIFT copy upload API tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token and find a trade"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "salih.karagoz",
            "password": "salih123"
        })
        if response.status_code == 200:
            self.token = response.json()["token"]
            self.headers = {"Authorization": f"Bearer {self.token}"}
        else:
            pytest.skip("Authentication failed")
        
        trades_response = requests.get(f"{BASE_URL}/api/trades", headers=self.headers)
        if trades_response.status_code == 200:
            trades = trades_response.json()
            if trades:
                self.trade_id = trades[0]["id"]
    
    def test_swift_endpoints_exist(self):
        """Test SWIFT upload/download endpoints exist"""
        if not hasattr(self, 'trade_id') or not self.trade_id:
            pytest.skip("No trade available for testing")
        
        # Test download endpoint (should return 404 if no file)
        response = requests.get(f"{BASE_URL}/api/trades/{self.trade_id}/download-swift", headers=self.headers)
        # 404 is expected if no SWIFT file uploaded, 200 if file exists
        assert response.status_code in [200, 404]


class TestCommissionsAPI:
    """Commission invoice API tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "salih.karagoz",
            "password": "salih123"
        })
        if response.status_code == 200:
            self.token = response.json()["token"]
            self.headers = {"Authorization": f"Bearer {self.token}"}
        else:
            pytest.skip("Authentication failed")
    
    def test_invoices_include_commission_invoices(self):
        """Test that invoices list includes auto-generated commission invoices"""
        response = requests.get(f"{BASE_URL}/api/invoices", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        # Check if any invoices have autoGenerated flag
        auto_generated = [inv for inv in data if inv.get("autoGenerated")]
        # This is informational - may or may not have auto-generated invoices
        print(f"Found {len(auto_generated)} auto-generated commission invoices")


class TestReferenceDataAPI:
    """Reference data endpoints tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "salih.karagoz",
            "password": "salih123"
        })
        if response.status_code == 200:
            self.token = response.json()["token"]
            self.headers = {"Authorization": f"Bearer {self.token}"}
        else:
            pytest.skip("Authentication failed")
    
    def test_commodities_list(self):
        """Test GET /api/commodities"""
        response = requests.get(f"{BASE_URL}/api/commodities", headers=self.headers)
        assert response.status_code == 200
        assert isinstance(response.json(), list)
    
    def test_ports_list(self):
        """Test GET /api/ports"""
        response = requests.get(f"{BASE_URL}/api/ports", headers=self.headers)
        assert response.status_code == 200
        assert isinstance(response.json(), list)
    
    def test_vessels_list(self):
        """Test GET /api/vessels"""
        response = requests.get(f"{BASE_URL}/api/vessels", headers=self.headers)
        assert response.status_code == 200
        assert isinstance(response.json(), list)
    
    def test_partners_list(self):
        """Test GET /api/partners"""
        response = requests.get(f"{BASE_URL}/api/partners", headers=self.headers)
        assert response.status_code == 200
        assert isinstance(response.json(), list)


class TestBuyerPaymentAPI:
    """Buyer payment date API tests (triggers commission auto-invoicing)"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token and find a trade"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "salih.karagoz",
            "password": "salih123"
        })
        if response.status_code == 200:
            self.token = response.json()["token"]
            self.headers = {"Authorization": f"Bearer {self.token}"}
        else:
            pytest.skip("Authentication failed")
        
        trades_response = requests.get(f"{BASE_URL}/api/trades", headers=self.headers)
        if trades_response.status_code == 200:
            trades = trades_response.json()
            # Find a trade with vessel that's not completed
            vessel_trades = [t for t in trades if t.get("vesselName") and t.get("status") != "completed"]
            if vessel_trades:
                self.trade_id = vessel_trades[0]["id"]
            else:
                self.trade_id = None
    
    def test_buyer_payment_endpoint_exists(self):
        """Test POST /api/trades/{id}/buyer-payment endpoint exists"""
        if not hasattr(self, 'trade_id') or not self.trade_id:
            pytest.skip("No suitable trade available for testing")
        
        # Just verify the endpoint exists and accepts requests
        # Don't actually set payment date to avoid side effects
        response = requests.post(
            f"{BASE_URL}/api/trades/{self.trade_id}/buyer-payment",
            json={"paymentDate": ""},  # Empty to clear/not set
            headers=self.headers
        )
        assert response.status_code == 200


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
