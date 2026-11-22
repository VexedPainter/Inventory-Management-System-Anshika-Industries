from datetime import datetime, timedelta, timezone
"""
Test Suite for Anishka Inventory Management System v7.0.
Verifies:
1. ALLOW_TEST_ROLE_HEADER behavior (blocked when false, allowed when true)
2. RBAC enforcement (admin = all, manager = approve/edit, storekeeper = in/out only)
3. Dynamic Status Engine (OK, LOW, CRITICAL, OUT, DEAD)
4. Items CRUD & unique SKU validation
5. Stock Movements: in, out (negative stock rejection), adjust (reason required)
6. Auto-reorder with Open PO suppression (Constraint 2: skip if on open DRAFT or APPROVED PO)
7. Purchase order lifecycle: create -> approve -> receive -> cancel
8. Dashboard metrics & Explainable Forecast API
9. Suppliers with open PO counts and values
10. Bulk CSV import row-by-row error reporting & sample template
"""

import os
import io
from fastapi.testclient import TestClient

# Ensure test role header is enabled for the test suite
os.environ["ALLOW_TEST_ROLE_HEADER"] = "true"

from app import app, get_db
from database import SessionLocal, Inventory, StockMovement, Procurement, POItem, AuditLog, Vendor, Outbox, init_db, DocExtraction

# Initialize database and seed if empty for fresh checkout compatibility
init_db()

client = TestClient(app)

def test_01_allow_test_role_header_security():
    """Verify X-User-Role is ignored when ALLOW_TEST_ROLE_HEADER=false."""
    os.environ["ALLOW_TEST_ROLE_HEADER"] = "false"
    try:
        # Without valid session or token, mutating endpoint returns 401
        res = client.post(
            "/api/items",
            headers={"X-User-Role": "admin"},
            json={
                "sku": "SEC-TEST-001",
                "name": "Security Test Item",
                "category": "MIG Welding",
                "quantity": 10,
                "reorder_level": 5
            }
        )
        assert res.status_code == 401, f"Expected 401, got {res.status_code}: {res.text}"
    finally:
        os.environ["ALLOW_TEST_ROLE_HEADER"] = "true"

    # Now with ALLOW_TEST_ROLE_HEADER=true, it succeeds
    res_allowed = client.post(
        "/api/items",
        headers={"X-User-Role": "admin"},
        json={
            "sku": "SEC-TEST-001",
            "name": "Security Test Item",
            "category": "MIG Welding",
            "quantity": 10,
            "reorder_level": 5
        }
    )
    assert res_allowed.status_code == 200, f"Expected 200, got {res_allowed.status_code}"


def test_02_items_crud_and_rbac():
    """Verify Items CRUD permissions and duplicate SKU rejection."""
    # 1. Storekeeper blocked from creating items
    res_sk_create = client.post(
        "/api/items",
        headers={"X-User-Role": "storekeeper"},
        json={"sku": "SKU-SK-01", "name": "Storekeeper Item", "category": "TIG Welding"}
    )
    assert res_sk_create.status_code == 403

    # 2. Manager creates item
    res_mgr_create = client.post(
        "/api/items",
        headers={"X-User-Role": "manager"},
        json={
            "sku": "ANI-TEST-TIP-01",
            "name": "Test Contact Tip 1.2mm",
            "category": "MIG Welding",
            "quantity": 100,
            "reorder_level": 25,
            "reorder_qty": 50,
            "unit_cost": 30.0,
            "selling_price": 55.0
        }
    )
    assert res_mgr_create.status_code == 200
    item_id = res_mgr_create.json()["id"]

    # 3. Duplicate SKU rejected
    res_dup = client.post(
        "/api/items",
        headers={"X-User-Role": "admin"},
        json={"sku": "ANI-TEST-TIP-01", "name": "Duplicate SKU", "category": "MIG Welding"}
    )
    assert res_dup.status_code == 400

    # 4. Storekeeper blocked from updating item
    res_sk_update = client.put(
        f"/api/items/{item_id}",
        headers={"X-User-Role": "storekeeper"},
        json={"name": "Hacked Item Name"}
    )
    assert res_sk_update.status_code == 403

    # 5. Manager updates item
    res_mgr_update = client.put(
        f"/api/items/{item_id}",
        headers={"X-User-Role": "manager"},
        json={"location": "R4-B09", "unit_cost": 32.0}
    )
    assert res_mgr_update.status_code == 200

    # 6. Manager blocked from deleting item (Admin only)
    res_mgr_del = client.delete(
        f"/api/items/{item_id}",
        headers={"X-User-Role": "manager"}
    )
    assert res_mgr_del.status_code == 403

    # 7. Admin can delete item
    res_admin_del = client.delete(
        f"/api/items/{item_id}",
        headers={"X-User-Role": "admin"}
    )
    assert res_admin_del.status_code == 200


def test_03_inventory_filters_sort_and_pagination():
    """Verify GET /api/inventory search, category/status filters, and pagination."""
    res = client.get("/api/inventory")
    assert res.status_code == 200
    data = res.json()
    assert isinstance(data, list)
    assert len(data) > 0
    # Every item must have computed status
    for it in data[:10]:
        assert it["status"] in ("OK", "LOW", "CRITICAL", "OUT", "DEAD")

    # Pagination test
    res_paged = client.get("/api/inventory?page=1&limit=5")
    assert res_paged.status_code == 200
    paged_data = res_paged.json()
    assert "items" in paged_data
    assert "total" in paged_data
    assert paged_data["page"] == 1
    assert len(paged_data["items"]) <= 5

    # Category filter
    res_cat = client.get("/api/inventory?category=MIG%20Welding")
    assert res_cat.status_code == 200
    assert all(i["category"] == "MIG Welding" for i in res_cat.json())

    # Search filter
    res_search = client.get("/api/inventory?search=nozzle")
    assert res_search.status_code == 200
    assert len(res_search.json()) > 0


def test_04_stock_in_out_and_negative_rejection():
    """Verify stock receipts, dispatches, and negative balance protection."""
    # Create a fresh item for movement tests
    res_item = client.post(
        "/api/items",
        headers={"X-User-Role": "admin"},
        json={
            "sku": "ANI-MOV-TEST-01",
            "name": "Stock Movement Test Diffuser",
            "category": "MIG Welding",
            "quantity": 15,
            "reorder_level": 10,
            "reorder_qty": 40
        }
    )
    assert res_item.status_code == 200

    # 1. Stock In by storekeeper
    res_in = client.post(
        "/api/stock/in",
        headers={"X-User-Role": "storekeeper"},
        json={
            "sku": "ANI-MOV-TEST-01",
            "quantity": 10,
            "reference": "PO-TEST-REC-01",
            "supplier": "Abicor Binzel Tech India"
        }
    )
    assert res_in.status_code == 200
    assert res_in.json()["current_quantity"] == 25

    # 2. Stock Out by storekeeper
    res_out = client.post(
        "/api/stock/out",
        headers={"X-User-Role": "storekeeper"},
        json={
            "sku": "ANI-MOV-TEST-01",
            "quantity": 5,
            "invoice_no": "DISP-TEST-01",
            "customer": "Welding Cell #1"
        }
    )
    assert res_out.status_code == 200
    assert res_out.json()["current_quantity"] == 20

    # 3. Reject negative stock
    res_neg = client.post(
        "/api/stock/out",
        headers={"X-User-Role": "storekeeper"},
        json={
            "sku": "ANI-MOV-TEST-01",
            "quantity": 999,
            "invoice_no": "DISP-EXCESS"
        }
    )
    assert res_neg.status_code == 400
    assert "Insufficient stock" in res_neg.json()["detail"]

    # 4. Stock Adjust: reason required
    res_no_reason = client.post(
        "/api/stock/adjust",
        headers={"X-User-Role": "storekeeper"},
        json={
            "sku": "ANI-MOV-TEST-01",
            "quantity_change": -2,
            "reason": ""
        }
    )
    assert res_no_reason.status_code == 400

    # 5. Stock Adjust: valid adjustment
    res_adj = client.post(
        "/api/stock/adjust",
        headers={"X-User-Role": "storekeeper"},
        json={
            "sku": "ANI-MOV-TEST-01",
            "quantity_change": -3,
            "reason": "QC Sampling damaged items"
        }
    )
    assert res_adj.status_code == 200
    assert res_adj.json()["current_quantity"] == 17


def test_05_auto_reorder_and_open_po_suppression():
    """
    CRITICAL CONSTRAINT TEST:
    1. Dispatch drops item below reorder level -> Auto DRAFT PO created.
    2. Second dispatch drops stock further -> Auto-reorder SKIPPED because item is on open DRAFT PO.
    3. Manager approves PO -> Status becomes APPROVED.
    4. Third dispatch -> Auto-reorder SKIPPED because item is on open APPROVED PO.
    5. Storekeeper receives PO -> Stock replenished, status becomes RECEIVED.
    """
    # Create item with quantity 20, reorder_level 15, reorder_qty 50
    sku = "ANI-AUTO-REORDER-SKU"
    res_item = client.post(
        "/api/items",
        headers={"X-User-Role": "admin"},
        json={
            "sku": sku,
            "name": "Auto-Reorder Controlled Nozzle",
            "category": "Robotics Spares",
            "quantity": 20,
            "reorder_level": 15,
            "reorder_qty": 50,
            "unit_cost": 120.0,
            "selling_price": 200.0,
            "supplier_id": "V001"
        }
    )
    assert res_item.status_code == 200

    # Step 1: Dispatch 8 units -> quantity drops to 12 (<= 15, LOW)
    res_disp1 = client.post(
        "/api/stock/out",
        headers={"X-User-Role": "storekeeper"},
        json={"sku": sku, "quantity": 8, "invoice_no": "TEST-DISP-01"}
    )
    assert res_disp1.status_code == 200
    assert res_disp1.json()["current_quantity"] == 12

    # Verify auto-draft PO was created
    db = SessionLocal()
    try:
        draft_pos = db.query(Procurement).filter(
            Procurement.status == "DRAFT",
            Procurement.auto_generated == True
        ).all()
        # Find PO containing our test item
        target_po = None
        for po in draft_pos:
            for it in po.items:
                if it.item.sku == sku:
                    target_po = po
                    break
            if target_po:
                break

        assert target_po is not None, "Expected an auto-draft PO for low-stock item"
        po_id = target_po.id
        po_num = target_po.po_number
    finally:
        db.close()

    # Step 2: Second dispatch of 2 units -> quantity drops to 10
    # Must NOT create a duplicate PO or duplicate line item
    res_disp2 = client.post(
        "/api/stock/out",
        headers={"X-User-Role": "storekeeper"},
        json={"sku": sku, "quantity": 2, "invoice_no": "TEST-DISP-02"}
    )
    assert res_disp2.status_code == 200
    assert res_disp2.json()["current_quantity"] == 10

    db = SessionLocal()
    try:
        # Check lines for this item across all open DRAFT POs
        lines = db.query(POItem).join(Procurement).filter(
            POItem.item.has(sku=sku),
            Procurement.status == "DRAFT"
        ).all()
        assert len(lines) == 1, f"Expected exactly 1 line item on DRAFT PO, found {len(lines)}"
    finally:
        db.close()

    # Step 3: Storekeeper blocked from approving PO (RBAC)
    res_sk_approve = client.post(
        f"/api/procurement/{po_num}/approve",
        headers={"X-User-Role": "storekeeper"}
    )
    assert res_sk_approve.status_code == 403

    # Step 4: Manager approves the PO -> moves to APPROVED
    res_mgr_approve = client.post(
        f"/api/procurement/{po_num}/approve",
        headers={"X-User-Role": "manager"}
    )
    assert res_mgr_approve.status_code == 200
    assert res_mgr_approve.json()["new_status"] == "APPROVED"

    # Step 5: Third dispatch while PO is APPROVED -> stock drops to 8
    # Auto-reorder MUST be skipped because the item is on an open APPROVED PO
    res_disp3 = client.post(
        "/api/stock/out",
        headers={"X-User-Role": "storekeeper"},
        json={"sku": sku, "quantity": 2, "invoice_no": "TEST-DISP-03"}
    )
    assert res_disp3.status_code == 200
    assert res_disp3.json()["current_quantity"] == 8

    db = SessionLocal()
    try:
        # Verify NO new DRAFT PO was created
        draft_pos_after = db.query(POItem).join(Procurement).filter(
            POItem.item.has(sku=sku),
            Procurement.status == "DRAFT"
        ).all()
        assert len(draft_pos_after) == 0, "No new DRAFT PO should be created while PO is APPROVED"
    finally:
        db.close()

    # Step 6: Storekeeper receives the PO -> adds stock, logs IN movement, marks RECEIVED
    res_rcv = client.post(
        f"/api/procurement/{po_num}/receive",
        headers={"X-User-Role": "storekeeper"}
    )
    assert res_rcv.status_code == 200
    assert res_rcv.json()["new_status"] == "RECEIVED"

    # Verify inventory increased by reorder_qty (8 + 50 = 58)
    res_inv = client.get(f"/api/inventory?search={sku}")
    assert res_inv.status_code == 200
    updated_item = res_inv.json()[0]
    assert updated_item["quantity"] == 58


def test_06_dashboard_and_forecast_apis():
    """Verify GET /api/dashboard and GET /api/forecast/{item_id}."""
    res_dash = client.get("/api/dashboard")
    assert res_dash.status_code == 200
    dash = res_dash.json()
    assert "stats" in dash
    assert "total_skus" in dash
    assert "stock_value" in dash
    assert "status_distribution" in dash
    assert "trend_30d" in dash
    assert len(dash["trend_30d"]) > 0

    # Forecast endpoint
    res_forecast = client.get("/api/forecast/ANI-AUTO-REORDER-SKU")
    assert res_forecast.status_code == 200
    fc = res_forecast.json()
    assert "sku" in fc
    assert "avg_daily_out" in fc
    assert "estimated_days_left" in fc
    assert "suggested_reorder_date" in fc
    assert "suggested_qty" in fc


def test_07_suppliers_open_pos_and_crud():
    """Verify open_po_count and open_po_value in suppliers list and update."""
    res = client.get("/api/suppliers")
    assert res.status_code == 200
    suppliers = res.json()
    assert len(suppliers) > 0
    first_supp = suppliers[0]
    assert "open_po_count" in first_supp
    assert "open_po_value" in first_supp
    assert isinstance(first_supp["open_po_count"], int)
    assert isinstance(first_supp["open_po_value"], (int, float))

    # Manager updates supplier
    res_update = client.put(
        f"/api/suppliers/{first_supp['id']}",
        headers={"X-User-Role": "manager"},
        json={"lead_time_days": 5, "rating": 4.8}
    )
    assert res_update.status_code == 200
    assert res_update.json()["supplier"]["lead_time_days"] == 5


def test_08_bulk_csv_import_and_reports():
    """Verify CSV sample download and row-by-row import error handling."""
    # 1. Download sample CSV
    res_sample = client.get("/api/import/sample")
    assert res_sample.status_code == 200
    assert "sku,name,category" in res_sample.text

    # 2. Upload CSV with 1 valid row and 1 invalid row (missing name)
    csv_data = (
        "sku,name,category,quantity,reorder_level,reorder_qty,unit_cost,selling_price\n"
        "BULK-GOOD-01,Valid Torch Neck,MIG Welding,40,10,20,250.0,400.0\n"
        "BULK-BAD-02,,MIG Welding,10,5,10,100.0,150.0\n"
    )

    res_import = client.post(
        "/api/import/csv",
        headers={"X-User-Role": "admin", "Content-Type": "text/csv"},
        content=csv_data.encode("utf-8")
    )
    assert res_import.status_code == 200
    imp = res_import.json()
    assert imp["total_rows"] == 2
    assert imp["imported"] == 1
    assert len(imp["errors"]) == 1
    assert imp["errors"][0]["sku"] == "BULK-BAD-02"

    # 3. Export low stock CSV
    res_csv = client.get("/api/export/low-stock/csv")
    assert res_csv.status_code == 200
    assert "SKU,Part Name" in res_csv.text

    # 4. Dispatch note PDF
    # Get any movement ID
    res_movs = client.get("/api/stock-movements?limit=1")
    assert res_movs.status_code == 200
    mov_list = res_movs.json()
    if mov_list:
        m_id = mov_list[0]["id"]
        res_disp_pdf = client.get(f"/api/pdf/dispatch/{m_id}")
        assert res_disp_pdf.status_code == 200
        assert res_disp_pdf.headers["content-type"] == "application/pdf"




def test_09_automation_cycle_drafts_for_low_items():
    """Verify background automation cycle scans and drafts PO for LOW item with duplicate suppression."""
    # Ensure settings: auto_reorder=True, auto_approve=False
    client.put(
        "/api/settings/automation",
        headers={"X-User-Role": "admin"},
        json={"auto_reorder_enabled": True, "auto_approve_enabled": False}
    )

    # 1. Create a LOW item
    sku = "AUTO-SCAN-LOW-01"
    res = client.post(
        "/api/items",
        headers={"X-User-Role": "admin"},
        json={
            "sku": sku,
            "name": "Scan Low Item",
            "category": "MIG Welding",
            "quantity": 2,
            "reorder_level": 15,
            "reorder_qty": 25,
            "unit_cost": 40.0,
            "selling_price": 75.0,
            "supplier_id": "V001"
        }
    )
    assert res.status_code == 200, f"Create item failed: {res.text}"
    item_id = res.json()["id"]

    # 2. Trigger automation run
    run_res = client.post("/api/automation/run-now", headers={"X-User-Role": "admin"})
    assert run_res.status_code == 200, f"Run now failed: {run_res.text}"
    run_data = run_res.json()
    assert run_data["scanned"] >= 1

    # Check procurement: exactly 1 open DRAFT PO line for this item
    db = SessionLocal()
    try:
        po_items = (
            db.query(POItem)
            .join(Procurement, POItem.po_id == Procurement.id)
            .filter(POItem.item_id == item_id, Procurement.status == "DRAFT")
            .all()
        )
        assert len(po_items) == 1, f"Expected 1 open DRAFT PO line, found {len(po_items)}"
    finally:
        db.close()

    # 3. Second run must NOT create duplicate PO
    run_res_2 = client.post("/api/automation/run-now", headers={"X-User-Role": "admin"})
    assert run_res_2.status_code == 200

    db = SessionLocal()
    try:
        po_items_2 = (
            db.query(POItem)
            .join(Procurement, POItem.po_id == Procurement.id)
            .filter(POItem.item_id == item_id, Procurement.status.in_(["DRAFT", "APPROVED", "PARTIALLY_RECEIVED"]))
            .all()
        )
        assert len(po_items_2) == 1, f"Duplicate PO created! Expected 1, found {len(po_items_2)}"
    finally:
        db.close()


def test_10_auto_approve_respects_toggle_and_limits():
    """Verify auto-approval respects toggle, value ceiling, and supplier rating minimum."""
    # 1. Enable auto-approval with high limit & low min rating
    client.put(
        "/api/settings/automation",
        headers={"X-User-Role": "admin"},
        json={
            "auto_reorder_enabled": True,
            "auto_approve_enabled": True,
            "auto_approve_limit": 50000.0,
            "auto_approve_min_supplier_rating": 1.0
        }
    )

    # Create low item that qualifies (reorder_qty=5, cost=100 -> total = 500 <= 50000)
    sku_qual = "AUTO-APP-OK-01"
    res = client.post(
        "/api/items",
        headers={"X-User-Role": "admin"},
        json={
            "sku": sku_qual,
            "name": "Auto Approve Qualify",
            "category": "TIG Welding",
            "quantity": 1,
            "reorder_level": 10,
            "reorder_qty": 5,
            "unit_cost": 100.0,
            "selling_price": 180.0,
            "supplier_id": "V001"
        }
    )
    assert res.status_code == 200, f"Create qualify item failed: {res.text}"
    item_id_qual = res.json()["id"]

    # Run cycle
    client.post("/api/automation/run-now", headers={"X-User-Role": "admin"})

    db = SessionLocal()
    try:
        po = (
            db.query(Procurement)
            .join(POItem, Procurement.id == POItem.po_id)
            .filter(POItem.item_id == item_id_qual)
            .first()
        )
        assert po is not None, "PO should have been created"
        assert po.status == "APPROVED", f"PO should be auto-approved, got {po.status}"
        assert po.auto_approved is True
    finally:
        db.close()

    # 2. Set auto_approve_limit to 10 Rs (too low), so next item remains DRAFT
    client.put(
        "/api/settings/automation",
        headers={"X-User-Role": "admin"},
        json={"auto_approve_limit": 10.0}
    )

    sku_high = "AUTO-APP-EXCEED-01"
    res2 = client.post(
        "/api/items",
        headers={"X-User-Role": "admin"},
        json={
            "sku": sku_high,
            "name": "Auto Approve Exceed",
            "category": "TIG Welding",
            "quantity": 1,
            "reorder_level": 10,
            "reorder_qty": 5,
            "unit_cost": 100.0,
            "selling_price": 180.0,
            "supplier_id": "V001"
        }
    )
    assert res2.status_code == 200, f"Create exceed item failed: {res2.text}"
    item_id_high = res2.json()["id"]

    client.post("/api/automation/run-now", headers={"X-User-Role": "admin"})

    db = SessionLocal()
    try:
        po2 = (
            db.query(Procurement)
            .join(POItem, Procurement.id == POItem.po_id)
            .filter(POItem.item_id == item_id_high)
            .first()
        )
        assert po2 is not None
        assert po2.status == "DRAFT", f"PO total exceeds limit; expected DRAFT, got {po2.status}"
    finally:
        db.close()

    # Reset auto_approve_enabled to False
    client.put(
        "/api/settings/automation",
        headers={"X-User-Role": "admin"},
        json={"auto_approve_enabled": False}
    )


def test_11_csv_import_triggers_draft():
    """Verify CSV import of below-reorder-level item triggers replenishment draft."""
    client.put(
        "/api/settings/automation",
        headers={"X-User-Role": "admin"},
        json={"auto_reorder_enabled": True, "auto_approve_enabled": False}
    )

    csv_data = (
        "sku,name,category,quantity,reorder_level,reorder_qty,unit_cost,selling_price\n"
        "CSV-AUTO-TRIG-01,CSV Trigger Part,MIG Welding,2,20,15,60.0,110.0\n"
    )
    res = client.post(
        "/api/import/csv",
        headers={"X-User-Role": "admin", "Content-Type": "text/csv"},
        content=csv_data.encode("utf-8")
    )
    assert res.status_code == 200, f"CSV import failed: {res.text}"
    assert res.json().get("imported", 0) >= 1

    # Verify a DRAFT PO exists for this SKU
    db = SessionLocal()
    try:
        item = db.query(Inventory).filter(Inventory.sku == "CSV-AUTO-TRIG-01").first()
        assert item is not None
        po_item = (
            db.query(POItem)
            .join(Procurement, POItem.po_id == Procurement.id)
            .filter(POItem.item_id == item.id, Procurement.status.in_(["DRAFT", "APPROVED"]))
            .first()
        )
        assert po_item is not None, "CSV import of below-level item should trigger an auto-reorder PO"
    finally:
        db.close()


def test_12_po_cancel_retriggers_draft():
    """Verify cancelling an open PO for a low-stock item re-triggers a new replenishment PO."""
    client.put(
        "/api/settings/automation",
        headers={"X-User-Role": "admin"},
        json={"auto_reorder_enabled": True, "auto_approve_enabled": False}
    )

    sku = "AUTO-CANCEL-RETRIG-01"
    res = client.post(
        "/api/items",
        headers={"X-User-Role": "admin"},
        json={
            "sku": sku,
            "name": "Cancel Retrigger Part",
            "category": "MIG Welding",
            "quantity": 1,
            "reorder_level": 15,
            "reorder_qty": 20,
            "unit_cost": 50.0,
            "supplier_id": "V001"
        }
    )
    assert res.status_code == 200
    item_id = res.json()["id"]

    # Trigger cycle to generate DRAFT PO
    client.post("/api/automation/run-now", headers={"X-User-Role": "admin"})

    db = SessionLocal()
    po_id = None
    try:
        po_item = (
            db.query(POItem)
            .join(Procurement, POItem.po_id == Procurement.id)
            .filter(POItem.item_id == item_id, Procurement.status == "DRAFT")
            .first()
        )
        assert po_item is not None
        po_id = po_item.po_id
    finally:
        db.close()

    # Cancel the PO
    res_cancel = client.post(f"/api/procurement/{po_id}/cancel", headers={"X-User-Role": "admin"})
    assert res_cancel.status_code == 200

    # Since cancel calls trigger_replenishment_events for cancelled items,
    # a new DRAFT PO must be created for this item
    db = SessionLocal()
    try:
        new_po_item = (
            db.query(POItem)
            .join(Procurement, POItem.po_id == Procurement.id)
            .filter(POItem.item_id == item_id, Procurement.id != po_id, Procurement.status == "DRAFT")
            .first()
        )
        assert new_po_item is not None, "Cancelling PO should have re-triggered a new DRAFT PO"
    finally:
        db.close()


def test_13_partial_receive_leaves_partially_received():
    """Verify partial receiving marks PO as PARTIALLY_RECEIVED and preserves on-order quantity."""
    sku = "AUTO-PART-RCV-01"
    res = client.post(
        "/api/items",
        headers={"X-User-Role": "admin"},
        json={
            "sku": sku,
            "name": "Partial Receive Part",
            "category": "MIG Welding",
            "quantity": 10,
            "reorder_level": 40,
            "reorder_qty": 30,
            "unit_cost": 25.0,
            "supplier_id": "V001"
        }
    )
    assert res.status_code == 200
    item_id = res.json()["id"]

    # Create manual PO with 30 qty and approve it
    res_po = client.post(
        "/api/procurement",
        headers={"X-User-Role": "admin"},
        json={
            "supplier_id": "V001",
            "items": [{"item_id": item_id, "qty": 30, "unit_cost": 25.0}]
        }
    )
    assert res_po.status_code == 200
    po_id = res_po.json()["id"]

    # Approve PO
    res_app = client.post(f"/api/procurement/{po_id}/approve", headers={"X-User-Role": "admin"})
    assert res_app.status_code == 200

    # Receive 10 out of 30 (partial receipt)
    res_rcv = client.post(
        f"/api/procurement/{po_id}/receive",
        headers={"X-User-Role": "storekeeper"},
        json={"items": [{"item_id": item_id, "qty_received": 10}]}
    )
    assert res_rcv.status_code == 200
    assert res_rcv.json()["new_status"] == "PARTIALLY_RECEIVED"

    # Inventory quantity should now be 10 + 10 = 20
    db = SessionLocal()
    try:
        inv = db.query(Inventory).filter(Inventory.id == item_id).first()
        assert inv.quantity == 20, f"Expected inventory 20, got {inv.quantity}"

        # 20 remaining units are still on order, so no duplicate draft should be generated
        po_item = db.query(POItem).filter(POItem.po_id == po_id, POItem.item_id == item_id).first()
        assert po_item.received_qty == 10
    finally:
        db.close()

    # Receive remaining 20 units -> status should become RECEIVED
    res_rcv_full = client.post(
        f"/api/procurement/{po_id}/receive",
        headers={"X-User-Role": "storekeeper"},
        json={"items": [{"item_id": item_id, "qty_received": 20}]}
    )
    assert res_rcv_full.status_code == 200
    assert res_rcv_full.json()["new_status"] == "RECEIVED"


def test_14_overdue_flag_in_po_list():
    """Verify overdue detection flags POs past expected_date in procurement list."""
    db = SessionLocal()
    po_id = None
    try:
        now_dt = datetime.now(timezone.utc)
        past_date = (now_dt - timedelta(days=7)).strftime("%Y-%m-%d")
        po = Procurement(
            po_number="ANI-PO-TEST-OVERDUE-01",
            supplier_id="V001",
            total_value=1200.0,
            status="APPROVED",
            created_at=now_dt.strftime("%Y-%m-%d %H:%M:%S"),
            expected_date=past_date,
            auto_generated=False
        )
        db.add(po)
        db.commit()
        db.refresh(po)
        po_id = po.id
    finally:
        db.close()

    # Query GET /api/procurement
    res = client.get("/api/procurement", headers={"X-User-Role": "admin"})
    assert res.status_code == 200
    pos = res.json()

    target = next((p for p in pos if p["id"] == po_id), None)
    assert target is not None, "Overdue PO must appear in /api/procurement"
    assert target["overdue"] is True, "PO past expected_date must have overdue=True"
    assert target["days_late"] >= 6, f"Expected days_late >= 6, got {target['days_late']}"



def test_15_supplier_email_outbox_queue_and_resend():
    """Verify approval queues email into Outbox (SIMULATED) and resend endpoint functions."""
    # Ensure email_on_approval is enabled
    client.put(
        "/api/settings/automation",
        headers={"X-User-Role": "admin"},
        json={"email_on_approval": True}
    )

    # Create a draft PO
    res_po = client.post(
        "/api/procurement",
        headers={"X-User-Role": "admin"},
        json={
            "supplier_id": "V001",
            "items": [{"item_id": 1, "qty": 10, "unit_cost": 50.0}]
        }
    )
    assert res_po.status_code == 200
    po_id = res_po.json()["id"]
    po_number = res_po.json()["po_number"]

    # Approve the PO
    res_app = client.post(f"/api/procurement/{po_id}/approve", headers={"X-User-Role": "admin"})
    assert res_app.status_code == 200

    # Verify Outbox entry
    db = SessionLocal()
    try:
        outbox_msg = db.query(Outbox).filter(Outbox.related_po == po_number).first()
        assert outbox_msg is not None, f"Expected Outbox entry for {po_number}"
        assert outbox_msg.status in ("SIMULATED", "QUEUED", "SENT")
        assert "@" in outbox_msg.to_email
        outbox_id = outbox_msg.id
    finally:
        db.close()

    # Query GET /api/outbox
    res_outbox = client.get("/api/outbox", headers={"X-User-Role": "admin"})
    assert res_outbox.status_code == 200
    msgs = res_outbox.json()
    assert any(m["id"] == outbox_id for m in msgs)

    # Test resend endpoint
    res_resend = client.post(f"/api/outbox/{outbox_id}/resend", headers={"X-User-Role": "admin"})
    assert res_resend.status_code == 200
    assert res_resend.json()["status"] == "success"


def test_16_daily_digest_generation_and_endpoint():
    """Verify daily operations digest generation, Outbox logging, and latest endpoint."""
    res_run = client.post("/api/digest/run-now", headers={"X-User-Role": "admin"})
    assert res_run.status_code == 200
    digest = res_run.json()["digest"]
    assert "low_count" in digest
    assert "dead_stock_value" in digest
    assert "body" in digest

    # Verify GET /api/digest/latest
    res_latest = client.get("/api/digest/latest", headers={"X-User-Role": "admin"})
    assert res_latest.status_code == 200
    latest = res_latest.json()
    assert "Daily Inventory & Operations Digest" in latest["subject"]
    assert "ANISHKA ENGINEERING" in latest["body"]


def test_17_smart_reorder_levels_and_suggestions():
    """Verify smart reorder level calculation and >25% discrepancy review endpoint."""
    res_review = client.get("/api/inventory/reorder-level-suggestions", headers={"X-User-Role": "admin"})
    assert res_review.status_code == 200
    data = res_review.json()
    assert "count" in data
    assert "items" in data

    # Verify /api/forecast returns suggested_reorder_level
    res_fc = client.get("/api/forecast/1", headers={"X-User-Role": "admin"})
    assert res_fc.status_code == 200
    fc = res_fc.json()
    assert "suggested_reorder_level" in fc
    assert "current_reorder_level" in fc


def test_18_dead_stock_actions_and_csv_export():
    """Verify dead stock analysis identification and CSV export endpoint."""
    res_dead = client.get("/api/inventory/dead-stock", headers={"X-User-Role": "admin"})
    assert res_dead.status_code == 200
    data = res_dead.json()
    assert "count" in data
    assert "total_tied_up_value" in data
    assert "items" in data
    if data["items"]:
        first = data["items"][0]
        assert "tied_up_value" in first
        assert "days_idle" in first
        assert "suggested_action" in first

    # Test CSV export
    res_csv = client.get("/api/export/dead-stock/csv", headers={"X-User-Role": "admin"})
    assert res_csv.status_code == 200
    assert "text/csv" in res_csv.headers["content-type"]
    assert "SKU,Part Name,Category" in res_csv.text




def test_19_scan_doc_upload_validation_and_auth():
    """Verify document upload validation, size limits, and authenticated file serving."""
    # 1. Unauthenticated scan upload must return 401
    res_unauth = client.post("/api/procurement/scan-document", data={"sample_key": "sample_challan_clean"})
    assert res_unauth.status_code == 401

    # 2. Unsupported file type must return 400
    res_bad = client.post(
        "/api/procurement/scan-document",
        headers={"X-User-Role": "storekeeper"},
        files={"file": ("test.exe", b"NOT_A_VALID_DOCUMENT", "application/x-msdownload")}
    )
    assert res_bad.status_code == 400
    assert "Unsupported file format" in res_bad.json()["detail"]

    # 3. Authenticated sample upload succeeds
    res_sample = client.post(
        "/api/procurement/scan-document",
        headers={"X-User-Role": "storekeeper"},
        data={"sample_key": "sample_challan_clean"}
    )
    assert res_sample.status_code == 200
    data = res_sample.json()
    assert "extraction_id" in data
    assert "file_name" in data
    file_name = data["file_name"]

    # 4. Accessing uploaded document without login must return 401
    try:
        os.environ["ALLOW_TEST_ROLE_HEADER"] = "false"
        res_file_unauth = client.get(f"/api/uploads/{file_name}")
        assert res_file_unauth.status_code == 401
    finally:
        os.environ["ALLOW_TEST_ROLE_HEADER"] = "true"

    # 5. Accessing uploaded document with login succeeds
    res_file_auth = client.get(f"/api/uploads/{file_name}", headers={"X-User-Role": "storekeeper"})
    assert res_file_auth.status_code == 200
    assert len(res_file_auth.content) > 0


def test_20_scan_doc_matching_and_discrepancy_flags():
    """Verify PO matching, token resolution, and discrepancy flags (short qty, price variance, not on PO)."""
    # Reset sample POs to clean state for test idempotency
    _db_reset = SessionLocal()
    for po_num in ("ANI-PO-2026-0008", "ANI-PO-2026-0007"):
        _po = _db_reset.query(Procurement).filter(Procurement.po_number == po_num).first()
        if _po:
            _po.status = "APPROVED"
            for _it in _po.items:
                _it.received_qty = 0
    _db_reset.commit()
    _db_reset.close()

    # 1. Clean challan: exact match, zero discrepancy flags
    res1 = client.post(
        "/api/procurement/scan-document",
        headers={"X-User-Role": "manager"},
        data={"sample_key": "sample_challan_clean"}
    )
    assert res1.status_code == 200
    d1 = res1.json()
    assert d1["po"]["po_number"] == "ANI-PO-2026-0008"
    assert len(d1["lines"]) == 2
    assert all(not l["flags"]["quantity_mismatch"] for l in d1["lines"])
    assert all(not l["flags"]["price_variance"] for l in d1["lines"])
    assert all(not l["flags"]["not_on_po"] for l in d1["lines"])

    # 2. Short challan: matches ANI-PO-2026-0007, flags quantity_mismatch
    res2 = client.post(
        "/api/procurement/scan-document",
        headers={"X-User-Role": "storekeeper"},
        data={"sample_key": "sample_challan_short"}
    )
    assert res2.status_code == 200
    d2 = res2.json()
    assert d2["po"]["po_number"] == "ANI-PO-2026-0007"
    lines2 = d2["lines"]
    short_line = next((l for l in lines2 if l["extracted"]["sku"] == "WIR-MIG-70S-08"), None)
    assert short_line is not None
    assert short_line["flags"]["quantity_mismatch"] is True
    assert short_line["extracted"]["qty"] == 300
    assert short_line["matched_po_item"]["pending_qty"] == 450

    # 3. Price hike invoice: flags price_variance (>5%) and not_on_po
    res3 = client.post(
        "/api/procurement/scan-document",
        headers={"X-User-Role": "admin"},
        data={"sample_key": "sample_invoice_price_hike"}
    )
    assert res3.status_code == 200
    d3 = res3.json()
    lines3 = d3["lines"]
    hike_line = next((l for l in lines3 if l["extracted"]["sku"] == "MIG-CT-M8-12"), None)
    assert hike_line is not None
    assert hike_line["flags"]["price_variance"] is True
    assert hike_line["flags"]["price_variance_pct"] > 5.0

    extra_line = next((l for l in lines3 if l["extracted"]["sku"] == "MIG-LN-ST12"), None)
    assert extra_line is not None
    assert extra_line["flags"]["not_on_po"] is True


def test_21_scan_doc_confirm_receipt_and_audit():
    """Verify document confirmation receives stock, updates PO, writes audit, and tracks accuracy."""
    # 1. Scan clean document
    res_scan = client.post(
        "/api/procurement/scan-document",
        headers={"X-User-Role": "storekeeper"},
        data={"sample_key": "sample_challan_clean"}
    )
    assert res_scan.status_code == 200
    scan_data = res_scan.json()
    ext_id = scan_data["extraction_id"]
    po_id = scan_data["po"]["id"]

    # Initial stock of MIG-CT-M8-12
    db = SessionLocal()
    item_before = db.query(Inventory).filter(Inventory.sku == "MIG-CT-M8-12").first()
    stock_before = item_before.quantity
    db.close()

    # 2. Confirm delivery with reviewed quantities and 1 user correction
    reviewed_lines = [
        {"item_id": l["matched_po_item"]["item_id"], "qty": 100}
        for l in scan_data["lines"]
        if l["matched_po_item"]
    ]
    res_confirm = client.post(
        f"/api/procurement/scan-document/{ext_id}/confirm",
        headers={"X-User-Role": "storekeeper"},
        json={
            "po_id": po_id,
            "reviewed_lines": reviewed_lines,
            "fields_corrected": 1
        }
    )
    assert res_confirm.status_code == 200
    conf_data = res_confirm.json()
    assert conf_data["status"] == "success"
    assert conf_data["units_received"] > 0
    assert conf_data["fields_corrected"] == 1

    # 3. Verify stock increased in inventory
    db = SessionLocal()
    item_after = db.query(Inventory).filter(Inventory.sku == "MIG-CT-M8-12").first()
    assert item_after.quantity == stock_before + 100

    # 4. Verify DocExtraction status is CONFIRMED
    ext_db = db.query(DocExtraction).filter(DocExtraction.id == ext_id).first()
    assert ext_db.status == "CONFIRMED"
    assert ext_db.fields_corrected == 1

    # 5. Verify audit log entry was written
    audit = db.query(AuditLog).filter(AuditLog.action == "DOC_SCANNED_RECEIVE").first()
    assert audit is not None
    assert "DC-BINZ-2026-8812" in audit.details

    # 6. Re-scanning same document now flags duplicate_document as True
    res_rescan = client.post(
        "/api/procurement/scan-document",
        headers={"X-User-Role": "storekeeper"},
        data={"sample_key": "sample_challan_clean"}
    )
    assert res_rescan.status_code == 200
    assert res_rescan.json()["flags"]["duplicate_document"] is True

    # 7. Check accuracy stats endpoint
    res_acc = client.get("/api/procurement/scan-document/accuracy", headers={"X-User-Role": "storekeeper"})
    assert res_acc.status_code == 200
    acc = res_acc.json()
    assert acc["total_documents_confirmed"] >= 1
    assert "accuracy_rate_pct" in acc
    db.close()


if __name__ == "__main__":
    tests = [
        test_01_allow_test_role_header_security,
        test_02_items_crud_and_rbac,
        test_03_inventory_filters_sort_and_pagination,
        test_04_stock_in_out_and_negative_rejection,
        test_05_auto_reorder_and_open_po_suppression,
        test_06_dashboard_and_forecast_apis,
        test_07_suppliers_open_pos_and_crud,
        test_08_bulk_csv_import_and_reports,
        test_09_automation_cycle_drafts_for_low_items,
        test_10_auto_approve_respects_toggle_and_limits,
        test_11_csv_import_triggers_draft,
        test_12_po_cancel_retriggers_draft,
        test_13_partial_receive_leaves_partially_received,
        test_14_overdue_flag_in_po_list,
        test_15_supplier_email_outbox_queue_and_resend,
        test_16_daily_digest_generation_and_endpoint,
        test_17_smart_reorder_levels_and_suggestions,
        test_18_dead_stock_actions_and_csv_export,
        test_19_scan_doc_upload_validation_and_auth,
        test_20_scan_doc_matching_and_discrepancy_flags,
        test_21_scan_doc_confirm_receipt_and_audit
    ]

    print("==================================================")
    print("  ANISHKA INVENTORY BACKEND API TEST SUITE")
    print("==================================================")

    passed = 0
    failed = 0

    for t in tests:
        name = t.__name__
        doc = (t.__doc__ or "").strip().split("\n")[0]
        try:
            t()
            print(f"[PASS] {name} - {doc}")
            passed += 1
        except Exception as e:
            print(f"[FAIL] {name} - {doc}")
            print(f"       Error: {e}")
            import traceback
            traceback.print_exc()
            failed += 1

    print("--------------------------------------------------")
    print(f"Results: {passed} passed, {failed} failed.")
    print("==================================================")
    if failed > 0:
        exit(1)
    else:
        print("ALL TESTS PASSED SUCCESSFULLY.")
