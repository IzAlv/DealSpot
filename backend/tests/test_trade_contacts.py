"""
Test suite for Trade Contacts feature
Tests the ability to select and save Trade Contacts and Execution Contacts for each party
(Seller, Buyer, Broker, Co-Broker) when creating/updating trades.

Partners with contacts in the database:
- Buyers: ADM Turkey (69beabbf9e8ce69a8010003c), Abalıoğlu Yem (69beabbf9e8ce69a8010003b), Agora Yem (69beabbf9e8ce69a8010003d)
- Co-Brokers: Atria Brokers FZCO (69be779f4843796c8e5fee3d), Nord Star LLC (69be779f4843796c8e5fee3e)
- Sellers: None have contacts currently
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test data - Partners with contacts (verified from database)
# Buyers with contacts
BUYER_ID = "69beabbf9e8ce69a8010003b"  # Abalıoğlu Yem San. A.Ş.
BUYER_TRADE_CONTACT = {"name": "Abalıoğlu Yem Trade 1", "email": "trade1@abalıoğluyem.com", "phone": "+2222222"}
BUYER_EXEC_CONTACT = {"name": "Abalıoğlu Yem Exec 1", "email": "exec1@abalıoğluyem.com", "phone": "+3333333"}

BUYER2_ID = "69beabbf9e8ce69a8010003c"  # ADM Turkey
BUYER2_TRADE_CONTACT = {"name": "ADM Turkey Trade 1", "email": "trade1@admturkey.com", "phone": "+2222222"}

# Co-Brokers with contacts
CO_BROKER_ID = "69be779f4843796c8e5fee3d"  # Atria Brokers FZCO
CO_BROKER_TRADE_CONTACT = {"name": "Atria Brokers Trade", "email": "trade@atriabrokers.com", "phone": "+5555555"}
CO_BROKER_EXEC_CONTACT = {"name": "Atria Brokers Exec", "email": "exec@atriabrokers.com", "phone": "+6666666"}

# Sellers (no contacts, but needed for trade creation)
SELLER_ID = "69beb14e46c507adb18e78c5"  # AV Trading Group Inc.

# Commodity
COMMODITY_ID = "69beb4e349d2bb8ec97ea87c"  # 10.5 % Pro. Wheat

# Track created trades for cleanup
created_trade_ids = []


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token for admin user"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "username": "salih.karagoz",
        "password": "salih123"
    })
    assert response.status_code == 200, f"Login failed: {response.text}"
    return response.json()["token"]


@pytest.fixture(scope="module")
def api_client(auth_token):
    """Authenticated requests session"""
    session = requests.Session()
    session.headers.update({
        "Content-Type": "application/json",
        "Authorization": f"Bearer {auth_token}"
    })
    return session


def test_01_create_trade_with_buyer_contacts(api_client):
    """Test POST /api/trades accepts buyerTradeContact and buyerExecutionContact"""
    payload = {
        "sellerId": SELLER_ID,
        "buyerId": BUYER_ID,
        "commodityId": COMMODITY_ID,
        "quantity": 1000,
        "buyerTradeContact": BUYER_TRADE_CONTACT,
        "buyerExecutionContact": BUYER_EXEC_CONTACT,
        "status": "confirmation"
    }
    
    response = api_client.post(f"{BASE_URL}/api/trades", json=payload)
    assert response.status_code == 200, f"Create trade failed: {response.text}"
    
    data = response.json()
    created_trade_ids.append(data["id"])
    
    # Verify buyer contacts are saved
    assert data.get("buyerTradeContact") == BUYER_TRADE_CONTACT, \
        f"buyerTradeContact mismatch: {data.get('buyerTradeContact')}"
    assert data.get("buyerExecutionContact") == BUYER_EXEC_CONTACT, \
        f"buyerExecutionContact mismatch: {data.get('buyerExecutionContact')}"
    
    print(f"✓ Trade created with buyer contacts: {data['id']}")


def test_02_create_trade_with_cobroker_contacts(api_client):
    """Test POST /api/trades accepts coBrokerTradeContact and coBrokerExecutionContact"""
    payload = {
        "sellerId": SELLER_ID,
        "buyerId": BUYER_ID,
        "commodityId": COMMODITY_ID,
        "coBrokerId": CO_BROKER_ID,
        "quantity": 2000,
        "coBrokerTradeContact": CO_BROKER_TRADE_CONTACT,
        "coBrokerExecutionContact": CO_BROKER_EXEC_CONTACT,
        "status": "confirmation"
    }
    
    response = api_client.post(f"{BASE_URL}/api/trades", json=payload)
    assert response.status_code == 200, f"Create trade failed: {response.text}"
    
    data = response.json()
    created_trade_ids.append(data["id"])
    
    # Verify co-broker contacts are saved
    assert data.get("coBrokerTradeContact") == CO_BROKER_TRADE_CONTACT, \
        f"coBrokerTradeContact mismatch: {data.get('coBrokerTradeContact')}"
    assert data.get("coBrokerExecutionContact") == CO_BROKER_EXEC_CONTACT, \
        f"coBrokerExecutionContact mismatch: {data.get('coBrokerExecutionContact')}"
    
    print(f"✓ Trade created with co-broker contacts: {data['id']}")


def test_03_create_trade_with_all_available_contacts(api_client):
    """Test POST /api/trades accepts buyer and co-broker contact fields"""
    payload = {
        "sellerId": SELLER_ID,
        "buyerId": BUYER_ID,
        "commodityId": COMMODITY_ID,
        "coBrokerId": CO_BROKER_ID,
        "quantity": 3000,
        "buyerTradeContact": BUYER_TRADE_CONTACT,
        "buyerExecutionContact": BUYER_EXEC_CONTACT,
        "coBrokerTradeContact": CO_BROKER_TRADE_CONTACT,
        "coBrokerExecutionContact": CO_BROKER_EXEC_CONTACT,
        "status": "confirmation"
    }
    
    response = api_client.post(f"{BASE_URL}/api/trades", json=payload)
    assert response.status_code == 200, f"Create trade failed: {response.text}"
    
    data = response.json()
    created_trade_ids.append(data["id"])
    
    # Verify all contacts are saved
    assert data.get("buyerTradeContact") == BUYER_TRADE_CONTACT
    assert data.get("buyerExecutionContact") == BUYER_EXEC_CONTACT
    assert data.get("coBrokerTradeContact") == CO_BROKER_TRADE_CONTACT
    assert data.get("coBrokerExecutionContact") == CO_BROKER_EXEC_CONTACT
    
    print(f"✓ Trade created with all contacts: {data['id']}")


def test_04_get_trade_returns_contact_fields(api_client):
    """Test GET /api/trades/{id} returns all contact fields"""
    # First create a trade with contacts
    payload = {
        "sellerId": SELLER_ID,
        "buyerId": BUYER_ID,
        "commodityId": COMMODITY_ID,
        "coBrokerId": CO_BROKER_ID,
        "quantity": 4000,
        "buyerTradeContact": BUYER_TRADE_CONTACT,
        "buyerExecutionContact": BUYER_EXEC_CONTACT,
        "coBrokerTradeContact": CO_BROKER_TRADE_CONTACT,
        "coBrokerExecutionContact": CO_BROKER_EXEC_CONTACT,
        "status": "confirmation"
    }
    
    create_response = api_client.post(f"{BASE_URL}/api/trades", json=payload)
    assert create_response.status_code == 200
    trade_id = create_response.json()["id"]
    created_trade_ids.append(trade_id)
    
    # Now GET the trade and verify contacts are returned
    get_response = api_client.get(f"{BASE_URL}/api/trades/{trade_id}")
    assert get_response.status_code == 200, f"Get trade failed: {get_response.text}"
    
    data = get_response.json()
    
    # Verify all contact fields are returned
    assert data.get("buyerTradeContact") == BUYER_TRADE_CONTACT, \
        f"GET buyerTradeContact mismatch: {data.get('buyerTradeContact')}"
    assert data.get("buyerExecutionContact") == BUYER_EXEC_CONTACT
    assert data.get("coBrokerTradeContact") == CO_BROKER_TRADE_CONTACT
    assert data.get("coBrokerExecutionContact") == CO_BROKER_EXEC_CONTACT
    
    print(f"✓ GET /api/trades/{trade_id} returns all contact fields")


def test_05_create_trade_with_null_contacts(api_client):
    """Test POST /api/trades accepts null contact fields"""
    payload = {
        "sellerId": SELLER_ID,
        "buyerId": BUYER_ID,
        "commodityId": COMMODITY_ID,
        "quantity": 5000,
        "buyerTradeContact": None,
        "buyerExecutionContact": None,
        "sellerTradeContact": None,
        "sellerExecutionContact": None,
        "status": "confirmation"
    }
    
    response = api_client.post(f"{BASE_URL}/api/trades", json=payload)
    assert response.status_code == 200, f"Create trade failed: {response.text}"
    
    data = response.json()
    created_trade_ids.append(data["id"])
    
    # Verify null contacts are accepted
    assert data.get("buyerTradeContact") is None
    assert data.get("buyerExecutionContact") is None
    
    print(f"✓ Trade created with null contacts: {data['id']}")


def test_06_update_trade_contacts(api_client):
    """Test PUT /api/trades/{id} can update contact fields"""
    # First create a trade without contacts
    create_payload = {
        "sellerId": SELLER_ID,
        "buyerId": BUYER_ID,
        "commodityId": COMMODITY_ID,
        "quantity": 6000,
        "status": "confirmation"
    }
    
    create_response = api_client.post(f"{BASE_URL}/api/trades", json=create_payload)
    assert create_response.status_code == 200
    trade_id = create_response.json()["id"]
    created_trade_ids.append(trade_id)
    
    # Now update with contacts
    update_payload = {
        "buyerTradeContact": BUYER_TRADE_CONTACT,
        "buyerExecutionContact": BUYER_EXEC_CONTACT
    }
    
    update_response = api_client.put(f"{BASE_URL}/api/trades/{trade_id}", json=update_payload)
    assert update_response.status_code == 200, f"Update trade failed: {update_response.text}"
    
    data = update_response.json()
    assert data.get("buyerTradeContact") == BUYER_TRADE_CONTACT
    assert data.get("buyerExecutionContact") == BUYER_EXEC_CONTACT
    
    # Verify via GET
    get_response = api_client.get(f"{BASE_URL}/api/trades/{trade_id}")
    assert get_response.status_code == 200
    get_data = get_response.json()
    assert get_data.get("buyerTradeContact") == BUYER_TRADE_CONTACT
    
    print(f"✓ Trade contacts updated successfully: {trade_id}")


def test_07_partners_have_contacts_arrays(api_client):
    """Test GET /api/partners returns tradeContacts and executionContacts arrays"""
    response = api_client.get(f"{BASE_URL}/api/partners")
    assert response.status_code == 200, f"Get partners failed: {response.text}"
    
    partners = response.json()
    
    # Find buyer with contacts
    buyer = next((p for p in partners if p["id"] == BUYER_ID), None)
    assert buyer is not None, f"Buyer {BUYER_ID} not found"
    assert "tradeContacts" in buyer, "Buyer missing tradeContacts array"
    assert "executionContacts" in buyer, "Buyer missing executionContacts array"
    assert len(buyer["tradeContacts"]) > 0, "Buyer has no trade contacts"
    
    # Verify contact structure
    tc = buyer["tradeContacts"][0]
    assert "name" in tc, "Trade contact missing name"
    assert "email" in tc, "Trade contact missing email"
    
    print(f"✓ Partners have tradeContacts and executionContacts arrays")


def test_08_get_partner_by_id_returns_contacts(api_client):
    """Test GET /api/partners/{id} returns contact arrays"""
    response = api_client.get(f"{BASE_URL}/api/partners/{BUYER_ID}")
    assert response.status_code == 200, f"Get partner failed: {response.text}"
    
    data = response.json()
    assert "tradeContacts" in data
    assert "executionContacts" in data
    assert len(data["tradeContacts"]) >= 1
    
    print(f"✓ GET /api/partners/{BUYER_ID} returns contact arrays")


def test_09_contact_object_structure(api_client):
    """Test that contact objects have correct structure (name, email, phone)"""
    payload = {
        "sellerId": SELLER_ID,
        "buyerId": BUYER_ID,
        "commodityId": COMMODITY_ID,
        "quantity": 7000,
        "buyerTradeContact": {
            "name": "Test Contact",
            "email": "test@example.com",
            "phone": "+1234567890"
        },
        "status": "confirmation"
    }
    
    response = api_client.post(f"{BASE_URL}/api/trades", json=payload)
    assert response.status_code == 200
    
    data = response.json()
    created_trade_ids.append(data["id"])
    
    contact = data.get("buyerTradeContact")
    assert contact is not None
    assert contact.get("name") == "Test Contact"
    assert contact.get("email") == "test@example.com"
    assert contact.get("phone") == "+1234567890"
    
    print("✓ Contact object structure validated")


def test_10_all_8_contact_fields_accepted(api_client):
    """Test that all 8 contact fields are accepted by the API"""
    payload = {
        "sellerId": SELLER_ID,
        "buyerId": BUYER_ID,
        "commodityId": COMMODITY_ID,
        "coBrokerId": CO_BROKER_ID,
        "quantity": 8000,
        "sellerTradeContact": {"name": "Seller TC", "email": "stc@test.com", "phone": "+1"},
        "sellerExecutionContact": {"name": "Seller EC", "email": "sec@test.com", "phone": "+2"},
        "buyerTradeContact": {"name": "Buyer TC", "email": "btc@test.com", "phone": "+3"},
        "buyerExecutionContact": {"name": "Buyer EC", "email": "bec@test.com", "phone": "+4"},
        "brokerTradeContact": {"name": "Broker TC", "email": "brtc@test.com", "phone": "+5"},
        "brokerExecutionContact": {"name": "Broker EC", "email": "brec@test.com", "phone": "+6"},
        "coBrokerTradeContact": {"name": "CoBroker TC", "email": "cbtc@test.com", "phone": "+7"},
        "coBrokerExecutionContact": {"name": "CoBroker EC", "email": "cbec@test.com", "phone": "+8"},
        "status": "confirmation"
    }
    
    response = api_client.post(f"{BASE_URL}/api/trades", json=payload)
    assert response.status_code == 200, f"Create trade failed: {response.text}"
    
    data = response.json()
    created_trade_ids.append(data["id"])
    
    # Verify all 8 contact fields are saved
    assert data.get("sellerTradeContact", {}).get("name") == "Seller TC"
    assert data.get("sellerExecutionContact", {}).get("name") == "Seller EC"
    assert data.get("buyerTradeContact", {}).get("name") == "Buyer TC"
    assert data.get("buyerExecutionContact", {}).get("name") == "Buyer EC"
    assert data.get("brokerTradeContact", {}).get("name") == "Broker TC"
    assert data.get("brokerExecutionContact", {}).get("name") == "Broker EC"
    assert data.get("coBrokerTradeContact", {}).get("name") == "CoBroker TC"
    assert data.get("coBrokerExecutionContact", {}).get("name") == "CoBroker EC"
    
    print("✓ All 8 contact fields accepted and saved")


def test_99_cleanup(api_client):
    """Cleanup created trades after all tests"""
    for trade_id in created_trade_ids:
        try:
            api_client.delete(f"{BASE_URL}/api/trades/{trade_id}")
            print(f"Cleaned up trade: {trade_id}")
        except Exception as e:
            print(f"Failed to cleanup trade {trade_id}: {e}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
