"""
Backend API Tests for PIR Grain & Pulses - Refactored Modular Backend
Tests all API endpoints after refactoring from monolithic server.py to modular structure.
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_USER = {"username": "salih.karagoz", "password": "salih123"}
ACCOUNTANT_USER = {"username": "pir.accounts", "password": "pir123"}


class TestHealthAndAuth:
    """Health check and authentication tests"""
    
    def test_health_endpoint(self):
        """Test /api/health returns healthy status"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert data["app"] == "PIR Grain & Pulses"
        print("PASS: Health endpoint working")
    
    def test_login_admin_success(self):
        """Test admin login with salih.karagoz/salih123"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN_USER)
        assert response.status_code == 200
        data = response.json()
        assert "token" in data
        assert "user" in data
        assert data["user"]["username"] == "salih.karagoz"
        assert data["user"]["role"] == "admin"
        print("PASS: Admin login successful")
    
    def test_login_accountant_success(self):
        """Test accountant login with pir.accounts/pir123"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=ACCOUNTANT_USER)
        assert response.status_code == 200
        data = response.json()
        assert "token" in data
        assert data["user"]["username"] == "pir.accounts"
        print("PASS: Accountant login successful")
    
    def test_login_invalid_credentials(self):
        """Test login with invalid credentials returns 401"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "invalid", "password": "wrong"
        })
        assert response.status_code == 401
        print("PASS: Invalid credentials rejected")
    
    def test_auth_me_endpoint(self):
        """Test /api/auth/me returns current user"""
        # First login
        login_resp = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN_USER)
        token = login_resp.json()["token"]
        
        # Then get current user
        response = requests.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["username"] == "salih.karagoz"
        assert "password" not in data  # Password should be excluded
        print("PASS: Auth/me endpoint working")


@pytest.fixture(scope="class")
def auth_token():
    """Get authentication token for tests"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN_USER)
    if response.status_code == 200:
        return response.json()["token"]
    pytest.skip("Authentication failed")


@pytest.fixture(scope="class")
def auth_headers(auth_token):
    """Get headers with auth token"""
    return {"Authorization": f"Bearer {auth_token}"}


class TestTradesEndpoints:
    """Tests for /api/trades endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self, auth_headers):
        self.headers = auth_headers
    
    def test_list_trades(self, auth_headers):
        """Test GET /api/trades returns list of trades"""
        response = requests.get(f"{BASE_URL}/api/trades", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"PASS: List trades returned {len(data)} trades")
    
    def test_trades_stats_overview(self, auth_headers):
        """Test GET /api/trades/stats/overview returns KPI stats"""
        response = requests.get(f"{BASE_URL}/api/trades/stats/overview", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert "totalTrades" in data
        assert "activeTrades" in data
        assert "pendingTrades" in data
        assert "completedTrades" in data
        assert "completionRate" in data
        assert "statusDistribution" in data
        print(f"PASS: Trade stats - Total: {data['totalTrades']}, Active: {data['activeTrades']}")
    
    def test_create_trade(self, auth_headers):
        """Test POST /api/trades creates a new trade"""
        trade_data = {
            "quantity": 1000,
            "pricePerMT": 350,
            "currency": "USD",
            "status": "confirmation",
            "notes": "TEST_trade_for_testing"
        }
        response = requests.post(f"{BASE_URL}/api/trades", json=trade_data, headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert "id" in data
        assert "referenceNumber" in data
        assert data["quantity"] == 1000
        assert data["pricePerMT"] == 350
        print(f"PASS: Created trade with ref: {data['referenceNumber']}")
        
        # Cleanup - delete the test trade
        trade_id = data["id"]
        requests.delete(f"{BASE_URL}/api/trades/{trade_id}", headers=auth_headers)
    
    def test_get_trade_by_id(self, auth_headers):
        """Test GET /api/trades/{id} returns specific trade"""
        # First create a trade
        trade_data = {"quantity": 500, "notes": "TEST_get_trade"}
        create_resp = requests.post(f"{BASE_URL}/api/trades", json=trade_data, headers=auth_headers)
        trade_id = create_resp.json()["id"]
        
        # Get the trade
        response = requests.get(f"{BASE_URL}/api/trades/{trade_id}", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == trade_id
        assert data["quantity"] == 500
        print(f"PASS: Get trade by ID working")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/trades/{trade_id}", headers=auth_headers)
    
    def test_update_trade(self, auth_headers):
        """Test PUT /api/trades/{id} updates trade"""
        # Create trade
        create_resp = requests.post(
            f"{BASE_URL}/api/trades", 
            json={"quantity": 100, "notes": "TEST_update_trade"},
            headers=auth_headers
        )
        trade_id = create_resp.json()["id"]
        
        # Update trade
        response = requests.put(
            f"{BASE_URL}/api/trades/{trade_id}",
            json={"quantity": 200, "notes": "TEST_updated"},
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["quantity"] == 200
        print("PASS: Update trade working")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/trades/{trade_id}", headers=auth_headers)
    
    def test_delete_trade(self, auth_headers):
        """Test DELETE /api/trades/{id} deletes trade"""
        # Create trade
        create_resp = requests.post(
            f"{BASE_URL}/api/trades",
            json={"notes": "TEST_delete_trade"},
            headers=auth_headers
        )
        trade_id = create_resp.json()["id"]
        
        # Delete trade
        response = requests.delete(f"{BASE_URL}/api/trades/{trade_id}", headers=auth_headers)
        assert response.status_code == 200
        
        # Verify deleted
        get_resp = requests.get(f"{BASE_URL}/api/trades/{trade_id}", headers=auth_headers)
        assert get_resp.status_code == 404
        print("PASS: Delete trade working")


class TestPartnersEndpoints:
    """Tests for /api/partners endpoints"""
    
    def test_list_partners(self, auth_headers):
        """Test GET /api/partners returns list of counterparties"""
        response = requests.get(f"{BASE_URL}/api/partners", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"PASS: List partners returned {len(data)} partners")
    
    def test_create_partner(self, auth_headers):
        """Test POST /api/partners creates a new partner"""
        partner_data = {
            "companyName": "TEST_Partner_Company",
            "type": ["buyer"],
            "email": "test@testpartner.com"
        }
        response = requests.post(f"{BASE_URL}/api/partners", json=partner_data, headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert "id" in data
        assert data["companyName"] == "TEST_Partner_Company"
        print(f"PASS: Created partner: {data['companyName']}")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/partners/{data['id']}", headers=auth_headers)
    
    def test_get_partner_by_id(self, auth_headers):
        """Test GET /api/partners/{id} returns specific partner"""
        # Create partner
        create_resp = requests.post(
            f"{BASE_URL}/api/partners",
            json={"companyName": "TEST_Get_Partner", "type": ["seller"]},
            headers=auth_headers
        )
        partner_id = create_resp.json()["id"]
        
        # Get partner
        response = requests.get(f"{BASE_URL}/api/partners/{partner_id}", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == partner_id
        print("PASS: Get partner by ID working")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/partners/{partner_id}", headers=auth_headers)


class TestVesselsEndpoints:
    """Tests for /api/vessels endpoints"""
    
    def test_list_vessels(self, auth_headers):
        """Test GET /api/vessels returns list of vessels"""
        response = requests.get(f"{BASE_URL}/api/vessels", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"PASS: List vessels returned {len(data)} vessels")
    
    def test_create_vessel(self, auth_headers):
        """Test POST /api/vessels creates a new vessel"""
        vessel_data = {
            "name": "TEST_Vessel_Ship",
            "imoNumber": "TEST123456",
            "flag": "Panama"
        }
        response = requests.post(f"{BASE_URL}/api/vessels", json=vessel_data, headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert "id" in data
        assert data["name"] == "TEST_Vessel_Ship"
        print(f"PASS: Created vessel: {data['name']}")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/vessels/{data['id']}", headers=auth_headers)


class TestReferenceDataEndpoints:
    """Tests for commodities, ports, origins, surveyors endpoints"""
    
    def test_list_commodities(self, auth_headers):
        """Test GET /api/commodities returns list"""
        response = requests.get(f"{BASE_URL}/api/commodities", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"PASS: List commodities returned {len(data)} items")
    
    def test_list_ports(self, auth_headers):
        """Test GET /api/ports returns list"""
        response = requests.get(f"{BASE_URL}/api/ports", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"PASS: List ports returned {len(data)} items")
    
    def test_list_origins(self, auth_headers):
        """Test GET /api/origins returns list"""
        response = requests.get(f"{BASE_URL}/api/origins", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"PASS: List origins returned {len(data)} items")
    
    def test_list_surveyors(self, auth_headers):
        """Test GET /api/surveyors returns list"""
        response = requests.get(f"{BASE_URL}/api/surveyors", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"PASS: List surveyors returned {len(data)} items")


class TestNotificationsEndpoints:
    """Tests for /api/notifications endpoints"""
    
    def test_list_notifications(self, auth_headers):
        """Test GET /api/notifications returns list"""
        response = requests.get(f"{BASE_URL}/api/notifications", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"PASS: List notifications returned {len(data)} items")


class TestEventsEndpoints:
    """Tests for /api/events endpoints"""
    
    def test_list_events(self, auth_headers):
        """Test GET /api/events returns list"""
        response = requests.get(f"{BASE_URL}/api/events", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"PASS: List events returned {len(data)} items")
    
    def test_create_event(self, auth_headers):
        """Test POST /api/events creates a new event"""
        event_data = {
            "title": "TEST_Event",
            "date": "2026-02-15",
            "type": "meeting"
        }
        response = requests.post(f"{BASE_URL}/api/events", json=event_data, headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert "id" in data
        assert data["title"] == "TEST_Event"
        print(f"PASS: Created event: {data['title']}")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/events/{data['id']}", headers=auth_headers)


class TestUsersEndpoints:
    """Tests for /api/users endpoints"""
    
    def test_list_users(self, auth_headers):
        """Test GET /api/users returns list of users"""
        response = requests.get(f"{BASE_URL}/api/users", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) > 0
        # Verify password is not exposed
        for user in data:
            assert "password" not in user
        print(f"PASS: List users returned {len(data)} users")
    
    def test_get_trade_statuses(self, auth_headers):
        """Test GET /api/trade-statuses returns status list"""
        response = requests.get(f"{BASE_URL}/api/trade-statuses", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert "confirmation" in data
        assert "completed" in data
        print(f"PASS: Trade statuses returned {len(data)} statuses")


class TestUnauthorizedAccess:
    """Tests for unauthorized access protection"""
    
    def test_trades_requires_auth(self):
        """Test /api/trades requires authentication"""
        response = requests.get(f"{BASE_URL}/api/trades")
        assert response.status_code == 401
        print("PASS: Trades endpoint requires auth")
    
    def test_partners_requires_auth(self):
        """Test /api/partners requires authentication"""
        response = requests.get(f"{BASE_URL}/api/partners")
        assert response.status_code == 401
        print("PASS: Partners endpoint requires auth")
    
    def test_vessels_requires_auth(self):
        """Test /api/vessels requires authentication"""
        response = requests.get(f"{BASE_URL}/api/vessels")
        assert response.status_code == 401
        print("PASS: Vessels endpoint requires auth")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
