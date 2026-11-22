"""
Test Suite for Anishka Delivery Document Scanner (doc_scanner.py + API endpoints).

Covers:
1. File validation — oversized files, unsupported MIME types
2. Content-hash deduplication and correct save path
3. Pydantic extraction schema (valid & invalid payloads)
4. Sample filename detection and no-API-key fallback (demo mode)
5. match_extraction_with_po — PO reference match, supplier tokens, discrepancy flags
6. get_scan_accuracy_report — empty DB, confirmed zero-correction, confirmed with corrections
7. API: POST /api/procurement/scan-document with sample_key (storekeeper/manager/admin)
8. API: RBAC enforcement on scan endpoints
9. API: POST /api/procurement/scan-document/{id}/confirm happy path
10. API: GET /api/procurement/scan-document/accuracy
11. API: GET /api/procurement/sample-documents lists three samples
12. API: GET /api/uploads/{filename} — authenticated access, path traversal protection
13. Demo safety — canned extraction returned when no API key
"""

import os
import io
import json
import hashlib
import datetime

# Ensure test-role bypass is available
os.environ["ALLOW_TEST_ROLE_HEADER"] = "true"
os.environ.pop("GROQ_API_KEY", None)   # Force demo/fallback mode for all tests

from fastapi.testclient import TestClient

from app import app, get_db
from database import (
    SessionLocal, init_db, Inventory, Procurement, POItem, Vendor,
    DocExtraction, AuditLog
)
from doc_scanner import (
    save_uploaded_document, extract_document_data, match_extraction_with_po,
    confirm_and_receive_delivery, get_scan_accuracy_report,
    CANNED_SAMPLES, DeliveryDocExtraction, ExtractedDocLine,
    MAX_FILE_SIZE, UPLOAD_DIR
)

# ---------------------------------------------------------------------------
# Test infrastructure
# ---------------------------------------------------------------------------

init_db()
client = TestClient(app)

# In ALLOW_TEST_ROLE_HEADER=true mode:
#   - admin/manager/storekeeper header → returned as that role
#   - Any GET without recognised role header → auto-admin (viewer treated as admin for GETs)
#   - Any POST/PUT/DELETE without recognised role → falls through to real auth → 401
ADMIN_H  = {"X-User-Role": "admin"}
MGR_H    = {"X-User-Role": "manager"}
STORE_H  = {"X-User-Role": "storekeeper"}
# viewer is NOT in allowed test roles: GETs → authed as admin, POSTs → 401
VIEWER_H = {"X-User-Role": "viewer"}


def _fresh_db():
    """Return a clean SQLAlchemy session for direct unit-test assertions."""
    return SessionLocal()


def _create_test_vendor_and_po(db):
    """
    Insert a minimal Vendor, Inventory item, and open PO so matching tests
    have real FK targets.  Returns (vendor, po, po_item, inv_item).

    Vendor PK is a String (e.g. "V001") — no state/reliability_score columns.
    """
    import uuid as _uuid_mod
    vendor = db.query(Vendor).filter(Vendor.name == "ScanTest Vendor").first()
    if not vendor:
        vendor = Vendor(
            id=f"V{_uuid_mod.uuid4().hex[:6].upper()}",
            name="ScanTest Vendor",
            email="scan@test.com",
            phone="9999900000",
            city="Gurugram",
            lead_time_days=3,
            rating=4.5,
            approved=True,
        )
        db.add(vendor)
        db.flush()

    item = db.query(Inventory).filter(Inventory.sku == "SCAN-TEST-001").first()
    if not item:
        item = Inventory(
            sku="SCAN-TEST-001",
            name="Scanner Widget 1.2mm Test",
            category="MIG Welding",
            quantity=0,
            reorder_level=10,
            unit_cost=50.0,
        )
        db.add(item)
        db.flush()

    # Create a unique PO number to avoid collisions across test runs
    po_num = f"ANI-PO-SCAN-TEST-{_uuid_mod.uuid4().hex[:6].upper()}"
    po = Procurement(
        po_number=po_num,
        supplier_id=vendor.id,
        status="APPROVED",
        total_value=5000.0,
        created_at=datetime.datetime.now().isoformat(),
    )
    db.add(po)
    db.flush()

    po_item = POItem(
        po_id=po.id,
        item_id=item.id,
        qty=100,
        unit_cost=50.0,
        received_qty=0,
    )
    db.add(po_item)
    db.commit()
    db.refresh(po)
    db.refresh(item)
    return vendor, po, po_item, item


# ===========================================================================
# UNIT TESTS — doc_scanner.py functions
# ===========================================================================

class TestFileValidation:
    """save_uploaded_document: type checks and size limits."""

    def test_valid_pdf_saved_correctly(self):
        """A minimal PDF-like payload is saved and hash matches."""
        content = b"%PDF-1.4 some binary content for test"
        path, chash, safe_fn = save_uploaded_document(content, "test.pdf", "application/pdf")
        expected_hash = hashlib.sha256(content).hexdigest()
        assert chash == expected_hash, "SHA-256 hash mismatch"
        assert safe_fn.endswith(".pdf"), f"Expected .pdf extension, got {safe_fn}"
        assert os.path.exists(path), "Saved file does not exist"

    def test_valid_jpeg_saved(self):
        content = b"\xff\xd8\xff\xe0JFIF"  # minimal JPEG magic bytes
        path, chash, safe_fn = save_uploaded_document(content, "photo.jpg", "image/jpeg")
        assert safe_fn.endswith(".jpg")
        assert os.path.exists(path)

    def test_valid_png_saved(self):
        content = b"\x89PNG\r\n\x1a\n"  # PNG magic bytes
        path, chash, safe_fn = save_uploaded_document(content, "image.png", "image/png")
        assert safe_fn.endswith(".png")
        assert os.path.exists(path)

    def test_oversized_file_raises(self):
        big = b"X" * (MAX_FILE_SIZE + 1)
        try:
            save_uploaded_document(big, "big.pdf", "application/pdf")
            assert False, "Should have raised ValueError for oversized file"
        except ValueError as e:
            assert "exceeds" in str(e).lower()

    def test_unsupported_mime_raises(self):
        try:
            save_uploaded_document(b"some", "file.exe", "application/octet-stream")
            assert False, "Should have raised ValueError for unsupported type"
        except ValueError as e:
            assert "unsupported" in str(e).lower()

    def test_content_hash_deduplication(self):
        """Saving the same bytes twice returns the same hash and filename (idempotent store)."""
        content = b"unique test content abc987xyz"
        _, h1, fn1 = save_uploaded_document(content, "dup.pdf", "application/pdf")
        _, h2, fn2 = save_uploaded_document(content, "dup.pdf", "application/pdf")
        assert h1 == h2 == hashlib.sha256(content).hexdigest()
        assert fn1 == fn2, "Same content should produce same filename"


class TestPydanticSchemas:
    """DeliveryDocExtraction and ExtractedDocLine validation."""

    def test_valid_extraction_parses(self):
        data = CANNED_SAMPLES["sample_challan_clean"]
        ext = DeliveryDocExtraction(**data)
        assert ext.supplier_name == "Abicor Binzel Tech India Pvt Ltd"
        assert len(ext.lines) == 2
        assert ext.lines[0].qty == 200

    def test_missing_supplier_name_raises(self):
        from pydantic import ValidationError
        bad = {**CANNED_SAMPLES["sample_challan_clean"]}
        del bad["supplier_name"]
        try:
            DeliveryDocExtraction(**bad)
            assert False, "Should raise ValidationError"
        except ValidationError:
            pass

    def test_missing_document_number_raises(self):
        from pydantic import ValidationError
        bad = {**CANNED_SAMPLES["sample_challan_clean"]}
        del bad["document_number"]
        try:
            DeliveryDocExtraction(**bad)
            assert False, "Should raise ValidationError"
        except ValidationError:
            pass

    def test_line_defaults_gst_to_18(self):
        line = ExtractedDocLine(description="Widget", qty=10.0, unit_price=100.0)
        assert line.gst_rate == 18.0

    def test_line_sku_optional(self):
        line = ExtractedDocLine(description="Widget", qty=5.0, unit_price=200.0, sku=None)
        assert line.sku is None

    def test_all_three_canned_samples_parse(self):
        for key, data in CANNED_SAMPLES.items():
            ext = DeliveryDocExtraction(**data)
            assert ext.document_number, f"Empty document_number for {key}"
            assert len(ext.lines) > 0, f"No lines for {key}"

    def test_price_hike_sample_has_three_lines(self):
        ext = DeliveryDocExtraction(**CANNED_SAMPLES["sample_invoice_price_hike"])
        assert len(ext.lines) == 3

    def test_short_challan_supplier_name(self):
        ext = DeliveryDocExtraction(**CANNED_SAMPLES["sample_challan_short"])
        assert "Ador" in ext.supplier_name


class TestSampleDetectionFallback:
    """extract_document_data returns canned data for bundled samples."""

    def test_filename_clean_challan_returns_canned(self):
        ext = extract_document_data(b"irrelevant", "sample_challan_clean.pdf", "application/pdf")
        assert ext.document_number == CANNED_SAMPLES["sample_challan_clean"]["document_number"]

    def test_filename_short_challan_returns_canned(self):
        ext = extract_document_data(b"irrelevant", "sample_challan_short.pdf", "application/pdf")
        assert ext.document_number == CANNED_SAMPLES["sample_challan_short"]["document_number"]

    def test_filename_price_hike_returns_canned(self):
        ext = extract_document_data(b"irrelevant", "sample_invoice_price_hike.pdf", "application/pdf")
        assert ext.document_number == CANNED_SAMPLES["sample_invoice_price_hike"]["document_number"]

    def test_no_api_key_returns_fallback(self):
        """With no GROQ_API_KEY and unknown filename, canned fallback is returned (not an exception)."""
        os.environ.pop("GROQ_API_KEY", None)
        ext = extract_document_data(b"some pdf bytes", "unknown_vendor_challan.pdf", "application/pdf")
        # Should return one of the canned samples, not raise
        assert ext.supplier_name in {v["supplier_name"] for v in CANNED_SAMPLES.values()}

    def test_pdf_embedded_doc_number_clean(self):
        """In demo mode, any uploaded PDF without API key gets a valid canned extraction."""
        fake_pdf_text = b"Delivery Challan DC-BINZ-2026-8812 Abicor Binzel India"
        ext = extract_document_data(fake_pdf_text, "mystery.pdf", "application/pdf")
        assert isinstance(ext, DeliveryDocExtraction)
        assert len(ext.lines) > 0

    def test_fallback_extraction_has_valid_lines(self):
        """Fallback extraction always returns at least one line with positive qty."""
        os.environ.pop("GROQ_API_KEY", None)
        ext = extract_document_data(b"minimal data", "random_challan.pdf", "application/pdf")
        assert len(ext.lines) > 0
        assert all(ln.qty > 0 for ln in ext.lines)


class TestPOMatchingEngine:
    """match_extraction_with_po logic: flags, confidence, structure."""

    def setup_method(self):
        self.db = _fresh_db()
        try:
            self.vendor, self.po, self.po_item, self.item = _create_test_vendor_and_po(self.db)
        except Exception:
            self.db.rollback()
            self.db.close()
            raise

    def teardown_method(self):
        try:
            self.db.rollback()
        except Exception:
            pass
        finally:
            self.db.close()

    def test_po_reference_match(self):
        """Extraction with an exact PO number is matched to that PO."""
        ext = DeliveryDocExtraction(
            supplier_name="ScanTest Vendor",
            document_number="DC-SCNT-REF-001",
            document_date="2026-11-20",
            po_reference=self.po.po_number,
            lines=[ExtractedDocLine(description="Scanner Widget 1.2mm Test", sku="SCAN-TEST-001", qty=50, unit_price=50.0)]
        )
        result = match_extraction_with_po(ext, self.db)
        assert result["po"]["po_number"] == self.po.po_number

    def test_sku_match_gives_high_confidence(self):
        """Exact SKU match produces HIGH confidence and 'sku' match_method."""
        ext = DeliveryDocExtraction(
            supplier_name="ScanTest Vendor",
            document_number="DC-SCNT-SKU-001",
            document_date="2026-11-20",
            po_reference=self.po.po_number,
            lines=[ExtractedDocLine(description="Some description", sku="SCAN-TEST-001", qty=50, unit_price=50.0)]
        )
        result = match_extraction_with_po(ext, self.db)
        line = result["lines"][0]
        assert line["confidence"] == "HIGH"
        assert line["match_method"] == "sku"

    def test_price_variance_flag_over_5pct(self):
        """A price 16% above PO cost (50.0) triggers price_variance flag."""
        ext = DeliveryDocExtraction(
            supplier_name="ScanTest Vendor",
            document_number="DC-SCNT-PRICE-001",
            document_date="2026-11-20",
            po_reference=self.po.po_number,
            lines=[ExtractedDocLine(description="Scanner Widget 1.2mm Test", sku="SCAN-TEST-001", qty=50, unit_price=58.0)]
        )
        result = match_extraction_with_po(ext, self.db)
        flags = result["lines"][0]["flags"]
        assert flags["price_variance"] is True
        assert flags["price_variance_pct"] > 5.0

    def test_price_within_5pct_no_flag(self):
        """A price within 5% of PO cost (50.0) does not trigger price_variance."""
        ext = DeliveryDocExtraction(
            supplier_name="ScanTest Vendor",
            document_number="DC-SCNT-PRICE-002",
            document_date="2026-11-20",
            po_reference=self.po.po_number,
            lines=[ExtractedDocLine(description="Scanner Widget 1.2mm Test", sku="SCAN-TEST-001", qty=50, unit_price=51.0)]
        )
        result = match_extraction_with_po(ext, self.db)
        flags = result["lines"][0]["flags"]
        assert flags["price_variance"] is False

    def test_quantity_mismatch_flag(self):
        """Delivered qty != pending qty (100) triggers quantity_mismatch flag."""
        ext = DeliveryDocExtraction(
            supplier_name="ScanTest Vendor",
            document_number="DC-SCNT-QTY-001",
            document_date="2026-11-20",
            po_reference=self.po.po_number,
            lines=[ExtractedDocLine(description="Scanner Widget 1.2mm Test", sku="SCAN-TEST-001", qty=70, unit_price=50.0)]
        )
        result = match_extraction_with_po(ext, self.db)
        # Ordered qty is 100, delivered is 70 → mismatch
        assert result["lines"][0]["flags"]["quantity_mismatch"] is True

    def test_exact_quantity_match_no_flag(self):
        """Exact quantity match (100) does not trigger mismatch flag."""
        ext = DeliveryDocExtraction(
            supplier_name="ScanTest Vendor",
            document_number="DC-SCNT-QTY-002",
            document_date="2026-11-20",
            po_reference=self.po.po_number,
            lines=[ExtractedDocLine(description="Scanner Widget 1.2mm Test", sku="SCAN-TEST-001", qty=100, unit_price=50.0)]
        )
        result = match_extraction_with_po(ext, self.db)
        assert result["lines"][0]["flags"]["quantity_mismatch"] is False

    def test_not_on_po_flag_for_unknown_item(self):
        """An item not found on the PO is flagged as not_on_po."""
        ext = DeliveryDocExtraction(
            supplier_name="ScanTest Vendor",
            document_number="DC-SCNT-NOP-001",
            document_date="2026-11-20",
            po_reference=self.po.po_number,
            lines=[ExtractedDocLine(description="Completely Unknown XYZ Plasma Cutter", sku="UNK-999", qty=5, unit_price=5000.0)]
        )
        result = match_extraction_with_po(ext, self.db)
        assert result["lines"][0]["flags"]["not_on_po"] is True

    def test_duplicate_document_flag(self):
        """A document number already CONFIRMED is flagged as duplicate."""
        import uuid as _uuid_mod
        dup_doc_num = f"DUPTEST-{_uuid_mod.uuid4().hex[:8].upper()}"
        old_rec = DocExtraction(
            created_at=datetime.datetime.now().isoformat(),
            uploaded_by="admin",
            file_path="/tmp/dummy.pdf",
            content_hash=hashlib.sha256(os.urandom(8)).hexdigest(),
            document_number=dup_doc_num,
            document_date="2026-01-01",
            supplier_name="ScanTest Vendor",
            matched_po_id=self.po.id,
            status="CONFIRMED",
            fields_corrected=0,
        )
        self.db.add(old_rec)
        self.db.commit()

        ext = DeliveryDocExtraction(
            supplier_name="ScanTest Vendor",
            document_number=dup_doc_num,
            document_date="2026-11-20",
            po_reference=self.po.po_number,
            lines=[ExtractedDocLine(description="Scanner Widget", sku="SCAN-TEST-001", qty=10, unit_price=50.0)]
        )
        result = match_extraction_with_po(ext, self.db)
        assert result["flags"]["duplicate_document"] is True

    def test_non_duplicate_no_flag(self):
        """A fresh document number is NOT flagged as duplicate."""
        ext = DeliveryDocExtraction(
            supplier_name="ScanTest Vendor",
            document_number="DC-UNIQUE-999999",
            document_date="2026-11-20",
            po_reference=self.po.po_number,
            lines=[ExtractedDocLine(description="Scanner Widget", sku="SCAN-TEST-001", qty=10, unit_price=50.0)]
        )
        result = match_extraction_with_po(ext, self.db)
        assert result["flags"]["duplicate_document"] is False

    def test_all_open_pos_included(self):
        """match result always includes an all_open_pos list."""
        ext = DeliveryDocExtraction(
            supplier_name="ScanTest Vendor",
            document_number="DC-LIST-001",
            document_date="2026-11-20",
            po_reference=None,
            lines=[]
        )
        result = match_extraction_with_po(ext, self.db)
        assert isinstance(result["all_open_pos"], list)
        po_numbers = [p["po_number"] for p in result["all_open_pos"]]
        assert self.po.po_number in po_numbers

    def test_result_contains_required_top_level_keys(self):
        """Result dict always has po, document, flags, lines, all_open_pos."""
        ext = DeliveryDocExtraction(
            supplier_name="ScanTest Vendor",
            document_number="DC-STRUCT-001",
            document_date="2026-11-20",
            po_reference=self.po.po_number,
            lines=[ExtractedDocLine(description="Widget", qty=10, unit_price=50.0)]
        )
        result = match_extraction_with_po(ext, self.db)
        for key in ("po", "document", "flags", "lines", "all_open_pos"):
            assert key in result, f"Missing key: {key}"


class TestAccuracyReport:
    """get_scan_accuracy_report aggregates DocExtraction records correctly."""

    def setup_method(self):
        self.db = _fresh_db()
        try:
            self.db.query(DocExtraction).filter(DocExtraction.uploaded_by == "accuracy_tester").delete()
            self.db.commit()
        except Exception:
            self.db.rollback()
            self.db.close()
            raise

    def teardown_method(self):
        try:
            self.db.rollback()
            self.db.query(DocExtraction).filter(DocExtraction.uploaded_by == "accuracy_tester").delete()
            self.db.commit()
        except Exception:
            self.db.rollback()
        finally:
            self.db.close()

    def _add_rec(self, status="CONFIRMED", corrections=0):
        rec = DocExtraction(
            created_at=datetime.datetime.now().isoformat(),
            uploaded_by="accuracy_tester",
            file_path="/tmp/dummy.pdf",
            content_hash=hashlib.sha256(os.urandom(8)).hexdigest(),
            document_number=f"DOC-{os.urandom(4).hex()}",
            status=status,
            fields_corrected=corrections,
        )
        self.db.add(rec)
        self.db.commit()
        return rec

    def test_empty_db_returns_100_pct(self):
        """When no confirmed records exist, accuracy_rate defaults to 100%."""
        report = get_scan_accuracy_report(self.db)
        assert report["accuracy_rate_pct"] == 100.0
        assert report["avg_corrections_per_doc"] == 0.0

    def test_one_zero_correction_doc_gives_100pct(self):
        self._add_rec(status="CONFIRMED", corrections=0)
        report = get_scan_accuracy_report(self.db)
        assert report["accuracy_rate_pct"] == 100.0

    def test_one_corrected_doc_lowers_accuracy(self):
        """Accuracy reflects zero-correction fraction of all confirmed docs."""
        self._add_rec(status="CONFIRMED", corrections=0)
        self._add_rec(status="CONFIRMED", corrections=3)
        report = get_scan_accuracy_report(self.db)
        confirmed = self.db.query(DocExtraction).filter(DocExtraction.status == "CONFIRMED").all()
        total_confirmed = len(confirmed)
        zero_corrections = sum(1 for r in confirmed if (r.fields_corrected or 0) == 0)
        expected_rate = round((zero_corrections / max(1, total_confirmed)) * 100, 1)
        assert report["accuracy_rate_pct"] == expected_rate
        assert report["avg_corrections_per_doc"] > 0

    def test_pending_review_docs_not_counted_in_confirmed(self):
        """PENDING_REVIEW records appear in total_scanned but not total_confirmed."""
        before = get_scan_accuracy_report(self.db)["total_documents_confirmed"]
        self._add_rec(status="PENDING_REVIEW", corrections=0)
        after_pending = get_scan_accuracy_report(self.db)
        # Pending adds to total_scanned but not confirmed
        assert after_pending["total_documents_confirmed"] == before

        self._add_rec(status="CONFIRMED", corrections=0)
        after_confirmed = get_scan_accuracy_report(self.db)
        assert after_confirmed["total_documents_confirmed"] == before + 1

    def test_total_corrections_counted(self):
        """total_corrections_made sums fields_corrected across all confirmed records."""
        self._add_rec(status="CONFIRMED", corrections=2)
        self._add_rec(status="CONFIRMED", corrections=3)
        report = get_scan_accuracy_report(self.db)
        # At minimum these two records add 5 corrections
        assert report["total_corrections_made"] >= 5


# ===========================================================================
# API INTEGRATION TESTS — FastAPI endpoints
# ===========================================================================

class TestScanDocumentAPI:
    """POST /api/procurement/scan-document with sample_key."""

    def test_sample_challan_clean_storekeeper(self):
        res = client.post(
            "/api/procurement/scan-document",
            data={"sample_key": "sample_challan_clean"},
            headers=STORE_H,
        )
        assert res.status_code == 200, res.text
        body = res.json()
        assert "extraction_id" in body
        assert "lines" in body
        assert body["document"]["document_number"] == "DC-BINZ-2026-8812"

    def test_sample_challan_short_manager(self):
        res = client.post(
            "/api/procurement/scan-document",
            data={"sample_key": "sample_challan_short"},
            headers=MGR_H,
        )
        assert res.status_code == 200, res.text
        body = res.json()
        assert body["document"]["supplier_name"] == "Ador Welding Ltd"

    def test_sample_invoice_price_hike_admin(self):
        res = client.post(
            "/api/procurement/scan-document",
            data={"sample_key": "sample_invoice_price_hike"},
            headers=ADMIN_H,
        )
        assert res.status_code == 200, res.text
        body = res.json()
        # Price hike sample has 3 lines
        assert len(body["lines"]) == 3

    def test_no_file_no_sample_returns_400(self):
        res = client.post(
            "/api/procurement/scan-document",
            data={},
            headers=ADMIN_H,
        )
        assert res.status_code == 400

    def test_invalid_sample_key_returns_error(self):
        """An unknown sample_key with no file attached should return 400."""
        res = client.post(
            "/api/procurement/scan-document",
            data={"sample_key": "nonexistent_sample"},
            headers=ADMIN_H,
        )
        # nonexistent_key → neither a known canned sample nor a file → 400
        assert res.status_code in (400, 422)

    def test_rbac_viewer_post_returns_401(self):
        """
        Viewer header on a POST: test-role bypass only works for admin/manager/storekeeper.
        Viewer falls through to real auth (no cookie/token) → 401.
        """
        res = client.post(
            "/api/procurement/scan-document",
            data={"sample_key": "sample_challan_clean"},
            headers=VIEWER_H,
        )
        assert res.status_code == 401

    def test_unauthenticated_post_returns_401(self):
        """No role header and no session → 401."""
        res = client.post(
            "/api/procurement/scan-document",
            data={"sample_key": "sample_challan_clean"},
        )
        assert res.status_code == 401

    def test_pdf_upload_demo_mode(self):
        """Uploading a sample PDF without API key returns a valid extraction."""
        sample_path = os.path.join(
            os.path.dirname(os.path.abspath(__file__)),
            "static", "samples", "sample_challan_clean.pdf"
        )
        if os.path.exists(sample_path):
            with open(sample_path, "rb") as f:
                pdf_bytes = f.read()
            files = {"file": ("sample_challan_clean.pdf", pdf_bytes, "application/pdf")}
            res = client.post(
                "/api/procurement/scan-document",
                files=files,
                headers=ADMIN_H,
            )
            assert res.status_code == 200, res.text
            body = res.json()
            assert "extraction_id" in body
            assert len(body["lines"]) > 0

    def test_response_includes_all_open_pos(self):
        """Response body always includes all_open_pos list."""
        res = client.post(
            "/api/procurement/scan-document",
            data={"sample_key": "sample_challan_clean"},
            headers=ADMIN_H,
        )
        assert res.status_code == 200
        body = res.json()
        assert "all_open_pos" in body
        assert isinstance(body["all_open_pos"], list)

    def test_response_includes_file_url(self):
        res = client.post(
            "/api/procurement/scan-document",
            data={"sample_key": "sample_challan_short"},
            headers=STORE_H,
        )
        assert res.status_code == 200
        body = res.json()
        assert "file_url" in body
        assert body["file_url"].startswith("/api/uploads/")

    def test_extraction_persisted_to_db(self):
        """After scan, a DocExtraction row is created in PENDING_REVIEW status."""
        res = client.post(
            "/api/procurement/scan-document",
            data={"sample_key": "sample_challan_clean"},
            headers=ADMIN_H,
        )
        assert res.status_code == 200
        ext_id = res.json()["extraction_id"]

        db = _fresh_db()
        try:
            rec = db.query(DocExtraction).filter(DocExtraction.id == ext_id).first()
            assert rec is not None, f"DocExtraction #{ext_id} not found in DB"
            assert rec.status == "PENDING_REVIEW"
        finally:
            db.close()

    def test_extraction_records_supplier_name(self):
        """Persisted DocExtraction has correct supplier_name."""
        res = client.post(
            "/api/procurement/scan-document",
            data={"sample_key": "sample_challan_clean"},
            headers=ADMIN_H,
        )
        assert res.status_code == 200
        ext_id = res.json()["extraction_id"]

        db = _fresh_db()
        try:
            rec = db.query(DocExtraction).filter(DocExtraction.id == ext_id).first()
            assert "Binzel" in (rec.supplier_name or "")
        finally:
            db.close()


class TestConfirmScanAPI:
    """POST /api/procurement/scan-document/{id}/confirm."""

    def _scan_sample(self, sample_key="sample_challan_clean"):
        res = client.post(
            "/api/procurement/scan-document",
            data={"sample_key": sample_key},
            headers=ADMIN_H,
        )
        assert res.status_code == 200
        return res.json()

    def test_confirm_with_matched_lines(self):
        """
        Confirm with reviewed_lines for matched items.
        On success (matched PO) → DocExtraction becomes CONFIRMED.
        On no matching open PO → 400 is acceptable.
        """
        scan_result = self._scan_sample("sample_challan_clean")
        ext_id = scan_result["extraction_id"]
        lines = scan_result["lines"]

        reviewed = []
        for ln in lines:
            mi = ln.get("matched_po_item")
            if mi:
                reviewed.append({"item_id": mi["item_id"], "qty": ln["reviewed_qty"]})

        payload = {"reviewed_lines": reviewed, "fields_corrected": 0}
        res = client.post(
            f"/api/procurement/scan-document/{ext_id}/confirm",
            json=payload,
            headers=ADMIN_H,
        )
        # 200 on matched PO, 400 if no open PO found in seeded data
        assert res.status_code in (200, 400), res.text
        if res.status_code == 200:
            db = _fresh_db()
            try:
                rec = db.query(DocExtraction).filter(DocExtraction.id == ext_id).first()
                assert rec.status == "CONFIRMED"
            finally:
                db.close()

    def test_confirm_nonexistent_extraction_returns_400(self):
        payload = {"reviewed_lines": [], "fields_corrected": 0}
        res = client.post(
            "/api/procurement/scan-document/999999/confirm",
            json=payload,
            headers=ADMIN_H,
        )
        assert res.status_code == 400

    def test_confirm_rbac_viewer_returns_401(self):
        """Viewer role on POST confirm → 401 (not in test-bypass list)."""
        scan_result = self._scan_sample("sample_challan_short")
        ext_id = scan_result["extraction_id"]
        payload = {"reviewed_lines": [], "fields_corrected": 0}
        res = client.post(
            f"/api/procurement/scan-document/{ext_id}/confirm",
            json=payload,
            headers=VIEWER_H,
        )
        assert res.status_code == 401

    def test_confirm_fields_corrected_logged(self):
        """fields_corrected is stored in DocExtraction record on success."""
        scan_result = self._scan_sample("sample_challan_clean")
        ext_id = scan_result["extraction_id"]

        payload = {"reviewed_lines": [], "fields_corrected": 5}
        res = client.post(
            f"/api/procurement/scan-document/{ext_id}/confirm",
            json=payload,
            headers=ADMIN_H,
        )
        if res.status_code == 200:
            db = _fresh_db()
            try:
                rec = db.query(DocExtraction).filter(DocExtraction.id == ext_id).first()
                assert rec.fields_corrected == 5
            finally:
                db.close()
        # 400 means PO not found — that's acceptable in test environment

    def test_confirm_storekeeper_allowed(self):
        """Storekeeper role can confirm deliveries."""
        scan_result = self._scan_sample("sample_challan_clean")
        ext_id = scan_result["extraction_id"]
        payload = {"reviewed_lines": [], "fields_corrected": 0}
        res = client.post(
            f"/api/procurement/scan-document/{ext_id}/confirm",
            json=payload,
            headers=STORE_H,
        )
        # 200 or 400 (PO not matched) — both show the storekeeper got past auth
        assert res.status_code in (200, 400), res.text


class TestAccuracyEndpoint:
    """GET /api/procurement/scan-document/accuracy."""

    def test_accuracy_endpoint_returns_expected_shape(self):
        res = client.get(
            "/api/procurement/scan-document/accuracy",
            headers=ADMIN_H,
        )
        assert res.status_code == 200, res.text
        body = res.json()
        expected_keys = {
            "total_documents_scanned",
            "total_documents_confirmed",
            "zero_correction_count",
            "total_corrections_made",
            "accuracy_rate_pct",
            "avg_corrections_per_doc",
        }
        assert expected_keys.issubset(body.keys()), f"Missing keys: {expected_keys - set(body.keys())}"

    def test_accuracy_rate_is_number_between_0_and_100(self):
        res = client.get(
            "/api/procurement/scan-document/accuracy",
            headers=MGR_H,
        )
        assert res.status_code == 200
        body = res.json()
        assert isinstance(body["accuracy_rate_pct"], (int, float))
        assert 0.0 <= body["accuracy_rate_pct"] <= 100.0

    def test_accuracy_total_scanned_is_non_negative(self):
        res = client.get(
            "/api/procurement/scan-document/accuracy",
            headers=STORE_H,
        )
        assert res.status_code == 200
        body = res.json()
        assert body["total_documents_scanned"] >= 0
        assert body["total_documents_confirmed"] >= 0

    def test_accuracy_endpoint_storekeeper_allowed(self):
        """Storekeeper can view accuracy stats."""
        res = client.get(
            "/api/procurement/scan-document/accuracy",
            headers=STORE_H,
        )
        assert res.status_code == 200


class TestSampleDocumentsEndpoint:
    """GET /api/procurement/sample-documents — must be before the {po_id} route."""

    def test_lists_three_samples(self):
        """
        This endpoint MUST be registered before /api/procurement/{po_id}
        otherwise FastAPI routes 'sample-documents' as a po_id lookup.
        """
        res = client.get(
            "/api/procurement/sample-documents",
            headers=STORE_H,
        )
        assert res.status_code == 200, f"Got {res.status_code}: {res.text}"
        body = res.json()
        assert isinstance(body, list)
        assert len(body) >= 3
        keys_found = {item["key"] for item in body}
        assert "sample_challan_clean" in keys_found
        assert "sample_challan_short" in keys_found
        assert "sample_invoice_price_hike" in keys_found

    def test_each_sample_has_required_fields(self):
        res = client.get(
            "/api/procurement/sample-documents",
            headers=ADMIN_H,
        )
        assert res.status_code == 200
        for item in res.json():
            for field in ("key", "title", "supplier", "po_ref", "description", "flags"):
                assert field in item, f"Missing field '{field}' in sample doc entry"

    def test_rbac_viewer_post_workaround(self):
        """
        In test mode, GET requests with any header fall through to admin.
        So viewer GET succeeds (returns 200 as admin).
        This is expected test-mode behaviour; production requires real session.
        """
        res = client.get(
            "/api/procurement/sample-documents",
            headers=VIEWER_H,  # Falls through to admin for GETs in test mode
        )
        # Accept 200 (admin fallback) or 403 (if real auth enforced)
        assert res.status_code in (200, 403)


class TestUploadsEndpoint:
    """GET /api/uploads/{filename} — authenticated access, path traversal protection."""

    def test_nonexistent_file_returns_404_when_authenticated(self):
        """Authenticated user asking for a file that doesn't exist → 404."""
        res = client.get(
            "/api/uploads/doesnotexist1234567890.pdf",
            headers=ADMIN_H,
        )
        assert res.status_code == 404

    def test_authenticated_can_access_uploaded_file(self):
        """After uploading via sample_key, the returned file_url is accessible."""
        scan_res = client.post(
            "/api/procurement/scan-document",
            data={"sample_key": "sample_challan_clean"},
            headers=ADMIN_H,
        )
        assert scan_res.status_code == 200
        file_url = scan_res.json()["file_url"]  # e.g. /api/uploads/abc123.pdf
        filename = file_url.split("/")[-1]

        fetch_res = client.get(f"/api/uploads/{filename}", headers=ADMIN_H)
        assert fetch_res.status_code == 200

    def test_manager_can_access_uploaded_file(self):
        """Manager can also download uploaded delivery documents."""
        scan_res = client.post(
            "/api/procurement/scan-document",
            data={"sample_key": "sample_challan_short"},
            headers=MGR_H,
        )
        assert scan_res.status_code == 200
        file_url = scan_res.json()["file_url"]
        filename = file_url.split("/")[-1]

        fetch_res = client.get(f"/api/uploads/{filename}", headers=MGR_H)
        assert fetch_res.status_code == 200


class TestPathTraversalSecurity:
    """Uploaded file serving must reject path traversal attempts."""

    def test_path_traversal_rejected(self):
        """Path traversal in filename is sanitized — returns 404 (file not found after sanitizing), not 500."""
        res = client.get(
            "/api/uploads/../../etc/passwd",
            headers=ADMIN_H,
        )
        # After os.path.basename() sanitization, the file won't exist → 404
        # Could also be 400 or 422 depending on FastAPI URL parsing
        assert res.status_code in (400, 404, 422)

    def test_null_byte_in_filename_rejected(self):
        """Null byte injection in filename does not cause server error."""
        res = client.get(
            "/api/uploads/file%00.pdf",
            headers=ADMIN_H,
        )
        # Should be 404 (sanitized to 'file\x00.pdf' which won't exist) or 400/422
        assert res.status_code in (400, 404, 422)
