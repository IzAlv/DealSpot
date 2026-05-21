"""
Test suite for Admin Password Change Feature
Tests the PUT /api/users/{user_id} endpoint for password changes
and the full flow of admin changing another user's password
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_USER = {"username": "salih.karagoz", "password": "salih123"}
NON_ADMIN_USER = {"username": "pir.accounts", "password": "pir123"}
NON_ADMIN_USER_ID = "69bea753bbc40685a90bd528"  # pir.accounts user ID

# Test password for changing
TEST_PASSWORD = "testpass456"
ORIGINAL_PASSWORD = "pir123"


class TestAdminPasswordChange:
    """Tests for admin password change functionality"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test fixtures"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
    def get_admin_token(self):
        """Get admin authentication token"""
        response = self.session.post(f"{BASE_URL}/api/auth/login", json=ADMIN_USER)
        if response.status_code == 200:
            return response.json().get("token")
        pytest.skip(f"Admin login failed: {response.status_code} - {response.text}")
        
    def get_non_admin_token(self, password=ORIGINAL_PASSWORD):
        """Get non-admin authentication token"""
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "username": NON_ADMIN_USER["username"],
            "password": password
        })
        if response.status_code == 200:
            return response.json().get("token")
        return None
    
    # ─── Test 1: Admin Login Works ───────────────────────────────
    def test_admin_login_success(self):
        """Test that admin user can login successfully"""
        response = self.session.post(f"{BASE_URL}/api/auth/login", json=ADMIN_USER)
        
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        data = response.json()
        assert "token" in data, "Token not in response"
        assert "user" in data, "User not in response"
        assert data["user"]["role"] == "admin", "User is not admin"
        assert data["user"]["username"] == ADMIN_USER["username"]
        print(f"✓ Admin login successful: {data['user']['name']}")
    
    # ─── Test 2: List Users Endpoint ─────────────────────────────
    def test_list_users(self):
        """Test that admin can list all users"""
        token = self.get_admin_token()
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        
        response = self.session.get(f"{BASE_URL}/api/users")
        
        assert response.status_code == 200, f"List users failed: {response.text}"
        users = response.json()
        assert isinstance(users, list), "Response should be a list"
        assert len(users) > 0, "Should have at least one user"
        
        # Verify pir.accounts user exists
        pir_user = next((u for u in users if u["username"] == "pir.accounts"), None)
        assert pir_user is not None, "pir.accounts user not found"
        assert pir_user["role"] == "user", "pir.accounts should be non-admin"
        print(f"✓ Listed {len(users)} users, found pir.accounts")
    
    # ─── Test 3: Admin Can Update User Fields ────────────────────
    def test_admin_can_update_user_fields(self):
        """Test that admin can update user fields (name, email, role)"""
        token = self.get_admin_token()
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        
        # Update user name
        response = self.session.put(
            f"{BASE_URL}/api/users/{NON_ADMIN_USER_ID}",
            json={"name": "Hasine Updated"}
        )
        
        assert response.status_code == 200, f"Update user failed: {response.text}"
        data = response.json()
        assert data["name"] == "Hasine Updated", "Name not updated"
        print("✓ Admin can update user fields")
        
        # Revert the name
        self.session.put(
            f"{BASE_URL}/api/users/{NON_ADMIN_USER_ID}",
            json={"name": "Hasine"}
        )
    
    # ─── Test 4: Admin Can Change User Password ──────────────────
    def test_admin_can_change_user_password(self):
        """Test that admin can change another user's password"""
        token = self.get_admin_token()
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        
        # Change password
        response = self.session.put(
            f"{BASE_URL}/api/users/{NON_ADMIN_USER_ID}",
            json={"password": TEST_PASSWORD}
        )
        
        assert response.status_code == 200, f"Password change failed: {response.text}"
        print("✓ Admin changed user password successfully")
        
        # Verify new password works
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "username": NON_ADMIN_USER["username"],
            "password": TEST_PASSWORD
        })
        
        assert login_response.status_code == 200, f"Login with new password failed: {login_response.text}"
        print("✓ User can login with new password")
        
        # Verify old password no longer works
        old_login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "username": NON_ADMIN_USER["username"],
            "password": ORIGINAL_PASSWORD
        })
        
        assert old_login_response.status_code == 401, "Old password should not work"
        print("✓ Old password no longer works")
        
        # CLEANUP: Reset password back to original
        reset_response = self.session.put(
            f"{BASE_URL}/api/users/{NON_ADMIN_USER_ID}",
            json={"password": ORIGINAL_PASSWORD}
        )
        assert reset_response.status_code == 200, "Failed to reset password"
        print("✓ Password reset to original")
    
    # ─── Test 5: Non-Admin Cannot Change Passwords ───────────────
    def test_non_admin_cannot_change_password(self):
        """Test that non-admin users get 403 when trying to change passwords"""
        # First login as non-admin
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "username": NON_ADMIN_USER["username"],
            "password": ORIGINAL_PASSWORD
        })
        
        if login_response.status_code != 200:
            pytest.skip(f"Non-admin login failed: {login_response.text}")
        
        non_admin_token = login_response.json().get("token")
        self.session.headers.update({"Authorization": f"Bearer {non_admin_token}"})
        
        # Try to change admin user's password
        admin_user_id = "69be779f4843796c8e5fee17"  # salih.karagoz ID
        response = self.session.put(
            f"{BASE_URL}/api/users/{admin_user_id}",
            json={"password": "hackedpassword"}
        )
        
        assert response.status_code == 403, f"Expected 403, got {response.status_code}: {response.text}"
        assert "admin" in response.json().get("detail", "").lower(), "Error should mention admin"
        print("✓ Non-admin correctly blocked from changing passwords (403)")
    
    # ─── Test 6: Full Password Change Flow ───────────────────────
    def test_full_password_change_flow(self):
        """Test the complete flow: admin changes password, user logs in with new password"""
        # Step 1: Admin login
        admin_token = self.get_admin_token()
        self.session.headers.update({"Authorization": f"Bearer {admin_token}"})
        
        # Step 2: Get users list
        users_response = self.session.get(f"{BASE_URL}/api/users")
        assert users_response.status_code == 200
        users = users_response.json()
        
        # Find pir.accounts user
        target_user = next((u for u in users if u["username"] == "pir.accounts"), None)
        assert target_user is not None, "Target user not found"
        
        # Step 3: Change password
        new_password = "newpass789"
        change_response = self.session.put(
            f"{BASE_URL}/api/users/{target_user['id']}",
            json={"password": new_password}
        )
        assert change_response.status_code == 200, f"Password change failed: {change_response.text}"
        
        # Step 4: Verify user can login with new password
        new_session = requests.Session()
        new_session.headers.update({"Content-Type": "application/json"})
        
        login_response = new_session.post(f"{BASE_URL}/api/auth/login", json={
            "username": "pir.accounts",
            "password": new_password
        })
        assert login_response.status_code == 200, f"Login with new password failed: {login_response.text}"
        
        user_data = login_response.json()["user"]
        assert user_data["username"] == "pir.accounts"
        print("✓ Full password change flow completed successfully")
        
        # CLEANUP: Reset password
        reset_response = self.session.put(
            f"{BASE_URL}/api/users/{target_user['id']}",
            json={"password": ORIGINAL_PASSWORD}
        )
        assert reset_response.status_code == 200
        print("✓ Password reset to original for cleanup")


class TestEdgeCases:
    """Edge case tests for password change"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
    def get_admin_token(self):
        response = self.session.post(f"{BASE_URL}/api/auth/login", json=ADMIN_USER)
        if response.status_code == 200:
            return response.json().get("token")
        pytest.skip("Admin login failed")
    
    def test_empty_password_field(self):
        """Test that empty password field doesn't change password"""
        token = self.get_admin_token()
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        
        # Send empty password
        response = self.session.put(
            f"{BASE_URL}/api/users/{NON_ADMIN_USER_ID}",
            json={"password": ""}
        )
        
        # Should succeed but not change password (empty string is falsy)
        assert response.status_code == 200
        
        # Verify original password still works
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "username": NON_ADMIN_USER["username"],
            "password": ORIGINAL_PASSWORD
        })
        assert login_response.status_code == 200, "Original password should still work"
        print("✓ Empty password field doesn't change password")
    
    def test_update_without_password(self):
        """Test that updating other fields doesn't affect password"""
        token = self.get_admin_token()
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        
        # Update only email
        response = self.session.put(
            f"{BASE_URL}/api/users/{NON_ADMIN_USER_ID}",
            json={"email": "test@example.com"}
        )
        assert response.status_code == 200
        
        # Verify password still works
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "username": NON_ADMIN_USER["username"],
            "password": ORIGINAL_PASSWORD
        })
        assert login_response.status_code == 200, "Password should still work after email update"
        
        # Revert email
        self.session.put(
            f"{BASE_URL}/api/users/{NON_ADMIN_USER_ID}",
            json={"email": "office@opg-bg.com"}
        )
        print("✓ Updating other fields doesn't affect password")
    
    def test_unauthenticated_request(self):
        """Test that unauthenticated requests are rejected"""
        response = self.session.put(
            f"{BASE_URL}/api/users/{NON_ADMIN_USER_ID}",
            json={"password": "hackedpassword"}
        )
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("✓ Unauthenticated requests are rejected")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
