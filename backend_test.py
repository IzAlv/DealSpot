#!/usr/bin/env python3

import requests
import sys
import json
from datetime import datetime

class CommodityTradingAPITester:
    def __init__(self, base_url="https://grain-logistics-hub-1.preview.emergentagent.com"):
        self.base_url = base_url
        self.token = None
        self.tests_run = 0
        self.tests_passed = 0
        self.test_results = []

    def log_result(self, test_name, success, details=""):
        """Log test result"""
        self.tests_run += 1
        if success:
            self.tests_passed += 1
            print(f"✅ {test_name} - PASSED")
        else:
            print(f"❌ {test_name} - FAILED: {details}")
        
        self.test_results.append({
            "test": test_name,
            "success": success,
            "details": details
        })

    def run_test(self, name, method, endpoint, expected_status, data=None, files=None):
        """Run a single API test"""
        url = f"{self.base_url}/{endpoint}"
        headers = {'Content-Type': 'application/json'}
        if self.token:
            headers['Authorization'] = f'Bearer {self.token}'
        
        if files:
            headers.pop('Content-Type', None)  # Let requests set it for multipart

        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, timeout=10)
            elif method == 'POST':
                if files:
                    response = requests.post(url, headers={k:v for k,v in headers.items() if k != 'Content-Type'}, files=files, data=data, timeout=10)
                else:
                    response = requests.post(url, json=data, headers=headers, timeout=10)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=headers, timeout=10)
            elif method == 'DELETE':
                response = requests.delete(url, headers=headers, timeout=10)

            success = response.status_code == expected_status
            if success:
                self.log_result(name, True)
                try:
                    return True, response.json()
                except:
                    return True, response.text
            else:
                self.log_result(name, False, f"Expected {expected_status}, got {response.status_code} - {response.text[:200]}")
                return False, {}

        except Exception as e:
            self.log_result(name, False, f"Exception: {str(e)}")
            return False, {}

    def test_health_check(self):
        """Test health endpoint"""
        print("\n🔍 Testing Health Check...")
        return self.run_test("Health Check", "GET", "api/health", 200)

    def test_login_valid(self):
        """Test login with valid credentials"""
        print("\n🔍 Testing Valid Login...")
        success, response = self.run_test(
            "Valid Login (salihkaragoz/salih123)",
            "POST",
            "api/auth/login",
            200,
            data={"username": "salihkaragoz", "password": "salih123"}
        )
        if success and 'token' in response:
            self.token = response['token']
            print(f"   Token obtained: {self.token[:20]}...")
            return True
        return False

    def test_login_invalid(self):
        """Test login with invalid credentials"""
        print("\n🔍 Testing Invalid Login...")
        return self.run_test(
            "Invalid Login (wrong credentials)",
            "POST",
            "api/auth/login",
            401,
            data={"username": "wronguser", "password": "wrongpass"}
        )

    def test_auth_me(self):
        """Test getting current user info"""
        print("\n🔍 Testing Auth Me...")
        return self.run_test("Get Current User", "GET", "api/auth/me", 200)

    def test_trades_crud(self):
        """Test trades CRUD operations"""
        print("\n🔍 Testing Trades CRUD...")
        
        # List trades
        success, trades = self.run_test("List Trades", "GET", "api/trades", 200)
        if not success:
            return False
        
        # Get trade stats
        self.run_test("Trade Stats", "GET", "api/trades/stats/overview", 200)
        
        # Search trades
        self.run_test("Search Trades", "GET", "api/trades?search=PIR", 200)
        
        # Filter trades by status
        self.run_test("Filter Trades by Status", "GET", "api/trades?status=pending", 200)
        
        # Get partners and commodities for trade creation
        success, partners = self.run_test("Get Partners for Trade", "GET", "api/partners", 200)
        success, commodities = self.run_test("Get Commodities for Trade", "GET", "api/commodities", 200)
        
        if not partners or not commodities:
            print("   Skipping trade creation - no reference data")
            return True
            
        # Create new trade
        buyers = [p for p in partners if p.get('type') == 'buyer']
        sellers = [p for p in partners if p.get('type') == 'seller']
        
        if buyers and sellers and commodities:
            trade_data = {
                "buyerId": buyers[0]['id'],
                "sellerId": sellers[0]['id'],
                "commodityId": commodities[0]['id'],
                "origin": "Turkey",
                "quantity": 5000,
                "unit": "MT",
                "price": 350.50,
                "priceUnit": "USD/MT",
                "currency": "USD",
                "contractNumber": "TEST-001",
                "status": "pending",
                "brokerage": 2.5,
                "brokerageUnit": "USD/MT",
                "paymentTerms": "LC at sight",
                "notes": "Test trade created by automated testing"
            }
            
            success, new_trade = self.run_test("Create Trade", "POST", "api/trades", 200, data=trade_data)
            
            if success and 'id' in new_trade:
                trade_id = new_trade['id']
                
                # Get specific trade
                self.run_test("Get Trade by ID", "GET", f"api/trades/{trade_id}", 200)
                
                # Update trade
                update_data = {
                    "quantity": 6000,
                    "price": 360.00,
                    "status": "ongoing",
                    "notes": "Updated by automated testing"
                }
                self.run_test("Update Trade", "PUT", f"api/trades/{trade_id}", 200, data=update_data)
                
                # Delete trade
                self.run_test("Delete Trade", "DELETE", f"api/trades/{trade_id}", 200)
        
        return True

    def test_partners_crud(self):
        """Test partners CRUD operations"""
        print("\n🔍 Testing Partners CRUD...")
        
        # List all partners
        self.run_test("List All Partners", "GET", "api/partners", 200)
        
        # Filter by type
        self.run_test("List Buyers", "GET", "api/partners?type=buyer", 200)
        self.run_test("List Sellers", "GET", "api/partners?type=seller", 200)
        self.run_test("List Co-Brokers", "GET", "api/partners?type=co-broker", 200)
        
        # Search partners
        self.run_test("Search Partners", "GET", "api/partners?search=Trade", 200)
        
        # Create new partner
        partner_data = {
            "companyName": "Test Trading Co",
            "contactPerson": "John Doe",
            "address": "123 Test Street",
            "city": "Test City",
            "country": "Test Country",
            "email": "test@testtrading.com",
            "phone": "+1-555-0123",
            "type": "buyer"
        }
        
        success, new_partner = self.run_test("Create Partner", "POST", "api/partners", 200, data=partner_data)
        
        if success and 'id' in new_partner:
            partner_id = new_partner['id']
            
            # Get specific partner
            self.run_test("Get Partner by ID", "GET", f"api/partners/{partner_id}", 200)
            
            # Update partner
            update_data = {
                "companyName": "Updated Test Trading Co",
                "contactPerson": "Jane Doe",
                "type": "seller"
            }
            self.run_test("Update Partner", "PUT", f"api/partners/{partner_id}", 200, data=update_data)
            
            # Delete partner
            self.run_test("Delete Partner", "DELETE", f"api/partners/{partner_id}", 200)
        
        return True

    def test_vessels_crud(self):
        """Test vessels CRUD operations"""
        print("\n🔍 Testing Vessels CRUD...")
        
        # List vessels
        self.run_test("List Vessels", "GET", "api/vessels", 200)
        
        # Search vessels
        self.run_test("Search Vessels", "GET", "api/vessels?search=Star", 200)
        
        # Create new vessel
        vessel_data = {
            "name": "MV Test Vessel",
            "imo": "1234567",
            "flag": "Test Flag",
            "dwt": 50000,
            "built": "2023",
            "vesselType": "Bulk Carrier"
        }
        
        success, new_vessel = self.run_test("Create Vessel", "POST", "api/vessels", 200, data=vessel_data)
        
        if success and 'id' in new_vessel:
            vessel_id = new_vessel['id']
            
            # Update vessel
            update_data = {
                "name": "MV Updated Test Vessel",
                "dwt": 55000,
                "built": "2024"
            }
            self.run_test("Update Vessel", "PUT", f"api/vessels/{vessel_id}", 200, data=update_data)
            
            # Delete vessel
            self.run_test("Delete Vessel", "DELETE", f"api/vessels/{vessel_id}", 200)
        
        return True

    def test_documents(self):
        """Test documents functionality"""
        print("\n🔍 Testing Documents...")
        
        # List documents
        self.run_test("List Documents", "GET", "api/documents", 200)
        
        # Test document upload (create a simple text file)
        test_content = "This is a test document for automated testing"
        files = {'file': ('test_document.txt', test_content, 'text/plain')}
        form_data = {
            'docType': 'Contract',
            'tradeId': '',
            'tradeRef': 'TEST-DOC'
        }
        
        success, new_doc = self.run_test("Upload Document", "POST", "api/documents", 200, data=form_data, files=files)
        
        if success and 'id' in new_doc:
            doc_id = new_doc['id']
            # Delete document
            self.run_test("Delete Document", "DELETE", f"api/documents/{doc_id}", 200)
        
        return True

    def test_reference_data(self):
        """Test reference data endpoints"""
        print("\n🔍 Testing Reference Data...")
        
        # Test commodities
        self.run_test("List Commodities", "GET", "api/commodities", 200)
        
        # Test origins
        self.run_test("List Origins", "GET", "api/origins", 200)
        
        # Test ports
        self.run_test("List Ports", "GET", "api/ports", 200)
        
        # Test surveyors
        self.run_test("List Surveyors", "GET", "api/surveyors", 200)
        
        return True

    def test_events(self):
        """Test events functionality"""
        print("\n🔍 Testing Events...")
        
        # List events
        self.run_test("List Events", "GET", "api/events", 200)
        
        # Create new event
        event_data = {
            "title": "Test Event",
            "date": "2024-12-31",
            "time": "10:00",
            "description": "Test event created by automated testing",
            "type": "meeting"
        }
        
        success, new_event = self.run_test("Create Event", "POST", "api/events", 200, data=event_data)
        
        if success and 'id' in new_event:
            event_id = new_event['id']
            # Delete event
            self.run_test("Delete Event", "DELETE", f"api/events/{event_id}", 200)
        
        return True

    def run_all_tests(self):
        """Run all tests"""
        print("🚀 Starting Commodity Trading API Tests")
        print(f"📍 Base URL: {self.base_url}")
        print("=" * 60)
        
        # Health check first
        self.test_health_check()
        
        # Authentication tests
        if not self.test_login_valid():
            print("❌ Login failed - stopping tests")
            return False
        
        self.test_login_invalid()
        self.test_auth_me()
        
        # Main functionality tests
        self.test_trades_crud()
        self.test_partners_crud()
        self.test_vessels_crud()
        self.test_documents()
        self.test_reference_data()
        self.test_events()
        
        # Print summary
        print("\n" + "=" * 60)
        print(f"📊 Test Summary: {self.tests_passed}/{self.tests_run} tests passed")
        
        if self.tests_passed == self.tests_run:
            print("🎉 All tests passed!")
            return True
        else:
            print(f"⚠️  {self.tests_run - self.tests_passed} tests failed")
            return False

def main():
    tester = CommodityTradingAPITester()
    success = tester.run_all_tests()
    
    # Save detailed results
    with open('/app/backend_test_results.json', 'w') as f:
        json.dump({
            'timestamp': datetime.now().isoformat(),
            'total_tests': tester.tests_run,
            'passed_tests': tester.tests_passed,
            'success_rate': (tester.tests_passed / tester.tests_run * 100) if tester.tests_run > 0 else 0,
            'results': tester.test_results
        }, f, indent=2)
    
    return 0 if success else 1

if __name__ == "__main__":
    sys.exit(main())