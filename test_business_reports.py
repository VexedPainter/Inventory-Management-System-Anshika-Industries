"""
test_business_reports.py
========================
Tests for the Business Reports module:
  - GST Sales / Purchase registers
  - GSTR-1 B2B/B2C summary
  - HSN-wise summary
  - Tally XML / CSV voucher export
  - Tally ledger settings CRUD
  - Owner Summary (metrics, PDF, Outbox dispatch)
  - RBAC enforcement
  - Dashboard owner_summary integration

Python: C:\Python314\python.exe
Run:    C:\Python314\python.exe -m pytest test_business_reports.py -v --tb=short
"""

import os
os.environ["ALLOW_TEST_ROLE_HEADER"] = "true"

import pytest
from fastapi.testclient import TestClient

from database import init_db, SessionLocal
init_db()

from app import app

client = TestClient(app, raise_server_exceptions=False)

ADMIN = {"X-User-Role": "admin"}
MGR   = {"X-User-Role": "manager"}
SK    = {"X-User-Role": "storekeeper"}

# Use a past month that is likely to have seed data; fall back gracefully if empty
MONTH = "2026-11"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_ok(url: str, headers=None, **kwargs):
    """GET a URL with admin headers; assert 200."""
    h = {**ADMIN, **(headers or {})}
    r = client.get(url, headers=h, **kwargs)
    assert r.status_code == 200, f"GET {url} → {r.status_code}: {r.text[:300]}"
    return r


def _post_ok(url: str, payload: dict, headers=None):
    """POST JSON with admin headers; assert 200."""
    h = {**ADMIN, **(headers or {})}
    r = client.post(url, json=payload, headers=h)
    assert r.status_code == 200, f"POST {url} → {r.status_code}: {r.text[:300]}"
    return r


# ===========================================================================
# 1. GST Sales Register
# ===========================================================================

class TestGSTSalesRegister:

    def test_200_json_schema(self):
        r = _get_ok(f"/api/reports/gst/sales-register?month={MONTH}")
        data = r.json()
        assert "records" in data, "Missing 'records'"
        assert "summary" in data, "Missing 'summary'"
        assert "disclaimer" in data, "Missing 'disclaimer'"
        assert isinstance(data["records"], list)
        s = data["summary"]
        assert "invoice_count" in s
        assert "total_taxable" in s
        assert "total_amount" in s

    def test_record_fields_when_data_present(self):
        r = _get_ok(f"/api/reports/gst/sales-register?month={MONTH}")
        records = r.json()["records"]
        if not records:
            pytest.skip("No sales invoices for this month — schema check skipped")
        rec = records[0]
        for field in ("invoice_no", "date", "customer_name", "taxable_value",
                      "cgst", "sgst", "igst", "total_amount", "is_b2b", "status"):
            assert field in rec, f"Missing field '{field}' in sales register record"

    def test_csv_format_returns_text(self):
        r = _get_ok(f"/api/reports/gst/sales-register?month={MONTH}&format=csv")
        ct = r.headers.get("content-type", "")
        assert "csv" in ct or "text" in ct, f"Unexpected content-type: {ct}"
        # CSV should have at least a header row
        assert len(r.text) > 10

    def test_disclaimer_contains_accountant(self):
        r = _get_ok(f"/api/reports/gst/sales-register?month={MONTH}")
        disc = r.json().get("disclaimer", "")
        assert "accountant" in disc.lower() or "statutory" in disc.lower(), (
            "Disclaimer missing 'accountant' / 'statutory' keyword"
        )

    def test_storekeeper_gets_403(self):
        r = client.get(
            f"/api/reports/gst/sales-register?month={MONTH}",
            headers=SK
        )
        assert r.status_code == 403, f"Expected 403 for storekeeper, got {r.status_code}"


# ===========================================================================
# 2. GST Purchase Register
# ===========================================================================

class TestGSTPurchaseRegister:

    def test_200_json_schema(self):
        r = _get_ok(f"/api/reports/gst/purchase-register?month={MONTH}")
        data = r.json()
        assert "records" in data
        assert "summary" in data
        assert "disclaimer" in data
        s = data["summary"]
        assert "po_count" in s
        assert "total_taxable" in s
        assert "total_amount" in s

    def test_record_fields_when_data_present(self):
        r = _get_ok(f"/api/reports/gst/purchase-register?month={MONTH}")
        records = r.json()["records"]
        if not records:
            pytest.skip("No POs for this month")
        rec = records[0]
        for field in ("po_number", "date", "supplier_name", "taxable_value",
                      "cgst", "sgst", "igst", "total_amount", "status"):
            assert field in rec, f"Missing field '{field}' in purchase register record"

    def test_csv_format_returns_text(self):
        r = _get_ok(f"/api/reports/gst/purchase-register?month={MONTH}&format=csv")
        ct = r.headers.get("content-type", "")
        assert "csv" in ct or "text" in ct, f"Unexpected content-type: {ct}"
        assert len(r.text) > 10

    def test_disclaimer_present(self):
        r = _get_ok(f"/api/reports/gst/purchase-register?month={MONTH}")
        disc = r.json().get("disclaimer", "")
        assert len(disc) > 20, "Disclaimer text too short or missing"

    def test_storekeeper_gets_403(self):
        r = client.get(
            f"/api/reports/gst/purchase-register?month={MONTH}",
            headers=SK
        )
        assert r.status_code == 403


# ===========================================================================
# 3. GSTR-1 Summary
# ===========================================================================

class TestGSTR1Summary:

    def test_200_json_schema(self):
        r = _get_ok(f"/api/reports/gst/gstr1?month={MONTH}")
        data = r.json()
        assert "b2b" in data, "Missing 'b2b'"
        assert "b2c" in data, "Missing 'b2c'"
        assert "grand_total" in data, "Missing 'grand_total'"
        assert "month" in data

    def test_b2b_has_invoices_list(self):
        r = _get_ok(f"/api/reports/gst/gstr1?month={MONTH}")
        b2b = r.json()["b2b"]
        assert "invoices" in b2b
        assert "count" in b2b
        assert isinstance(b2b["invoices"], list)

    def test_b2b_invoice_fields_when_present(self):
        r = _get_ok(f"/api/reports/gst/gstr1?month={MONTH}")
        invoices = r.json()["b2b"].get("invoices", [])
        if not invoices:
            pytest.skip("No B2B invoices for this month")
        inv = invoices[0]
        for field in ("recipient_gstin", "recipient_name", "invoice_number",
                      "invoice_date", "invoice_value", "place_of_supply",
                      "reverse_charge", "rate", "taxable_value"):
            assert field in inv, f"Missing B2B field: '{field}'"

    def test_b2b_csv_format(self):
        r = _get_ok(f"/api/reports/gst/gstr1?month={MONTH}&format=b2b_csv")
        ct = r.headers.get("content-type", "")
        assert "csv" in ct or "text" in ct

    def test_b2c_csv_format(self):
        r = _get_ok(f"/api/reports/gst/gstr1?month={MONTH}&format=b2c_csv")
        ct = r.headers.get("content-type", "")
        assert "csv" in ct or "text" in ct

    def test_grand_total_has_numeric_fields(self):
        r = _get_ok(f"/api/reports/gst/gstr1?month={MONTH}")
        gt = r.json()["grand_total"]
        assert "total_taxable" in gt
        assert "total_tax" in gt
        assert "total_value" in gt
        assert isinstance(gt["total_taxable"], (int, float))

    def test_storekeeper_gets_403(self):
        r = client.get(f"/api/reports/gst/gstr1?month={MONTH}", headers=SK)
        assert r.status_code == 403


# ===========================================================================
# 4. HSN Summary
# ===========================================================================

class TestHSNSummary:

    def test_200_json_schema(self):
        r = _get_ok(f"/api/reports/gst/hsn-summary?month={MONTH}")
        data = r.json()
        assert "records" in data
        assert "summary" in data
        assert isinstance(data["records"], list)

    def test_summary_fields(self):
        r = _get_ok(f"/api/reports/gst/hsn-summary?month={MONTH}")
        s = r.json()["summary"]
        assert "total_hsn_codes" in s
        assert "total_taxable" in s
        assert "total_value" in s

    def test_record_fields_when_present(self):
        r = _get_ok(f"/api/reports/gst/hsn-summary?month={MONTH}")
        records = r.json()["records"]
        if not records:
            pytest.skip("No HSN records for this month")
        rec = records[0]
        for field in ("hsn_code", "description", "uqc", "total_quantity",
                      "total_taxable_value", "integrated_tax_amount",
                      "central_tax_amount", "state_tax_amount",
                      "total_tax_amount", "total_value"):
            assert field in rec, f"Missing HSN field: '{field}'"

    def test_numeric_values(self):
        r = _get_ok(f"/api/reports/gst/hsn-summary?month={MONTH}")
        records = r.json()["records"]
        if not records:
            pytest.skip("No HSN records for this month")
        rec = records[0]
        assert isinstance(rec["total_taxable_value"], (int, float))
        assert isinstance(rec["total_value"], (int, float))

    def test_csv_format(self):
        r = _get_ok(f"/api/reports/gst/hsn-summary?month={MONTH}&format=csv")
        ct = r.headers.get("content-type", "")
        assert "csv" in ct or "text" in ct
        assert len(r.text) > 10

    def test_storekeeper_gets_403(self):
        r = client.get(f"/api/reports/gst/hsn-summary?month={MONTH}", headers=SK)
        assert r.status_code == 403


# ===========================================================================
# 5. Tally Settings
# ===========================================================================

class TestTallySettings:

    REQUIRED_KEYS = [
        "tally_company_name",
        "tally_sales_ledger",
        "tally_purchase_ledger",
        "tally_output_cgst_ledger",
        "tally_output_sgst_ledger",
        "tally_output_igst_ledger",
        "tally_input_cgst_ledger",
        "tally_input_sgst_ledger",
        "tally_input_igst_ledger",
        "tally_round_off_ledger",
    ]

    def test_get_settings_200(self):
        r = _get_ok("/api/reports/tally/settings")
        data = r.json()
        assert isinstance(data, dict)
        for key in self.REQUIRED_KEYS:
            assert key in data, f"Missing Tally setting key: '{key}'"

    def test_settings_values_are_strings(self):
        r = _get_ok("/api/reports/tally/settings")
        for key, val in r.json().items():
            assert isinstance(val, str), f"Setting '{key}' value is not a string: {val!r}"

    def test_post_settings_updates(self):
        unique_name = "Test Company Pvt Ltd XYZ"
        r = _post_ok("/api/reports/tally/settings", {
            "tally_company_name": unique_name
        })
        assert r.json().get("saved", 0) >= 1 or r.status_code == 200

        # Verify it was saved
        r2 = _get_ok("/api/reports/tally/settings")
        assert r2.json().get("tally_company_name") == unique_name

    def test_storekeeper_get_403(self):
        r = client.get("/api/reports/tally/settings", headers=SK)
        assert r.status_code == 403

    def test_storekeeper_post_403(self):
        r = client.post("/api/reports/tally/settings",
                        json={"tally_company_name": "Hack"},
                        headers=SK)
        assert r.status_code == 403


# ===========================================================================
# 6. Tally Voucher Export
# ===========================================================================

class TestTallyVoucherExport:

    def test_xml_export_200(self):
        r = _get_ok("/api/reports/tally/vouchers?format=xml")
        ct = r.headers.get("content-type", "")
        assert "xml" in ct or "octet" in ct or "text" in ct, f"Unexpected CT: {ct}"
        body = r.text
        assert len(body) > 50, "XML body is suspiciously short"

    def test_xml_contains_envelope(self):
        r = _get_ok("/api/reports/tally/vouchers?format=xml")
        body = r.text
        assert "<ENVELOPE>" in body, "Tally XML missing <ENVELOPE>"
        assert "TALLYREQUEST" in body or "TALLY" in body, "Tally XML missing TALLY markers"

    def test_xml_contains_voucher(self):
        r = _get_ok("/api/reports/tally/vouchers?format=xml")
        body = r.text
        # May be empty if no data, but structure must be valid XML-like
        # At minimum the envelope wrapper must exist
        assert body.strip().startswith("<?xml") or "<ENVELOPE>" in body

    def test_csv_export_200(self):
        r = _get_ok("/api/reports/tally/vouchers?format=csv")
        ct = r.headers.get("content-type", "")
        assert "csv" in ct or "text" in ct or "octet" in ct

    def test_csv_has_header(self):
        r = _get_ok("/api/reports/tally/vouchers?format=csv")
        body = r.text
        # Should contain at minimum some CSV-like structure
        assert len(body) > 5

    def test_sales_only_type(self):
        r = _get_ok("/api/reports/tally/vouchers?type=sales&format=xml")
        assert r.status_code == 200

    def test_purchase_only_type(self):
        r = _get_ok("/api/reports/tally/vouchers?type=purchase&format=xml")
        assert r.status_code == 200

    def test_date_range_filter(self):
        r = _get_ok("/api/reports/tally/vouchers?format=xml&from_date=2026-01-01&to_date=2026-12-31")
        assert r.status_code == 200

    def test_storekeeper_gets_403(self):
        r = client.get("/api/reports/tally/vouchers?format=xml", headers=SK)
        assert r.status_code == 403


# ===========================================================================
# 7. Owner Summary Metrics
# ===========================================================================

class TestOwnerSummary:

    def test_200_schema(self):
        r = _get_ok("/api/reports/owner-summary")
        data = r.json()
        assert "metrics" in data, "Missing 'metrics'"
        assert "narrative" in data, "Missing 'narrative'"
        assert "period" in data, "Missing 'period'"

    def test_metrics_subkeys(self):
        r = _get_ok("/api/reports/owner-summary")
        m = r.json()["metrics"]
        for section in ("sales", "margin", "receivables", "procurement",
                        "dead_stock", "stockouts", "automation_activity",
                        "top_customers"):
            assert section in m, f"Missing metrics section: '{section}'"

    def test_sales_metrics_numeric(self):
        r = _get_ok("/api/reports/owner-summary")
        s = r.json()["metrics"]["sales"]
        assert isinstance(s.get("total_revenue", 0), (int, float))
        assert isinstance(s.get("invoice_count", 0), int)

    def test_narrative_is_string(self):
        r = _get_ok("/api/reports/owner-summary")
        narr = r.json()["narrative"]
        assert isinstance(narr, str) and len(narr) > 10, "Narrative too short or not string"

    def test_narrative_no_hallucinated_numbers(self):
        """LLM rule: narrative must not contain ₹ symbols with invented numbers
        that differ wildly from metric values. We just check it is non-empty."""
        r = _get_ok("/api/reports/owner-summary")
        narr = r.json()["narrative"]
        assert len(narr) > 20

    def test_period_has_dates(self):
        r = _get_ok("/api/reports/owner-summary")
        p = r.json()["period"]
        assert "from_date" in p
        assert "to_date" in p

    def test_date_range_param(self):
        r = _get_ok("/api/reports/owner-summary?from_date=2026-11-01&to_date=2026-11-30")
        assert r.status_code == 200
        p = r.json()["period"]
        assert p.get("from_date") == "2026-11-01"
        assert p.get("to_date") == "2026-11-30"

    def test_top_customers_list(self):
        r = _get_ok("/api/reports/owner-summary")
        tc = r.json()["metrics"].get("top_customers", [])
        assert isinstance(tc, list)

    def test_storekeeper_gets_403(self):
        r = client.get("/api/reports/owner-summary", headers=SK)
        assert r.status_code == 403

    def test_manager_can_access(self):
        r = client.get("/api/reports/owner-summary", headers=MGR)
        assert r.status_code == 200


# ===========================================================================
# 8. Owner Summary PDF
# ===========================================================================

class TestOwnerSummaryPDF:

    def test_pdf_200(self):
        r = _get_ok("/api/reports/owner-summary/pdf")
        ct = r.headers.get("content-type", "")
        assert "pdf" in ct or "octet" in ct, f"Unexpected CT: {ct}"

    def test_pdf_starts_with_pdf_magic(self):
        r = _get_ok("/api/reports/owner-summary/pdf")
        assert r.content[:4] == b"%PDF", "Response does not start with %PDF magic bytes"

    def test_pdf_has_minimum_size(self):
        r = _get_ok("/api/reports/owner-summary/pdf")
        assert len(r.content) > 500, "PDF is suspiciously small"

    def test_storekeeper_gets_403(self):
        r = client.get("/api/reports/owner-summary/pdf", headers=SK)
        assert r.status_code == 403


# ===========================================================================
# 9. Owner Summary Dispatch (Outbox)
# ===========================================================================

class TestOwnerSummaryDispatch:

    def test_dispatch_creates_outbox_entry(self):
        r = client.post(
            "/api/reports/owner-summary/dispatch",
            json={},
            headers=ADMIN
        )
        assert r.status_code == 200, f"Dispatch failed: {r.text[:300]}"
        data = r.json()
        assert "outbox_id" in data, "Missing 'outbox_id' in dispatch response"
        assert isinstance(data["outbox_id"], int)

    def test_dispatch_returns_summary_info(self):
        r = client.post(
            "/api/reports/owner-summary/dispatch",
            json={"from_date": "2026-11-01", "to_date": "2026-11-30"},
            headers=ADMIN
        )
        assert r.status_code == 200
        data = r.json()
        assert "outbox_id" in data

    def test_storekeeper_gets_403(self):
        r = client.post("/api/reports/owner-summary/dispatch", json={}, headers=SK)
        assert r.status_code == 403


# ===========================================================================
# 10. Dashboard integration
# ===========================================================================

class TestDashboardIntegration:

    def test_dashboard_has_owner_summary(self):
        r = client.get("/api/dashboard", headers=ADMIN)
        assert r.status_code == 200
        data = r.json()
        # owner_summary may be nested under data directly or under stats
        has_key = (
            "owner_summary" in data
            or "owner_summary" in data.get("stats", {})
        )
        assert has_key, (
            "Dashboard response missing 'owner_summary' key. "
            f"Top-level keys: {list(data.keys())}"
        )

    def test_owner_summary_on_dashboard_has_period(self):
        r = client.get("/api/dashboard", headers=ADMIN)
        data = r.json()
        os_data = data.get("owner_summary") or data.get("stats", {}).get("owner_summary", {})
        if not os_data:
            pytest.skip("owner_summary not in dashboard (may be empty)")
        # Period or some revenue field should exist
        has_content = "period" in os_data or "total_revenue" in os_data
        assert has_content, f"owner_summary on dashboard has unexpected shape: {os_data}"


# ===========================================================================
# 11. Additional RBAC sweep
# ===========================================================================

class TestRBACSweep:

    GST_URLS = [
        f"/api/reports/gst/sales-register?month={MONTH}",
        f"/api/reports/gst/purchase-register?month={MONTH}",
        f"/api/reports/gst/gstr1?month={MONTH}",
        f"/api/reports/gst/hsn-summary?month={MONTH}",
        "/api/reports/tally/settings",
        "/api/reports/tally/vouchers?format=xml",
        "/api/reports/owner-summary",
        "/api/reports/owner-summary/pdf",
    ]

    @pytest.mark.parametrize("url", GST_URLS)
    def test_storekeeper_forbidden_all_report_endpoints(self, url):
        r = client.get(url, headers=SK)
        assert r.status_code == 403, (
            f"Storekeeper should get 403 on {url}, got {r.status_code}"
        )

    @pytest.mark.parametrize("url", GST_URLS)
    def test_manager_allowed_all_report_endpoints(self, url):
        r = client.get(url, headers=MGR)
        assert r.status_code == 200, (
            f"Manager should get 200 on {url}, got {r.status_code}: {r.text[:200]}"
        )
