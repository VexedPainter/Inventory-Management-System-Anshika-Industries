"""
test_opportunities.py
Tests for the Sales Opportunities & WhatsApp Communications module.
"""
import os
os.environ["ALLOW_TEST_ROLE_HEADER"] = "true"

import pytest
from fastapi.testclient import TestClient
from database import init_db, SessionLocal, Customer, SalesOrder, SalesOrderItem, Inventory, Outbox, Item, Procurement, Vendor

# Ensure DB migrations and tables are initialized
init_db()

from app import app

client = TestClient(app)
ADMIN = {"X-User-Role": "admin"}
MGR   = {"X-User-Role": "manager"}
SK    = {"X-User-Role": "storekeeper"}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _first_active_customer():
    db = SessionLocal()
    try:
        return db.query(Customer).filter(Customer.is_active == True).first()
    finally:
        db.close()


def _first_po():
    db = SessionLocal()
    try:
        po = db.query(Procurement).first()
        if po:
            return po.po_number
        # Create a dummy PO if none exists
        vendor = db.query(Vendor).first()
        if not vendor:
            vendor = Vendor(id="VEND-TEST", name="Test Vendor", state="Haryana", city="Gurugram", phone="9810011111")
            db.add(vendor)
            db.commit()
        new_po = Procurement(
            po_number="PO-TEST-001",
            supplier_id=vendor.id,
            status="APPROVED",
            total_amount=5000.0
        )
        db.add(new_po)
        db.commit()
        return new_po.po_number
    finally:
        db.close()


def _create_opted_out_customer():
    db = SessionLocal()
    try:
        cust = Customer(
            name="Opt-Out Test Co",
            gstin=None,
            state="Haryana",
            city="Gurugram",
            phone="+91 9999900001",
            whatsapp_opt_out=True,
        )
        db.add(cust)
        db.commit()
        db.refresh(cust)
        return cust.id
    finally:
        db.close()


# ---------------------------------------------------------------------------
# 1. GET /api/sales/opportunities — basic schema
# ---------------------------------------------------------------------------

def test_opportunities_list_returns_200():
    res = client.get("/api/sales/opportunities", headers=ADMIN)
    assert res.status_code == 200


def test_opportunities_list_schema():
    res = client.get("/api/sales/opportunities", headers=ADMIN)
    data = res.json()
    assert "total_opportunities" in data
    assert "opportunities" in data
    assert isinstance(data["opportunities"], list)
    assert isinstance(data["total_opportunities"], int)


# ---------------------------------------------------------------------------
# 2. Window filter parameter variations
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("window", [7, 14, 30])
def test_opportunities_window_filter(window):
    res = client.get(f"/api/sales/opportunities?window_days={window}", headers=ADMIN)
    assert res.status_code == 200
    data = res.json()
    assert "opportunities" in data


def test_opportunities_no_window_returns_all():
    """When window_days is omitted the endpoint should still succeed."""
    res = client.get("/api/sales/opportunities", headers=ADMIN)
    assert res.status_code == 200


# ---------------------------------------------------------------------------
# 3. Confidence filter
# ---------------------------------------------------------------------------

def test_opportunities_confidence_filter_high():
    res = client.get("/api/sales/opportunities?confidence=HIGH", headers=ADMIN)
    assert res.status_code == 200
    for o in res.json()["opportunities"]:
        assert o["confidence"] == "HIGH"


def test_opportunities_confidence_filter_medium():
    res = client.get("/api/sales/opportunities?confidence=MEDIUM", headers=ADMIN)
    assert res.status_code == 200
    for o in res.json()["opportunities"]:
        assert o["confidence"] == "MEDIUM"


def test_opportunities_confidence_filter_low():
    res = client.get("/api/sales/opportunities?confidence=LOW", headers=ADMIN)
    assert res.status_code == 200
    for o in res.json()["opportunities"]:
        assert o["confidence"] == "LOW"


# ---------------------------------------------------------------------------
# 4. Stock-status filter
# ---------------------------------------------------------------------------

def test_opportunities_stock_filter_covered():
    res = client.get("/api/sales/opportunities?stock_status=COVERED", headers=ADMIN)
    assert res.status_code == 200
    for o in res.json()["opportunities"]:
        assert o["stock_status"] == "COVERED"


def test_opportunities_stock_filter_shortfall():
    res = client.get("/api/sales/opportunities?stock_status=SHORTFALL", headers=ADMIN)
    assert res.status_code == 200
    for o in res.json()["opportunities"]:
        assert o["stock_status"] == "SHORTFALL"


# ---------------------------------------------------------------------------
# 5. Opportunity object fields
# ---------------------------------------------------------------------------

REQUIRED_OPP_FIELDS = [
    "id", "customer_id", "customer_name", "item_id", "sku",
    "cadence_days", "last_order_date", "predicted_date",
    "confidence", "usual_qty", "expected_value",
    "stock_status", "available_stock", "suggested_lines",
]

def test_opportunity_has_required_fields():
    res = client.get("/api/sales/opportunities", headers=ADMIN)
    data = res.json()
    if data["total_opportunities"] == 0:
        pytest.skip("No opportunities in database — seed data first")
    o = data["opportunities"][0]
    for field in REQUIRED_OPP_FIELDS:
        assert field in o, f"Missing field: {field}"


def test_opportunity_suggested_lines_is_list():
    res = client.get("/api/sales/opportunities", headers=ADMIN)
    data = res.json()
    if data["total_opportunities"] == 0:
        pytest.skip("No opportunities in database")
    for o in data["opportunities"]:
        assert isinstance(o["suggested_lines"], list)


def test_opportunity_expected_value_is_numeric():
    res = client.get("/api/sales/opportunities", headers=ADMIN)
    data = res.json()
    for o in data["opportunities"]:
        assert isinstance(o["expected_value"], (int, float))
        assert o["expected_value"] >= 0


def test_opportunity_confidence_valid_values():
    res = client.get("/api/sales/opportunities", headers=ADMIN)
    data = res.json()
    valid = {"HIGH", "MEDIUM", "LOW"}
    for o in data["opportunities"]:
        assert o["confidence"] in valid, f"Unexpected confidence: {o['confidence']}"


def test_opportunity_stock_status_valid_values():
    res = client.get("/api/sales/opportunities", headers=ADMIN)
    data = res.json()
    valid = {"COVERED", "SHORTFALL", "NO_STOCK"}
    for o in data["opportunities"]:
        assert o["stock_status"] in valid, f"Unexpected stock_status: {o['stock_status']}"


# ---------------------------------------------------------------------------
# 6. RBAC on opportunities
# ---------------------------------------------------------------------------

def test_opportunities_accessible_by_storekeeper():
    res = client.get("/api/sales/opportunities", headers=SK)
    assert res.status_code == 200


def test_opportunities_accessible_by_manager():
    res = client.get("/api/sales/opportunities", headers=MGR)
    assert res.status_code == 200


# ---------------------------------------------------------------------------
# 7. Create quote from opportunity
# ---------------------------------------------------------------------------

def test_create_quote_from_opportunity_requires_manager():
    """Storekeeper should be forbidden."""
    res = client.post("/api/sales/opportunities/OPP-999/quote", json={}, headers=SK)
    assert res.status_code == 403


def test_create_quote_nonexistent_opportunity():
    """Non-existent opportunity ID should return 404."""
    res = client.post("/api/sales/opportunities/OPP-DOES-NOT-EXIST-99999/quote",
                      json={}, headers=MGR)
    assert res.status_code == 404


# ---------------------------------------------------------------------------
# 8. GET /api/sales/funnel
# ---------------------------------------------------------------------------

def test_sales_funnel_returns_200():
    res = client.get("/api/sales/funnel", headers=ADMIN)
    assert res.status_code == 200


def test_sales_funnel_schema():
    res = client.get("/api/sales/funnel", headers=ADMIN)
    data = res.json()
    assert "funnel_stages" in data
    assert "conversion_rates" in data
    assert isinstance(data["funnel_stages"], list)
    assert len(data["funnel_stages"]) == 4


def test_sales_funnel_stage_keys():
    res = client.get("/api/sales/funnel", headers=ADMIN)
    data = res.json()
    keys = {s["stage_key"] for s in data["funnel_stages"]}
    assert keys == {"IDENTIFIED", "MESSAGED", "QUOTED", "WON"}


def test_sales_funnel_stage_counts_non_negative():
    res = client.get("/api/sales/funnel", headers=ADMIN)
    data = res.json()
    for stage in data["funnel_stages"]:
        assert stage["count"] >= 0
        assert stage["value"] >= 0


def test_sales_funnel_conversion_rates_schema():
    res = client.get("/api/sales/funnel", headers=ADMIN)
    data = res.json()
    cr = data["conversion_rates"]
    for key in ("identified_to_messaged_pct", "messaged_to_quote_pct", "quote_to_won_pct"):
        assert key in cr, f"Missing conversion_rate key: {key}"
        assert isinstance(cr[key], (int, float))


def test_sales_funnel_accessible_by_manager():
    res = client.get("/api/sales/funnel", headers=MGR)
    assert res.status_code == 200


# ---------------------------------------------------------------------------
# 9. POST /api/communications/whatsapp/preview — English
# ---------------------------------------------------------------------------

def test_whatsapp_preview_opportunity_en():
    cust = _first_active_customer()
    payload = {
        "template_type": "opportunity",
        "ref_id": "OPP-PREVIEW-001",
        "lang": "en",
        "customer_id": cust.id if cust else None,
    }
    res = client.post("/api/communications/whatsapp/preview", json=payload, headers=ADMIN)
    assert res.status_code == 200
    data = res.json()
    assert "message" in data
    assert "wa_link" in data
    assert "opted_out" in data
    assert len(data["message"]) > 20


def test_whatsapp_preview_has_wa_link_format():
    cust = _first_active_customer()
    payload = {
        "template_type": "opportunity",
        "ref_id": "OPP-PREVIEW-002",
        "lang": "en",
        "customer_id": cust.id if cust else None,
    }
    res = client.post("/api/communications/whatsapp/preview", json=payload, headers=ADMIN)
    assert res.status_code == 200
    data = res.json()
    if data.get("wa_link"):
        assert "wa.me" in data["wa_link"] or data["wa_link"].startswith("https://")


# ---------------------------------------------------------------------------
# 10. POST /api/communications/whatsapp/preview — Hindi & PO
# ---------------------------------------------------------------------------

def test_whatsapp_preview_opportunity_hi():
    payload = {
        "template_type": "opportunity",
        "ref_id": "OPP-PREVIEW-003",
        "lang": "hi",
    }
    res = client.post("/api/communications/whatsapp/preview", json=payload, headers=ADMIN)
    assert res.status_code == 200
    data = res.json()
    assert len(data["message"]) > 20


def test_whatsapp_preview_po_en():
    po_no = _first_po()
    payload = {
        "template_type": "po",
        "ref_id": po_no,
        "lang": "en",
    }
    res = client.post("/api/communications/whatsapp/preview", json=payload, headers=ADMIN)
    assert res.status_code == 200
    data = res.json()
    assert len(data["message"]) > 10


# ---------------------------------------------------------------------------
# 11. POST /api/communications/whatsapp/send — simulated
# ---------------------------------------------------------------------------

def test_whatsapp_send_simulated():
    payload = {
        "template_type": "opportunity",
        "ref_id": "OPP-SEND-TEST-001",
        "phone": "9810012345",
        "message": "Test replenishment message from Anishka Industries",
        "lang": "en",
        "customer_id": None,
    }
    res = client.post("/api/communications/whatsapp/send", json=payload, headers=SK)
    assert res.status_code == 200
    data = res.json()
    assert data["dispatch_status"] in ("SENT", "SIMULATED", "FAILED")
    assert "outbox_id" in data
    assert "wa_link" in data


def test_whatsapp_send_creates_outbox_entry():
    payload = {
        "template_type": "opportunity",
        "ref_id": "OPP-SEND-TEST-002",
        "phone": "9810012346",
        "message": "Outbox test message",
        "lang": "en",
        "customer_id": None,
    }
    res = client.post("/api/communications/whatsapp/send", json=payload, headers=MGR)
    assert res.status_code == 200
    outbox_id = res.json().get("outbox_id")
    assert outbox_id is not None

    # Verify entry appears in outbox list
    outbox_res = client.get("/api/outbox", headers=ADMIN)
    assert outbox_res.status_code == 200
    outbox_ids = [m.get("id") for m in outbox_res.json()]
    assert outbox_id in outbox_ids


def test_whatsapp_send_po_template():
    payload = {
        "template_type": "po",
        "ref_id": "PO-SEND-TEST-001",
        "phone": "9810012347",
        "message": "PO dispatch test from Anishka Industries",
        "lang": "en",
        "customer_id": None,
    }
    res = client.post("/api/communications/whatsapp/send", json=payload, headers=MGR)
    assert res.status_code == 200
    data = res.json()
    assert data["dispatch_status"] in ("SENT", "SIMULATED", "FAILED")


# ---------------------------------------------------------------------------
# 12. Opt-out enforcement
# ---------------------------------------------------------------------------

def test_whatsapp_send_opted_out_customer_blocked():
    cust_id = _create_opted_out_customer()

    payload = {
        "template_type": "opportunity",
        "ref_id": "OPP-OPTOUT-TEST",
        "phone": "9999900001",
        "message": "Should be blocked",
        "lang": "en",
        "customer_id": cust_id,
    }
    res = client.post("/api/communications/whatsapp/send", json=payload, headers=MGR)
    assert res.status_code == 400
    assert "opted out" in res.json()["detail"].lower()


def test_whatsapp_preview_shows_opted_out_flag():
    cust_id = _create_opted_out_customer()
    payload = {
        "template_type": "opportunity",
        "ref_id": "OPP-OPTOUT-PREVIEW",
        "lang": "en",
        "customer_id": cust_id,
    }
    res = client.post("/api/communications/whatsapp/preview", json=payload, headers=ADMIN)
    assert res.status_code == 200
    assert res.json()["opted_out"] == True


# ---------------------------------------------------------------------------
# 13. PUT /api/customers/{id}/whatsapp-opt
# ---------------------------------------------------------------------------

def test_customer_whatsapp_opt_toggle():
    cust = _first_active_customer()
    if cust is None:
        pytest.skip("No active customers")
    cust_id = cust.id

    # Set to True
    res1 = client.put(f"/api/customers/{cust_id}/whatsapp-opt",
                      json={"opt_out": True}, headers=MGR)
    assert res1.status_code == 200
    assert res1.json()["whatsapp_opt_out"] == True

    # Set back to False
    res2 = client.put(f"/api/customers/{cust_id}/whatsapp-opt",
                      json={"opt_out": False}, headers=MGR)
    assert res2.status_code == 200
    assert res2.json()["whatsapp_opt_out"] == False


def test_customer_whatsapp_opt_requires_manager():
    cust = _first_active_customer()
    if cust is None:
        pytest.skip("No active customers")
    res = client.put(f"/api/customers/{cust.id}/whatsapp-opt",
                     json={"opt_out": True}, headers=SK)
    assert res.status_code == 403


def test_customer_whatsapp_opt_nonexistent():
    res = client.put("/api/customers/9999999/whatsapp-opt",
                     json={"opt_out": True}, headers=MGR)
    assert res.status_code == 404


# ---------------------------------------------------------------------------
# 14. Customer list includes whatsapp_opt_out field
# ---------------------------------------------------------------------------

def test_customer_response_includes_opt_out():
    res = client.get("/api/customers", headers=ADMIN)
    assert res.status_code == 200
    customers = res.json()
    assert len(customers) > 0
    for c in customers:
        assert "whatsapp_opt_out" in c, f"Missing whatsapp_opt_out on customer {c.get('id')}"


def test_create_customer_with_opt_out_true():
    payload = {
        "name": "WA Opt-Out Customer Test",
        "state": "Delhi",
        "city": "New Delhi",
        "phone": "9811111111",
        "whatsapp_opt_out": True,
    }
    res = client.post("/api/customers", json=payload, headers=MGR)
    assert res.status_code == 200
    data = res.json()
    assert data["whatsapp_opt_out"] == True


def test_create_customer_opt_out_defaults_false():
    payload = {
        "name": "WA Default Opt-In Customer Test",
        "state": "Delhi",
        "city": "New Delhi",
        "phone": "9822222222",
    }
    res = client.post("/api/customers", json=payload, headers=MGR)
    assert res.status_code == 200
    data = res.json()
    assert data["whatsapp_opt_out"] == False


# ---------------------------------------------------------------------------
# 15. Dashboard includes sales_funnel
# ---------------------------------------------------------------------------

def test_dashboard_includes_sales_funnel():
    res = client.get("/api/dashboard", headers=ADMIN)
    assert res.status_code == 200
    data = res.json()
    funnel = data.get("sales_funnel") or data.get("stats", {}).get("sales_funnel")
    assert funnel is not None, "sales_funnel missing from dashboard response"
    assert "funnel_stages" in funnel


def test_dashboard_funnel_has_four_stages():
    res = client.get("/api/dashboard", headers=ADMIN)
    data = res.json()
    funnel = data.get("sales_funnel") or data.get("stats", {}).get("sales_funnel")
    assert len(funnel["funnel_stages"]) == 4


# ---------------------------------------------------------------------------
# 16. GET /api/outbox — channel and sender fields
# ---------------------------------------------------------------------------

def test_outbox_has_channel_field():
    res = client.get("/api/outbox", headers=ADMIN)
    assert res.status_code == 200
    for msg in res.json():
        assert "channel" in msg, f"Missing 'channel' on outbox record {msg.get('id')}"


def test_outbox_has_sender_field():
    res = client.get("/api/outbox", headers=ADMIN)
    assert res.status_code == 200
    for msg in res.json():
        assert "sender" in msg, f"Missing 'sender' on outbox record {msg.get('id')}"


def test_outbox_whatsapp_records_have_recipient_phone():
    payload = {
        "template_type": "opportunity",
        "ref_id": "OPP-OUTBOX-FIELD-TEST",
        "phone": "9810099999",
        "message": "Outbox field test",
        "lang": "en",
        "customer_id": None,
    }
    send_res = client.post("/api/communications/whatsapp/send", json=payload, headers=ADMIN)
    assert send_res.status_code == 200
    outbox_id = send_res.json()["outbox_id"]

    outbox_res = client.get("/api/outbox", headers=ADMIN)
    record = next((m for m in outbox_res.json() if m["id"] == outbox_id), None)
    assert record is not None
    assert record.get("recipient_phone") or record.get("channel") == "WHATSAPP"
