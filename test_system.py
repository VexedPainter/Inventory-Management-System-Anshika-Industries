"""
Comprehensive Test Suite for Anishka Inventory (FastAPI + SQLite + RBAC)
"""
import sys
from fastapi.testclient import TestClient
from app import app
from database import init_db
from seed_data import seed_database

client = TestClient(app)

def run_all_tests():
    seed_database()
    print("==================================================")
    print("  RUNNING ANISHKA INVENTORY INTEGRATION TEST SUITE")
    print("==================================================")

    # 1. Test Login & RBAC
    print("\n[TEST 1] Testing Login & RBAC Authentication...")
    for user, pwd, expected_role in [
        ("admin", "admin@2026", "admin"),
        ("manager", "manager@2026", "manager"),
        ("storekeeper", "storekeeper@2026", "storekeeper")
    ]:
        res = client.post("/api/login", json={"username": user, "password": pwd})
        assert res.status_code == 200, f"Login failed for {user}: {res.text}"
        data = res.json()
        assert data["status"] == "success"
        assert data["role"] == expected_role
        assert "token" in data
        print(f"  [OK] {user} authenticated successfully as {expected_role}")

    # Bad login
    res = client.post("/api/login", json={"username": "admin", "password": "wrongpassword"})
    assert res.status_code == 401, f"Expected 401, got {res.status_code}"
    print("  [OK] Invalid login rejected with 401 Unauthorized")

    # 2. Test Stats
    print("\n[TEST 2] Testing Dashboard KPIs / Stats...")
    res = client.get("/api/stats")
    assert res.status_code == 200, res.text
    stats = res.json()
    print(f"  [OK] Total Items: {stats['total_items']}")
    print(f"  [OK] Total Stock Units: {stats['total_stock_units']}")
    print(f"  [OK] Total Valuation: Rs. {stats['total_valuation']:,.2f}")
    print(f"  [OK] Low Stock Count: {stats['low_stock_items']}")
    print(f"  [OK] Out of Stock Count: {stats['out_of_stock_items']}")
    assert stats["total_items"] == 62, f"Expected 62 items, got {stats['total_items']}"
    assert stats["out_of_stock_items"] == 3, f"Expected 3 out of stock, got {stats['out_of_stock_items']}"
    assert stats["low_stock_items"] >= 3

    # 3. Test Inventory Catalog & Extended Fields
    print("\n[TEST 3] Testing Inventory Catalog & Extended Fields...")
    res = client.get("/api/inventory")
    assert res.status_code == 200, res.text
    items = res.json()
    assert len(items) == 62, f"Expected 62 items, got {len(items)}"
    sample = items[0]
    required_fields = ["id", "sku", "name", "category", "unit", "compatible_with", "location", "quantity", "unit_cost", "selling_price", "reorder_qty", "is_active", "status"]
    for rf in required_fields:
        assert rf in sample, f"Missing field '{rf}' in inventory item: {sample}"
    print(f"  [OK] All 62 items contain required extended fields")

    # 4. Test Category Filtering
    print("\n[TEST 4] Testing 5 Core Categories...")
    cats = ["MIG Welding", "TIG Welding", "Robotics Spares", "Welding Wire", "Safety & Accessories"]
    total_filtered = 0
    for cat in cats:
        res = client.get("/api/inventory", params={"category": cat})
        assert res.status_code == 200
        cat_items = res.json()
        assert len(cat_items) > 0, f"No items found for {cat}"
        total_filtered += len(cat_items)
        print(f"  [OK] {cat}: {len(cat_items)} SKUs")
    assert total_filtered == 62, f"Expected total 62, got {total_filtered}"

    # 5. Test Suppliers
    print("\n[TEST 5] Testing Suppliers & OEMs Directory...")
    res = client.get("/api/suppliers")
    assert res.status_code == 200
    suppliers = res.json()
    assert len(suppliers) == 14, f"Expected 14 suppliers, got {len(suppliers)}"
    s_sample = suppliers[0]
    for rf in ["id", "name", "contact_person", "phone", "city", "lead_time_days", "rating"]:
        assert rf in s_sample, f"Missing field '{rf}' in supplier: {s_sample}"
    print(f"  [OK] 14 Industrial Suppliers verified with cities: {set(s['city'] for s in suppliers)}")

    # 6. Test Stock Movements
    print("\n[TEST 6] Testing Stock Movement Ledger...")
    res = client.get("/api/stock-movements?limit=10")
    assert res.status_code == 200
    movs = res.json()
    assert len(movs) > 0
    m_sample = movs[0]
    for rf in ["id", "sku", "type", "quantity", "reference", "party", "performed_by", "balance_after"]:
        assert rf in m_sample, f"Missing field '{rf}' in movement: {m_sample}"
    print(f"  [OK] Stock movements ledger verified with balance_after tracking")

    # 7. Test Purchase Orders & PO Line Items
    print("\n[TEST 7] Testing Purchase Orders & Line Items...")
    res = client.get("/api/procurement")
    assert res.status_code == 200
    pos = res.json()
    assert len(pos) == 10, f"Expected 10 POs, got {len(pos)}"
    po_sample = pos[0]
    for rf in ["id", "po_number", "supplier_id", "status", "created_at", "expected_date", "total_value", "items"]:
        assert rf in po_sample, f"Missing field '{rf}' in PO: {po_sample}"
    print(f"  [OK] 10 Purchase Orders verified (with attached line items)")

    # 8. Test Stock Adjustment
    print("\n[TEST 8] Testing Stock Adjustment Transaction...")
    sku_to_test = "MIG-CT-M6-08"
    item_before = next(i for i in items if i["sku"] == sku_to_test)
    adj_res = client.post("/api/inventory/adjust", json={
        "sku": sku_to_test,
        "quantity_change": -5,
        "reason": "Test issue to welding cell",
        "destination": "Test Robotic Bay"
    })
    assert adj_res.status_code == 200, adj_res.text
    adj_data = adj_res.json()
    assert adj_data["current_quantity"] == item_before["quantity"] - 5
    print(f"  [OK] Stock adjustment successful: {item_before['quantity']} -> {adj_data['current_quantity']}")

    # Revert adjustment
    client.post("/api/inventory/adjust", json={
        "sku": sku_to_test,
        "quantity_change": 5,
        "reason": "Reverting test issue",
        "destination": "Central Store"
    })

    # 9. Test PDF & Excel Exports
    print("\n[TEST 9] Testing Document Generation & Exports...")
    pdf_rep = client.get("/api/pdf/dashboard-report")
    assert pdf_rep.status_code == 200 and pdf_rep.content.startswith(b"%PDF"), "Valuation report PDF generation failed"
    print("  [OK] Valuation Report PDF generated successfully")

    pdf_bulk = client.get("/api/pdf/bulk-procurement")
    assert pdf_bulk.status_code == 200 and pdf_bulk.content.startswith(b"%PDF"), "Bulk PO PDF generation failed"
    print("  [OK] Bulk PO PDF generated successfully")

    pdf_po = client.get("/api/pdf/PO-2026-001")
    assert pdf_po.status_code == 200 and pdf_po.content.startswith(b"%PDF"), "Single PO PDF generation failed"
    print("  [OK] Single PO PDF generated successfully")

    csv_res = client.get("/api/export/csv/inventory")
    assert csv_res.status_code == 200 and "SKU,Name,Category" in csv_res.text, "CSV export failed"
    print("  [OK] Inventory CSV export generated successfully")

    excel_res = client.get("/api/export/excel/all")
    assert excel_res.status_code == 200 and excel_res.content.startswith(b"PK"), "Excel export failed"
    print("  [OK] Comprehensive Excel export generated successfully")

    # 10. Test Demo Reset
    print("\n[TEST 10] Testing Demo Reset Endpoint...")
    # Admin role required for demo reset
    client.post("/api/login", json={"username": "admin", "password": "admin@2026"})
    reset_res = client.post("/api/demo/reset")
    assert reset_res.status_code == 200, reset_res.text
    print("  [OK] Demo Reset executed cleanly")

    print("\n==================================================")
    print("  ALL 10 TEST SUITES PASSED FLAWLESSLY! (100% OK)")
    print("==================================================")

if __name__ == "__main__":
    run_all_tests()
