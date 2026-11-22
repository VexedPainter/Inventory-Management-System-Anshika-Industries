"""
business_impact.py
==================
Business Impact, ROI Calculator, Pilot KPI Tracker, and Pricing Unit-Economics
Engine for Anishka Industries Inventory Management System.

Features:
- Configurable ROI Calculator with fully visible and editable formulas
- Pilot KPI Tracker recording baseline (before) and measured (after) values
- Configurable SaaS subscription plans and customer unit-economics calculator
- Full database persistence via PilotReading and AppSetting models
"""

import datetime
from typing import Dict, List, Any, Optional

from sqlalchemy.orm import Session
from database import PilotReading, AuditLog


# ---------------------------------------------------------------------------
# 1. Pilot KPI Default Templates & Seeder
# ---------------------------------------------------------------------------

DEFAULT_PILOT_KPIS = [
    {
        "kpi_key": "stockouts_per_month",
        "kpi_name": "Stockout Incidents per Month",
        "category": "Operations",
        "unit": "incidents/mo",
        "higher_is_better": False,
        "baseline_value": 18.0,
        "baseline_date": "2026-10-01",
        "measured_value": 4.0,
        "measured_date": "2026-11-20",
        "target_value": 3.0,
        "notes": "Replace with Anishka's real numbers. Baseline before automated ROP; measured with cadence alerts.",
        "recorded_by": "System Seed"
    },
    {
        "kpi_key": "po_creation_time_mins",
        "kpi_name": "Time to Create a Purchase Order",
        "category": "Procurement",
        "unit": "mins",
        "higher_is_better": False,
        "baseline_value": 35.0,
        "baseline_date": "2026-10-01",
        "measured_value": 3.0,
        "measured_date": "2026-11-20",
        "target_value": 5.0,
        "notes": "Replace with Anishka's real numbers. 1-click auto-replenishment vs manual Excel drafting.",
        "recorded_by": "System Seed"
    },
    {
        "kpi_key": "goods_receipt_time_mins",
        "kpi_name": "Time to Receive Delivered Goods",
        "category": "Warehouse",
        "unit": "mins",
        "higher_is_better": False,
        "baseline_value": 45.0,
        "baseline_date": "2026-10-01",
        "measured_value": 8.0,
        "measured_date": "2026-11-20",
        "target_value": 10.0,
        "notes": "Replace with Anishka's real numbers. Mobile barcode scanning & OCR 3-way match.",
        "recorded_by": "System Seed"
    },
    {
        "kpi_key": "inventory_accuracy_pct",
        "kpi_name": "Cycle Count Inventory Accuracy",
        "category": "Warehouse",
        "unit": "%",
        "higher_is_better": True,
        "baseline_value": 78.5,
        "baseline_date": "2026-10-01",
        "measured_value": 98.2,
        "measured_date": "2026-11-20",
        "target_value": 98.0,
        "notes": "Replace with Anishka's real numbers. Weekly ABC cycle counts & real-time stock-in logging.",
        "recorded_by": "System Seed"
    },
    {
        "kpi_key": "invoice_turnaround_hours",
        "kpi_name": "Sales Invoice Turnaround Time",
        "category": "Sales & Finance",
        "unit": "hours",
        "higher_is_better": False,
        "baseline_value": 24.0,
        "baseline_date": "2026-10-01",
        "measured_value": 1.5,
        "measured_date": "2026-11-20",
        "target_value": 2.0,
        "notes": "Replace with Anishka's real numbers. Instant tax invoice generation from sales order dispatch.",
        "recorded_by": "System Seed"
    }
]


def seed_default_pilot_kpis(db: Session) -> None:
    """Populate initial baseline pilot KPIs if table is empty."""
    existing_count = db.query(PilotReading).count()
    if existing_count > 0:
        return

    now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    for item in DEFAULT_PILOT_KPIS:
        reading = PilotReading(
            kpi_key=item["kpi_key"],
            kpi_name=item["kpi_name"],
            category=item["category"],
            unit=item["unit"],
            higher_is_better=item["higher_is_better"],
            baseline_value=item["baseline_value"],
            baseline_date=item["baseline_date"],
            measured_value=item.get("measured_value"),
            measured_date=item.get("measured_date"),
            target_value=item.get("target_value"),
            notes=item.get("notes"),
            recorded_by=item.get("recorded_by", "System Seed"),
            created_at=now_str,
            updated_at=now_str
        )
        db.add(reading)
    db.commit()


def get_pilot_kpis(db: Session) -> List[Dict[str, Any]]:
    """Retrieve all tracked pilot KPIs with computed delta and improvement percentage."""
    readings = db.query(PilotReading).order_by(PilotReading.id.asc()).all()
    results = []

    for r in readings:
        delta = None
        delta_pct = None
        status = "pending"

        if r.measured_value is not None:
            delta = round(r.measured_value - r.baseline_value, 2)
            if r.baseline_value != 0:
                delta_pct = round((delta / r.baseline_value) * 100, 1)

            # Determine whether delta represents an improvement
            if r.higher_is_better:
                if delta > 0:
                    status = "improved"
                elif delta < 0:
                    status = "degraded"
                else:
                    status = "neutral"
            else:
                # Lower is better (e.g. stockouts, turnaround hours)
                if delta < 0:
                    status = "improved"
                elif delta > 0:
                    status = "degraded"
                else:
                    status = "neutral"

        results.append({
            "id": r.id,
            "kpi_key": r.kpi_key,
            "kpi_name": r.kpi_name,
            "category": r.category,
            "unit": r.unit,
            "higher_is_better": r.higher_is_better,
            "baseline_value": r.baseline_value,
            "baseline_date": r.baseline_date,
            "measured_value": r.measured_value,
            "measured_date": r.measured_date,
            "target_value": r.target_value,
            "delta": delta,
            "delta_pct": delta_pct,
            "status": status,
            "notes": r.notes,
            "recorded_by": r.recorded_by,
            "created_at": r.created_at,
            "updated_at": r.updated_at
        })

    return results


def create_pilot_kpi(db: Session, data: Dict[str, Any], username: str) -> Dict[str, Any]:
    """Create a new pilot KPI tracking record."""
    now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    reading = PilotReading(
        kpi_key=data.get("kpi_key") or data.get("kpi_name", "").lower().replace(" ", "_"),
        kpi_name=data["kpi_name"],
        category=data.get("category", "Operations"),
        unit=data.get("unit", ""),
        higher_is_better=bool(data.get("higher_is_better", False)),
        baseline_value=float(data["baseline_value"]),
        baseline_date=data.get("baseline_date") or datetime.datetime.now().strftime("%Y-%m-%d"),
        measured_value=float(data["measured_value"]) if data.get("measured_value") is not None else None,
        measured_date=data.get("measured_date"),
        target_value=float(data["target_value"]) if data.get("target_value") is not None else None,
        notes=data.get("notes"),
        recorded_by=username,
        created_at=now_str,
        updated_at=now_str
    )
    db.add(reading)
    db.add(AuditLog(
        timestamp=now_str,
        action="PILOT_KPI_CREATED",
        user=username,
        target_id=reading.kpi_key,
        details=f"Created pilot KPI '{reading.kpi_name}' with baseline {reading.baseline_value}."
    ))
    db.commit()
    db.refresh(reading)

    return {"status": "success", "id": reading.id, "kpi_name": reading.kpi_name}


def update_pilot_kpi(db: Session, kpi_id: int, data: Dict[str, Any], username: str) -> Dict[str, Any]:
    """Update an existing pilot KPI reading."""
    reading = db.query(PilotReading).filter(PilotReading.id == kpi_id).first()
    if not reading:
        raise ValueError(f"Pilot KPI reading with ID {kpi_id} not found.")

    now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    if "kpi_name" in data:
        reading.kpi_name = data["kpi_name"]
    if "category" in data:
        reading.category = data["category"]
    if "unit" in data:
        reading.unit = data["unit"]
    if "higher_is_better" in data:
        reading.higher_is_better = bool(data["higher_is_better"])
    if "baseline_value" in data and data["baseline_value"] is not None:
        reading.baseline_value = float(data["baseline_value"])
    if "baseline_date" in data:
        reading.baseline_date = data["baseline_date"]
    if "measured_value" in data:
        reading.measured_value = float(data["measured_value"]) if data["measured_value"] is not None else None
    if "measured_date" in data:
        reading.measured_date = data["measured_date"]
    if "target_value" in data:
        reading.target_value = float(data["target_value"]) if data["target_value"] is not None else None
    if "notes" in data:
        reading.notes = data["notes"]

    reading.recorded_by = username
    reading.updated_at = now_str

    db.add(AuditLog(
        timestamp=now_str,
        action="PILOT_KPI_UPDATED",
        user=username,
        target_id=reading.kpi_key,
        details=f"Updated pilot KPI '{reading.kpi_name}' (measured: {reading.measured_value})."
    ))
    db.commit()

    return {"status": "success", "id": reading.id, "kpi_name": reading.kpi_name}


def delete_pilot_kpi(db: Session, kpi_id: int) -> bool:
    """Delete a pilot KPI record."""
    reading = db.query(PilotReading).filter(PilotReading.id == kpi_id).first()
    if not reading:
        return False
    db.delete(reading)
    db.commit()
    return True


# ---------------------------------------------------------------------------
# 2. ROI Calculator Engine with Fully Visible & Editable Formulas
# ---------------------------------------------------------------------------

DEFAULT_ROI_BENCHMARKS = {
    "time_reduction_pct": 0.65,         # 65% reduction in stock count & PO generation time
    "stockout_reduction_pct": 0.70,     # 70% reduction in stockouts via automated ROP & cadence alerts
    "order_loss_per_stockout": 0.40,    # 40% of stockouts result in lost customer orders
    "gross_margin_rate": 0.25,          # 25% gross margin on welding spares
    "inventory_holding_rate": 0.18,     # 18% annual inventory holding cost (capital cost, warehouse space, obsolescence)
    "dead_stock_reduction_pct": 0.15,   # 15% reduction in dead/excess stock freed up as cash
    "annual_software_cost": 75000.0     # Reference software cost (₹75,000/year)
}


def calculate_roi(inputs: Dict[str, Any], formulas: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """
    Calculate operational ROI and financial return for Anishka Industries.
    Every formula is transparent and configurable.
    """
    f = {**DEFAULT_ROI_BENCHMARKS, **(formulas or {})}

    num_skus = float(inputs.get("num_skus") or 0)
    monthly_orders = float(inputs.get("monthly_orders") or 0)
    hours_per_week = float(inputs.get("hours_per_week_stock_po") or 0)
    stockout_incidents_monthly = float(inputs.get("stockout_incidents_per_month") or 0)
    aov = float(inputs.get("average_order_value") or 0)
    inv_value = float(inputs.get("total_inventory_value") or 0)
    hourly_cost = float(inputs.get("hourly_staff_cost") or 0)
    software_cost = float(f.get("annual_software_cost", 75000.0))

    # Multipliers
    time_red = float(f.get("time_reduction_pct", 0.65))
    stockout_red = float(f.get("stockout_reduction_pct", 0.70))
    loss_rate = float(f.get("order_loss_per_stockout", 0.40))
    margin_rate = float(f.get("gross_margin_rate", 0.25))
    holding_rate = float(f.get("inventory_holding_rate", 0.18))
    dead_stock_red = float(f.get("dead_stock_reduction_pct", 0.15))

    # 1. Labor & Time Savings
    hours_saved_monthly = round((hours_per_week * 4.333) * time_red, 1)
    hours_saved_annually = round(hours_saved_monthly * 12, 1)
    annual_labor_savings = round(hours_saved_annually * hourly_cost, 2)

    # 2. Stockout Prevention & Revenue Protection
    annual_stockouts_avoided = round((stockout_incidents_monthly * 12) * stockout_red, 1)
    annual_revenue_protected = round(annual_stockouts_avoided * loss_rate * aov, 2)
    gross_margin_protected = round(annual_revenue_protected * margin_rate, 2)

    # 3. Working Capital & Inventory Holding Savings
    working_capital_freed = round(inv_value * dead_stock_red, 2)
    annual_holding_cost_savings = round(working_capital_freed * holding_rate, 2)

    # 4. Total Financial Impact
    total_annual_benefit = round(annual_labor_savings + gross_margin_protected + annual_holding_cost_savings, 2)
    monthly_benefit = round(total_annual_benefit / 12, 2) if total_annual_benefit > 0 else 0

    # 5. Payback Period & Net ROI Multiple
    payback_months = round(software_cost / (total_annual_benefit / 12), 1) if total_annual_benefit > 0 else 0.0
    net_roi_multiple = round(total_annual_benefit / software_cost, 1) if software_cost > 0 else 0.0

    return {
        "inputs_echo": {
            "num_skus": num_skus,
            "monthly_orders": monthly_orders,
            "hours_per_week_stock_po": hours_per_week,
            "stockout_incidents_per_month": stockout_incidents_monthly,
            "average_order_value": aov,
            "total_inventory_value": inv_value,
            "hourly_staff_cost": hourly_cost
        },
        "formula_parameters": {
            "time_reduction_pct": time_red,
            "stockout_reduction_pct": stockout_red,
            "order_loss_per_stockout": loss_rate,
            "gross_margin_rate": margin_rate,
            "inventory_holding_rate": holding_rate,
            "dead_stock_reduction_pct": dead_stock_red,
            "annual_software_cost": software_cost
        },
        "outputs": {
            "hours_saved_monthly": hours_saved_monthly,
            "hours_saved_annually": hours_saved_annually,
            "annual_labor_savings": annual_labor_savings,
            "annual_stockouts_avoided": annual_stockouts_avoided,
            "annual_revenue_protected": annual_revenue_protected,
            "gross_margin_protected": gross_margin_protected,
            "working_capital_freed": working_capital_freed,
            "annual_holding_cost_savings": annual_holding_cost_savings,
            "total_annual_benefit": total_annual_benefit,
            "monthly_benefit": monthly_benefit,
            "payback_period_months": payback_months,
            "net_roi_multiple": net_roi_multiple
        },
        "formula_breakdowns": {
            "labor_savings": f"({hours_per_week} hrs/wk × 4.33 wks/mo × {time_red:.0%}) × 12 mos × ₹{hourly_cost}/hr = ₹{annual_labor_savings:,.2f}",
            "revenue_protected": f"({stockout_incidents_monthly} stockouts/mo × 12 × {stockout_red:.0%}) × {loss_rate:.0%} loss rate × ₹{aov:,.2f} AOV = ₹{annual_revenue_protected:,.2f}",
            "margin_protected": f"₹{annual_revenue_protected:,.2f} revenue × {margin_rate:.0%} gross margin = ₹{gross_margin_protected:,.2f}",
            "working_capital": f"₹{inv_value:,.2f} inventory × {dead_stock_red:.0%} dead stock reduction = ₹{working_capital_freed:,.2f} cash released",
            "holding_cost_savings": f"₹{working_capital_freed:,.2f} cash released × {holding_rate:.0%} holding rate = ₹{annual_holding_cost_savings:,.2f}/yr",
            "payback_period": f"₹{software_cost:,.2f} software cost ÷ (₹{total_annual_benefit:,.2f} annual benefit ÷ 12) = {payback_months} months"
        }
    }


# ---------------------------------------------------------------------------
# 3. SaaS Subscription Pricing & Unit-Economics Calculator
# ---------------------------------------------------------------------------

DEFAULT_SUBSCRIPTION_PLANS = [
    {
        "id": "starter",
        "name": "Starter Workshop",
        "monthly_price": 4999,
        "annual_price": 49999,
        "max_users": 3,
        "max_skus": 500,
        "features": [
            "Real-time Inventory Catalog",
            "Mobile PWA & Camera Barcode Scanner",
            "Physical Stock Adjustments",
            "Basic Purchase Order Generation",
            "Email Digest Reports"
        ],
        "recommended_for": "Small welding workshops & single-location parts dealers."
    },
    {
        "id": "professional",
        "name": "Industrial Growth",
        "monthly_price": 9999,
        "annual_price": 99999,
        "max_users": 10,
        "max_skus": "Unlimited",
        "is_popular": True,
        "features": [
            "All Starter Features",
            "Preventive Demand Forecasting (Statsmodels)",
            "Predictive Cadence & Sales Opportunities",
            "WhatsApp Order & PO Notifications",
            "GST Registers (Sales, Purchase, GSTR-1, HSN)",
            "Automated Replenishment Engine"
        ],
        "recommended_for": "Anishka Industries & mid-sized welding supply distributors."
    },
    {
        "id": "enterprise",
        "name": "OEM Enterprise",
        "monthly_price": 19999,
        "annual_price": 199999,
        "max_users": "Unlimited",
        "max_skus": "Unlimited",
        "features": [
            "All Professional Features",
            "Tally Prime / ERP 9 Automated XML/CSV Sync",
            "Challan & Invoice OCR 3-Way Match",
            "Executive Owner Weekly Brief & Groq LLM",
            "Multi-Warehouse Support",
            "Dedicated Cloud PostgreSQL & 99.9% SLA"
        ],
        "recommended_for": "Multi-branch industrial distributors & high-volume OEMs."
    }
]

DEFAULT_UNIT_ECONOMICS = {
    "plan_price_monthly": 9999.0,
    "hosting_server_per_customer": 650.0,
    "llm_ai_tokens_per_customer": 450.0,
    "whatsapp_cloud_api_per_customer": 300.0,
    "support_ops_per_customer": 1200.0,
    "fixed_overhead_monthly": 45000.0
}


def calculate_unit_economics(inputs: Dict[str, Any]) -> Dict[str, Any]:
    """
    Calculate customer-level SaaS unit economics, gross margins, and break-even scale.
    """
    params = {**DEFAULT_UNIT_ECONOMICS, **inputs}

    price = float(params.get("plan_price_monthly") or 9999.0)
    hosting = float(params.get("hosting_server_per_customer") or 0.0)
    llm = float(params.get("llm_ai_tokens_per_customer") or 0.0)
    wa = float(params.get("whatsapp_cloud_api_per_customer") or 0.0)
    support = float(params.get("support_ops_per_customer") or 0.0)
    overhead = float(params.get("fixed_overhead_monthly") or 0.0)

    # Direct variable cost per customer per month
    variable_cost = round(hosting + llm + wa + support, 2)
    gross_profit_per_customer = round(price - variable_cost, 2)
    gross_margin_pct = round((gross_profit_per_customer / price * 100), 1) if price > 0 else 0.0

    # Break-even calculation
    break_even_customers = int((overhead / gross_profit_per_customer) + 0.999) if gross_profit_per_customer > 0 else 999
    annual_arr_per_customer = round(price * 12, 2)

    return {
        "monthly_price": price,
        "cost_breakdown": {
            "hosting_infrastructure": hosting,
            "llm_inference_tokens": llm,
            "whatsapp_messaging_api": wa,
            "customer_success_ops": support,
            "total_variable_cost": variable_cost
        },
        "gross_profit_monthly": gross_profit_per_customer,
        "gross_margin_pct": gross_margin_pct,
        "fixed_overhead_monthly": overhead,
        "break_even_customers": break_even_customers,
        "annual_arr_per_customer": annual_arr_per_customer,
        "contribution_summary": (
            f"At ₹{price:,.0f}/mo with direct cost of ₹{variable_cost:,.0f}/mo, each customer delivers "
            f"₹{gross_profit_per_customer:,.0f}/mo ({gross_margin_pct}% gross margin). "
            f"Break-even is achieved at {break_even_customers} active customers covering ₹{overhead:,.0f}/mo overhead."
        )
    }
