"""
Test Bank Accounts CRUD API
Tests: /api/bank-accounts endpoints for Create, Read, Update, Delete operations
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestBankAccountsAPI:
    """Bank Accounts CRUD API tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup - get auth token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as admin
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "username": "salih.karagoz",
            "password": "salih123"
        })
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        token = login_response.json().get("token")
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        
        yield
        
        # Cleanup - delete any test bank accounts created
        try:
            accounts = self.session.get(f"{BASE_URL}/api/bank-accounts").json()
            for acc in accounts:
                if acc.get("accountName", "").startswith("TEST_"):
                    self.session.delete(f"{BASE_URL}/api/bank-accounts/{acc['id']}")
        except:
            pass
    
    def test_list_bank_accounts(self):
        """Test GET /api/bank-accounts returns list"""
        response = self.session.get(f"{BASE_URL}/api/bank-accounts")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"✓ GET /api/bank-accounts returns {len(data)} accounts")
        
        # Check if existing account 'PIR GRAIN AND PULSES LTD' exists
        pir_account = next((acc for acc in data if "PIR GRAIN" in acc.get("accountName", "")), None)
        if pir_account:
            print(f"✓ Found existing account: {pir_account.get('accountName')} at {pir_account.get('bankName')}")
            assert "id" in pir_account, "Account should have id"
            assert "accountName" in pir_account, "Account should have accountName"
            assert "bankName" in pir_account, "Account should have bankName"
    
    def test_create_bank_account(self):
        """Test POST /api/bank-accounts creates new account"""
        new_account = {
            "accountName": "TEST_New Account",
            "bankName": "TEST Bank",
            "currency": "EUR",
            "iban": "DE89370400440532013000",
            "bic": "COBADEFFXXX",
            "address": "123 Test Street\nTest City, 12345"
        }
        
        response = self.session.post(f"{BASE_URL}/api/bank-accounts", json=new_account)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "id" in data, "Response should have id"
        assert data["accountName"] == new_account["accountName"], "Account name should match"
        assert data["bankName"] == new_account["bankName"], "Bank name should match"
        assert data["currency"] == new_account["currency"], "Currency should match"
        assert data["iban"] == new_account["iban"], "IBAN should match"
        assert data["bic"] == new_account["bic"], "BIC should match"
        assert data["address"] == new_account["address"], "Address should match"
        
        print(f"✓ POST /api/bank-accounts created account with id: {data['id']}")
        
        # Verify it appears in list
        list_response = self.session.get(f"{BASE_URL}/api/bank-accounts")
        accounts = list_response.json()
        created = next((acc for acc in accounts if acc["id"] == data["id"]), None)
        assert created is not None, "Created account should appear in list"
        print(f"✓ Created account verified in list")
        
        return data["id"]
    
    def test_update_bank_account(self):
        """Test PUT /api/bank-accounts/{id} updates account"""
        # First create an account
        new_account = {
            "accountName": "TEST_Update Account",
            "bankName": "Original Bank",
            "currency": "USD",
            "iban": "US12345678901234567890",
            "bic": "CHASUS33",
            "address": "Original Address"
        }
        
        create_response = self.session.post(f"{BASE_URL}/api/bank-accounts", json=new_account)
        assert create_response.status_code == 200
        account_id = create_response.json()["id"]
        
        # Update the account
        update_data = {
            "accountName": "TEST_Updated Account Name",
            "bankName": "Updated Bank Name",
            "currency": "GBP",
            "iban": "GB82WEST12345698765432",
            "bic": "WESTGB2L",
            "address": "Updated Address\nNew City"
        }
        
        update_response = self.session.put(f"{BASE_URL}/api/bank-accounts/{account_id}", json=update_data)
        assert update_response.status_code == 200, f"Expected 200, got {update_response.status_code}: {update_response.text}"
        
        updated = update_response.json()
        assert updated["accountName"] == update_data["accountName"], "Account name should be updated"
        assert updated["bankName"] == update_data["bankName"], "Bank name should be updated"
        assert updated["currency"] == update_data["currency"], "Currency should be updated"
        assert updated["iban"] == update_data["iban"], "IBAN should be updated"
        assert updated["bic"] == update_data["bic"], "BIC should be updated"
        assert updated["address"] == update_data["address"], "Address should be updated"
        
        print(f"✓ PUT /api/bank-accounts/{account_id} updated successfully")
        
        # Verify persistence with GET
        list_response = self.session.get(f"{BASE_URL}/api/bank-accounts")
        accounts = list_response.json()
        persisted = next((acc for acc in accounts if acc["id"] == account_id), None)
        assert persisted is not None, "Updated account should exist"
        assert persisted["accountName"] == update_data["accountName"], "Update should persist"
        print(f"✓ Update verified in list")
    
    def test_delete_bank_account(self):
        """Test DELETE /api/bank-accounts/{id} removes account"""
        # First create an account
        new_account = {
            "accountName": "TEST_Delete Account",
            "bankName": "Delete Bank",
            "currency": "CHF",
            "iban": "CH9300762011623852957",
            "bic": "UBSWCHZH80A",
            "address": "Delete Address"
        }
        
        create_response = self.session.post(f"{BASE_URL}/api/bank-accounts", json=new_account)
        assert create_response.status_code == 200
        account_id = create_response.json()["id"]
        
        # Delete the account
        delete_response = self.session.delete(f"{BASE_URL}/api/bank-accounts/{account_id}")
        assert delete_response.status_code == 200, f"Expected 200, got {delete_response.status_code}: {delete_response.text}"
        
        data = delete_response.json()
        assert "message" in data, "Response should have message"
        print(f"✓ DELETE /api/bank-accounts/{account_id} returned: {data['message']}")
        
        # Verify removal
        list_response = self.session.get(f"{BASE_URL}/api/bank-accounts")
        accounts = list_response.json()
        deleted = next((acc for acc in accounts if acc["id"] == account_id), None)
        assert deleted is None, "Deleted account should not appear in list"
        print(f"✓ Deleted account verified removed from list")
    
    def test_unauthorized_access(self):
        """Test that unauthenticated requests are rejected"""
        unauth_session = requests.Session()
        unauth_session.headers.update({"Content-Type": "application/json"})
        
        response = unauth_session.get(f"{BASE_URL}/api/bank-accounts")
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print(f"✓ Unauthorized GET /api/bank-accounts returns 401")
    
    def test_accountant_cannot_access(self):
        """Test that accountant role cannot access bank accounts"""
        accountant_session = requests.Session()
        accountant_session.headers.update({"Content-Type": "application/json"})
        
        # Login as accountant
        login_response = accountant_session.post(f"{BASE_URL}/api/auth/login", json={
            "username": "pir.accounts",
            "password": "pir123"
        })
        assert login_response.status_code == 200, f"Accountant login failed: {login_response.text}"
        token = login_response.json().get("token")
        accountant_session.headers.update({"Authorization": f"Bearer {token}"})
        
        # Try to access bank accounts
        response = accountant_session.get(f"{BASE_URL}/api/bank-accounts")
        # Based on the code, non_accountant = require_roles("admin", "user") - accountant should be blocked
        assert response.status_code == 403, f"Expected 403 for accountant, got {response.status_code}"
        print(f"✓ Accountant role correctly blocked from /api/bank-accounts (403)")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
