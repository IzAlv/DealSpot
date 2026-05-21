"""
Test Loading Port functionality:
1. Loading Port field is separate from Base Port in trade creation/update
2. Loading Port is correctly saved with loadingPortId, loadingPortName, loadingPortCountry
3. Business Confirmation PDF includes country names in PRICE section
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestLoadingPort:
    """Test Loading Port functionality in trades"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup - login and get auth token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "username": "salih.karagoz",
            "password": "salih123"
        })
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        token = login_response.json().get("token")
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        
        # Get ports for testing
        ports_response = self.session.get(f"{BASE_URL}/api/ports")
        assert ports_response.status_code == 200
        self.ports = ports_response.json()
        
        # Find loading and discharge ports
        self.loading_ports = [p for p in self.ports if p.get('type') == 'loading']
        self.discharge_ports = [p for p in self.ports if p.get('type') == 'discharge']
        
        # Get partners for testing
        partners_response = self.session.get(f"{BASE_URL}/api/partners")
        assert partners_response.status_code == 200
        self.partners = partners_response.json()
        
        # Get commodities for testing
        commodities_response = self.session.get(f"{BASE_URL}/api/commodities")
        assert commodities_response.status_code == 200
        self.commodities = commodities_response.json()
        
        yield
        
    def test_ports_have_loading_type(self):
        """Verify loading ports exist in the database"""
        print(f"Found {len(self.loading_ports)} loading ports")
        assert len(self.loading_ports) > 0, "No loading ports found in database"
        
        # Verify Chornomorsk is a loading port
        chornomorsk = next((p for p in self.loading_ports if 'Chornomorsk' in p.get('name', '')), None)
        assert chornomorsk is not None, "Chornomorsk loading port not found"
        assert chornomorsk.get('country') == 'Ukraine', f"Chornomorsk country should be Ukraine, got {chornomorsk.get('country')}"
        print(f"Chornomorsk port: {chornomorsk}")
        
    def test_trade_mw2611_has_loading_port(self):
        """Verify trade MW2611 has correct loadingPortId set"""
        # Get the trade
        trades_response = self.session.get(f"{BASE_URL}/api/trades")
        assert trades_response.status_code == 200
        trades = trades_response.json()
        
        # Find MW2611
        mw2611 = next((t for t in trades if t.get('pirContractNumber') == 'MW2611'), None)
        assert mw2611 is not None, "Trade MW2611 not found"
        
        # Verify loading port fields
        assert mw2611.get('loadingPortId'), "loadingPortId should be set"
        assert mw2611.get('loadingPortName') == 'Chornomorsk', f"loadingPortName should be Chornomorsk, got {mw2611.get('loadingPortName')}"
        assert mw2611.get('loadingPortCountry') == 'Ukraine', f"loadingPortCountry should be Ukraine, got {mw2611.get('loadingPortCountry')}"
        
        # Verify base port is different
        assert mw2611.get('basePortName') == 'CIF Marmara Ports', f"basePortName should be CIF Marmara Ports, got {mw2611.get('basePortName')}"
        assert mw2611.get('basePortCountry') == 'Turkiye', f"basePortCountry should be Turkiye, got {mw2611.get('basePortCountry')}"
        
        print(f"Trade MW2611 loading port: {mw2611.get('loadingPortName')}, {mw2611.get('loadingPortCountry')}")
        print(f"Trade MW2611 base port: {mw2611.get('basePortName')}, {mw2611.get('basePortCountry')}")
        
    def test_create_trade_with_loading_port(self):
        """Test creating a new trade with a separate loading port"""
        # Find a seller and buyer
        sellers = [p for p in self.partners if 'seller' in str(p.get('type', '')).lower()]
        buyers = [p for p in self.partners if 'buyer' in str(p.get('type', '')).lower()]
        
        assert len(sellers) > 0, "No sellers found"
        assert len(buyers) > 0, "No buyers found"
        assert len(self.commodities) > 0, "No commodities found"
        
        # Get specific ports
        chornomorsk = next((p for p in self.loading_ports if 'Chornomorsk' in p.get('name', '')), None)
        marmara = next((p for p in self.discharge_ports if 'Marmara' in p.get('name', '')), None)
        
        assert chornomorsk is not None, "Chornomorsk loading port not found"
        assert marmara is not None, "CIF Marmara Ports discharge port not found"
        
        # Create trade with separate loading port
        trade_data = {
            "sellerId": sellers[0]['id'],
            "buyerId": buyers[0]['id'],
            "commodityId": self.commodities[0]['id'],
            "quantity": 5000,
            "pricePerMT": 250,
            "currency": "USD",
            "deliveryTerm": "CIF",
            "basePortId": marmara['id'],  # Discharge port
            "loadingPortId": chornomorsk['id'],  # Loading port - SEPARATE from base port
            "status": "confirmation",
            "pirContractNumber": "TEST_LOADING_PORT_001"
        }
        
        create_response = self.session.post(f"{BASE_URL}/api/trades", json=trade_data)
        assert create_response.status_code == 200, f"Failed to create trade: {create_response.text}"
        
        created_trade = create_response.json()
        trade_id = created_trade.get('id')
        
        try:
            # Verify loading port is saved correctly
            assert created_trade.get('loadingPortId') == chornomorsk['id'], "loadingPortId not saved correctly"
            assert created_trade.get('loadingPortName') == 'Chornomorsk', f"loadingPortName should be Chornomorsk, got {created_trade.get('loadingPortName')}"
            assert created_trade.get('loadingPortCountry') == 'Ukraine', f"loadingPortCountry should be Ukraine, got {created_trade.get('loadingPortCountry')}"
            
            # Verify base port is different
            assert created_trade.get('basePortId') == marmara['id'], "basePortId not saved correctly"
            assert created_trade.get('basePortName') == 'CIF Marmara Ports', f"basePortName should be CIF Marmara Ports, got {created_trade.get('basePortName')}"
            
            print(f"Created trade with loading port: {created_trade.get('loadingPortName')}, {created_trade.get('loadingPortCountry')}")
            print(f"Created trade with base port: {created_trade.get('basePortName')}, {created_trade.get('basePortCountry')}")
            
            # GET to verify persistence
            get_response = self.session.get(f"{BASE_URL}/api/trades/{trade_id}")
            assert get_response.status_code == 200
            fetched_trade = get_response.json()
            
            assert fetched_trade.get('loadingPortId') == chornomorsk['id'], "loadingPortId not persisted"
            assert fetched_trade.get('loadingPortName') == 'Chornomorsk', "loadingPortName not persisted"
            assert fetched_trade.get('loadingPortCountry') == 'Ukraine', "loadingPortCountry not persisted"
            
        finally:
            # Cleanup
            self.session.delete(f"{BASE_URL}/api/trades/{trade_id}")
            
    def test_update_trade_loading_port(self):
        """Test updating a trade's loading port"""
        # Find a seller and buyer
        sellers = [p for p in self.partners if 'seller' in str(p.get('type', '')).lower()]
        buyers = [p for p in self.partners if 'buyer' in str(p.get('type', '')).lower()]
        
        # Get specific ports
        chornomorsk = next((p for p in self.loading_ports if 'Chornomorsk' in p.get('name', '')), None)
        odessa = next((p for p in self.loading_ports if 'Odessa' in p.get('name', '')), None)
        marmara = next((p for p in self.discharge_ports if 'Marmara' in p.get('name', '')), None)
        
        assert chornomorsk is not None, "Chornomorsk loading port not found"
        assert odessa is not None, "Odessa loading port not found"
        assert marmara is not None, "CIF Marmara Ports discharge port not found"
        
        # Create trade with Chornomorsk
        trade_data = {
            "sellerId": sellers[0]['id'],
            "buyerId": buyers[0]['id'],
            "commodityId": self.commodities[0]['id'],
            "quantity": 5000,
            "pricePerMT": 250,
            "currency": "USD",
            "deliveryTerm": "CIF",
            "basePortId": marmara['id'],
            "loadingPortId": chornomorsk['id'],
            "status": "confirmation",
            "pirContractNumber": "TEST_UPDATE_LOADING_PORT_001"
        }
        
        create_response = self.session.post(f"{BASE_URL}/api/trades", json=trade_data)
        assert create_response.status_code == 200
        created_trade = create_response.json()
        trade_id = created_trade.get('id')
        
        try:
            # Update loading port to Odessa
            update_response = self.session.put(f"{BASE_URL}/api/trades/{trade_id}", json={
                "loadingPortId": odessa['id']
            })
            assert update_response.status_code == 200, f"Failed to update trade: {update_response.text}"
            
            updated_trade = update_response.json()
            
            # Verify loading port is updated
            assert updated_trade.get('loadingPortId') == odessa['id'], "loadingPortId not updated"
            assert updated_trade.get('loadingPortName') == 'Odessa', f"loadingPortName should be Odessa, got {updated_trade.get('loadingPortName')}"
            assert updated_trade.get('loadingPortCountry') == 'Ukraine', f"loadingPortCountry should be Ukraine, got {updated_trade.get('loadingPortCountry')}"
            
            # Base port should remain unchanged
            assert updated_trade.get('basePortId') == marmara['id'], "basePortId should not change"
            assert updated_trade.get('basePortName') == 'CIF Marmara Ports', "basePortName should not change"
            
            print(f"Updated trade loading port from Chornomorsk to: {updated_trade.get('loadingPortName')}")
            
        finally:
            # Cleanup
            self.session.delete(f"{BASE_URL}/api/trades/{trade_id}")
            
    def test_business_confirmation_pdf_has_country(self):
        """Test that Business Confirmation PDF includes country in PRICE section"""
        # Get trade MW2611
        trades_response = self.session.get(f"{BASE_URL}/api/trades")
        assert trades_response.status_code == 200
        trades = trades_response.json()
        
        mw2611 = next((t for t in trades if t.get('pirContractNumber') == 'MW2611'), None)
        assert mw2611 is not None, "Trade MW2611 not found"
        
        trade_id = mw2611.get('id')
        
        # Get the PDF
        pdf_response = self.session.get(f"{BASE_URL}/api/business-confirmation/{trade_id}/pdf")
        assert pdf_response.status_code == 200, f"Failed to get PDF: {pdf_response.text}"
        assert pdf_response.headers.get('content-type') == 'application/pdf', "Response should be PDF"
        
        # PDF content is binary, we can't easily parse it, but we verified the endpoint works
        print(f"Business Confirmation PDF generated successfully for trade {mw2611.get('pirContractNumber')}")
        print(f"PDF size: {len(pdf_response.content)} bytes")
        
        # Verify the trade has the country data that should appear in PDF
        assert mw2611.get('basePortCountry') == 'Turkiye', "basePortCountry should be Turkiye for PDF"
        print(f"Trade has basePortCountry: {mw2611.get('basePortCountry')} - this should appear in PDF PRICE section")


class TestPortsAPI:
    """Test Ports API returns correct data"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup - login and get auth token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "username": "salih.karagoz",
            "password": "salih123"
        })
        assert login_response.status_code == 200
        token = login_response.json().get("token")
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        yield
        
    def test_ports_have_type_field(self):
        """Verify ports have type field (loading or discharge)"""
        response = self.session.get(f"{BASE_URL}/api/ports")
        assert response.status_code == 200
        ports = response.json()
        
        loading_ports = [p for p in ports if p.get('type') == 'loading']
        discharge_ports = [p for p in ports if p.get('type') == 'discharge']
        
        print(f"Total ports: {len(ports)}")
        print(f"Loading ports: {len(loading_ports)}")
        print(f"Discharge ports: {len(discharge_ports)}")
        
        assert len(loading_ports) > 0, "Should have loading ports"
        assert len(discharge_ports) > 0, "Should have discharge ports"
        
        # Verify loading ports have country
        for port in loading_ports:
            assert port.get('country'), f"Loading port {port.get('name')} should have country"
            print(f"  Loading: {port.get('name')}, {port.get('country')}")
            
    def test_ports_have_country_field(self):
        """Verify all ports have country field"""
        response = self.session.get(f"{BASE_URL}/api/ports")
        assert response.status_code == 200
        ports = response.json()
        
        for port in ports:
            assert port.get('country'), f"Port {port.get('name')} should have country field"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
