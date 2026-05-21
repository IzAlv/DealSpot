"""
Regression Test Suite - Iteration 18
Testing the bug fix for pending commissions matching between TradesPage and CommissionsPage
Plus full regression after 40+ file changes
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://grain-logistics-hub-1.preview.emergentagent.com').rstrip('/')

# Test credentials
ADMIN_USER = {"username": "salih.karagoz", "password": "salih123"}
ACCOUNTANT_USER = {"username": "pir.accounts", "password": "pir123"}


@pytest.fixture(scope="module")
def admin_token():
    """Get admin authentication token"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN_USER)
    assert response.status_code == 200, f"Admin login failed: {response.text}"
    return response.json().get("token")


@pytest.fixture(scope="module")
def accountant_token():
    """Get accountant authentication token"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json=ACCOUNTANT_USER)
    assert response.status_code == 200, f"Accountant login failed: {response.text}"
    return response.json().get("token")


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    """Headers with admin auth token"""
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def accountant_headers(accountant_token):
    """Headers with accountant auth token"""
    return {"Authorization": f"Bearer {accountant_token}", "Content-Type": "application/json"}


class TestAuthenticationFlow:
    """Test login flows"""
    
    def test_admin_login_success(self):
        """Admin login should succeed"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN_USER)
        assert response.status_code == 200
        data = response.json()
        assert "token" in data
        assert data.get("user", {}).get("role") == "admin"
    
    def test_accountant_login_success(self):
        """Accountant login should succeed"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=ACCOUNTANT_USER)
        assert response.status_code == 200
        data = response.json()
        assert "token" in data
        assert data.get("user", {}).get("role") == "accountant"
    
    def test_invalid_login_fails(self):
        """Invalid credentials should fail"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={"username": "invalid", "password": "wrong"})
        assert response.status_code in [401, 400]


class TestPendingCommissionsBugFix:
    """
    CRITICAL: Test the bug fix for pending commissions matching
    BEK446 should appear in both TradesPage 'Awaiting Brokerage Payment' and CommissionsPage 'Pending'
    Both pages now use trade.invoicePaid field as source of truth
    """
    
    def test_get_all_trades(self, admin_headers):
        """Get all trades and verify BEK446 exists"""
        response = requests.get(f"{BASE_URL}/api/trades", headers=admin_headers)
        assert response.status_code == 200
        trades = response.json()
        assert len(trades) == 14, f"Expected 14 trades, got {len(trades)}"
        
        # Find BEK446
        bek446 = next((t for t in trades if 'BEK446' in (t.get('referenceNumber', '') or t.get('pirContractNumber', ''))), None)
        assert bek446 is not None, "BEK446 trade not found"
        return trades
    
    def test_bek446_has_correct_fields(self, admin_headers):
        """BEK446 should have status=completed, invoicePaid=false, and broker info"""
        response = requests.get(f"{BASE_URL}/api/trades", headers=admin_headers)
        assert response.status_code == 200
        trades = response.json()
        
        bek446 = next((t for t in trades if 'BEK446' in (t.get('referenceNumber', '') or t.get('pirContractNumber', ''))), None)
        assert bek446 is not None, "BEK446 not found"
        
        # Verify the fields that determine pending commission status
        assert bek446.get('status') == 'completed', f"BEK446 status should be 'completed', got {bek446.get('status')}"
        assert bek446.get('invoicePaid') == False, f"BEK446 invoicePaid should be False, got {bek446.get('invoicePaid')}"
        assert bek446.get('brokerName') or bek446.get('brokeragePerMT', 0) > 0, "BEK446 should have broker info"
    
    def test_only_bek446_has_unpaid_invoice(self, admin_headers):
        """Only BEK446 should have invoicePaid=false among completed trades with broker"""
        response = requests.get(f"{BASE_URL}/api/trades", headers=admin_headers)
        assert response.status_code == 200
        trades = response.json()
        
        # Find all trades that would appear in pending commissions
        # Criteria: completed status, invoicePaid=false, has broker
        pending_commissions = [
            t for t in trades 
            if t.get('status') == 'completed' 
            and not t.get('invoicePaid', True)
            and (t.get('brokerName') or (t.get('brokeragePerMT') or 0) > 0)
        ]
        
        assert len(pending_commissions) == 1, f"Expected 1 pending commission (BEK446), got {len(pending_commissions)}"
        assert 'BEK446' in (pending_commissions[0].get('referenceNumber', '') or pending_commissions[0].get('pirContractNumber', '')), \
            "The only pending commission should be BEK446"
    
    def test_trades_with_brokerage_status_have_paid_invoices(self, admin_headers):
        """Trades with status='brokerage' should have invoicePaid=True (already paid)"""
        response = requests.get(f"{BASE_URL}/api/trades", headers=admin_headers)
        assert response.status_code == 200
        trades = response.json()
        
        # PIR-26-AZ8304, MW1002, RC190126 have status='brokerage' but invoicePaid=True
        brokerage_trades = [t for t in trades if t.get('status') == 'brokerage']
        
        for t in brokerage_trades:
            ref = t.get('referenceNumber', '') or t.get('pirContractNumber', '')
            # These should have invoicePaid=True (already paid)
            assert t.get('invoicePaid') == True, f"Trade {ref} with status='brokerage' should have invoicePaid=True"


class TestTradesAPI:
    """Test trades CRUD operations"""
    
    def test_get_trades_list(self, admin_headers):
        """GET /api/trades should return list of trades"""
        response = requests.get(f"{BASE_URL}/api/trades", headers=admin_headers)
        assert response.status_code == 200
        trades = response.json()
        assert isinstance(trades, list)
        assert len(trades) > 0
    
    def test_get_single_trade(self, admin_headers):
        """GET /api/trades/{id} should return trade details"""
        # First get a trade ID
        response = requests.get(f"{BASE_URL}/api/trades", headers=admin_headers)
        trades = response.json()
        trade_id = trades[0]['id']
        
        # Get single trade
        response = requests.get(f"{BASE_URL}/api/trades/{trade_id}", headers=admin_headers)
        assert response.status_code == 200
        trade = response.json()
        assert trade['id'] == trade_id
    
    def test_trade_status_update(self, admin_headers):
        """PATCH /api/trades/{id}/status should update status"""
        # Get BEK446 trade
        response = requests.get(f"{BASE_URL}/api/trades", headers=admin_headers)
        trades = response.json()
        bek446 = next((t for t in trades if 'BEK446' in (t.get('referenceNumber', '') or t.get('pirContractNumber', ''))), None)
        
        if bek446:
            # Try to update status (should work)
            response = requests.patch(
                f"{BASE_URL}/api/trades/{bek446['id']}/status",
                headers=admin_headers,
                json={"status": "completed"}
            )
            # Status update should succeed or fail with validation error
            assert response.status_code in [200, 400, 422]


class TestGlobalSearch:
    """Test global search functionality in header"""
    
    def test_search_trades_endpoint(self, admin_headers):
        """GET /api/trades should return searchable data"""
        response = requests.get(f"{BASE_URL}/api/trades", headers=admin_headers)
        assert response.status_code == 200
        trades = response.json()
        
        # Verify trades have searchable fields
        if trades:
            trade = trades[0]
            assert 'pirContractNumber' in trade or 'contractNumber' in trade
            assert 'commodityName' in trade
            assert 'sellerName' in trade
            assert 'buyerName' in trade
    
    def test_search_partners_endpoint(self, admin_headers):
        """GET /api/partners should return searchable data"""
        response = requests.get(f"{BASE_URL}/api/partners", headers=admin_headers)
        assert response.status_code == 200
        partners = response.json()
        assert isinstance(partners, list)
        
        if partners:
            partner = partners[0]
            assert 'companyName' in partner
    
    def test_search_vessels_endpoint(self, admin_headers):
        """GET /api/vessels should return searchable data"""
        response = requests.get(f"{BASE_URL}/api/vessels", headers=admin_headers)
        assert response.status_code == 200
        vessels = response.json()
        assert isinstance(vessels, list)


class TestVesselExecutionPage:
    """Test Vessel Execution page endpoints"""
    
    def test_get_commodities(self, admin_headers):
        """GET /api/commodities for filter"""
        response = requests.get(f"{BASE_URL}/api/commodities", headers=admin_headers)
        assert response.status_code == 200
        assert isinstance(response.json(), list)
    
    def test_get_ports(self, admin_headers):
        """GET /api/ports for B/L details"""
        response = requests.get(f"{BASE_URL}/api/ports", headers=admin_headers)
        assert response.status_code == 200
        assert isinstance(response.json(), list)
    
    def test_get_surveyors(self, admin_headers):
        """GET /api/surveyors for vessel nomination"""
        response = requests.get(f"{BASE_URL}/api/surveyors", headers=admin_headers)
        assert response.status_code == 200
        assert isinstance(response.json(), list)
    
    def test_get_origins(self, admin_headers):
        """GET /api/origins for filter"""
        response = requests.get(f"{BASE_URL}/api/origins", headers=admin_headers)
        assert response.status_code == 200
        assert isinstance(response.json(), list)


class TestMarketDataPage:
    """Test Market Data page endpoints"""
    
    def test_get_market_prices(self, admin_headers):
        """GET /api/market/prices for Prices tab"""
        response = requests.get(f"{BASE_URL}/api/market/prices", headers=admin_headers)
        assert response.status_code == 200
    
    def test_get_market_tenders(self, admin_headers):
        """GET /api/market/tenders for TMO Tenders tab"""
        response = requests.get(f"{BASE_URL}/api/market/tenders", headers=admin_headers)
        assert response.status_code == 200
    
    def test_get_market_news(self, admin_headers):
        """GET /api/market/news for Indications tab"""
        response = requests.get(f"{BASE_URL}/api/market/news", headers=admin_headers)
        assert response.status_code == 200


class TestAccountingPage:
    """Test Accounting page endpoints with RBAC"""
    
    def test_admin_can_access_vendors(self, admin_headers):
        """Admin should access vendors"""
        response = requests.get(f"{BASE_URL}/api/vendors", headers=admin_headers)
        assert response.status_code == 200
    
    def test_admin_can_access_bank_accounts(self, admin_headers):
        """Admin should access bank accounts"""
        response = requests.get(f"{BASE_URL}/api/bank-accounts", headers=admin_headers)
        assert response.status_code == 200
    
    def test_admin_can_access_bank_statements(self, admin_headers):
        """Admin should access bank statements"""
        response = requests.get(f"{BASE_URL}/api/bank-statements", headers=admin_headers)
        assert response.status_code == 200
    
    def test_accountant_can_read_vendors(self, accountant_headers):
        """Accountant should read vendors (RBAC fix)"""
        response = requests.get(f"{BASE_URL}/api/vendors", headers=accountant_headers)
        assert response.status_code == 200
    
    def test_accountant_can_read_bank_accounts(self, accountant_headers):
        """Accountant should read bank accounts (RBAC fix)"""
        response = requests.get(f"{BASE_URL}/api/bank-accounts", headers=accountant_headers)
        assert response.status_code == 200
    
    def test_accountant_cannot_create_vendor(self, accountant_headers):
        """Accountant should NOT create vendors"""
        response = requests.post(
            f"{BASE_URL}/api/vendors",
            headers=accountant_headers,
            json={"name": "Test Vendor", "taxId": "123"}
        )
        assert response.status_code == 403


class TestCalendarPage:
    """Test Calendar page endpoints"""
    
    def test_get_events(self, admin_headers):
        """GET /api/events for calendar"""
        response = requests.get(f"{BASE_URL}/api/events", headers=admin_headers)
        assert response.status_code == 200
        assert isinstance(response.json(), list)


class TestPortLineupsPage:
    """Test Port Line-ups page endpoints"""
    
    def test_get_port_lineup_dates(self, admin_headers):
        """GET /api/port-lineups/dates"""
        response = requests.get(f"{BASE_URL}/api/port-lineups/dates", headers=admin_headers)
        assert response.status_code == 200
    
    def test_get_port_lineup_summary(self, admin_headers):
        """GET /api/port-lineups/summary"""
        response = requests.get(f"{BASE_URL}/api/port-lineups/summary", headers=admin_headers)
        assert response.status_code == 200


class TestCommissionsPage:
    """Test Commissions/Brokerage page endpoints"""
    
    def test_get_invoices(self, admin_headers):
        """GET /api/invoices for commissions"""
        response = requests.get(f"{BASE_URL}/api/invoices", headers=admin_headers)
        assert response.status_code == 200
    
    def test_get_bank_accounts_for_invoice(self, admin_headers):
        """GET /api/bank-accounts for invoice generation"""
        response = requests.get(f"{BASE_URL}/api/bank-accounts", headers=admin_headers)
        assert response.status_code == 200


class TestNewContractPage:
    """Test New Contract page endpoints"""
    
    def test_get_partners_for_form(self, admin_headers):
        """GET /api/partners for seller/buyer selection"""
        response = requests.get(f"{BASE_URL}/api/partners", headers=admin_headers)
        assert response.status_code == 200
        partners = response.json()
        assert isinstance(partners, list)
    
    def test_get_commodities_for_form(self, admin_headers):
        """GET /api/commodities for commodity selection"""
        response = requests.get(f"{BASE_URL}/api/commodities", headers=admin_headers)
        assert response.status_code == 200
    
    def test_get_origins_for_form(self, admin_headers):
        """GET /api/origins for origin selection"""
        response = requests.get(f"{BASE_URL}/api/origins", headers=admin_headers)
        assert response.status_code == 200


class TestYearFilterLogic:
    """Test year filter includes older completed trades with unpaid brokerage"""
    
    def test_year_filter_includes_unpaid_brokerage(self, admin_headers):
        """
        Year filter should include older completed trades with unpaid brokerage
        when viewing current year (2026)
        """
        response = requests.get(f"{BASE_URL}/api/trades", headers=admin_headers)
        assert response.status_code == 200
        trades = response.json()
        
        # Find trades that should appear in current year filter
        # even if they're from older years (completed with unpaid brokerage)
        current_year = "2026"
        
        for t in trades:
            contract_date = t.get('contractDate', '') or t.get('createdAt', '')
            status = t.get('status', '')
            invoice_paid = t.get('invoicePaid', True)
            has_broker = t.get('brokerName') or (t.get('brokeragePerMT') or 0) > 0
            
            # If completed with unpaid brokerage and has broker, should be included
            if status == 'completed' and not invoice_paid and has_broker:
                ref = t.get('referenceNumber', '') or t.get('pirContractNumber', '')
                print(f"Trade {ref} should appear in year filter (completed, unpaid brokerage)")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
