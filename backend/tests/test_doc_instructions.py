"""
Test Documentary Instructions API endpoints
Tests for:
- Port dropdown format (Name, Country)
- Surveyor label changes (Buyer Surveyor at Load Port)
- Seller Surveyor field auto-population from trade
- CRUD operations for DI
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "username": "salih.karagoz",
        "password": "salih123"
    })
    assert response.status_code == 200, f"Login failed: {response.text}"
    return response.json().get("token")

@pytest.fixture(scope="module")
def auth_headers(auth_token):
    """Headers with auth token"""
    return {
        "Authorization": f"Bearer {auth_token}",
        "Content-Type": "application/json"
    }


class TestPortsAPI:
    """Test ports API returns data with name and country for dropdown display"""
    
    def test_ports_returns_name_and_country(self, auth_headers):
        """Verify ports have name, type, and country fields for 'Name, Country' display"""
        response = requests.get(f"{BASE_URL}/api/ports", headers=auth_headers)
        assert response.status_code == 200
        
        ports = response.json()
        assert len(ports) > 0, "No ports returned"
        
        # Check discharge ports have required fields
        discharge_ports = [p for p in ports if p.get('type') == 'discharge']
        assert len(discharge_ports) > 0, "No discharge ports found"
        
        for port in discharge_ports[:5]:  # Check first 5
            assert 'name' in port, f"Port missing 'name' field: {port}"
            assert 'country' in port, f"Port missing 'country' field: {port}"
            assert port['name'], f"Port name is empty: {port}"
            assert port['country'], f"Port country is empty: {port}"
            print(f"Port: {port['name']}, {port['country']}")
    
    def test_discharge_ports_have_turkish_ports(self, auth_headers):
        """Verify Turkish discharge ports exist (e.g., Samsun, Türkiye)"""
        response = requests.get(f"{BASE_URL}/api/ports", headers=auth_headers)
        assert response.status_code == 200
        
        ports = response.json()
        turkish_discharge = [p for p in ports if p.get('type') == 'discharge' and 'Türkiye' in p.get('country', '')]
        assert len(turkish_discharge) > 0, "No Turkish discharge ports found"
        print(f"Found {len(turkish_discharge)} Turkish discharge ports")


class TestTradesAPI:
    """Test trades API returns sellerSurveyor field"""
    
    def test_trades_have_seller_surveyor_field(self, auth_headers):
        """Verify trades include sellerSurveyor field for auto-population"""
        response = requests.get(f"{BASE_URL}/api/trades", headers=auth_headers)
        assert response.status_code == 200
        
        trades = response.json()
        assert len(trades) > 0, "No trades returned"
        
        # Check if any trade has sellerSurveyor
        trades_with_seller_surveyor = [t for t in trades if t.get('sellerSurveyor')]
        print(f"Found {len(trades_with_seller_surveyor)} trades with sellerSurveyor")
        
        if trades_with_seller_surveyor:
            trade = trades_with_seller_surveyor[0]
            print(f"Trade {trade.get('pirContractNumber', trade.get('id'))} has sellerSurveyor: {trade['sellerSurveyor']}")
            assert isinstance(trade['sellerSurveyor'], str)


class TestDocInstructionsAPI:
    """Test Documentary Instructions CRUD with sellerSurveyor field"""
    
    def test_list_doc_instructions(self, auth_headers):
        """Test listing documentary instructions"""
        response = requests.get(f"{BASE_URL}/api/doc-instructions/", headers=auth_headers)
        assert response.status_code == 200
        assert isinstance(response.json(), list)
    
    def test_create_di_with_seller_surveyor(self, auth_headers):
        """Test creating DI with sellerSurveyor field"""
        # First get a trade with sellerSurveyor
        trades_response = requests.get(f"{BASE_URL}/api/trades", headers=auth_headers)
        assert trades_response.status_code == 200
        trades = trades_response.json()
        
        # Find a trade with sellerSurveyor
        trade_with_surveyor = None
        for t in trades:
            if t.get('sellerSurveyor'):
                trade_with_surveyor = t
                break
        
        if not trade_with_surveyor:
            pytest.skip("No trade with sellerSurveyor found")
        
        trade_id = trade_with_surveyor['id']
        seller_surveyor = trade_with_surveyor['sellerSurveyor']
        
        # Create DI
        di_data = {
            "tradeId": trade_id,
            "dischargePort": "Samsun, Türkiye",
            "surveyor": "Test Buyer Surveyor",
            "sellerSurveyor": seller_surveyor,
            "consigneeOption": "to_order",
            "notifyOption": "buyer_details"
        }
        
        response = requests.post(f"{BASE_URL}/api/doc-instructions/", json=di_data, headers=auth_headers)
        assert response.status_code == 200, f"Failed to create DI: {response.text}"
        
        created_di = response.json()
        assert 'id' in created_di
        assert created_di.get('sellerSurveyor') == seller_surveyor, f"sellerSurveyor not saved correctly"
        print(f"Created DI with sellerSurveyor: {created_di.get('sellerSurveyor')}")
        
        # Cleanup - delete the created DI
        delete_response = requests.delete(f"{BASE_URL}/api/doc-instructions/{created_di['id']}", headers=auth_headers)
        assert delete_response.status_code == 200
    
    def test_create_di_auto_populates_seller_surveyor(self, auth_headers):
        """Test that creating DI without sellerSurveyor auto-populates from trade"""
        # Get a trade with sellerSurveyor
        trades_response = requests.get(f"{BASE_URL}/api/trades", headers=auth_headers)
        trades = trades_response.json()
        
        trade_with_surveyor = None
        for t in trades:
            if t.get('sellerSurveyor'):
                trade_with_surveyor = t
                break
        
        if not trade_with_surveyor:
            pytest.skip("No trade with sellerSurveyor found")
        
        trade_id = trade_with_surveyor['id']
        expected_seller_surveyor = trade_with_surveyor['sellerSurveyor']
        
        # Create DI WITHOUT sellerSurveyor - should auto-populate
        di_data = {
            "tradeId": trade_id,
            "dischargePort": "Karasu, Türkiye",
            "surveyor": "Test Surveyor",
            "consigneeOption": "to_order",
            "notifyOption": "buyer_details"
        }
        
        response = requests.post(f"{BASE_URL}/api/doc-instructions/", json=di_data, headers=auth_headers)
        assert response.status_code == 200, f"Failed to create DI: {response.text}"
        
        created_di = response.json()
        assert created_di.get('sellerSurveyor') == expected_seller_surveyor, \
            f"sellerSurveyor not auto-populated. Expected: {expected_seller_surveyor}, Got: {created_di.get('sellerSurveyor')}"
        print(f"Auto-populated sellerSurveyor: {created_di.get('sellerSurveyor')}")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/doc-instructions/{created_di['id']}", headers=auth_headers)
    
    def test_update_di_preserves_seller_surveyor(self, auth_headers):
        """Test updating DI preserves sellerSurveyor field"""
        # Get a trade
        trades_response = requests.get(f"{BASE_URL}/api/trades", headers=auth_headers)
        trades = trades_response.json()
        
        trade_with_surveyor = None
        for t in trades:
            if t.get('sellerSurveyor'):
                trade_with_surveyor = t
                break
        
        if not trade_with_surveyor:
            pytest.skip("No trade with sellerSurveyor found")
        
        trade_id = trade_with_surveyor['id']
        
        # Create DI
        di_data = {
            "tradeId": trade_id,
            "dischargePort": "Mersin, Türkiye",
            "surveyor": "Initial Surveyor",
            "sellerSurveyor": "Initial Seller Surveyor",
            "consigneeOption": "to_order"
        }
        
        create_response = requests.post(f"{BASE_URL}/api/doc-instructions/", json=di_data, headers=auth_headers)
        assert create_response.status_code == 200
        created_di = create_response.json()
        di_id = created_di['id']
        
        # Update DI - change surveyor but not sellerSurveyor
        update_data = {
            "surveyor": "Updated Buyer Surveyor"
        }
        
        update_response = requests.put(f"{BASE_URL}/api/doc-instructions/{di_id}", json=update_data, headers=auth_headers)
        assert update_response.status_code == 200
        
        updated_di = update_response.json()
        assert updated_di.get('surveyor') == "Updated Buyer Surveyor"
        assert updated_di.get('sellerSurveyor') == "Initial Seller Surveyor", "sellerSurveyor should be preserved"
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/doc-instructions/{di_id}", headers=auth_headers)
    
    def test_get_di_returns_seller_surveyor(self, auth_headers):
        """Test GET single DI returns sellerSurveyor field"""
        # Get a trade
        trades_response = requests.get(f"{BASE_URL}/api/trades", headers=auth_headers)
        trades = trades_response.json()
        
        if not trades:
            pytest.skip("No trades found")
        
        trade = trades[0]
        
        # Create DI
        di_data = {
            "tradeId": trade['id'],
            "dischargePort": "Gemlik, Türkiye",
            "sellerSurveyor": "Test Seller Surveyor"
        }
        
        create_response = requests.post(f"{BASE_URL}/api/doc-instructions/", json=di_data, headers=auth_headers)
        assert create_response.status_code == 200
        created_di = create_response.json()
        di_id = created_di['id']
        
        # GET the DI
        get_response = requests.get(f"{BASE_URL}/api/doc-instructions/{di_id}", headers=auth_headers)
        assert get_response.status_code == 200
        
        fetched_di = get_response.json()
        assert 'sellerSurveyor' in fetched_di
        assert fetched_di['sellerSurveyor'] == "Test Seller Surveyor"
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/doc-instructions/{di_id}", headers=auth_headers)


class TestSurveyorsAPI:
    """Test surveyors API for buyer surveyor dropdown"""
    
    def test_surveyors_list(self, auth_headers):
        """Test surveyors endpoint returns list for dropdown"""
        response = requests.get(f"{BASE_URL}/api/surveyors", headers=auth_headers)
        assert response.status_code == 200
        
        surveyors = response.json()
        assert isinstance(surveyors, list)
        print(f"Found {len(surveyors)} surveyors")
        
        if surveyors:
            surveyor = surveyors[0]
            assert 'name' in surveyor, "Surveyor missing 'name' field"
            print(f"Sample surveyor: {surveyor.get('name')}")
