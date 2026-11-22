"""
test_business_impact.py
=======================
Comprehensive test suite for the Business Impact module:
- ROI Calculator with transparent formula breakdowns and editable multipliers
- Pilot KPI Tracker: baseline vs measured values, delta computation, CRUD, status indicators
- Pricing Plans and Unit Economics Calculator
- RBAC enforcement (admin and manager allowed; storekeeper forbidden)

Run with: C:\\Python314\\python.exe -m pytest test_business_impact.py -v --tb=short
"""

import os
os.environ["ALLOW_TEST_ROLE_HEADER"] = "true"

import pytest
from fastapi.testclient import TestClient

from database import init_db, SessionLocal, PilotReading
init_db()

from app import app
from business_impact import (
    calculate_roi, calculate_unit_economics,
    DEFAULT_ROI_BENCHMARKS, DEFAULT_UNIT_ECONOMICS, DEFAULT_SUBSCRIPTION_PLANS
)

client = TestClient(app, raise_server_exceptions=False)

ADMIN = {"X-User-Role": "admin"}
MGR   = {"X-User-Role": "manager"}
SK    = {"X-User-Role": "storekeeper"}


# ---------------------------------------------------------------------------
# 1. Pure Unit Tests for ROI Engine
# ---------------------------------------------------------------------------

def test_roi_calculator_zero_inputs():
    """Calculator should safely handle empty / zero inputs without division by zero."""
    result = calculate_roi({})
    assert "outputs" in result
    assert result["outputs"]["total_annual_benefit"] == 0.0
    assert result["outputs"]["payback_period_months"] == 0.0
    assert result["outputs"]["net_roi_multiple"] == 0.0


def test_roi_calculator_realistic_anishka_numbers():
    """Verify formula calculations against sample realistic numbers for Anishka Industries."""
    inputs = {
        "num_skus": 250,
        "monthly_orders": 85,
        "hours_per_week_stock_po": 15,    # 15 hours/week on stock counts & PO drafting
        "stockout_incidents_per_month": 12, # 12 stockouts/month
        "average_order_value": 18500,     # ₹18,500 average order value
        "total_inventory_value": 3500000, # ₹35,00,000 inventory
        "hourly_staff_cost": 300          # ₹300/hr warehouse & procurement staff
    }
    res = calculate_roi(inputs)

    outputs = res["outputs"]
    assert outputs["hours_saved_monthly"] > 0
    assert outputs["hours_saved_annually"] > 0
    assert outputs["annual_labor_savings"] > 0
    assert outputs["annual_stockouts_avoided"] > 0
    assert outputs["annual_revenue_protected"] > 0
    assert outputs["gross_margin_protected"] > 0
    assert outputs["working_capital_freed"] > 0
    assert outputs["annual_holding_cost_savings"] > 0
    assert outputs["total_annual_benefit"] > 0
    assert outputs["payback_period_months"] > 0
    assert outputs["net_roi_multiple"] > 1.0

    # Formula breakdowns are present as readable strings
    breakdowns = res["formula_breakdowns"]
    assert "labor_savings" in breakdowns
    assert "revenue_protected" in breakdowns
    assert "margin_protected" in breakdowns
    assert "working_capital" in breakdowns
    assert "payback_period" in breakdowns
    assert "₹" in breakdowns["labor_savings"]


def test_roi_calculator_custom_formula_parameters():
    """Formulas should accept user-overridden benchmarks (e.g. higher holding rate or margin)."""
    inputs = {
        "num_skus": 100,
        "monthly_orders": 50,
        "hours_per_week_stock_po": 10,
        "stockout_incidents_per_month": 5,
        "average_order_value": 10000,
        "total_inventory_value": 1000000,
        "hourly_staff_cost": 250
    }
    # Standard software cost is 75000, let's override to 50000
    res_custom = calculate_roi(inputs, formulas={"annual_software_cost": 50000.0, "time_reduction_pct": 0.80})
    assert res_custom["formula_parameters"]["annual_software_cost"] == 50000.0
    assert res_custom["formula_parameters"]["time_reduction_pct"] == 0.80


# ---------------------------------------------------------------------------
# 2. Pure Unit Tests for Unit Economics & Pricing
# ---------------------------------------------------------------------------

def test_unit_economics_default():
    """Verify standard unit economics with default SaaS cost profile."""
    res = calculate_unit_economics({"plan_price_monthly": 9999.0})
    assert res["monthly_price"] == 9999.0
    assert res["gross_margin_pct"] > 60.0  # Typically >70% gross margin
    assert res["break_even_customers"] > 0
    assert "contribution_summary" in res


def test_unit_economics_custom_inputs():
    """Custom infrastructure and support costs recalculate gross profit accurately."""
    inputs = {
        "plan_price_monthly": 15000.0,
        "hosting_server_per_customer": 1000.0,
        "llm_ai_tokens_per_customer": 500.0,
        "whatsapp_cloud_api_per_customer": 500.0,
        "support_ops_per_customer": 2000.0,
        "fixed_overhead_monthly": 80000.0
    }
    res = calculate_unit_economics(inputs)
    assert res["cost_breakdown"]["total_variable_cost"] == 4000.0
    assert res["gross_profit_monthly"] == 11000.0
    assert res["gross_margin_pct"] == 73.3
    # Break-even: 80000 / 11000 = 7.27 -> 8 customers
    assert res["break_even_customers"] == 8


# ---------------------------------------------------------------------------
# 3. API RBAC Tests
# ---------------------------------------------------------------------------

def test_rbac_pilot_kpis_access():
    """Manager and admin can view pilot KPIs; storekeeper gets 403."""
    res_sk = client.get("/api/business-impact/pilot-kpis", headers=SK)
    assert res_sk.status_code == 403

    res_mgr = client.get("/api/business-impact/pilot-kpis", headers=MGR)
    assert res_mgr.status_code == 200
    assert isinstance(res_mgr.json(), list)

    res_admin = client.get("/api/business-impact/pilot-kpis", headers=ADMIN)
    assert res_admin.status_code == 200


def test_rbac_roi_calculator_access():
    """Storekeeper cannot use ROI calculator; admin/manager can."""
    res_sk = client.post("/api/business-impact/roi-calculator", json={"inputs": {}}, headers=SK)
    assert res_sk.status_code == 403

    res_mgr = client.post("/api/business-impact/roi-calculator", json={"inputs": {}}, headers=MGR)
    assert res_mgr.status_code == 200

    res_admin = client.post("/api/business-impact/roi-calculator", json={"inputs": {}}, headers=ADMIN)
    assert res_admin.status_code == 200


def test_rbac_pricing_and_unit_economics_access():
    """Pricing plans and unit economics require admin/manager role."""
    assert client.get("/api/business-impact/pricing-plans", headers=SK).status_code == 403
    assert client.get("/api/business-impact/pricing-plans", headers=MGR).status_code == 200
    assert client.get("/api/business-impact/pricing-plans", headers=ADMIN).status_code == 200

    assert client.post("/api/business-impact/unit-economics", json={}, headers=SK).status_code == 403
    assert client.post("/api/business-impact/unit-economics", json={}, headers=MGR).status_code == 200


# ---------------------------------------------------------------------------
# 4. Pilot KPI CRUD & Delta Tracking via API
# ---------------------------------------------------------------------------

def test_pilot_kpis_retrieval_and_seeding():
    """Seeded pilot KPIs are present with baseline, measured, and delta calculations."""
    res = client.get("/api/business-impact/pilot-kpis", headers=ADMIN)
    assert res.status_code == 200
    kpis = res.json()
    assert len(kpis) >= 5

    # Check key KPIs
    keys = [k["kpi_key"] for k in kpis]
    assert "stockouts_per_month" in keys
    assert "po_creation_time_mins" in keys
    assert "inventory_accuracy_pct" in keys

    # Verify delta computation on seeded stockouts
    stockout_kpi = next(k for k in kpis if k["kpi_key"] == "stockouts_per_month")
    assert stockout_kpi["baseline_value"] == 18.0
    assert stockout_kpi["measured_value"] == 4.0
    assert stockout_kpi["delta"] == -14.0
    assert stockout_kpi["status"] == "improved"  # Lower is better, -14 is improvement


def test_create_and_update_pilot_kpi():
    """Create a new pilot KPI, update measured value, verify delta changes."""
    new_kpi = {
        "kpi_name": "Supplier On-Time Delivery Rate",
        "category": "Procurement",
        "unit": "%",
        "higher_is_better": True,
        "baseline_value": 72.0,
        "baseline_date": "2026-10-01",
        "target_value": 95.0,
        "notes": "Replace with Anishka's real numbers. Baseline from manual order logs."
    }
    res_create = client.post("/api/business-impact/pilot-kpis", json=new_kpi, headers=MGR)
    assert res_create.status_code == 200
    kpi_id = res_create.json()["id"]
    assert kpi_id > 0

    # Retrieve and verify initial state (pending measurement)
    kpis = client.get("/api/business-impact/pilot-kpis", headers=MGR).json()
    created = next(k for k in kpis if k["id"] == kpi_id)
    assert created["kpi_name"] == "Supplier On-Time Delivery Rate"
    assert created["baseline_value"] == 72.0
    assert created["measured_value"] is None
    assert created["status"] == "pending"

    # Now update with pilot measured result
    res_update = client.put(
        f"/api/business-impact/pilot-kpis/{kpi_id}",
        json={"measured_value": 91.5, "measured_date": "2026-11-20", "notes": "Measured with automated cadence POs."},
        headers=MGR
    )
    assert res_update.status_code == 200

    # Re-fetch and check delta and status
    kpis_after = client.get("/api/business-impact/pilot-kpis", headers=MGR).json()
    updated = next(k for k in kpis_after if k["id"] == kpi_id)
    assert updated["measured_value"] == 91.5
    assert updated["delta"] == 19.5
    assert updated["delta_pct"] == 27.1
    assert updated["status"] == "improved"  # Higher is better, +19.5% is improved


def test_delete_pilot_kpi_admin_only():
    """Deleting a pilot KPI requires admin privileges."""
    # Create an ephemeral KPI to delete
    res_create = client.post(
        "/api/business-impact/pilot-kpis",
        json={
            "kpi_name": "Temporary Test KPI",
            "baseline_value": 10.0
        },
        headers=ADMIN
    )
    temp_id = res_create.json()["id"]

    # Manager cannot delete (403)
    res_mgr_del = client.delete(f"/api/business-impact/pilot-kpis/{temp_id}", headers=MGR)
    assert res_mgr_del.status_code == 403

    # Admin can delete
    res_admin_del = client.delete(f"/api/business-impact/pilot-kpis/{temp_id}", headers=ADMIN)
    assert res_admin_del.status_code == 200

    # Re-deleting returns 404
    res_404 = client.delete(f"/api/business-impact/pilot-kpis/{temp_id}", headers=ADMIN)
    assert res_404.status_code == 404


# ---------------------------------------------------------------------------
# 5. Full Pricing Plans API & Unit Economics API
# ---------------------------------------------------------------------------

def test_pricing_plans_api():
    """Verify subscription tiers retrieved via API."""
    res = client.get("/api/business-impact/pricing-plans", headers=ADMIN)
    assert res.status_code == 200
    plans = res.json()["plans"]
    assert len(plans) == 3
    plan_ids = [p["id"] for p in plans]
    assert "starter" in plan_ids
    assert "professional" in plan_ids
    assert "enterprise" in plan_ids

    pro = next(p for p in plans if p["id"] == "professional")
    assert pro["monthly_price"] == 9999
    assert pro.get("is_popular") is True


def test_unit_economics_api():
    """Verify unit economics API returns full breakdown and break-even."""
    payload = {
        "plan_price_monthly": 12000.0,
        "hosting_server_per_customer": 800.0,
        "llm_ai_tokens_per_customer": 600.0,
        "whatsapp_cloud_api_per_customer": 400.0,
        "support_ops_per_customer": 1500.0,
        "fixed_overhead_monthly": 50000.0
    }
    res = client.post("/api/business-impact/unit-economics", json=payload, headers=MGR)
    assert res.status_code == 200
    data = res.json()
    assert data["monthly_price"] == 12000.0
    assert data["cost_breakdown"]["total_variable_cost"] == 3300.0
    assert data["gross_profit_monthly"] == 8700.0
    assert data["gross_margin_pct"] == 72.5
    assert data["break_even_customers"] == 6
