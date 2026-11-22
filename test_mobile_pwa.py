import os
import uuid
import pytest

os.environ["ALLOW_TEST_ROLE_HEADER"] = "true"

from fastapi.testclient import TestClient
from app import app, get_db
from database import SessionLocal, Inventory, StockMovement, CycleCount, CycleCountItem

client = TestClient(app)

def test_manifest_and_sw_endpoints():
    r = client.get("/manifest.json")
    assert r.status_code == 200
    data = r.json()
    assert "Anishka" in data["name"]
    assert len(data["icons"]) >= 2
    assert data["display"] == "standalone"

    r_sw = client.get("/sw.js")
    assert r_sw.status_code == 200
    assert "javascript" in r_sw.headers.get("content-type", "").lower()
    assert b"CACHE_NAME" in r_sw.content


def test_qr_labels_pdf_endpoints():
    # Item labels PDF
    r_item = client.get("/api/labels/items/pdf?all=1", headers={"X-User-Role": "storekeeper"})
    assert r_item.status_code == 200
    assert "application/pdf" in r_item.headers.get("content-type", "")
    assert r_item.content.startswith(b"%PDF")

    # Bin labels PDF
    r_bin = client.get("/api/labels/bins/pdf?all=1", headers={"X-User-Role": "storekeeper"})
    assert r_bin.status_code == 200
    assert "application/pdf" in r_bin.headers.get("content-type", "")
    assert r_bin.content.startswith(b"%PDF")


def test_idempotent_stock_actions():
    db = SessionLocal()
    item = db.query(Inventory).filter(Inventory.quantity > 5).first()
    assert item is not None, "Need at least one inventory item for test"
    test_sku = item.sku
    db.close()

    client_id_in = f"test-in-{uuid.uuid4()}"
    payload_in = {
        "sku": test_sku,
        "quantity": 5,
        "supplier": "Test Supplier",
        "reference": "Test GRN",
        "client_id": client_id_in
    }

    # First call -> normal receipt
    r1 = client.post("/api/stock/in", json=payload_in, headers={"X-User-Role": "storekeeper"})
    assert r1.status_code in [200, 201]

    # Second call with same client_id -> idempotent replay
    r2 = client.post("/api/stock/in", json=payload_in, headers={"X-User-Role": "storekeeper"})
    assert r2.status_code == 200
    data2 = r2.json()
    assert data2.get("status") == "idempotent_replay"

    # Test Stock Out idempotency
    client_id_out = f"test-out-{uuid.uuid4()}"
    payload_out = {
        "sku": test_sku,
        "quantity": 2,
        "customer": "Test Line",
        "invoice_no": "TEST-DISP",
        "client_id": client_id_out
    }

    r_out1 = client.post("/api/stock/out", json=payload_out, headers={"X-User-Role": "storekeeper"})
    assert r_out1.status_code == 200
    r_out2 = client.post("/api/stock/out", json=payload_out, headers={"X-User-Role": "storekeeper"})
    assert r_out2.status_code == 200
    assert r_out2.json().get("status") == "idempotent_replay"

    # Test Stock Adjust idempotency
    client_id_adj = f"test-adj-{uuid.uuid4()}"
    payload_adj = {
        "sku": test_sku,
        "quantity_change": 1,
        "reason": "Test Adjustment Idempotency",
        "destination": "Central Store",
        "client_id": client_id_adj
    }

    r_adj1 = client.post("/api/stock/adjust", json=payload_adj, headers={"X-User-Role": "storekeeper"})
    assert r_adj1.status_code == 200
    r_adj2 = client.post("/api/stock/adjust", json=payload_adj, headers={"X-User-Role": "storekeeper"})
    assert r_adj2.status_code == 200
    assert r_adj2.json().get("status") == "idempotent_replay"


def test_cycle_count_full_workflow():
    # 1. Create cycle count sheet
    create_payload = {
        "type": "CATEGORY",
        "target_name": "MIG Welding",
        "notes": "Automated test cycle count"
    }
    r_create = client.post("/api/cycle-counts", json=create_payload, headers={"X-User-Role": "storekeeper"})
    assert r_create.status_code in [200, 201]
    sheet = r_create.json()
    cc_id = sheet["id"]
    assert sheet["status"] == "OPEN"
    assert sheet["total_items"] > 0

    # 2. Get cycle counts list
    r_list = client.get("/api/cycle-counts", headers={"X-User-Role": "storekeeper"})
    assert r_list.status_code == 200
    assert any(c["id"] == cc_id for c in r_list.json())

    # 3. Get sheet detail
    r_detail = client.get(f"/api/cycle-counts/{cc_id}", headers={"X-User-Role": "storekeeper"})
    assert r_detail.status_code == 200
    detail = r_detail.json()
    items = detail["items"]
    assert len(items) > 0

    # 4. Record count with a variance
    target_item = items[0]
    new_count = target_item["system_qty"] + 3
    count_payload = {
        "items": [
            {
                "item_id": target_item["id"],
                "counted_qty": new_count,
                "discrepancy_reason": "Found extra units during audit"
            }
        ]
    }
    r_count = client.post(f"/api/cycle-counts/{cc_id}/count", json=count_payload, headers={"X-User-Role": "storekeeper"})
    assert r_count.status_code == 200
    updated_sheet = r_count.json()
    assert updated_sheet["total_variance_qty"] == 3

    # 5. Submit for approval
    r_sub = client.post(f"/api/cycle-counts/{cc_id}/submit", headers={"X-User-Role": "storekeeper"})
    assert r_sub.status_code == 200
    assert r_sub.json()["status"] == "SUBMITTED"

    # 6. Non-manager approval rejection (RBAC: viewer -> 403 or 401)
    r_viewer_app = client.post(f"/api/cycle-counts/{cc_id}/approve", headers={"X-User-Role": "viewer"})
    assert r_viewer_app.status_code in [401, 403]

    # 7. Manager/Admin approves and posts adjustments
    r_app = client.post(f"/api/cycle-counts/{cc_id}/approve", headers={"X-User-Role": "admin"})
    assert r_app.status_code == 200
    approved = r_app.json()
    assert approved["status"] in ["APPROVED", "POSTED"]
    assert approved["posted_at"] is not None
