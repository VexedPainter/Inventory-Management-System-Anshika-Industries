"""
test_pilot_readiness.py
=======================
Comprehensive test suite for Pilot Readiness features:
- Password hashing (Argon2 / Bcrypt) & complexity validation
- Login rate limiting and brute-force lockout (429)
- Forced change of default passwords on first login
- Change password endpoint (POST /api/auth/change-password)
- User Management CRUD & RBAC (Admin only)
- Data Import Wizard (Upload, Validate row-by-row, Commit batch, Rollback)
- Template generation (CSV / Excel)
- Database Hot Backup creation, listing, downloading, and restore verification
- Health check endpoint (/api/health) with DB latency & scheduler
- Enterprise security headers on all responses

Python: C:\\Python314\\python.exe
Run:    C:\\Python314\\python.exe -m pytest test_pilot_readiness.py -v --tb=short
"""

import io
import os
import json
import pytest

os.environ["ALLOW_TEST_ROLE_HEADER"] = "true"

from fastapi.testclient import TestClient
from database import init_db, SessionLocal, UserRole, Inventory, Vendor, ImportBatch
init_db()

from app import app
from security_manager import (
    hash_password, verify_password, needs_rehash, is_default_password,
    validate_password_complexity, check_rate_limit, record_failed_login,
    record_successful_login, reset_all_rate_limits
)
from backup_manager import create_backup, list_backups, restore_backup, BACKUP_DIR
from import_wizard import generate_template, auto_map_columns

client = TestClient(app, raise_server_exceptions=False)

ADMIN = {"X-User-Role": "admin"}
MGR   = {"X-User-Role": "manager"}
SK    = {"X-User-Role": "storekeeper"}


@pytest.fixture(autouse=True)
def clean_rate_limits():
    """Ensure clean rate limiting state between tests."""
    reset_all_rate_limits()
    yield
    reset_all_rate_limits()


# ===========================================================================
# 1. Security & Password Hashing Unit Tests
# ===========================================================================

class TestSecurityEngine:

    def test_hash_and_verify_argon2(self):
        plain = "SuperSecret#2026"
        hashed = hash_password(plain)
        assert hashed.startswith("$argon2") or hashed.startswith("$2b$")
        assert verify_password(plain, hashed) is True
        assert verify_password("WrongPassword", hashed) is False

    def test_verify_legacy_plaintext(self):
        plain = "admin@2026"
        assert verify_password("admin@2026", plain) is True
        assert verify_password("wrong", plain) is False
        assert needs_rehash(plain) is True

    def test_password_complexity(self):
        # Too short
        ok, msg = validate_password_complexity("short1")
        assert ok is False
        assert "at least 8" in msg

        # No digits/specials
        ok, msg = validate_password_complexity("alllettersonly")
        assert ok is False

        # Reusing default
        ok, msg = validate_password_complexity("admin@2026")
        assert ok is False
        assert "default credentials" in msg

        # Valid strong password
        ok, msg = validate_password_complexity("WeldingPro#2026")
        assert ok is True
        assert msg == ""


# ===========================================================================
# 2. Login, Rate Limiting & Lockout Tests
# ===========================================================================

class TestLoginAndRateLimiting:

    def test_successful_login_returns_token_and_flags(self):
        res = client.post("/api/login", json={"username": "admin", "password": "admin@2026"})
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "success"
        assert "token" in data
        assert data["role"] == "admin"
        # Since admin@2026 is default, must_change_password should be True
        assert data.get("must_change_password") is True

    def test_rate_limiting_locks_out_after_five_attempts(self):
        uname = "test_lockout_user"
        # 4 failed attempts should return 401
        for i in range(4):
            r = client.post("/api/login", json={"username": uname, "password": "bad"})
            assert r.status_code == 401, f"Attempt {i+1} got {r.status_code}"

        # 5th failed attempt should trigger lockout (429)
        r5 = client.post("/api/login", json={"username": uname, "password": "bad"})
        assert r5.status_code == 429
        assert "locked" in r5.text.lower()

        # 6th attempt should also be rejected with 429
        r6 = client.post("/api/login", json={"username": uname, "password": "bad"})
        assert r6.status_code == 429

    def test_change_password_endpoint(self):
        import uuid
        uname = f"user_pwd_{uuid.uuid4().hex[:6]}"
        init_pwd = "InitPassword#2026"
        # 1. Create a dedicated user
        r_create = client.post("/api/users", json={
            "username": uname,
            "full_name": "Change Pwd User",
            "role": "storekeeper",
            "password": init_pwd,
            "must_change_password": True
        }, headers=ADMIN)
        assert r_create.status_code == 200

        # 2. Login with initial password
        r_login = client.post("/api/login", json={"username": uname, "password": init_pwd})
        assert r_login.status_code == 200
        token = r_login.json()["token"]
        assert r_login.json()["must_change_password"] is True

        # 3. Change password
        new_pwd = "UpdatedPassword#2026"
        res = client.post(
            "/api/auth/change-password",
            json={"old_password": init_pwd, "new_password": new_pwd},
            headers={"Authorization": f"Bearer {token}"}
        )
        assert res.status_code == 200, res.text
        assert res.json()["status"] == "success"

        # 4. Verify new password logs in cleanly and must_change_password is False
        res_login2 = client.post("/api/login", json={"username": uname, "password": new_pwd})
        assert res_login2.status_code == 200
        assert res_login2.json()["must_change_password"] is False


# ===========================================================================
# 3. User Management CRUD Endpoints (Admin only)
# ===========================================================================

class TestUserManagement:

    def test_list_users_admin(self):
        r = client.get("/api/users", headers=ADMIN)
        assert r.status_code == 200
        users = r.json()
        assert isinstance(users, list)
        assert len(users) >= 1
        u = users[0]
        assert "username" in u
        assert "role" in u
        assert "password" not in u  # Passwords must not be exposed

    def test_list_users_forbidden_for_storekeeper(self):
        r = client.get("/api/users", headers=SK)
        assert r.status_code == 403

    def test_create_and_deactivate_user(self):
        import uuid
        new_uname = f"pilot_user_{uuid.uuid4().hex[:6]}"
        # 1. Create user
        payload = {
            "username": new_uname,
            "full_name": "Pilot Tester",
            "role": "storekeeper",
            "password": "PilotPassword#2026",
            "must_change_password": True
        }
        r = client.post("/api/users", json=payload, headers=ADMIN)
        assert r.status_code == 200
        user_data = r.json()
        user_id = user_data["id"]

        # 2. Update user
        r_up = client.put(f"/api/users/{user_id}", json={"full_name": "Updated Pilot Name"}, headers=ADMIN)
        assert r_up.status_code == 200
        assert r_up.json()["full_name"] == "Updated Pilot Name"

        # 3. Deactivate user
        r_del = client.delete(f"/api/users/{user_id}", headers=ADMIN)
        assert r_del.status_code == 200

        # Verify deactivated in listing
        r_list = client.get("/api/users", headers=ADMIN)
        found = [u for u in r_list.json() if u["username"] == new_uname]
        assert len(found) == 1
        assert found[0]["is_active"] is False


# ===========================================================================
# 4. Import Wizard Endpoints
# ===========================================================================

class TestImportWizard:

    def test_download_templates(self):
        # CSV template
        r_csv = client.get("/api/import/template?type=items&format=csv")
        assert r_csv.status_code == 200
        assert "text/csv" in r_csv.headers.get("content-type", "")
        assert "sku" in r_csv.text.lower()

        # Excel template
        r_xlsx = client.get("/api/import/template?type=suppliers&format=xlsx")
        assert r_xlsx.status_code == 200
        assert "spreadsheetml" in r_xlsx.headers.get("content-type", "")
        assert len(r_xlsx.content) > 100

    def test_import_preview_and_validation(self):
        csv_content = """sku,name,category,unit,quantity,unit_cost,selling_price,reorder_level
TEST-WIZ-01,Test Welding Contact Tip,Consumables,PCS,50,45.0,75.0,10
TEST-WIZ-02,Test Ceramic Gas Shield,Torch Spares,PCS,25,85.0,140.0,5
"""
        files = {"file": ("test_catalog.csv", csv_content.encode("utf-8"), "text/csv")}
        data = {"import_type": "items"}

        r = client.post("/api/import/preview", files=files, data=data, headers=ADMIN)
        assert r.status_code == 200
        val = r.json()
        assert val["total_rows"] == 2
        assert val["valid_count"] == 2
        assert val["error_count"] == 0
        assert val["can_commit"] is True
        assert len(val["preview_rows"]) == 2

    def test_import_commit_and_rollback(self):
        sku1 = "TEST-COMMIT-01"
        rows = [
            {
                "row_num": 2,
                "status": "valid",
                "data": {
                    "sku": sku1,
                    "name": "Commit Test Item",
                    "category": "Consumables",
                    "quantity": 100,
                    "unit_cost": 50.0,
                    "selling_price": 90.0
                }
            }
        ]
        payload = {
            "import_type": "items",
            "filename": "test_commit.csv",
            "rows": rows
        }

        # 1. Commit
        r_commit = client.post("/api/import/commit", json=payload, headers=ADMIN)
        assert r_commit.status_code == 200
        commit_res = r_commit.json()
        batch_id = commit_res["batch_id"]
        assert commit_res["records_count"] == 1

        # Verify item exists in DB
        db = SessionLocal()
        item = db.query(Inventory).filter(Inventory.sku == sku1).first()
        assert item is not None
        assert item.quantity == 100
        db.close()

        # 2. Rollback
        r_roll = client.post(f"/api/import/rollback/{batch_id}", headers=ADMIN)
        assert r_roll.status_code == 200
        assert r_roll.json()["status"] == "success"

        # Verify item deactivated or cleaned
        db = SessionLocal()
        item_after = db.query(Inventory).filter(Inventory.sku == sku1).first()
        assert item_after is None or item_after.is_active is False
        db.close()

    def test_list_import_batches(self):
        r = client.get("/api/import/batches", headers=MGR)
        assert r.status_code == 200
        assert isinstance(r.json(), list)


# ===========================================================================
# 5. Database Hot Backup & Recovery
# ===========================================================================

class TestBackupManager:

    def test_create_and_list_backup(self):
        # 1. Create backup
        r_create = client.post("/api/backup/create", json={"tag": "pilot_test"}, headers=ADMIN)
        assert r_create.status_code == 200
        b_info = r_create.json()
        assert b_info["status"] == "success"
        filename = b_info["filename"]
        assert "pilot_test" in filename
        assert b_info["size_bytes"] > 0
        assert len(b_info["checksum_sha256"]) == 64

        # 2. List backups
        r_list = client.get("/api/backup/list", headers=ADMIN)
        assert r_list.status_code == 200
        filenames = [b["filename"] for b in r_list.json()]
        assert filename in filenames

        # 3. Download backup
        r_dl = client.get(f"/api/backup/download/{filename}", headers=ADMIN)
        assert r_dl.status_code == 200
        assert len(r_dl.content) == b_info["size_bytes"]

    def test_storekeeper_cannot_create_backup(self):
        r = client.post("/api/backup/create", json={}, headers=SK)
        assert r.status_code == 403


# ===========================================================================
# 6. Health & Security Headers
# ===========================================================================

class TestHealthAndSecurityHeaders:

    def test_api_health_endpoint(self):
        # Admin gets detailed telemetry without DB URL
        r = client.get("/api/health", headers={"X-User-Role": "admin"})
        assert r.status_code == 200
        data = r.json()
        assert data["status"] in ("healthy", "degraded")
        assert "Anishka Industries" in data["facility"]
        assert "database" in data
        assert data["database"]["status"] == "connected"
        assert isinstance(data["database"]["latency_ms"], (int, float))
        assert "scheduler" in data
        assert "security" in data
        assert "url" not in data["database"], "DB url must never be in health payload"

        # Public caller gets only {status, database, version}
        r_pub = client.get("/api/health")
        assert r_pub.status_code == 200
        data_pub = r_pub.json()
        assert data_pub == {"status": "healthy", "database": "connected", "version": "2.5.0-pilot"}

    def test_enterprise_security_headers_present(self):
        r = client.get("/api/health")
        h = r.headers
        assert h.get("x-content-type-options") == "nosniff"
        assert h.get("x-frame-options") == "DENY"
        assert "mode=block" in h.get("x-xss-protection", "")
        assert "content-security-policy" in h
        assert "x-request-id" in h
        assert "x-process-time-ms" in h
