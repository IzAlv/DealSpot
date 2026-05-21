"""
Regression tests for PIR Grain & Pulses Dashboard
Testing after massive UI changes to VesselExecutionPage, AccountingPage, 
PortLineupsPage, CommissionsPage, and various dark mode fixes.
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestAuthEndpoints:
    """Authentication endpoint tests"""
    
    def test_login_admin_success(self):
        """Test admin login with salih.karagoz credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "salih.karagoz",
            "password": "salih123"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "token" in data, "Response should contain 'token'"
        assert "user" in data, "Response should contain 'user'"
        assert data["user"]["username"] == "salih.karagoz"
        assert data["user"]["role"] == "admin"
        return data["token"]
    
    def test_login_accountant_success(self):
        """Test accountant login with pir.accounts credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "pir.accounts",
            "password": "pir123"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "token" in data, "Response should contain 'token'"
        assert "user" in data, "Response should contain 'user'"
        assert data["user"]["username"] == "pir.accounts"
        assert data["user"]["role"] == "accountant"
    
    def test_login_invalid_credentials(self):
        """Test login with invalid credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "invalid_user",
            "password": "wrong_password"
        })
        assert response.status_code == 401


class TestHealthEndpoint:
    """Health check endpoint tests"""
    
    def test_health_check(self):
        """Test health endpoint returns healthy status"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert data["app"] == "PIR Grain & Pulses"


class TestTradesEndpoints:
    """Trades/Contracts API tests"""
    
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
        """Test listing all trades"""
        response = requests.get(f"{BASE_URL}/api/trades", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        # Verify trade structure if trades exist
        if len(data) > 0:
            trade = data[0]
            assert "id" in trade
    
    def test_get_trade_stats(self):
        """Test trade statistics endpoint"""
        response = requests.get(f"{BASE_URL}/api/trades/stats/overview", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert "totalTrades" in data
        assert "activeTrades" in data
        assert "pendingTrades" in data
        assert "completedTrades" in data


class TestAccountingEndpoints:
    """Accounting API tests - invoices and bank statements"""
    
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
    
    def test_list_invoices(self):
        """Test listing all invoices"""
        response = requests.get(f"{BASE_URL}/api/invoices", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
    
    def test_list_bank_statements(self):
        """Test listing bank statements"""
        response = requests.get(f"{BASE_URL}/api/bank-statements", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
    
    def test_list_bank_accounts(self):
        """Test listing bank accounts"""
        response = requests.get(f"{BASE_URL}/api/bank-accounts", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)


class TestPortLineupsEndpoints:
    """Port Line-Ups API tests - Daily and Monthly"""
    
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
    
    def test_get_port_lineup_dates(self):
        """Test getting available port lineup dates"""
        response = requests.get(f"{BASE_URL}/api/port-lineups/dates", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert "dates" in data
        assert isinstance(data["dates"], list)
    
    def test_get_port_lineup_summary(self):
        """Test getting port lineup summary"""
        response = requests.get(f"{BASE_URL}/api/port-lineups/summary", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert "latestDate" in data
        assert "ports" in data
        assert "totalVessels" in data
    
    def test_list_monthly_lineups(self):
        """Test listing monthly lineups"""
        response = requests.get(f"{BASE_URL}/api/port-lineups/monthly/list", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)


class TestMarketDataEndpoints:
    """Market Data API tests"""
    
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
    
    def test_list_indications(self):
        """Test listing market indications"""
        response = requests.get(f"{BASE_URL}/api/market-data/indications", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
    
    def test_list_tmo_tenders(self):
        """Test listing TMO tenders"""
        response = requests.get(f"{BASE_URL}/api/market-data/tmo-tenders", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
    
    def test_list_coaster_freights(self):
        """Test listing coaster freights"""
        response = requests.get(f"{BASE_URL}/api/market-data/coaster-freights", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)


class TestReferenceDataEndpoints:
    """Reference data API tests - commodities, ports, partners, etc."""
    
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
    
    def test_list_commodities(self):
        """Test listing commodities"""
        response = requests.get(f"{BASE_URL}/api/commodities", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) > 0, "Should have at least one commodity"
    
    def test_list_ports(self):
        """Test listing ports"""
        response = requests.get(f"{BASE_URL}/api/ports", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
    
    def test_list_partners(self):
        """Test listing partners (sellers, buyers, brokers)"""
        response = requests.get(f"{BASE_URL}/api/partners", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
    
    def test_list_vessels(self):
        """Test listing vessels"""
        response = requests.get(f"{BASE_URL}/api/vessels", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
    
    def test_list_origins(self):
        """Test listing origins"""
        response = requests.get(f"{BASE_URL}/api/origins", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)


class TestVendorsEndpoints:
    """Vendors API tests"""
    
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
    
    def test_list_vendors(self):
        """Test listing vendors"""
        response = requests.get(f"{BASE_URL}/api/vendors", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)


class TestDocInstructionsEndpoints:
    """Documentary Instructions API tests"""
    
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
    
    def test_list_doc_instructions(self):
        """Test listing documentary instructions"""
        response = requests.get(f"{BASE_URL}/api/doc-instructions", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
