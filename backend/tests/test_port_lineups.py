"""
Port Line-Ups API Tests
Tests for the port lineups feature including:
- GET /api/port-lineups/dates - List all available report dates
- GET /api/port-lineups/report/{date} - Get report data for a specific date
- GET /api/port-lineups/summary - Get summary of latest report
- POST /api/port-lineups/upload - Upload Excel file (not tested here - requires file)
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestPortLineupsAuth:
    """Test authentication requirements for port lineups endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
    
    def test_dates_requires_auth(self):
        """GET /api/port-lineups/dates should require authentication"""
        response = self.session.get(f"{BASE_URL}/api/port-lineups/dates")
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
    
    def test_report_requires_auth(self):
        """GET /api/port-lineups/report/{date} should require authentication"""
        response = self.session.get(f"{BASE_URL}/api/port-lineups/report/19.03.2026")
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
    
    def test_summary_requires_auth(self):
        """GET /api/port-lineups/summary should require authentication"""
        response = self.session.get(f"{BASE_URL}/api/port-lineups/summary")
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"


class TestPortLineupsDates:
    """Test GET /api/port-lineups/dates endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        # Login to get token
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "username": "salih.karagoz",
            "password": "salih123"
        })
        assert login_response.status_code == 200, "Login failed"
        token = login_response.json().get("token")
        self.session.headers.update({"Authorization": f"Bearer {token}"})
    
    def test_get_dates_returns_list(self):
        """GET /api/port-lineups/dates should return list of dates"""
        response = self.session.get(f"{BASE_URL}/api/port-lineups/dates")
        assert response.status_code == 200
        data = response.json()
        assert "dates" in data
        assert isinstance(data["dates"], list)
    
    def test_dates_sorted_descending(self):
        """Dates should be sorted newest first (descending)"""
        response = self.session.get(f"{BASE_URL}/api/port-lineups/dates")
        assert response.status_code == 200
        dates = response.json()["dates"]
        assert len(dates) > 0, "No dates found"
        # First date should be the latest (19.03.2026)
        assert dates[0] == "19.03.2026", f"Expected latest date 19.03.2026, got {dates[0]}"
    
    def test_dates_count_is_92(self):
        """Should have 92 dates as per uploaded data"""
        response = self.session.get(f"{BASE_URL}/api/port-lineups/dates")
        assert response.status_code == 200
        dates = response.json()["dates"]
        assert len(dates) == 92, f"Expected 92 dates, got {len(dates)}"


class TestPortLineupsReport:
    """Test GET /api/port-lineups/report/{date} endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        # Login to get token
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "username": "salih.karagoz",
            "password": "salih123"
        })
        assert login_response.status_code == 200, "Login failed"
        token = login_response.json().get("token")
        self.session.headers.update({"Authorization": f"Bearer {token}"})
    
    def test_get_report_for_latest_date(self):
        """GET /api/port-lineups/report/19.03.2026 should return report data"""
        response = self.session.get(f"{BASE_URL}/api/port-lineups/report/19.03.2026")
        assert response.status_code == 200
        data = response.json()
        assert "reportDate" in data
        assert data["reportDate"] == "19.03.2026"
        assert "ports" in data
        assert isinstance(data["ports"], list)
    
    def test_report_has_12_ports(self):
        """Latest report should have 12 ports"""
        response = self.session.get(f"{BASE_URL}/api/port-lineups/report/19.03.2026")
        assert response.status_code == 200
        ports = response.json()["ports"]
        assert len(ports) == 12, f"Expected 12 ports, got {len(ports)}"
    
    def test_port_data_structure(self):
        """Each port should have portName and vessels array"""
        response = self.session.get(f"{BASE_URL}/api/port-lineups/report/19.03.2026")
        assert response.status_code == 200
        ports = response.json()["ports"]
        for port in ports:
            assert "portName" in port, "Port missing portName"
            assert "vessels" in port, "Port missing vessels"
            assert isinstance(port["vessels"], list), "vessels should be a list"
    
    def test_vessel_data_structure(self):
        """Each vessel should have required fields"""
        response = self.session.get(f"{BASE_URL}/api/port-lineups/report/19.03.2026")
        assert response.status_code == 200
        ports = response.json()["ports"]
        # Check first port's first vessel
        vessel = ports[0]["vessels"][0]
        required_fields = ["vesselName", "loadingPort", "arrivalDate", "status", 
                          "operation", "cargo", "blTonnage", "buyer", "seller"]
        for field in required_fields:
            assert field in vessel, f"Vessel missing field: {field}"
    
    def test_report_not_found(self):
        """GET /api/port-lineups/report/{invalid_date} should return 404"""
        response = self.session.get(f"{BASE_URL}/api/port-lineups/report/99.99.9999")
        assert response.status_code == 404
    
    def test_port_names_include_turkish_chars(self):
        """Port names should include Turkish characters"""
        response = self.session.get(f"{BASE_URL}/api/port-lineups/report/19.03.2026")
        assert response.status_code == 200
        ports = response.json()["ports"]
        port_names = [p["portName"] for p in ports]
        # Check for Turkish characters in port names
        has_turkish = any("İ" in name or "Ğ" in name for name in port_names)
        assert has_turkish, f"Expected Turkish characters in port names: {port_names}"


class TestPortLineupsSummary:
    """Test GET /api/port-lineups/summary endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        # Login to get token
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "username": "salih.karagoz",
            "password": "salih123"
        })
        assert login_response.status_code == 200, "Login failed"
        token = login_response.json().get("token")
        self.session.headers.update({"Authorization": f"Bearer {token}"})
    
    def test_summary_returns_latest_date(self):
        """Summary should return the latest date"""
        response = self.session.get(f"{BASE_URL}/api/port-lineups/summary")
        assert response.status_code == 200
        data = response.json()
        assert data["latestDate"] == "19.03.2026"
    
    def test_summary_has_port_counts(self):
        """Summary should include port vessel counts"""
        response = self.session.get(f"{BASE_URL}/api/port-lineups/summary")
        assert response.status_code == 200
        data = response.json()
        assert "ports" in data
        assert len(data["ports"]) == 12
        for port in data["ports"]:
            assert "portName" in port
            assert "vesselCount" in port
            assert isinstance(port["vesselCount"], int)
    
    def test_summary_total_vessels(self):
        """Summary should include total vessel count"""
        response = self.session.get(f"{BASE_URL}/api/port-lineups/summary")
        assert response.status_code == 200
        data = response.json()
        assert "totalVessels" in data
        assert data["totalVessels"] == 146, f"Expected 146 vessels, got {data['totalVessels']}"
    
    def test_summary_total_dates(self):
        """Summary should include total dates count"""
        response = self.session.get(f"{BASE_URL}/api/port-lineups/summary")
        assert response.status_code == 200
        data = response.json()
        assert "totalDates" in data
        assert data["totalDates"] == 92, f"Expected 92 dates, got {data['totalDates']}"


class TestDaysSinceCalculation:
    """Test days since arrival calculation logic"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        # Login to get token
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "username": "salih.karagoz",
            "password": "salih123"
        })
        assert login_response.status_code == 200, "Login failed"
        token = login_response.json().get("token")
        self.session.headers.update({"Authorization": f"Bearer {token}"})
    
    def test_vessel_has_arrival_date(self):
        """Vessels should have arrival dates for days calculation"""
        response = self.session.get(f"{BASE_URL}/api/port-lineups/report/19.03.2026")
        assert response.status_code == 200
        ports = response.json()["ports"]
        # Find a vessel with arrival date
        found_arrival = False
        for port in ports:
            for vessel in port["vessels"]:
                if vessel.get("arrivalDate"):
                    found_arrival = True
                    # Verify date format is DD.MM.YYYY
                    parts = vessel["arrivalDate"].split(".")
                    assert len(parts) == 3, f"Invalid date format: {vessel['arrivalDate']}"
                    break
            if found_arrival:
                break
        assert found_arrival, "No vessels with arrival dates found"


class TestStatusValues:
    """Test vessel status values"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        # Login to get token
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "username": "salih.karagoz",
            "password": "salih123"
        })
        assert login_response.status_code == 200, "Login failed"
        token = login_response.json().get("token")
        self.session.headers.update({"Authorization": f"Bearer {token}"})
    
    def test_status_values_are_valid(self):
        """Vessel status should be one of: RIHTIMDA, DEMIR/DEMİR, AYRILDI"""
        response = self.session.get(f"{BASE_URL}/api/port-lineups/report/19.03.2026")
        assert response.status_code == 200
        ports = response.json()["ports"]
        valid_statuses = {"RIHTIMDA", "DEMIR", "DEMİR", "AYRILDI", ""}
        for port in ports:
            for vessel in port["vessels"]:
                status = vessel.get("status", "")
                assert status in valid_statuses, f"Invalid status: {status}"


class TestSearchFunctionality:
    """Test that data supports search functionality"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        # Login to get token
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "username": "salih.karagoz",
            "password": "salih123"
        })
        assert login_response.status_code == 200, "Login failed"
        token = login_response.json().get("token")
        self.session.headers.update({"Authorization": f"Bearer {token}"})
    
    def test_vessels_have_searchable_fields(self):
        """Vessels should have fields for search: vesselName, cargo, buyer, seller"""
        response = self.session.get(f"{BASE_URL}/api/port-lineups/report/19.03.2026")
        assert response.status_code == 200
        ports = response.json()["ports"]
        vessel = ports[0]["vessels"][0]
        # All searchable fields should exist
        assert "vesselName" in vessel
        assert "cargo" in vessel
        assert "buyer" in vessel
        assert "seller" in vessel
        # At least some should have values
        has_values = (vessel.get("vesselName") or vessel.get("cargo") or 
                     vessel.get("buyer") or vessel.get("seller"))
        assert has_values, "Vessel should have at least one searchable field with value"
