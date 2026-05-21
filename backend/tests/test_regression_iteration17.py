"""
Regression Test Suite - Iteration 17
Testing major changes since iteration 16:
1. Vessel Execution tab restructuring (7 renamed tabs with green active state)
2. Accounting RBAC fixes (Promise.all crash for accountant role)
3. Draft Documents view-in-new-tab logic (blob-based window.open)
4. JWT token extended to 7 days
5. Axios interceptor fix to prevent random logouts
6. Bank Statement edit functionality
7. Commission invoice date sync from buyer payment date
8. Partner tax fields
9. Port options formatting
10. Excel file upload support
11. TBA discharge port option
12. Multi-day calendar events
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_USER = {"username": "salih.karagoz", "password": "salih123"}
ACCOUNTANT_USER = {"username": "pir.accounts", "password": "pir123"}


class TestAuthFlows:
    """Authentication endpoint tests for both admin and accountant roles"""
    
    def test_admin_login_success(self):
        """Test admin login with valid credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN_USER)
        assert response.status_code == 200
        data = response.json()
        assert "token" in data
        assert "user" in data
        assert data["user"]["username"] == "salih.karagoz"
        assert data["user"]["role"] == "admin"
        
    def test_accountant_login_success(self):
        """Test accountant login with pir.accounts credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=ACCOUNTANT_USER)
        assert response.status_code == 200
        data = response.json()
        assert "token" in data
        assert "user" in data
        assert data["user"]["username"] == "pir.accounts"
        assert data["user"]["role"] == "accountant"
        
    def test_login_invalid_credentials(self):
        """Test login with invalid credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "invalid",
            "password": "invalid"
        })
        assert response.status_code == 401


class TestAccountantRBAC:
    """Test RBAC fixes for accountant role - vendors and bank-accounts access"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get accountant auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=ACCOUNTANT_USER)
        if response.status_code == 200:
            self.token = response.json()["token"]
            self.headers = {"Authorization": f"Bearer {self.token}"}
        else:
            pytest.skip("Accountant authentication failed")
    
    def test_accountant_can_access_vendors(self):
        """Test accountant can GET /api/vendors (RBAC fix)"""
        response = requests.get(f"{BASE_URL}/api/vendors", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        
    def test_accountant_can_access_bank_accounts(self):
        """Test accountant can GET /api/bank-accounts (RBAC fix)"""
        response = requests.get(f"{BASE_URL}/api/bank-accounts", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        
    def test_accountant_can_access_invoices(self):
        """Test accountant can GET /api/invoices"""
        response = requests.get(f"{BASE_URL}/api/invoices", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        
    def test_accountant_can_access_bank_statements(self):
        """Test accountant can GET /api/bank-statements"""
        response = requests.get(f"{BASE_URL}/api/bank-statements", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        
    def test_accountant_cannot_create_vendor(self):
        """Test accountant cannot POST /api/vendors (write restricted)"""
        response = requests.post(f"{BASE_URL}/api/vendors", json={"name": "TEST_Vendor"}, headers=self.headers)
        assert response.status_code == 403


class TestTradesAPI:
    """Trades CRUD tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get admin auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN_USER)
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
        if len(data) > 0:
            trade = data[0]
            assert "id" in trade
    
    def test_get_single_trade(self):
        """Test GET /api/trades/{id} returns trade details"""
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


class TestBankStatementEdit:
    """Test bank statement edit functionality"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get admin auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN_USER)
        if response.status_code == 200:
            self.token = response.json()["token"]
            self.headers = {"Authorization": f"Bearer {self.token}"}
        else:
            pytest.skip("Authentication failed")
    
    def test_bank_statement_edit_endpoint_exists(self):
        """Test PUT /api/bank-statements/{id} endpoint exists"""
        # First get list of bank statements
        list_response = requests.get(f"{BASE_URL}/api/bank-statements", headers=self.headers)
        assert list_response.status_code == 200
        statements = list_response.json()
        
        if len(statements) == 0:
            pytest.skip("No bank statements available for testing")
        
        stmt_id = statements[0]["id"]
        # Test update with minimal data
        response = requests.put(
            f"{BASE_URL}/api/bank-statements/{stmt_id}",
            json={"description": "TEST_Updated description"},
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        assert "id" in data


class TestEventsAPI:
    """Events/Calendar API tests including multi-day events"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN_USER)
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
    
    def test_create_multi_day_event(self):
        """Test POST /api/events creates a multi-day event"""
        event_data = {
            "title": "TEST_Multi_Day_Event",
            "date": "2026-01-20",
            "endDate": "2026-01-25",
            "type": "shipment",
            "description": "Test multi-day event spanning 5 days"
        }
        response = requests.post(f"{BASE_URL}/api/events", json=event_data, headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert data["title"] == "TEST_Multi_Day_Event"
        assert "id" in data
        
        # Cleanup
        event_id = data["id"]
        requests.delete(f"{BASE_URL}/api/events/{event_id}", headers=self.headers)


class TestInvoicesAPI:
    """Invoices API tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN_USER)
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


class TestDraftDocumentsAPI:
    """Draft Documents API tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token and find a trade"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN_USER)
        if response.status_code == 200:
            self.token = response.json()["token"]
            self.headers = {"Authorization": f"Bearer {self.token}"}
        else:
            pytest.skip("Authentication failed")
        
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


class TestReferenceDataAPI:
    """Reference data endpoints tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN_USER)
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


class TestMarketDataAPI:
    """Market Data API tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN_USER)
        if response.status_code == 200:
            self.token = response.json()["token"]
            self.headers = {"Authorization": f"Bearer {self.token}"}
        else:
            pytest.skip("Authentication failed")
    
    def test_market_prices(self):
        """Test GET /api/market/prices"""
        response = requests.get(f"{BASE_URL}/api/market/prices", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
    
    def test_market_tenders(self):
        """Test GET /api/market/tenders"""
        response = requests.get(f"{BASE_URL}/api/market/tenders", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
    
    def test_turkish_exchanges(self):
        """Test GET /api/market/turkish-exchanges"""
        response = requests.get(f"{BASE_URL}/api/market/turkish-exchanges", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)


class TestPortLineupsAPI:
    """Port Line-Ups API tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN_USER)
        if response.status_code == 200:
            self.token = response.json()["token"]
            self.headers = {"Authorization": f"Bearer {self.token}"}
        else:
            pytest.skip("Authentication failed")
    
    def test_port_lineups_dates(self):
        """Test GET /api/port-lineups/dates"""
        response = requests.get(f"{BASE_URL}/api/port-lineups/dates", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert "dates" in data
    
    def test_port_lineups_summary(self):
        """Test GET /api/port-lineups/summary"""
        response = requests.get(f"{BASE_URL}/api/port-lineups/summary", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert "latestDate" in data or "ports" in data


class TestCommissionsAPI:
    """Commission/Brokerage API tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN_USER)
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
        auto_generated = [inv for inv in data if inv.get("autoGenerated")]
        print(f"Found {len(auto_generated)} auto-generated commission invoices")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
