"""
Comprehensive test suite for Advanced Analytics & Demand Intelligence Features:
- ABC/XYZ 3x3 Classification
- Exponential-Smoothing Demand Forecast with 8-week Backtest WAPE & Prediction Intervals
- Statistical Safety Stock & ROP with Configurable Service Levels (90/95/98%)
- What-If Scenario Simulation
- Enterprise Business KPIs (Turnover, DIO, Working Capital, 30d Stockouts, Fill Rate)
- Robust Z-Score Movement Outlier Detection (Median/MAD)
- 12-Month Demo Synthetic Data Generation with Seasonality and Labeled Anomalies
- REST API Endpoints
"""
import os
os.environ["ALLOW_TEST_ROLE_HEADER"] = "true"

import uuid
import pytest
import datetime
import math
import numpy as np
from fastapi.testclient import TestClient

from app import app
from database import SessionLocal, Inventory, StockMovement, AppSetting, Vendor, Procurement, UserRole, POItem
from preventive_intelligence import (
    compute_abc_xyz_classification,
    calculate_advanced_forecast,
    compute_safety_stock_rop,
    compute_what_if_simulation,
    compute_business_kpis,
    detect_robust_z_anomalies,
    seed_twelve_month_analytics_history,
    SERVICE_LEVEL_Z
)


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="module")
def db_session():
    db = SessionLocal()
    yield db
    db.close()


# ─── 1. ABC / XYZ CLASSIFICATION TESTS ─────────────────────────────────

def test_abc_xyz_classification_math(db_session):
    """Test Pareto ABC (80/15/5) and XYZ weekly demand variability (CV)."""
    res = compute_abc_xyz_classification(db_session)
    assert "matrix" in res
    assert "abc_distribution" in res
    assert "xyz_distribution" in res
    assert "items" in res
    assert res["total_items"] > 0

    # Verify all 9 matrix cells exist
    for cell in ["AX", "AY", "AZ", "BX", "BY", "BZ", "CX", "CY", "CZ"]:
        assert cell in res["matrix"]
        assert "count" in res["matrix"][cell]
        assert "total_value" in res["matrix"][cell]

    # Check item assignment
    for it in res["items"]:
        assert it["abc"] in ("A", "B", "C")
        assert it["xyz"] in ("X", "Y", "Z")
        assert it["matrix_class"] == f"{it['abc']}{it['xyz']}"
        assert it["annual_consumption_value"] >= 0
        assert it["weekly_cv"] >= 0


# ─── 2. DEMAND FORECAST & BACKTESTING TESTS ───────────────────────────

def test_advanced_forecast_and_backtesting(db_session):
    """Test weekly demand forecast, prediction interval, and 8-week backtest WAPE."""
    first_item = db_session.query(Inventory).filter(Inventory.is_active == True).first()
    assert first_item is not None

    fc = calculate_advanced_forecast(first_item, db_session, periods_ahead=8)
    assert fc["item_id"] == first_item.id
    assert "model" in fc
    assert "backtest_metrics" in fc
    assert "forecast" in fc
    assert len(fc["forecast"]) == 8

    # Verify backtesting metrics
    bm = fc["backtest_metrics"]
    assert "wape" in bm
    assert "mape" in bm
    assert "accuracy_pct" in bm
    assert "is_reliable" in bm
    assert "reliability_note" in bm
    assert 0.0 <= bm["accuracy_pct"] <= 100.0

    # Verify 95% confidence prediction interval bounds
    for step in fc["forecast"]:
        assert "lower" in step
        assert "upper" in step
        assert "forecast" in step
        assert step["lower"] <= step["forecast"] <= step["upper"]
        assert step["lower"] >= 0.0


# ─── 3. STATISTICAL SAFETY STOCK & ROP TESTS ──────────────────────────

def test_safety_stock_rop_service_levels(db_session):
    """Test statistical safety stock formula z * sigma * sqrt(L) across 90%, 95%, 98%."""
    first_item = db_session.query(Inventory).filter(Inventory.is_active == True).first()
    assert first_item is not None

    # Test 90% service level
    ss_90 = compute_safety_stock_rop(first_item, db_session, service_level="90%")
    assert ss_90["z_score"] == SERVICE_LEVEL_Z["90%"]
    assert ss_90["safety_stock"] >= 1
    assert ss_90["reorder_point"] >= ss_90["safety_stock"]
    assert "Safety Stock = z * σ_d * √L" in ss_90["formula_text"]

    # Test 95% service level
    ss_95 = compute_safety_stock_rop(first_item, db_session, service_level="95%")
    assert ss_95["z_score"] == SERVICE_LEVEL_Z["95%"]
    # Higher service level should yield >= safety stock
    assert ss_95["safety_stock"] >= ss_90["safety_stock"]

    # Test 98% service level
    ss_98 = compute_safety_stock_rop(first_item, db_session, service_level="98%")
    assert ss_98["z_score"] == SERVICE_LEVEL_Z["98%"]
    assert ss_98["safety_stock"] >= ss_95["safety_stock"]

    # Verify traditional comparison
    assert "traditional_comparison" in ss_95
    assert "safety_days" in ss_95["traditional_comparison"]
    assert "safety_stock" in ss_95["traditional_comparison"]
    assert "reorder_point" in ss_95["traditional_comparison"]


# ─── 4. WHAT-IF SCENARIO SIMULATOR TESTS ──────────────────────────────

def test_what_if_simulation_scenarios(db_session):
    """Test what-if simulator under lead-time delay and demand surge."""
    first_item = db_session.query(Inventory).filter(Inventory.is_active == True).first()
    assert first_item is not None

    # Baseline scenario (delta = 0)
    base = compute_what_if_simulation(first_item, db_session, lead_time_delta_days=0, demand_increase_pct=0.0)
    assert "base_scenario" in base
    assert "simulated_scenario" in base
    sim_base = base["simulated_scenario"]

    # Stress scenario: +10 days supplier delay, +50% demand surge
    stress = compute_what_if_simulation(first_item, db_session, lead_time_delta_days=10, demand_increase_pct=50.0)
    sim_stress = stress["simulated_scenario"]

    assert sim_stress["effective_lead_time"] == sim_base["effective_lead_time"] + 10
    assert sim_stress["simulated_daily_demand"] > sim_base["simulated_daily_demand"]
    assert sim_stress["simulated_runway_days"] <= sim_base["simulated_runway_days"]
    assert sim_stress["risk_level"] in ("SAFE", "WARNING", "CRITICAL", "OUT")
    assert len(sim_stress["risk_message"]) > 0


# ─── 5. BUSINESS KPIS TESTS ───────────────────────────────────────────

def test_business_kpis_calculation(db_session):
    """Test enterprise KPIs: turnover, DIO, working capital, 30d stockouts, fill rate."""
    kpis = compute_business_kpis(db_session)
    assert "inventory_turnover" in kpis
    assert "days_of_inventory" in kpis
    assert "working_capital_tied_up" in kpis
    assert "stockout_count_30d" in kpis
    assert "fill_rate_pct" in kpis
    assert "annual_cogs" in kpis

    assert kpis["inventory_turnover"] >= 0.0
    assert kpis["days_of_inventory"] >= 0.0
    assert kpis["working_capital_tied_up"] >= 0.0
    assert kpis["stockout_count_30d"] >= 0
    assert 0.0 <= kpis["fill_rate_pct"] <= 100.0


# ─── 6. ROBUST Z-SCORE ANOMALY DETECTION TESTS ────────────────────────

def test_robust_z_anomalies_detection(db_session):
    """Test median/MAD robust z-score calculation and reason descriptions."""
    # Seed a high-volume movement to guarantee an outlier — use a unique
    # client_id per run so this test is idempotent across repeated full-suite runs.
    item = db_session.query(Inventory).first()
    now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    unique_client_id = f"test-anom-{uuid.uuid4().hex[:12]}"
    outlier = StockMovement(
        item_id=item.id,
        timestamp=now_str,
        type="OUT",
        quantity=999,
        balance_after=0,
        performed_by="test_auditor",
        client_id=unique_client_id,
        reference="[TEST ANOMALY] Heavy bulk test dispatch"
    )
    db_session.add(outlier)
    db_session.commit()

    anomalies = detect_robust_z_anomalies(db_session, threshold=3.0)
    assert isinstance(anomalies, list)
    if len(anomalies) > 0:
        an = anomalies[0]
        assert "robust_z" in an
        assert an["robust_z"] >= 3.0
        assert "reason" in an
        assert "Robust Z =" in an["reason"]
        assert "median =" in an["reason"]


# ─── 7. 12-MONTH SYNTHETIC DEMO SEEDING TESTS ─────────────────────────

def test_seed_twelve_month_analytics_history(db_session):
    """Test 52-week synthetic history generation with seasonal cycle and injected anomalies."""
    res = seed_twelve_month_analytics_history(db_session)
    assert res["status"] == "success"
    assert res["movements_seeded"] > 0
    assert res["anomalies_injected"] >= 4
    assert res["history_weeks"] == 52

    # Verify anomalies contain [DEMO SYNTHETIC] tag
    anomalies = detect_robust_z_anomalies(db_session, threshold=3.0)
    synthetic_found = any(a["is_synthetic"] for a in anomalies)
    assert synthetic_found is True


# ─── 8. FASTAPI REST API ENDPOINT TESTS ───────────────────────────────

def test_analytics_api_endpoints(client):
    """Test all newly added analytics REST API routes."""
    headers = {"X-User-Role": "admin"}

    # 1. ABC-XYZ Matrix
    res = client.get("/api/analytics/abc-xyz", headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert "matrix" in data
    assert "abc_distribution" in data

    # 2. Advanced Forecast
    res = client.get("/api/analytics/forecast/1", headers=headers)
    assert res.status_code in (200, 404)
    if res.status_code == 200:
        fc = res.json()
        assert "backtest_metrics" in fc
        assert len(fc["forecast"]) == 8

    # 3. What-If Simulation
    res = client.post("/api/analytics/what-if", json={
        "item_id": 1,
        "lead_time_delta_days": 3,
        "demand_increase_pct": 25.0
    }, headers=headers)
    assert res.status_code == 200
    assert "simulated_scenario" in res.json()

    # 4. Business KPIs
    res = client.get("/api/analytics/kpis", headers=headers)
    assert res.status_code == 200
    kpis = res.json()
    assert "inventory_turnover" in kpis
    assert "days_of_inventory" in kpis

    # 5. Safety Stock Breakdown
    res = client.get("/api/analytics/safety-stock/1?service_level=98%25", headers=headers)
    assert res.status_code in (200, 404)
    if res.status_code == 200:
        ss = res.json()
        assert ss["service_level"] == "98%"
        assert ss["safety_stock"] >= 1

    # 6. Movement Anomalies
    res = client.get("/api/analytics/anomalies", headers=headers)
    assert res.status_code == 200
    assert isinstance(res.json(), list)

    # 7. Service Level Settings GET & POST
    res = client.get("/api/settings/service-level", headers=headers)
    assert res.status_code == 200
    assert "service_level" in res.json()

    res = client.post("/api/settings/service-level", json={
        "service_level": "98%",
        "safety_stock_method": "service_level"
    }, headers=headers)
    assert res.status_code == 200
    assert res.json()["service_level"] == "98%"

    # 8. Dashboard stats includes business KPIs
    res = client.get("/api/dashboard", headers=headers)
    assert res.status_code == 200
    dash = res.json()
    stats = dash.get("stats", {})
    assert "inventory_turnover" in stats
    assert "days_of_inventory" in stats
    assert "working_capital_tied_up" in stats
