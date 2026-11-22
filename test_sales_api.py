import os
import sys
import datetime
from fastapi.testclient import TestClient

# Ensure test role header is enabled for unit tests
os.environ["ALLOW_TEST_ROLE_HEADER"] = "true"
os.environ["COMPANY_STATE"] = "Haryana"
os.environ["COMPANY_GSTIN"] = "06AAAAA0000A1Z5"

from database import init_db, SessionLocal, Customer, SalesOrder, SalesOrderItem, Invoice, Payment, Inventory, StockMovement
from seed_data import seed_database
from app import app

client = TestClient(app)

ADMIN_HEADERS = {"X-User-Role": "admin"}
MANAGER_HEADERS = {"X-User-Role": "manager"}
STOREKEEPER_HEADERS = {"X-User-Role": "storekeeper"}


def setup_module():
    """Ensure database is seeded before running sales tests."""
    init_db()
    seed_database()


def test_01_customer_crud_and_auth():
    """Test customer creation, reading, and ledger access."""
    # Anonymous request must fail (401) when test headers disabled
    os.environ["ALLOW_TEST_ROLE_HEADER"] = "false"
    res = client.get("/api/customers")
    assert res.status_code == 401
    os.environ["ALLOW_TEST_ROLE_HEADER"] = "true" 

    # Storekeeper can read customers
    res = client.get("/api/customers", headers=STOREKEEPER_HEADERS)
    assert res.status_code == 200
    customers = res.json()
    assert len(customers) >= 12

    # Storekeeper cannot create customer (403)
    new_cust_payload = {
        "name": "Tata Motors Limited Test",
        "gstin": "27AABCT1234F1ZP",
        "state": "Maharashtra",
        "city": "Pune",
        "contact_person": "P. Deshmukh",
        "phone": "+91 98220 11111",
        "email": "procurement@tatamotors.test",
        "price_tier": "Tier-1",
        "credit_limit": 1000000.0,
        "credit_days": 45
    }
    res = client.post("/api/customers", json=new_cust_payload, headers=STOREKEEPER_HEADERS)
    assert res.status_code == 403

    # Manager can create customer
    res = client.post("/api/customers", json=new_cust_payload, headers=MANAGER_HEADERS)
    assert res.status_code == 200
    created = res.json()
    assert created["name"] == "Tata Motors Limited Test"
    assert created["gstin"] == "27AABCT1234F1ZP"
    cust_id = created["id"]

    # Customer ledger
    res = client.get(f"/api/customers/{cust_id}/ledger", headers=STOREKEEPER_HEADERS)
    assert res.status_code == 200
    ledger = res.json()
    assert ledger["customer"]["id"] == cust_id
    assert ledger["outstanding"] == 0.0
    print("  [OK] test_01_customer_crud_and_auth passed.")


def test_02_sales_order_quote_and_margin_visibility():
    """Test creating quotation and verify margin is hidden from storekeeper."""
    db = SessionLocal()
    item = db.query(Inventory).filter(Inventory.quantity > 50).first()
    assert item is not None
    item_id = item.id
    db.close()

    # Create a quotation as Manager
    payload = {
        "customer_id": 1,
        "is_quote": True,
        "valid_until": (datetime.date.today() + datetime.timedelta(days=15)).isoformat(),
        "notes": "Testing quotation margin and roles",
        "items": [
            {
                "item_id": item_id,
                "qty": 5,
                "unit_price": 200.0,
                "discount_pct": 5.0,
                "gst_rate": 18.0
            }
        ]
    }
    res = client.post("/api/sales/orders", json=payload, headers=MANAGER_HEADERS)
    assert res.status_code == 200
    so = res.json()
    assert so["status"] == "QUOTE"
    assert so["order_no"].startswith("ANI-SO-") or so["order_no"].startswith("ANI-QT-")
    so_id = so["id"]

    # Inspect as storekeeper: margin_per_unit should NOT be in items
    res_sk = client.get(f"/api/sales/orders/{so_id}", headers=STOREKEEPER_HEADERS)
    assert res_sk.status_code == 200
    sk_data = res_sk.json()
    assert "margin_per_unit" not in sk_data["items"][0]

    # Inspect as manager: margin_per_unit MUST be present
    res_mgr = client.get(f"/api/sales/orders/{so_id}", headers=MANAGER_HEADERS)
    assert res_mgr.status_code == 200
    mgr_data = res_mgr.json()
    assert "margin_per_unit" in mgr_data["items"][0]
    print("  [OK] test_02_sales_order_quote_and_margin_visibility passed.")


def test_03_credit_limit_enforcement_and_override():
    """Test credit limit blocking and manager override."""
    db = SessionLocal()
    # Create a customer with a very small credit limit
    small_cust = Customer(
        name="Small Credit Workshop",
        gstin="06AABCS9999F1Z1",
        state="Haryana",
        city="Manesar",
        credit_limit=1000.0,
        credit_days=15
    )
    db.add(small_cust)
    db.commit()
    db.refresh(small_cust)
    cust_id = small_cust.id

    item = db.query(Inventory).filter(Inventory.quantity > 50).first()
    item_id = item.id
    db.close()

    # Create a quote exceeding credit limit (total ~ ₹5000)
    payload = {
        "customer_id": cust_id,
        "is_quote": True,
        "items": [
            {
                "item_id": item_id,
                "qty": 10,
                "unit_price": 500.0,
                "discount_pct": 0.0,
                "gst_rate": 18.0
            }
        ]
    }
    res = client.post("/api/sales/orders", json=payload, headers=MANAGER_HEADERS)
    assert res.status_code == 200
    so_id = res.json()["id"]

    # Attempt to confirm without override reason -> 400 Bad Request
    res_conf = client.post(f"/api/sales/orders/{so_id}/confirm", json={}, headers=MANAGER_HEADERS)
    assert res_conf.status_code == 400
    assert "credit limit" in res_conf.json()["detail"].lower()

    # Confirm WITH manager override reason -> 200 OK
    res_override = client.post(
        f"/api/sales/orders/{so_id}/confirm",
        json={"override_reason": "Special MD approval for long-standing client"},
        headers=MANAGER_HEADERS
    )
    assert res_override.status_code == 200
    confirmed_so = res_override.json()
    assert confirmed_so["status"] == "CONFIRMED"
    print("  [OK] test_03_credit_limit_enforcement_and_override passed.")


def test_04_stock_reservation_and_cancellation():
    """Test stock reservation on confirm and release on cancel."""
    db = SessionLocal()
    item = db.query(Inventory).filter(Inventory.quantity > 50).first()
    item_id = item.id
    initial_reserved = item.reserved_qty or 0
    db.close()

    # Create quotation for 10 units
    payload = {
        "customer_id": 1,
        "is_quote": True,
        "items": [{"item_id": item_id, "qty": 10, "unit_price": 100.0, "discount_pct": 0.0, "gst_rate": 18.0}]
    }
    res = client.post("/api/sales/orders", json=payload, headers=ADMIN_HEADERS)
    assert res.status_code == 200
    so_id = res.json()["id"]

    # Verify stock NOT reserved yet
    db = SessionLocal()
    item_now = db.query(Inventory).filter(Inventory.id == item_id).first()
    assert (item_now.reserved_qty or 0) == initial_reserved
    db.close()

    # Confirm order
    res = client.post(f"/api/sales/orders/{so_id}/confirm", json={}, headers=ADMIN_HEADERS)
    assert res.status_code == 200

    # Verify stock is now reserved
    db = SessionLocal()
    item_now = db.query(Inventory).filter(Inventory.id == item_id).first()
    assert item_now.reserved_qty == initial_reserved + 10
    db.close()

    # Cancel order -> reserved stock must be released
    res_cancel = client.post(f"/api/sales/orders/{so_id}/cancel", headers=ADMIN_HEADERS)
    assert res_cancel.status_code == 200

    db = SessionLocal()
    item_now = db.query(Inventory).filter(Inventory.id == item_id).first()
    assert item_now.reserved_qty == initial_reserved
    db.close()
    print("  [OK] test_04_stock_reservation_and_cancellation passed.")


def test_05_storekeeper_role_restriction():
    """Storekeeper can dispatch only; cannot confirm, invoice, or record payments."""
    db = SessionLocal()
    item = db.query(Inventory).filter(Inventory.quantity > 20).first()
    item_id = item.id
    db.close()

    # Manager creates and confirms an order
    payload = {
        "customer_id": 1,
        "is_quote": False,
        "items": [{"item_id": item_id, "qty": 2, "unit_price": 150.0, "discount_pct": 0.0, "gst_rate": 18.0}]
    }
    res = client.post("/api/sales/orders", json=payload, headers=MANAGER_HEADERS)
    assert res.status_code == 200
    so_data = res.json()
    so_id = so_data["id"]

    # Storekeeper tries to cancel -> 403
    res_cancel = client.post(f"/api/sales/orders/{so_id}/cancel", headers=STOREKEEPER_HEADERS)
    assert res_cancel.status_code == 403

    # Storekeeper CAN dispatch!
    dispatch_payload = {
        "reference": "TEST-SK-DISPATCH-01",
        "items": [{"item_id": so_data["items"][0]["id"], "qty": 2}]
    }
    res = client.post(f"/api/sales/orders/{so_id}/dispatch", json=dispatch_payload, headers=STOREKEEPER_HEADERS)
    assert res.status_code == 200
    assert res.json()["status"] == "DISPATCHED"

    # Storekeeper tries to generate invoice -> 403
    res = client.post(f"/api/sales/orders/{so_id}/invoice", headers=STOREKEEPER_HEADERS)
    assert res.status_code == 403
    print("  [OK] test_05_storekeeper_role_restriction passed.")


def test_06_gst_calculation_and_tax_invoice():
    """Test CGST+SGST for intra-state (Haryana) vs IGST for inter-state (e.g. Maharashtra)."""
    db = SessionLocal()
    haryana_cust = db.query(Customer).filter(Customer.state == "Haryana").first()
    maha_cust = db.query(Customer).filter(Customer.state == "Maharashtra").first()
    item = db.query(Inventory).filter(Inventory.quantity > 20).first()
    item_id = item.id
    db.close()

    assert haryana_cust is not None
    assert maha_cust is not None

    # Order 1: Haryana Customer (Intra-state)
    p1 = {
        "customer_id": haryana_cust.id,
        "is_quote": False,
        "items": [{"item_id": item_id, "qty": 2, "unit_price": 1000.0, "discount_pct": 0.0, "gst_rate": 18.0}]
    }
    r1 = client.post("/api/sales/orders", json=p1, headers=ADMIN_HEADERS)
    so1_id = r1.json()["id"]
    client.post(f"/api/sales/orders/{so1_id}/dispatch", json={"items": [{"item_id": r1.json()["items"][0]["id"], "qty": 2}]}, headers=ADMIN_HEADERS)
    inv1_res = client.post(f"/api/sales/orders/{so1_id}/invoice", headers=ADMIN_HEADERS)
    assert inv1_res.status_code == 200
    inv1 = inv1_res.json()

    # Intra-state: CGST (9%) + SGST (9%), IGST must be 0
    assert inv1["cgst"] > 0
    assert inv1["sgst"] > 0
    assert inv1["igst"] == 0.0
    assert inv1["invoice_no"].startswith("ANI/")

    # Order 2: Maharashtra Customer (Inter-state)
    p2 = {
        "customer_id": maha_cust.id,
        "is_quote": False,
        "items": [{"item_id": item_id, "qty": 2, "unit_price": 1000.0, "discount_pct": 0.0, "gst_rate": 18.0}]
    }
    r2 = client.post("/api/sales/orders", json=p2, headers=ADMIN_HEADERS)
    so2_id = r2.json()["id"]
    client.post(f"/api/sales/orders/{so2_id}/dispatch", json={"items": [{"item_id": r2.json()["items"][0]["id"], "qty": 2}]}, headers=ADMIN_HEADERS)
    inv2_res = client.post(f"/api/sales/orders/{so2_id}/invoice", headers=ADMIN_HEADERS)
    assert inv2_res.status_code == 200
    inv2 = inv2_res.json()

    # Inter-state: IGST (18%), CGST and SGST must be 0
    assert inv2["igst"] > 0
    assert inv2["cgst"] == 0.0
    assert inv2["sgst"] == 0.0
    print("  [OK] test_06_gst_calculation_and_tax_invoice passed.")


def test_07_payment_recording_and_ledger_update():
    """Test recording invoice payment and verifying customer ledger running balance."""
    # List invoices to find an UNPAID one
    res = client.get("/api/invoices?status=UNPAID", headers=ADMIN_HEADERS)
    assert res.status_code == 200
    unpaid_list = res.json()
    assert len(unpaid_list) > 0
    target_inv = unpaid_list[0]
    inv_id = target_inv["id"]
    cust_id = target_inv["customer_id"]
    total_val = target_inv["total"]

    # Record partial payment
    partial_amt = round(total_val / 2, 2)
    pay_payload = {
        "amount": partial_amt,
        "mode": "NEFT",
        "reference": "TEST-NEFT-REF-001",
        "date": datetime.date.today().isoformat()
    }
    p_res = client.post(f"/api/invoices/{inv_id}/payments", json=pay_payload, headers=MANAGER_HEADERS)
    assert p_res.status_code == 200

    # Invoice should now be PARTIALLY_PAID
    inv_check = client.get(f"/api/invoices/{inv_id}", headers=MANAGER_HEADERS).json()
    assert inv_check["status"] == "PARTIALLY_PAID"
    assert inv_check["paid_amount"] == partial_amt

    # Check customer ledger has the transaction
    ledger = client.get(f"/api/customers/{cust_id}/ledger", headers=MANAGER_HEADERS).json()
    tx_refs = [t["reference"] for t in ledger["transactions"]]
    assert "TEST-NEFT-REF-001" in tx_refs
    print("  [OK] test_07_payment_recording_and_ledger_update passed.")


def test_08_pdf_documents():
    """Test Quotation and Tax Invoice PDF downloads."""
    # Quotation PDF
    res = client.get("/api/sales/orders", headers=ADMIN_HEADERS)
    order_id = res.json()[0]["id"]

    res_q_pdf = client.get(f"/api/sales/orders/{order_id}/quote-pdf", headers=ADMIN_HEADERS)
    assert res_q_pdf.status_code == 200
    assert res_q_pdf.headers["content-type"] == "application/pdf"
    assert res_q_pdf.content.startswith(b"%PDF")

    # Tax Invoice PDF
    res_inv = client.get("/api/invoices", headers=ADMIN_HEADERS)
    inv_id = res_inv.json()[0]["id"]

    res_i_pdf = client.get(f"/api/invoices/{inv_id}/pdf", headers=ADMIN_HEADERS)
    assert res_i_pdf.status_code == 200
    assert res_i_pdf.headers["content-type"] == "application/pdf"
    assert res_i_pdf.content.startswith(b"%PDF")
    print("  [OK] test_08_pdf_documents passed.")


def test_09_receivables_ageing():
    """Verify receivables ageing metrics in dashboard stats."""
    res = client.get("/api/dashboard", headers=ADMIN_HEADERS)
    assert res.status_code == 200
    data = res.json()
    assert "receivables_ageing" in data
    ageing = data["receivables_ageing"]
    for bucket in ["bucket_0_30", "bucket_31_60", "bucket_60_plus", "total_outstanding"]:
        assert bucket in ageing
        assert isinstance(ageing[bucket], (int, float))
    assert ageing["total_outstanding"] >= 0
    print("  [OK] test_09_receivables_ageing passed.")


if __name__ == "__main__":
    print("==================================================")
    print("  RUNNING ANISHKA INVENTORY SALES MODULE TESTS")
    print("==================================================")
    setup_module()
    test_01_customer_crud_and_auth()
    test_02_sales_order_quote_and_margin_visibility()
    test_03_credit_limit_enforcement_and_override()
    test_04_stock_reservation_and_cancellation()
    test_05_storekeeper_role_restriction()
    test_06_gst_calculation_and_tax_invoice()
    test_07_payment_recording_and_ledger_update()
    test_08_pdf_documents()
    test_09_receivables_ageing()
    print("==================================================")
    print("  ALL SALES MODULE TESTS PASSED (100% OK)")
    print("==================================================")
