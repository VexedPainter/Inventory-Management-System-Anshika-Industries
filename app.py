import time
"""
FastAPI Server for Anishka Inventory Management System v7.0.
Enterprise stock control for Anishka Industries (Khandsa Road, Sector-10, Gurugram).
Specialized in MIG, TIG, and Robotics Welding Spares.

Features:
- REST API & Real-time WebSocket updates
- JWT/Cookie Authentication & Role-Based Access Control (RBAC)
- Multi-format Reports (PDF, Excel, CSV)
- Groq AI Inventory & Technical Copilot
- Live Stock Movement Simulator
"""
import os
import io
import csv
import json
import random
import secrets
import asyncio
import datetime
import tempfile
import logging
from collections import defaultdict
from typing import Optional, Literal, List, Dict, Any
from contextlib import asynccontextmanager

from dotenv import load_dotenv
load_dotenv()

from fastapi import (
    FastAPI, Depends, HTTPException, WebSocket, WebSocketDisconnect,
    Request, Response, UploadFile, status, File, Form, Query
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, Response, RedirectResponse, JSONResponse, StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy import func

import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from starlette.middleware.base import BaseHTTPMiddleware

from database import (
    DATABASE_URL,
    SessionLocal, init_db, Vendor, Inventory, Procurement,
    StockMovement, POItem, AuditLog,
    UserRole, ROLE_PERMISSIONS, AppSetting, AutomationRun, Outbox, seed_default_settings,
    Customer, SalesOrder, SalesOrderItem, Invoice, Payment,
    DocExtraction, CycleCount, CycleCountItem
)
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from pdf_generator import (
    generate_document_pdf, generate_bulk_pdf, generate_dashboard_report_pdf,
    generate_low_stock_report_pdf, generate_dispatch_note_pdf,
    generate_tax_invoice_pdf, generate_quotation_pdf, number_to_indian_currency_words,
    generate_item_labels_pdf, generate_bin_labels_pdf
)
from doc_scanner import (
    save_uploaded_document, extract_document_data, match_extraction_with_po,
    confirm_and_receive_delivery, get_scan_accuracy_report,
    CANNED_SAMPLES, UPLOAD_DIR, SAMPLES_DIR, DeliveryDocExtraction
)
from preventive_intelligence import (
    compute_item_status, compute_items_status_map,
    check_and_trigger_auto_reorder, calculate_forecast,
    find_smart_alternatives, check_and_apply_auto_approval,
    ensure_replenishment, queue_po_approval_email,
    compute_suggested_reorder_level, get_dead_stock_analysis,
    generate_daily_digest,
    compute_abc_xyz_classification, calculate_advanced_forecast,
    compute_safety_stock_rop, compute_what_if_simulation,
    compute_business_kpis, detect_robust_z_anomalies,
    seed_twelve_month_analytics_history
)
from sales_opportunities import (
    clean_whatsapp_phone,
    build_whatsapp_link,
    get_whatsapp_template,
    compute_sales_opportunities,
    send_or_simulate_whatsapp_message,
    compute_sales_funnel
)
from security_manager import (
    LOCKOUT_MINUTES,
    hash_password, verify_password, needs_rehash, is_default_password,
    validate_password_complexity, check_rate_limit, record_failed_login,
    record_successful_login, reset_all_rate_limits, SECURITY_HEADERS, get_cookie_params
)
from backup_manager import (
    create_backup, list_backups, restore_backup, clean_old_backups, BACKUP_DIR
)
from import_wizard import (
    parse_file_to_dataframe, auto_map_columns, validate_import_data,
    commit_import_batch, rollback_import_batch, list_import_batches,
    generate_template
)
from structured_logging import StructuredLoggingMiddleware
from database import ImportBatch

from business_reports import (
    get_gst_sales_register,
    get_gst_purchase_register,
    get_gstr1_summary,
    get_hsn_summary,
    export_sales_register_csv,
    export_purchase_register_csv,
    export_gstr1_b2b_csv,
    export_gstr1_b2c_csv,
    export_hsn_summary_csv,
    get_tally_ledger_settings,
    save_tally_ledger_settings,
    generate_tally_xml_vouchers,
    generate_tally_csv_vouchers,
    compute_owner_summary_metrics,
    generate_owner_summary_narrative,
    generate_owner_summary_pdf,
    dispatch_owner_summary_outbox,
    get_dashboard_owner_summary,
    STATUTORY_GST_NOTICE
)
from ai_copilot import run_chat_agent, stream_chat_agent, check_ai_health, AIChatLog

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("anishka_inventory")

# ─── Security & Authentication ───────────────────────────────────────
ALLOW_TEST_ROLE_HEADER = os.getenv("ALLOW_TEST_ROLE_HEADER", "false").lower() in ("true", "1", "yes")
AUTHENTICATED_SESSIONS: dict[str, dict] = {}
SESSION_TTL_HOURS = 24

def _purge_expired_sessions():
    now = datetime.datetime.now()
    expired = [t for t, data in AUTHENTICATED_SESSIONS.items() if (now - data.get("expires", now)).total_seconds() > 0]
    for t in expired:
        del AUTHENTICATED_SESSIONS[t]

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def get_current_user(request: Request, db: Session = Depends(get_db)) -> dict:
    """
    Resolve acting user and role:
    1. Honors X-User-Role only when ALLOW_TEST_ROLE_HEADER=true (for automated tests)
    2. Authorization: Bearer header takes precedence over ss_token cookie
    3. Unauthenticated requests raise 401
    """
    allow_test_role = os.getenv("ALLOW_TEST_ROLE_HEADER", "false").strip().lower() in ("true", "1", "yes")
    if allow_test_role:
        test_role = request.headers.get("X-User-Role")
        via_ai = request.headers.get("X-Via-AI") == "true" or request.query_params.get("via_ai") == "true"
        suffix = " via AI" if via_ai else ""
        if test_role in ("admin", "manager", "storekeeper"):
            return {"username": f"{test_role}{suffix}", "role": test_role, "full_name": test_role.capitalize()}
        elif request.method == "GET":
            return {"username": f"admin{suffix}", "role": "admin", "full_name": "Test Admin"}

    auth_header = request.headers.get("Authorization", "").strip()
    token = ""
    if auth_header.startswith("Bearer "):
        token = auth_header[7:].strip()
    elif auth_header:
        token = auth_header
    if not token:
        token = request.cookies.get("ss_token", "").strip()

    if token and token in AUTHENTICATED_SESSIONS:
        _purge_expired_sessions()
        session_data = AUTHENTICATED_SESSIONS.get(token)
        if session_data:
            user_dict = dict(session_data)
            via_ai = request.headers.get("X-Via-AI") == "true" or request.query_params.get("via_ai") == "true"
            if via_ai:
                base = user_dict["username"].replace(" via AI", "")
                user_dict["username"] = f"{base} via AI"
            return user_dict

    raise HTTPException(status_code=401, detail="Authentication required. Please sign in.")

def require_roles(allowed_roles: list[str]):
    def role_checker(current_user: dict = Depends(get_current_user)):
        user_role = current_user.get("role", "storekeeper")
        if user_role not in allowed_roles:
            raise HTTPException(
                status_code=403,
                detail=f"Operation forbidden for role '{user_role}'. Allowed roles: {allowed_roles}"
            )
        return current_user
    return role_checker


# ─── Pydantic Request Models ─────────────────────────────────────────
class LoginRequest(BaseModel):
    username: str
    password: str

class ItemCreateRequest(BaseModel):
    sku: str
    name: str
    category: str
    unit: Optional[str] = "pcs"
    compatible_with: Optional[str] = None
    location: Optional[str] = "R1-B01"
    quantity: int = 0
    reorder_level: int = 10
    reorder_qty: int = 50
    unit_cost: float = 0.0
    selling_price: float = 0.0
    supplier_id: Optional[str] = None

class ItemUpdateRequest(BaseModel):
    sku: Optional[str] = None
    name: Optional[str] = None
    category: Optional[str] = None
    unit: Optional[str] = None
    compatible_with: Optional[str] = None
    location: Optional[str] = None
    quantity: Optional[int] = None
    reorder_level: Optional[int] = None
    reorder_qty: Optional[int] = None
    unit_cost: Optional[float] = None
    selling_price: Optional[float] = None
    supplier_id: Optional[str] = None

class StockInRequest(BaseModel):
    item_id: Optional[int] = None
    sku: Optional[str] = None
    quantity: int
    supplier: Optional[str] = "Authorized OEM"
    reference: Optional[str] = "Goods Receipt"
    client_id: Optional[str] = None # Offline queue idempotency UUID

class StockOutRequest(BaseModel):
    item_id: Optional[int] = None
    sku: Optional[str] = None
    quantity: int
    customer: Optional[str] = "Welding Line"
    invoice_no: Optional[str] = "DISP-ISSUE"
    client_id: Optional[str] = None # Offline queue idempotency UUID

class StockAdjustmentRequest(BaseModel):
    item_id: Optional[int] = None
    sku: Optional[str] = None
    quantity_change: int
    reason: str
    reference: Optional[str] = "Manual Adjustment"
    destination: Optional[str] = "Shop Floor"
    client_id: Optional[str] = None # Offline queue idempotency UUID

class StockMovementCreate(BaseModel):
    sku: str
    item_name: Optional[str] = ""
    movement_type: Optional[str] = "OUTWARD"
    type: Optional[str] = None
    quantity: int
    reference: Optional[str] = ""
    destination_or_source: Optional[str] = "Central Store"
    party: Optional[str] = None
    operator: Optional[str] = "storekeeper"
    performed_by: Optional[str] = None
    notes: Optional[str] = ""
    client_id: Optional[str] = None # Offline queue idempotency UUID

class CycleCountCreateRequest(BaseModel):
    type: str = "CATEGORY" # CATEGORY | BIN | ALL
    target_name: Optional[str] = "MIG Welding"
    notes: Optional[str] = None

class CycleCountItemEntry(BaseModel):
    item_id: int
    counted_qty: int
    discrepancy_reason: Optional[str] = None

class CycleCountUpdateRequest(BaseModel):
    counts: List[CycleCountItemEntry]

class CycleCountActionRequest(BaseModel):
    notes: Optional[str] = None
    reason: Optional[str] = None

class POLineItemCreate(BaseModel):
    item_id: Optional[int] = None
    sku: Optional[str] = None
    qty: int
    unit_cost: Optional[float] = None

class CreatePORequest(BaseModel):
    vendor_id: Optional[str] = None
    supplier_id: Optional[str] = None
    po_number: Optional[str] = None
    item: Optional[str] = "Welding Equipment Spares"
    quantity: Optional[int] = 1
    amount: Optional[float] = 0.0
    department: Optional[str] = "Central Store"
    items: Optional[list] = None

class POReceiveItem(BaseModel):
    item_id: int
    qty_received: int

class POReceiveRequest(BaseModel):
    items: Optional[list[POReceiveItem]] = None

class ScanDocConfirmRequest(BaseModel):
    reviewed_lines: list[dict]
    fields_corrected: int = 0
    po_id: Optional[int] = None

class CreateInventoryItemRequest(BaseModel):
    id: Optional[int] = None
    name: str
    sku: str
    category: str
    unit: Optional[str] = "pcs"
    compatible_with: Optional[str] = None
    location: Optional[str] = "R1-B01"
    quantity: int = 0
    reorder_level: int = 10
    reorder_qty: int = 50
    unit_cost: float = 0.0
    selling_price: float = 0.0
    unit_price: Optional[float] = None
    supplier_id: Optional[str] = None
    hsn_code: Optional[str] = "8466"
    gst_rate: Optional[float] = 18.0

class CustomerCreateRequest(BaseModel):
    name: str
    gstin: Optional[str] = None
    state: str = "Haryana"
    city: str
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    price_tier: Optional[str] = "Standard"
    credit_limit: Optional[float] = 100000.0
    credit_days: Optional[int] = 30
    whatsapp_opt_out: Optional[bool] = False

class CustomerUpdateRequest(BaseModel):
    name: Optional[str] = None
    gstin: Optional[str] = None
    state: Optional[str] = None
    city: Optional[str] = None
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    price_tier: Optional[str] = None
    credit_limit: Optional[float] = None
    credit_days: Optional[int] = None
    is_active: Optional[bool] = None
    whatsapp_opt_out: Optional[bool] = None

class WhatsAppPreviewRequest(BaseModel):
    template_type: str = "opportunity" # "opportunity" | "po"
    ref_id: str
    lang: Optional[str] = "en" # "en" | "hi"
    customer_id: Optional[int] = None
    supplier_id: Optional[str] = None
    custom_text: Optional[str] = None

class WhatsAppSendRequest(BaseModel):
    template_type: str = "opportunity" # "opportunity" | "po"
    ref_id: str
    lang: Optional[str] = "en"
    phone: str
    message: str
    customer_id: Optional[int] = None
    supplier_id: Optional[str] = None

class CustomerOptOutRequest(BaseModel):
    opt_out: bool

class SalesOrderItemInput(BaseModel):
    item_id: int
    qty: int
    unit_price: Optional[float] = None
    discount_pct: Optional[float] = 0.0

class SalesOrderCreateRequest(BaseModel):
    customer_id: int
    items: list[SalesOrderItemInput]
    status: Optional[str] = None
    is_quote: Optional[bool] = None
    valid_until: Optional[str] = None
    notes: Optional[str] = None

class SalesOrderConfirmRequest(BaseModel):
    override_reason: Optional[str] = None

class SalesOrderDispatchRequest(BaseModel):
    items: Optional[list[dict]] = None

class PaymentCreateRequest(BaseModel):
    amount: float
    mode: Optional[str] = "NEFT/RTGS"
    reference: Optional[str] = None
    date: Optional[str] = None

class SupplierCreateRequest(BaseModel):
    id: Optional[str] = None
    name: str
    contact_person: Optional[str] = "Sales Manager"
    phone: Optional[str] = "+91 124 400 0000"
    city: Optional[str] = "Delhi-NCR"
    lead_time_days: Optional[int] = 3
    rating: Optional[float] = 4.5
    category: Optional[str] = "Welding Supplies"
    contact_email: Optional[str] = "sales@supplier.com"

class SupplierUpdateRequest(BaseModel):
    name: Optional[str] = None
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    city: Optional[str] = None
    lead_time_days: Optional[int] = None
    rating: Optional[float] = None
    category: Optional[str] = None
    contact_email: Optional[str] = None

class AIChatRequest(BaseModel):
    message: str
    conversation_history: Optional[list] = None
    stream: bool = False
    session_id: Optional[str] = None

class WhatIfRequest(BaseModel):
    item_id: Optional[int] = None
    sku: Optional[str] = None
    lead_time_delta_days: int = 0
    demand_increase_pct: float = 0.0

class ServiceLevelSettingRequest(BaseModel):
    service_level: str = "95%"
    safety_stock_method: Optional[str] = "service_level"


# ─── WebSocket Connection Manager ────────────────────────────────────
class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.info(f"[WS] Client connected. Active: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
        logger.info(f"[WS] Client disconnected. Active: {len(self.active_connections)}")

    async def broadcast(self, message: dict):
        dead_sockets = []
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception:
                dead_sockets.append(connection)
        for s in dead_sockets:
            self.disconnect(s)

manager = ConnectionManager()
simulator_running = os.getenv("SIMULATOR_ENABLED", "false").lower() in ("true", "1", "yes")


# ─── Background Welding Spares Simulator ─────────────────────────────
async def simulate_stock_events():
    """Simulate realistic factory stock dispatches and receipts in Gurugram industrial cluster."""
    global simulator_running
    await asyncio.sleep(4)  # Initial wait

    welding_lines = [
        "Robotic Welding Cell #1 (Auto Exhaust)",
        "Robotic Welding Cell #2 (Chassis Fab)",
        "TIG Piping Station B",
        "MIG Heavy Fab Bay",
        "Structural Assembly Line 3",
        "Toolroom Maintenance",
    ]

    while True:
        try:
            if not simulator_running:
                await asyncio.sleep(3)
                continue

            await asyncio.sleep(random.randint(6, 12))
            db = SessionLocal()
            try:
                items = db.query(Inventory).all()
                if not items:
                    continue

                item = random.choice(items)
                event_type = random.choices(["DISPATCH", "RECEIPT", "CYCLE_COUNT"], weights=[0.65, 0.25, 0.10])[0]

                now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")
                now_iso = datetime.datetime.now().isoformat()

                if event_type == "DISPATCH" and item.quantity > 5:
                    disp_qty = random.randint(1, min(10, item.quantity))
                    item.quantity -= disp_qty
                    item.last_updated = now_iso
                    line = random.choice(welding_lines)

                    movement = StockMovement(
                        item_id=item.id,
                        type="OUT",
                        quantity=disp_qty,
                        reference=f"ISSUE-{random.randint(1000, 9999)}",
                        party=line,
                        performed_by="storekeeper",
                        timestamp=now_str,
                        balance_after=item.quantity
                    )
                    db.add(movement)
                    db.commit()

                    await manager.broadcast({
                        "type": "new_stock_movement",
                        "data": {
                            "sku": item.sku,
                            "item_name": item.name,
                            "type": "OUTWARD",
                            "quantity": disp_qty,
                            "destination": line,
                            "remaining": item.quantity,
                            "timestamp": now_str
                        }
                    })

                    # Requirement C: Event trigger in simulator
                    await trigger_replenishment_events([item.id], db, user="simulator")

                elif event_type == "RECEIPT":
                    rcv_qty = random.choice([20, 50, 100, 200])
                    item.quantity += rcv_qty
                    item.last_updated = now_iso

                    movement = StockMovement(
                        item_id=item.id,
                        type="IN",
                        quantity=rcv_qty,
                        reference=f"PO-2026-{random.randint(110, 199)}",
                        party="Supplier Delivery Dock",
                        performed_by="storekeeper",
                        timestamp=now_str,
                        balance_after=item.quantity
                    )
                    db.add(movement)
                    db.commit()

                    await manager.broadcast({
                        "type": "new_stock_movement",
                        "data": {
                            "sku": item.sku,
                            "item_name": item.name,
                            "type": "INWARD",
                            "quantity": rcv_qty,
                            "destination": "Central Store",
                            "remaining": item.quantity,
                            "timestamp": now_str
                        }
                    })

                # Broadcast live stats update
                stats_payload = _compute_stats(db)
                await manager.broadcast({
                    "type": "stats_update",
                    "data": stats_payload
                })

            finally:
                db.close()

        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error(f"[Simulator] Error: {e}")
            await asyncio.sleep(5)


# ─── Lifespan Context ────────────────────────────────────────────────

# ─── Automation Engine & Scheduler ──────────────────────────────────
scheduler = AsyncIOScheduler()
# _daily_overdue_notified now stored in AppSetting table

class AutomationSettingsUpdate(BaseModel):
    auto_reorder_enabled: Optional[bool] = None
    scan_interval_minutes: Optional[int] = None
    smart_qty_enabled: Optional[bool] = None
    safety_days: Optional[int] = None
    auto_approve_enabled: Optional[bool] = None
    auto_approve_limit: Optional[float] = None
    auto_approve_min_supplier_rating: Optional[float] = None
    overdue_alerts_enabled: Optional[bool] = None
    email_on_approval: Optional[bool] = None
    digest_time: Optional[str] = None

def get_setting_val(db: Session, key: str, default: str = "") -> str:
    s = db.query(AppSetting).filter(AppSetting.key == key).first()
    return s.value if s else default

def get_automation_settings_dict(db: Session) -> dict:
    return {
        "auto_reorder_enabled": get_setting_val(db, "auto_reorder_enabled", "true").lower() in ("true", "1", "yes"),
        "scan_interval_minutes": int(get_setting_val(db, "scan_interval_minutes", "5") or "5"),
        "smart_qty_enabled": get_setting_val(db, "smart_qty_enabled", "true").lower() in ("true", "1", "yes"),
        "safety_days": int(get_setting_val(db, "safety_days", "14") or "14"),
        "auto_approve_enabled": get_setting_val(db, "auto_approve_enabled", "false").lower() in ("true", "1", "yes"),
        "auto_approve_limit": float(get_setting_val(db, "auto_approve_limit", "25000") or "25000"),
        "auto_approve_min_supplier_rating": float(get_setting_val(db, "auto_approve_min_supplier_rating", "4.0") or "4.0"),
        "overdue_alerts_enabled": get_setting_val(db, "overdue_alerts_enabled", "true").lower() in ("true", "1", "yes"),
        "email_on_approval": get_setting_val(db, "email_on_approval", "true").lower() in ("true", "1", "yes"),
        "digest_time": get_setting_val(db, "digest_time", "08:00")
    }

async def trigger_replenishment_events(item_ids, db: Session, user: str = "system"):
    """Helper to run ensure_replenishment and broadcast resulting WebSocket alerts."""
    try:
        triggered = ensure_replenishment(item_ids, db, user=user)
        for t in triggered:
            alert = t.get("alert")
            if alert:
                await manager.broadcast({"type": "low_stock", "data": alert})
                await manager.broadcast({"type": "reorder_alert", "data": alert})
        if triggered:
            stats = _compute_stats(db)
            await manager.broadcast({"type": "stats_update", "data": stats})
        return triggered
    except Exception as e:
        logger.error(f"[trigger_replenishment_events] Error: {e}")
        return []

async def run_automation_cycle(trigger: str = "scheduled") -> dict:
    """
    Scheduled & on-demand automation cycle:
    1. Reads active settings from AppSetting.
    2. Computes status for all active items.
    3. Triggers reorder for LOW/CRITICAL/OUT not on open DRAFT/APPROVED/PARTIALLY_RECEIVED POs.
    4. Evaluates auto-approval rules.
    5. Detects and daily-dedupes overdue PO alerts.
    6. Records AutomationRun and broadcasts.
    """
    db = SessionLocal()
    try:
        settings = get_automation_settings_dict(db)
        items = db.query(Inventory).filter(Inventory.is_active == True).all()
        scanned = len(items)
        drafted = 0
        auto_approved = 0
        skipped_open_po = 0
        pos_touched = set()

        for item in items:
            status = compute_item_status(item, db)
            if status in ("LOW", "CRITICAL", "OUT"):
                open_lines = db.query(POItem).join(Procurement).filter(
                    POItem.item_id == item.id,
                    Procurement.status.in_(["DRAFT", "APPROVED", "PARTIALLY_RECEIVED"])
                ).all()
                has_open_po = False
                for line in open_lines:
                    po_status = line.purchase_order.status
                    if po_status in ("DRAFT", "APPROVED"):
                        has_open_po = True
                        break
                    elif po_status == "PARTIALLY_RECEIVED":
                        outstanding = line.qty - (getattr(line, "received_qty", 0) or 0)
                        if outstanding > 0:
                            has_open_po = True
                            break

                if has_open_po:
                    skipped_open_po += 1
                    continue

                if settings["auto_reorder_enabled"]:
                    triggered, po, alert = check_and_trigger_auto_reorder(item, db, user="automation")
                    if triggered and po:
                        drafted += 1
                        pos_touched.add(po)
                        if alert:
                            await manager.broadcast({"type": "low_stock", "data": alert})
                            await manager.broadcast({"type": "reorder_alert", "data": alert})

        for po in pos_touched:
            approved = check_and_apply_auto_approval(po, db, user="automation")
            if approved:
                auto_approved += 1
                await manager.broadcast({
                    "type": "po_auto_approved",
                    "data": {
                        "id": po.id,
                        "po_number": po.po_number,
                        "total_value": po.total_value,
                        "supplier_name": po.supplier.name if po.supplier else ""
                    }
                })
                await manager.broadcast({
                    "type": "po_status_change",
                    "data": {"id": po.id, "po_number": po.po_number, "status": "APPROVED"}
                })
            else:
                await manager.broadcast({
                    "type": "po_awaiting_approval",
                    "data": {
                        "id": po.id,
                        "po_number": po.po_number,
                        "total_value": po.total_value,
                        "supplier_name": po.supplier.name if po.supplier else ""
                    }
                })

        # Overdue PO checks
        today_str = datetime.date.today().isoformat()
        overdue_pos = db.query(Procurement).filter(
            Procurement.status.in_(["APPROVED", "PARTIALLY_RECEIVED"]),
            Procurement.expected_date != None,
            Procurement.expected_date < today_str
        ).all()
        overdue_count = len(overdue_pos)

        if settings["overdue_alerts_enabled"]:
            notified_setting_key = f"overdue_notified_{today_str}"
            notified_row = db.query(AppSetting).filter(AppSetting.key == notified_setting_key).first()
            notified_set = set()
            if notified_row and notified_row.value:
                try:
                    notified_set = set(json.loads(notified_row.value))
                except Exception:
                    notified_set = set()

            newly_notified = False
            for opo in overdue_pos:
                if opo.po_number not in notified_set:
                    notified_set.add(opo.po_number)
                    newly_notified = True
                    try:
                        exp_d = datetime.date.fromisoformat(str(opo.expected_date)[:10])
                        d_late = (datetime.date.today() - exp_d).days
                    except Exception:
                        d_late = 1
                    await manager.broadcast({
                        "type": "po_overdue_alert",
                        "data": {
                            "po_number": opo.po_number,
                            "supplier_name": opo.supplier.name if opo.supplier else "Supplier",
                            "expected_date": opo.expected_date,
                            "days_late": d_late
                        }
                    })

            if newly_notified:
                val_json = json.dumps(list(notified_set))
                if notified_row:
                    notified_row.value = val_json
                    notified_row.updated_at = datetime.datetime.now().isoformat()
                else:
                    db.add(AppSetting(
                        key=notified_setting_key,
                        value=val_json,
                        updated_by="automation",
                        updated_at=datetime.datetime.now().isoformat()
                    ))
                db.commit()

        summary = f"Scanned {scanned} items. Drafted {drafted} items, {auto_approved} auto-approved, {skipped_open_po} skipped (on open PO). {overdue_count} overdue POs."
        now_dt_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        run_rec = AutomationRun(
            started_at=now_dt_str,
            trigger=trigger,
            scanned=scanned,
            drafted=drafted,
            auto_approved=auto_approved,
            overdue=overdue_count,
            summary=summary
        )
        db.add(run_rec)
        db.commit()

        run_data = {
            "id": run_rec.id,
            "started_at": run_rec.started_at,
            "trigger": trigger,
            "scanned": scanned,
            "drafted": drafted,
            "auto_approved": auto_approved,
            "skipped_open_po": skipped_open_po,
            "overdue": overdue_count,
            "summary": summary
        }

        await manager.broadcast({"type": "automation_run", "data": run_data})
        if drafted > 0:
            stats = _compute_stats(db)
            await manager.broadcast({"type": "stats_update", "data": stats})

        return run_data

    except Exception as e:
        logger.error(f"[Automation Engine] Cycle error: {e}", exc_info=True)
        return {
            "error": str(e),
            "scanned": 0,
            "drafted": 0,
            "auto_approved": 0,
            "skipped_open_po": 0,
            "overdue": 0,
            "summary": f"Automation cycle encountered error: {e}"
        }
    finally:
        db.close()

async def run_daily_digest_job():
    """Scheduled task generating daily operational digest."""
    db = SessionLocal()
    try:
        data = generate_daily_digest(db, triggered_by="scheduler")
        await manager.broadcast({"type": "daily_digest_generated", "data": {"date": data.get("date")}})
        logger.info(f"[Daily Digest] Generated daily operations digest for {data.get('date')}.")
    except Exception as e:
        logger.error(f"[Daily Digest] Scheduled run error: {e}")
    finally:
        db.close()

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    logger.info("Anishka Inventory Management System (Anishka Industries, Gurugram) online.")
    sim_task = asyncio.create_task(simulate_stock_events())

    # Start APScheduler for automation cycle
    db_init = SessionLocal()
    try:
        s_int = db_init.query(AppSetting).filter(AppSetting.key == "scan_interval_minutes").first()
        scan_mins = int(s_int.value) if s_int and s_int.value and s_int.value.isdigit() else 5
    except Exception:
        scan_mins = 5
    finally:
        db_init.close()

    try:
        scheduler.add_job(
            run_automation_cycle,
            "interval",
            minutes=max(1, scan_mins),
            id="automation_cycle",
            replace_existing=True
        )

        d_val = get_setting_val(db_init, "digest_time", "08:00")
        try:
            parts = d_val.split(":")
            dh, dm = int(parts[0]), int(parts[1])
        except Exception:
            dh, dm = 8, 0

        scheduler.add_job(
            create_backup,
            "cron",
            hour=2,
            minute=0,
            id="nightly_backup_job",
            kwargs={"tag": "nightly"},
            replace_existing=True
        )

        scheduler.add_job(
            run_daily_digest_job,
            "cron",
            hour=dh,
            minute=dm,
            id="daily_digest_job",
            replace_existing=True
        )
        if not scheduler.running:
            scheduler.start()
        logger.info(f"[Automation] Scheduler started with {scan_mins}m interval.")
    except Exception as sched_err:
        logger.error(f"[Automation] Scheduler failed to start: {sched_err}")

    yield

    global simulator_running
    simulator_running = False
    sim_task.cancel()
    if scheduler.running:
        scheduler.shutdown(wait=False)


# ─── FastAPI App Initialization ──────────────────────────────────────
app = FastAPI(
    title="Anishka Inventory · Industrial Spares Management",
    description="Inventory and procurement management system for Anishka Industries, Gurugram",
    version="7.0.0",
    lifespan=lifespan
)

def _rate_limit_key(request: Request) -> str:
    auth_header = request.headers.get("Authorization", "").strip()
    token = ""
    if auth_header.startswith("Bearer "):
        token = auth_header[7:].strip()
    elif auth_header:
        token = auth_header
    if not token:
        token = request.cookies.get("ss_token", "").strip()
    if token:
        return f"tok:{token}"
    test_role = request.headers.get("X-User-Role")
    if test_role:
        return f"role:{test_role}"
    return get_remote_address(request)

limiter = Limiter(key_func=_rate_limit_key)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

@app.middleware("http")
async def enforce_api_authentication(request: Request, call_next):
    path = request.url.path
    if path.startswith("/api/") and path not in ("/api/login", "/api/health"):
        allow_test_role = os.getenv("ALLOW_TEST_ROLE_HEADER", "false").strip().lower() in ("true", "1", "yes")
        user = None
        if allow_test_role:
            test_role = request.headers.get("X-User-Role")
            if test_role in ("admin", "manager", "storekeeper"):
                user = {"username": test_role, "role": test_role, "full_name": test_role.capitalize()}
            elif request.method == "GET":
                user = {"username": "admin", "role": "admin", "full_name": "Test Admin"}
        if not user:
            auth_header = request.headers.get("Authorization", "").strip()
            token = ""
            if auth_header.startswith("Bearer "):
                token = auth_header[7:].strip()
            elif auth_header:
                token = auth_header
            if not token:
                token = request.cookies.get("ss_token", "").strip()
            if token and token in AUTHENTICATED_SESSIONS:
                _purge_expired_sessions()
                user = AUTHENTICATED_SESSIONS.get(token)
        if not user:
            return JSONResponse(status_code=401, content={"detail": "Authentication required. Please sign in."})
    return await call_next(request)

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        for h_name, h_val in SECURITY_HEADERS.items():
            response.headers[h_name] = h_val
        return response

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition", "X-Request-ID", "X-Process-Time-Ms"]
)
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(StructuredLoggingMiddleware)
app.mount("/static", StaticFiles(directory=os.path.join(os.path.dirname(__file__), "static")), name="static")


# ─── Root & Authentication Endpoints ─────────────────────────────────

@app.get("/")
async def root_redirect(request: Request):
    """Serve the single-page application dashboard."""
    index_file = os.path.join(os.path.dirname(__file__), "static", "index.html")
    return FileResponse(index_file)

@app.get("/login")
async def login_page():
    return RedirectResponse(url="/", status_code=302)

@app.get("/legacy")
async def legacy_ui():
    legacy_file = os.path.join(os.path.dirname(__file__), "static", "legacy.html")
    return FileResponse(legacy_file)

@app.get("/manifest.json")
async def get_manifest():
    """Serve PWA Web App Manifest."""
    manifest_file = os.path.join(os.path.dirname(__file__), "static", "manifest.json")
    return FileResponse(manifest_file, media_type="application/manifest+json")

@app.get("/sw.js")
async def get_service_worker():
    """Serve PWA Service Worker for offline shell caching and sync."""
    sw_file = os.path.join(os.path.dirname(__file__), "static", "sw.js")
    return FileResponse(sw_file, media_type="application/javascript")

def is_admin_request(request: Request) -> bool:
    """Helper to check if request is authenticated as an admin."""
    allow_test_role = os.getenv("ALLOW_TEST_ROLE_HEADER", "false").strip().lower() in ("true", "1", "yes")
    if allow_test_role:
        test_role = request.headers.get("X-User-Role")
        if test_role == "admin":
            return True
        if test_role:
            return False

    auth_header = request.headers.get("Authorization", "").strip()
    token = ""
    if auth_header.startswith("Bearer "):
        token = auth_header[7:].strip()
    elif auth_header:
        token = auth_header
    if not token:
        token = request.cookies.get("ss_token", "").strip()

    if token and token in AUTHENTICATED_SESSIONS:
        session_data = AUTHENTICATED_SESSIONS.get(token)
        if session_data and session_data.get("role") == "admin":
            return True

    return False

@app.get("/api/health")
async def api_health(request: Request, db: Session = Depends(get_db)):
    """Health check endpoint: public callers get {status, database, version}; admin gets detailed telemetry without DB URL."""
    t_start = time.perf_counter()
    db_ok = False
    dialect_name = "unknown"
    try:
        db.connection().exec_driver_sql("SELECT 1")
        db_ok = True
        dialect_name = "sqlite" if "sqlite" in DATABASE_URL.lower() else "postgresql"
    except Exception as e:
        dialect_name = str(e)
    db_latency = round((time.perf_counter() - t_start) * 1000, 2)

    # Public response: only status, database, version (no DB path/URL, no internal details)
    if not is_admin_request(request):
        return {
            "status": "healthy" if db_ok else "degraded",
            "database": "connected" if db_ok else "error",
            "version": "2.5.0-pilot"
        }

    # Admin response: full telemetry, gated behind admin, strictly omitting DB url
    scheduler_jobs = []
    sched_running = False
    try:
        if scheduler.running:
            sched_running = True
            for job in scheduler.get_jobs():
                scheduler_jobs.append({
                    "id": job.id,
                    "name": job.name,
                    "next_run": str(job.next_run_time) if job.next_run_time else None
                })
    except Exception:
        pass

    return {
        "status": "healthy" if db_ok else "degraded",
        "facility": "Anishka Industries, Gurugram",
        "version": "2.5.0-pilot",
        "timestamp": datetime.datetime.now().isoformat(),
        "database": {
            "status": "connected" if db_ok else "error",
            "connected": db_ok,
            "dialect": dialect_name,
            "latency_ms": db_latency
        },
        "database_connected": db_ok,
        "scheduler": {
            "running": sched_running,
            "jobs_count": len(scheduler_jobs),
            "jobs": [j["id"] for j in scheduler_jobs]
        },
        "security": {
            "password_hashing": "argon2id/bcrypt",
            "rate_limiting": "active",
            "secure_cookies": os.getenv("SECURE_COOKIES", "false").lower() in ("true", "1")
        }
    }

@app.post("/api/login")
async def api_login(req: LoginRequest, response: Response, db: Session = Depends(get_db)):
    # 1. Brute-force rate limiting & lockout check
    is_locked, remaining_secs = check_rate_limit(req.username)
    if is_locked:
        mins = max(1, remaining_secs // 60)
        raise HTTPException(
            status_code=429,
            detail=f"Account locked due to consecutive failed login attempts. Try again in {mins} minute(s)."
        )

    valid_passwords = {
        "admin": "admin@2026",
        "manager": "manager@2026",
        "storekeeper": "storekeeper@2026"
    }

    user = db.query(UserRole).filter(UserRole.username == req.username).first()
    authenticated = False
    role = "storekeeper"
    full_name = req.username
    must_change = False

    if user:
        if hasattr(user, "is_active") and user.is_active is False:
            raise HTTPException(status_code=403, detail="Account is deactivated. Contact system administrator.")

        if verify_password(req.password, user.password):
            authenticated = True
            role = user.role
            full_name = user.full_name or req.username

            # Transparently upgrade legacy plaintext password to Argon2/bcrypt hash
            if needs_rehash(user.password):
                user.password = hash_password(req.password)

            # Check if password must be changed
            must_change = bool(getattr(user, "must_change_password", False) or is_default_password(req.password))
            user.last_login = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            db.commit()

    elif req.username in valid_passwords and req.password == valid_passwords[req.username]:
        # Fallback for seeded accounts if user not yet created in user_roles
        authenticated = True
        role = req.username
        must_change = True

    if authenticated:
        record_successful_login(req.username)
        token = secrets.token_hex(24)
        AUTHENTICATED_SESSIONS[token] = {
            "username": req.username,
            "role": role,
            "full_name": full_name,
            "expires": datetime.datetime.now() + datetime.timedelta(hours=SESSION_TTL_HOURS)
        }

        cookie_opts = get_cookie_params(max_age_seconds=SESSION_TTL_HOURS * 3600)
        response.set_cookie(
            key="ss_token",
            value=token,
            **cookie_opts
        )

        db.add(AuditLog(
            timestamp=datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            action="USER_LOGIN",
            user=req.username,
            target_id="AUTH",
            details=f"Successful authentication for {req.username} ({role})."
        ))
        db.commit()

        return {
            "status": "success",
            "token": token,
            "username": req.username,
            "role": role,
            "full_name": full_name,
            "must_change_password": must_change,
            "permissions": ROLE_PERMISSIONS.get(role, [])
        }

    # Record failed attempt
    attempts, is_now_locked, lockout_secs = record_failed_login(req.username)
    if is_now_locked:
        raise HTTPException(
            status_code=429,
            detail=f"Account locked: 5 consecutive failed attempts. Locked for {LOCKOUT_MINUTES} minutes."
        )

    rem = max(0, 5 - attempts)
    detail_msg = "Invalid username or passcode."
    if rem > 0:
        detail_msg += f" {rem} attempt(s) remaining before account lockout."
    raise HTTPException(status_code=401, detail=detail_msg)

@app.post("/api/logout")
async def api_logout(request: Request, response: Response):
    auth_header = request.headers.get("Authorization", "").strip()
    token = ""
    if auth_header.startswith("Bearer "):
        token = auth_header[7:].strip()
    elif auth_header:
        token = auth_header
    if not token:
        token = request.cookies.get("ss_token")
    if token and token in AUTHENTICATED_SESSIONS:
        del AUTHENTICATED_SESSIONS[token]
    response.delete_cookie("ss_token")
    return {"status": "success", "message": "Logged out"}


# ─── WebSocket Endpoint ──────────────────────────────────────────────
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    token = websocket.cookies.get("ss_token") or websocket.query_params.get("token")
    allow_test = os.getenv("ALLOW_TEST_ROLE_HEADER", "false").lower() in ("true", "1", "yes")
    is_valid = False
    if token and token in AUTHENTICATED_SESSIONS:
        is_valid = True
    elif allow_test and (token in ("admin", "manager", "storekeeper") or websocket.headers.get("X-User-Role")):
        is_valid = True

    if not is_valid:
        await websocket.close(code=4401)
        return

    await manager.connect(websocket)
    # Send initial payload
    db = SessionLocal()
    try:
        stats_payload = _compute_stats(db)
        await websocket.send_json({
            "type": "connection_info",
            "data": {
                "clients": len(manager.active_connections),
                "simulator": simulator_running,
                "facility": "Anishka Industries, Gurugram"
            }
        })
        await websocket.send_json({
            "type": "stats_update",
            "data": stats_payload
        })
    finally:
        db.close()

    try:
        while True:
            data = await websocket.receive_text()
            try:
                msg = json.loads(data)
                if msg.get("type") == "ping":
                    await websocket.send_json({"type": "pong", "data": {"clients": len(manager.active_connections)}})
            except Exception:
                pass
    except WebSocketDisconnect:
        manager.disconnect(websocket)


def _compute_stats(db: Session) -> dict:
    items = db.query(Inventory).filter(Inventory.is_active == True).all()
    status_map = compute_items_status_map(items, db)

    total_val = sum(item.quantity * (item.unit_cost if item.unit_cost and item.unit_cost > 0 else (item.selling_price or item.unit_price or 0.0)) for item in items)
    total_valuation = sum(item.quantity * (item.selling_price or item.unit_price or 0.0) for item in items)
    total_units = sum(item.quantity for item in items)
    total_skus = len(items)

    out_of_stock = sum(1 for s in status_map.values() if s == "OUT")
    low_stock = sum(1 for s in status_map.values() if s == "LOW")
    critical_stock = sum(1 for s in status_map.values() if s == "CRITICAL")
    dead_stock = sum(1 for s in status_map.values() if s == "DEAD")
    ok_stock = sum(1 for s in status_map.values() if s == "OK")

    dead_stock_val = sum(
        item.quantity * (item.unit_cost if item.unit_cost and item.unit_cost > 0 else (item.selling_price or item.unit_price or 0.0))
        for item in items if status_map.get(item.id) == "DEAD"
    )

    pending_pos = db.query(Procurement).filter(Procurement.status.in_(["DRAFT", "APPROVED"])).all()
    pending_po_count = len(pending_pos)
    pending_po_value = round(sum(p.total_value or 0.0 for p in pending_pos), 2)

    suppliers_count = db.query(Vendor).count()
    pos_count = db.query(Procurement).count()
    movements_count = db.query(StockMovement).count()

    healthy_count = ok_stock
    health_pct = round((healthy_count / total_skus * 100), 1) if total_skus > 0 else 100.0

    # Calculate Receivables Ageing
    today_d = datetime.date.today()
    unpaid_invs = db.query(Invoice).filter(Invoice.status.in_(["UNPAID", "PARTIALLY_PAID"])).all()
    b_0_30 = 0.0
    b_31_60 = 0.0
    b_60_plus = 0.0
    for inv in unpaid_invs:
        paid_sum = sum(p.amount for p in inv.payments)
        bal = max(0.0, inv.total - paid_sum)
        if bal > 0:
            try:
                idat = datetime.date.fromisoformat(inv.date[:10])
                age = (today_d - idat).days
            except Exception:
                age = 0
            if age <= 30:
                b_0_30 += bal
            elif age <= 60:
                b_31_60 += bal
            else:
                b_60_plus += bal

    total_rec = round(b_0_30 + b_31_60 + b_60_plus, 2)
    rec_ageing = {
        "bucket_0_30": round(b_0_30, 2),
        "bucket_31_60": round(b_31_60, 2),
        "bucket_60_plus": round(b_60_plus, 2),
        "total_outstanding": total_rec
    }
    kpis = compute_business_kpis(db)

    return {
        "receivables_ageing": rec_ageing,
        "total_inventory_value": round(total_valuation, 2),
        "total_valuation": round(total_valuation, 2),
        "total_cost_value": round(total_val, 2),
        "total_skus": total_skus,
        "total_items": total_skus,
        "total_stock_units": total_units,
        "low_stock_count": low_stock + critical_stock,
        "low_stock_items": low_stock + critical_stock,
        "critical_stock_count": critical_stock,
        "out_of_stock_items": out_of_stock,
        "dead_stock_count": dead_stock,
        "dead_stock_value": round(dead_stock_val, 2),
        "pending_po_count": pending_po_count,
        "pending_po_value": pending_po_value,
        "total_suppliers": suppliers_count,
        "total_pos": pos_count,
        "total_movements": movements_count,
        "inventory_health_pct": health_pct,
        "inventory_turnover": kpis["inventory_turnover"],
        "days_of_inventory": kpis["days_of_inventory"],
        "working_capital_tied_up": kpis["working_capital_tied_up"],
        "stockout_count_30d": kpis["stockout_count_30d"],
        "fill_rate_pct": kpis["fill_rate_pct"],
        "business_kpis": kpis,
        "sales_funnel": compute_sales_funnel(db),
        "owner_summary": get_dashboard_owner_summary(db),
        "status_distribution": {
            "OK": ok_stock,
            "LOW": low_stock,
            "CRITICAL": critical_stock,
            "OUT": out_of_stock,
            "DEAD": dead_stock
        },
        "facility": "Anishka Industries Gurugram"
    }


# ─── Dashboard Stats & Chart Endpoints ───────────────────────────────

@app.get("/api/stats")
async def get_stats(db: Session = Depends(get_db)):
    """Return summary metrics for the executive command center."""
    return _compute_stats(db)

@app.get("/api/dashboard")
async def get_dashboard_summary(db: Session = Depends(get_db)):
    """Comprehensive executive command center payload: metrics, 30-day trend, top 10 fast movers, status distribution."""
    stats = _compute_stats(db)

    # 30-day trend
    now = datetime.datetime.now()
    thirty_days_ago_dt = now - datetime.timedelta(days=30)
    thirty_days_ago_str = thirty_days_ago_dt.strftime("%Y-%m-%d %H:%M")

    movements_30d = db.query(StockMovement).filter(
        StockMovement.timestamp >= thirty_days_ago_str
    ).all()

    daily_map = defaultdict(lambda: {"inward": 0, "outward": 0})
    item_out_map = defaultdict(int)

    for m in movements_30d:
        day_str = m.timestamp[:10] if m.timestamp else ""
        if m.type == "IN":
            daily_map[day_str]["inward"] += m.quantity
        elif m.type == "OUT":
            daily_map[day_str]["outward"] += m.quantity
            item_out_map[m.item_id] += m.quantity

    trend_30d = []
    for d in range(30, -1, -1):
        dt = (now - datetime.timedelta(days=d)).strftime("%Y-%m-%d")
        trend_30d.append({
            "date": dt,
            "inward": daily_map[dt]["inward"],
            "outward": daily_map[dt]["outward"]
        })

    # Top 10 fast movers
    top_item_ids = sorted(item_out_map.keys(), key=lambda x: item_out_map[x], reverse=True)[:10]
    fast_movers = []
    if top_item_ids:
        fast_items = db.query(Inventory).filter(Inventory.id.in_(top_item_ids)).all()
        item_obj_map = {i.id: i for i in fast_items}
        for i_id in top_item_ids:
            it = item_obj_map.get(i_id)
            if it:
                fast_movers.append({
                    "item_id": it.id,
                    "sku": it.sku,
                    "name": it.name,
                    "category": it.category,
                    "units_dispatched_30d": item_out_map[i_id],
                    "current_stock": it.quantity
                })

    return {
        "stats": stats,
        "sales_funnel": stats.get("sales_funnel", {}),
        "receivables_ageing": stats.get("receivables_ageing", {}),
        "total_skus": stats["total_skus"],
        "stock_value": stats["total_valuation"],
        "counts": stats["status_distribution"],
        "dead_stock_value": stats["dead_stock_value"],
        "pending_po_count": stats["pending_po_count"],
        "pending_po_value": stats["pending_po_value"],
        "status_distribution": stats["status_distribution"],
        "trend_30d": trend_30d,
        "fast_movers": fast_movers
    }

@app.get("/api/forecast/{item_id}")
async def get_item_forecast(item_id: str, db: Session = Depends(get_db)):
    """Explainable 30-day forecast: daily run-rate, days remaining, suggested reorder date & quantity."""
    item = None
    if item_id.isdigit():
        item = db.query(Inventory).filter(Inventory.id == int(item_id)).first()
    if not item:
        item = db.query(Inventory).filter(Inventory.sku == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found.")
    fc = calculate_forecast(item, db)
    sug_res = compute_suggested_reorder_level(item, db)
    fc["suggested_reorder_level"] = sug_res["suggested_reorder_level"]
    fc["current_reorder_level"] = sug_res["current_reorder_level"]
    fc["reorder_level_diff"] = sug_res["diff"]
    fc["reorder_level_diff_pct"] = sug_res["diff_pct"]
    return fc


# ─── Advanced Analytics & Demand Intelligence Endpoints ───────────────

@app.get("/api/analytics/abc-xyz")
async def get_analytics_abc_xyz(db: Session = Depends(get_db)):
    """Return ABC-XYZ classification matrix, Pareto distribution, and per-item metrics."""
    return compute_abc_xyz_classification(db)

@app.get("/api/analytics/forecast/{item_id}")
async def get_analytics_advanced_forecast(item_id: str, periods_ahead: int = 8, db: Session = Depends(get_db)):
    """Return weekly forecast with Exponential Smoothing, prediction intervals, and 8-week backtest WAPE."""
    item = None
    if item_id.isdigit():
        item = db.query(Inventory).filter(Inventory.id == int(item_id)).first()
    if not item:
        item = db.query(Inventory).filter(Inventory.sku == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found.")
    return calculate_advanced_forecast(item, db, periods_ahead=periods_ahead)

@app.post("/api/analytics/what-if")
async def run_analytics_what_if(req: WhatIfRequest, db: Session = Depends(get_db)):
    """Run interactive what-if simulation for lead-time delays and demand surges."""
    item = None
    if req.item_id:
        item = db.query(Inventory).filter(Inventory.id == req.item_id).first()
    elif req.sku:
        item = db.query(Inventory).filter(Inventory.sku == req.sku).first()
    if not item:
        first_item = db.query(Inventory).filter(Inventory.is_active == True).first()
        if first_item:
            item = first_item
        else:
            raise HTTPException(status_code=404, detail="No item found for simulation.")
    return compute_what_if_simulation(
        item=item,
        db=db,
        lead_time_delta_days=req.lead_time_delta_days,
        demand_increase_pct=req.demand_increase_pct
    )

@app.get("/api/analytics/kpis")
async def get_analytics_kpis(db: Session = Depends(get_db)):
    """Return enterprise business KPIs: turnover, DIO, working capital, 30d stockouts, fill rate."""
    return compute_business_kpis(db)

@app.get("/api/analytics/safety-stock/{item_id}")
async def get_analytics_safety_stock(item_id: str, service_level: Optional[str] = None, db: Session = Depends(get_db)):
    """Return statistical safety stock and reorder point with service level and formula breakdown."""
    item = None
    if item_id.isdigit():
        item = db.query(Inventory).filter(Inventory.id == int(item_id)).first()
    if not item:
        item = db.query(Inventory).filter(Inventory.sku == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found.")
    return compute_safety_stock_rop(item, db, service_level=service_level)

@app.get("/api/analytics/anomalies")
async def get_analytics_anomalies(threshold: float = 3.0, db: Session = Depends(get_db)):
    """Return statistical movement anomalies based on modified robust z-score (Median/MAD)."""
    return detect_robust_z_anomalies(db, threshold=threshold)

@app.post("/api/analytics/seed-demo-history")
async def seed_analytics_demo_history(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Seed 12-month synthetic history with seasonal patterns and injected labeled anomalies."""
    if current_user.get("role") not in ("admin", "manager"):
        raise HTTPException(status_code=403, detail="Admin or Manager privileges required to seed demo data.")
    return seed_twelve_month_analytics_history(db)

@app.get("/api/settings/service-level")
async def get_service_level_setting(db: Session = Depends(get_db)):
    """Get current inventory service level configuration."""
    sl = db.query(AppSetting).filter(AppSetting.key == "service_level").first()
    sm = db.query(AppSetting).filter(AppSetting.key == "safety_stock_method").first()
    return {
        "service_level": sl.value if sl else "95%",
        "safety_stock_method": sm.value if sm else "safety_days",
        "supported_levels": ["90%", "95%", "98%"],
        "z_scores": {"90%": 1.282, "95%": 1.645, "98%": 2.054}
    }

@app.post("/api/settings/service-level")
async def set_service_level_setting(
    req: ServiceLevelSettingRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Update service level configuration."""
    if current_user.get("role") not in ("admin", "manager"):
        raise HTTPException(status_code=403, detail="Admin or Manager privileges required to update settings.")
    
    now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    sl = db.query(AppSetting).filter(AppSetting.key == "service_level").first()
    if not sl:
        sl = AppSetting(key="service_level", value=req.service_level, updated_by=current_user.get("username", "admin"), updated_at=now_str)
        db.add(sl)
    else:
        sl.value = req.service_level
        sl.updated_by = current_user.get("username", "admin")
        sl.updated_at = now_str

    if req.safety_stock_method:
        sm = db.query(AppSetting).filter(AppSetting.key == "safety_stock_method").first()
        if not sm:
            sm = AppSetting(key="safety_stock_method", value=req.safety_stock_method, updated_by=current_user.get("username", "admin"), updated_at=now_str)
            db.add(sm)
        else:
            sm.value = req.safety_stock_method
            sm.updated_by = current_user.get("username", "admin")
            sm.updated_at = now_str

    db.commit()
    return {"status": "success", "service_level": req.service_level, "safety_stock_method": req.safety_stock_method or "service_level"}

@app.get("/api/charts/category-distribution")
async def get_category_distribution(db: Session = Depends(get_db)):
    """Distribution of inventory valuation by welding category."""
    items = db.query(Inventory).all()
    dist = defaultdict(float)
    count_dist = defaultdict(int)
    for item in items:
        val = item.quantity * item.unit_price
        dist[item.category] += val
        count_dist[item.category] += 1
    return {
        "valuation": {k: round(v, 2) for k, v in dist.items()},
        "counts": dict(count_dist)
    }

@app.get("/api/charts/stock-status")
async def get_stock_status(db: Session = Depends(get_db)):
    """Categorization of items into In-Stock, Low-Stock, and Out-of-Stock."""
    items = db.query(Inventory).all()
    in_stock = 0
    low_stock = 0
    out_of_stock = 0

    for item in items:
        if item.quantity == 0:
            out_of_stock += 1
        elif item.quantity <= item.reorder_level:
            low_stock += 1
        else:
            in_stock += 1

    return {
        "in_stock": in_stock,
        "low_stock": low_stock,
        "out_of_stock": out_of_stock
    }

@app.get("/api/charts/movement-trend")
async def get_movement_trend(db: Session = Depends(get_db)):
    """Recent stock movement velocity (Inward vs Outward)."""
    movements = db.query(StockMovement).order_by(StockMovement.id.desc()).limit(30).all()
    inwards = sum(m.quantity for m in movements if m.movement_type == "INWARD")
    outwards = sum(m.quantity for m in movements if m.movement_type == "OUTWARD")
    return {
        "total_inward": inwards,
        "total_outward": outwards,
        "recent_count": len(movements)
    }


# ─── Inventory Catalog API ───────────────────────────────────────────

@app.get("/api/inventory")
async def get_inventory(
    category: Optional[str] = None,
    search: Optional[str] = None,
    status: Optional[str] = None,
    sort: Optional[str] = None,
    page: Optional[int] = None,
    limit: int = 50,
    db: Session = Depends(get_db)
):
    """Return inventory items with search, category/status filter, sort, and pagination."""
    q = db.query(Inventory).filter(Inventory.is_active == True)
    if category and category != "all":
        q = q.filter(Inventory.category == category)
    if search:
        search_fmt = f"%{search.lower()}%"
        q = q.filter(
            (func.lower(Inventory.name).like(search_fmt)) |
            (func.lower(Inventory.sku).like(search_fmt)) |
            (func.lower(Inventory.location).like(search_fmt))
        )

    # Sorting
    sort_map = {
        "name": Inventory.name, "quantity": Inventory.quantity,
        "category": Inventory.category, "sku": Inventory.sku,
        "unit_cost": Inventory.unit_cost, "-quantity": Inventory.quantity.desc(),
        "-name": Inventory.name.desc(), "-unit_cost": Inventory.unit_cost.desc(),
    }
    order_col = sort_map.get(sort) if sort else None
    if order_col is not None:
        q = q.order_by(order_col)
    else:
        q = q.order_by(Inventory.category, Inventory.name)

    items = q.all()

    # Compute statuses using the shared engine
    status_map = compute_items_status_map(items, db)

    # Status filter (post-query because it depends on computed status)
    if status and status.upper() in ("OK", "LOW", "CRITICAL", "OUT", "DEAD"):
        target_status = status.upper()
        items = [i for i in items if status_map.get(i.id) == target_status]

    def _serialize(i):
        s = status_map.get(i.id, "OK")
        return {
            "id": i.id, "sku": i.sku, "name": i.name, "category": i.category,
            "unit": i.unit or "pcs", "compatible_with": i.compatible_with or "Standard",
            "location": i.location or "Central Store", "quantity": i.quantity,
            "reorder_level": i.reorder_level, "reorder_qty": i.reorder_qty or 50,
            "unit_cost": i.unit_cost or 0.0,
            "selling_price": i.selling_price or i.unit_price or 0.0,
            "unit_price": i.unit_price or 0.0, "supplier_id": i.supplier_id,
            "reserved_qty": getattr(i, "reserved_qty", 0) or 0,
            "available_quantity": max(0, (i.quantity or 0) - (getattr(i, "reserved_qty", 0) or 0)),
            "hsn_code": getattr(i, "hsn_code", "8466") or "8466",
            "gst_rate": getattr(i, "gst_rate", 18.0) or 18.0,
            "last_updated": i.last_updated, "is_active": i.is_active, "status": s,
        }

    if page is not None:
        total = len(items)
        start = (page - 1) * limit
        page_items = items[start : start + limit]
        return {"items": [_serialize(i) for i in page_items], "total": total, "page": page, "limit": limit}

    return [_serialize(i) for i in items]

@app.post("/api/inventory/item")
@app.post("/api/items")
async def create_inventory_item(
    item_data: CreateInventoryItemRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_roles(["admin", "manager"]))
):
    """Add a new welding spare part to the catalog."""
    if item_data.supplier_id:
        sup = db.query(Vendor).filter(Vendor.id == item_data.supplier_id).first()
        if not sup:
            raise HTTPException(status_code=400, detail=f"Supplier '{item_data.supplier_id}' does not exist.")

    existing = db.query(Inventory).filter(Inventory.sku == item_data.sku).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"SKU {item_data.sku} already exists.")

    cost = item_data.unit_cost or (item_data.unit_price * 0.7 if item_data.unit_price else 0.0)
    selling = item_data.selling_price or item_data.unit_price or 0.0

    item = Inventory(
        name=item_data.name,
        sku=item_data.sku,
        category=item_data.category,
        unit=item_data.unit or "pcs",
        compatible_with=item_data.compatible_with,
        location=item_data.location or "R1-B01",
        quantity=item_data.quantity,
        reorder_level=item_data.reorder_level,
        reorder_qty=item_data.reorder_qty or 50,
        unit_cost=cost,
        selling_price=selling,
        supplier_id=item_data.supplier_id,
        hsn_code=item_data.hsn_code or "8466",
        gst_rate=item_data.gst_rate if item_data.gst_rate is not None else 18.0,
        reserved_qty=0,
        last_updated=datetime.datetime.now().isoformat(),
        is_active=True
    )
    db.add(item)
    db.add(AuditLog(
        timestamp=datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        action="ITEM_CREATED",
        user=current_user["username"],
        target_id=item_data.sku,
        details=f"Added {item_data.name} to {item_data.category}."
    ))
    db.commit()

    # Requirement C: Event trigger after item create
    await trigger_replenishment_events([item.id], db, user=current_user["username"])

    await manager.broadcast({"type": "item_created", "data": {"sku": item_data.sku, "name": item_data.name}})
    stats = _compute_stats(db)
    await manager.broadcast({"type": "stats_update", "data": stats})

    return {"status": "success", "id": item.id, "sku": item_data.sku}

@app.post("/api/inventory/adjust")
@app.post("/api/stock/adjust")
async def adjust_stock(
    adj: StockAdjustmentRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_roles(["admin", "manager", "storekeeper"]))
):
    """Adjust physical stock quantity with audit logging and stock movement recording."""
    item = None
    if adj.item_id:
        item = db.query(Inventory).filter(Inventory.id == adj.item_id).first()
    if not item and adj.sku:
        item = db.query(Inventory).filter(Inventory.sku == adj.sku).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found.")

    # Idempotent replay for offline queue
    if adj.client_id:
        existing = db.query(StockMovement).filter(StockMovement.client_id == adj.client_id).first()
        if existing:
            return {
                "status": "idempotent_replay",
                "message": "Stock adjustment already processed.",
                "sku": item.sku,
                "previous_quantity": item.quantity,
                "current_quantity": item.quantity,
                "movement_id": existing.movement_id
            }

    if not adj.reason or not adj.reason.strip():
        raise HTTPException(status_code=400, detail="Reason is required for stock adjustments.")

    new_qty = item.quantity + adj.quantity_change
    if new_qty < 0:
        raise HTTPException(status_code=400, detail="Stock quantity cannot be negative.")

    prev_qty = item.quantity
    item.quantity = new_qty
    item.last_updated = datetime.datetime.now().isoformat()

    m_type = "ADJUST"
    now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")
    party_val = adj.destination or "Central Store"

    movement = StockMovement(
        item_id=item.id,
        type=m_type,
        quantity=abs(adj.quantity_change),
        reference=adj.reference or "Manual Adjustment",
        party=party_val,
        performed_by=current_user["username"],
        timestamp=now_str,
        balance_after=new_qty,
        client_id=adj.client_id
    )
    db.add(movement)

    db.add(AuditLog(
        timestamp=datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        action="STOCK_ADJUSTED",
        user=current_user["username"],
        target_id=item.sku,
        details=f"Stock for {item.sku} changed from {prev_qty} to {new_qty}. Reason: {adj.reason}"
    ))
    db.commit()

    # Requirement C: Event trigger after stock adjust
    await trigger_replenishment_events([item.id], db, user=current_user["username"])

    # WebSocket broadcast
    await manager.broadcast({
        "type": "new_stock_movement",
        "data": {
            "sku": item.sku, "item_name": item.name, "type": "ADJUSTMENT",
            "quantity": abs(adj.quantity_change), "destination": adj.destination,
            "remaining": new_qty, "timestamp": movement.timestamp
        }
    })
    stats = _compute_stats(db)
    await manager.broadcast({"type": "stats_update", "data": stats})

    return {"status": "success", "sku": item.sku, "previous_quantity": prev_qty, "current_quantity": new_qty}

@app.get("/api/inventory/reorders")
async def get_reorder_list(db: Session = Depends(get_db)):
    """Get all items that require replenishment using compute_item_status and real suggested qty."""
    items = db.query(Inventory).filter(Inventory.is_active == True).all()
    reorders = []
    for i in items:
        status = compute_item_status(i, db)
        if status in ("LOW", "CRITICAL", "OUT"):
            fc = calculate_forecast(i, db)
            suggested_qty = fc.get("suggested_qty") or i.reorder_qty or 50
            reorders.append({
                "id": i.id,
                "sku": i.sku,
                "name": i.name,
                "quantity": i.quantity,
                "reorder_level": i.reorder_level,
                "suggested_order_qty": suggested_qty,
                "reorder_qty": i.reorder_qty or 50,
                "status": status,
                "category": i.category
            })
    return reorders

@app.post("/api/inventory/reorder")
async def trigger_reorder(
    payload: dict,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_roles(["admin", "manager"]))
):
    """Trigger replenishment using check_and_trigger_auto_reorder with force=True and duplicate protection."""
    sku = payload.get("sku")
    if not sku:
        raise HTTPException(status_code=400, detail="SKU is required.")
    item = db.query(Inventory).filter(Inventory.sku == sku).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    triggered, po, alert = check_and_trigger_auto_reorder(
        item,
        db,
        user=current_user["username"],
        force=True
    )

    if not triggered or not po:
        if alert and "already_on_po" in alert:
            return {
                "status": "warning",
                "message": alert["message"],
                "po_number": alert["already_on_po"],
                "item": item.name
            }
        existing_open_po_item = db.query(POItem).join(Procurement).filter(
            POItem.item_id == item.id,
            Procurement.status.in_(["DRAFT", "APPROVED"])
        ).first()
        if existing_open_po_item:
            open_po = existing_open_po_item.purchase_order or db.query(Procurement).filter(Procurement.id == existing_open_po_item.po_id).first()
            po_num = open_po.po_number if open_po else f"ANI-PO-2026-{existing_open_po_item.po_id:04d}"
            return {
                "status": "warning",
                "message": f"Already on {po_num}",
                "po_number": po_num,
                "item": item.name
            }
        return {
            "status": "warning",
            "message": "Reorder could not be processed",
            "item": item.name
        }

    if alert:
        await manager.broadcast({"type": "reorder_alert", "data": alert})
        await manager.broadcast({"type": "low_stock", "data": alert})
    stats = _compute_stats(db)
    await manager.broadcast({"type": "stats_update", "data": stats})

    return {
        "status": "success",
        "po_id": po.id,
        "po_number": po.po_number,
        "item": item.name,
        "quantity": alert.get("reorder_qty", item.reorder_qty or 50) if alert else (item.reorder_qty or 50),
        "message": f"Draft Purchase Order {po.po_number} raised for {item.name}"
    }


# ─── Items CRUD (update / soft-delete) ───────────────────────────────

@app.put("/api/items/{item_id}")
async def update_item(
    item_id: int,
    data: ItemUpdateRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_roles(["admin", "manager"]))
):
    """Update an existing inventory item."""
    item = db.query(Inventory).filter(Inventory.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found.")
    if data.supplier_id is not None and data.supplier_id != "":
        sup = db.query(Vendor).filter(Vendor.id == data.supplier_id).first()
        if not sup:
            raise HTTPException(status_code=400, detail=f"Supplier '{data.supplier_id}' does not exist.")

    if data.sku and data.sku != item.sku:
        dup = db.query(Inventory).filter(Inventory.sku == data.sku, Inventory.id != item_id).first()
        if dup:
            raise HTTPException(status_code=400, detail=f"SKU {data.sku} already in use.")

    changes = []
    for field in ["sku", "name", "category", "unit", "compatible_with", "location", "hsn_code", "gst_rate",
                   "quantity", "reorder_level", "reorder_qty", "unit_cost", "selling_price", "supplier_id"]:
        val = getattr(data, field, None)
        if val is not None:
            old = getattr(item, field)
            setattr(item, field, val)
            changes.append(f"{field}: {old} -> {val}")
    item.last_updated = datetime.datetime.now().isoformat()

    db.add(AuditLog(
        timestamp=datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        action="ITEM_UPDATED", user=current_user["username"],
        target_id=item.sku, details=f"Updated {item.name}: {'; '.join(changes[:5])}"
    ))
    db.commit()

    # Requirement C: Event trigger after item edit
    await trigger_replenishment_events([item.id], db, user=current_user["username"])

    await manager.broadcast({"type": "item_updated", "data": {"id": item.id, "sku": item.sku}})
    stats = _compute_stats(db)
    await manager.broadcast({"type": "stats_update", "data": stats})
    return {"status": "success", "id": item.id, "sku": item.sku}


@app.delete("/api/items/{item_id}")
async def delete_item(
    item_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_roles(["admin"]))
):
    """Soft-delete an inventory item (admin only)."""
    item = db.query(Inventory).filter(Inventory.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found.")
    item.is_active = False
    item.last_updated = datetime.datetime.now().isoformat()
    db.add(AuditLog(
        timestamp=datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        action="ITEM_DELETED", user=current_user["username"],
        target_id=item.sku, details=f"Soft-deleted {item.name} ({item.sku})."
    ))
    db.commit()
    await manager.broadcast({"type": "item_deleted", "data": {"id": item.id, "sku": item.sku}})
    stats = _compute_stats(db)
    await manager.broadcast({"type": "stats_update", "data": stats})
    return {"status": "success", "id": item.id, "message": f"{item.sku} deactivated."}


# ─── Dedicated Stock In / Out Endpoints ──────────────────────────────

@app.post("/api/stock/in")
async def stock_in(
    req: StockInRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_roles(["admin", "manager", "storekeeper"]))
):
    """Receive stock into inventory."""
    item = None
    if req.item_id:
        item = db.query(Inventory).filter(Inventory.id == req.item_id).first()
    if not item and req.sku:
        item = db.query(Inventory).filter(Inventory.sku == req.sku).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found.")

    # Idempotent replay for offline queue
    if req.client_id:
        existing = db.query(StockMovement).filter(StockMovement.client_id == req.client_id).first()
        if existing:
            return {
                "status": "idempotent_replay",
                "message": "Stock receipt already processed.",
                "sku": item.sku,
                "quantity_added": req.quantity,
                "current_quantity": item.quantity,
                "movement_id": existing.movement_id
            }

    item.quantity += req.quantity
    item.last_updated = datetime.datetime.now().isoformat()
    now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")

    movement = StockMovement(
        item_id=item.id, type="IN", quantity=req.quantity,
        reference=req.reference or "Goods Receipt",
        party=req.supplier or "Authorized OEM",
        performed_by=current_user["username"], timestamp=now_str,
        balance_after=item.quantity,
        client_id=req.client_id
    )
    db.add(movement)
    db.add(AuditLog(
        timestamp=datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        action="STOCK_IN", user=current_user["username"],
        target_id=item.sku,
        details=f"Received {req.quantity} units of {item.name}. Balance: {item.quantity}."
    ))
    db.commit()

    # Requirement C: Event trigger after stock in
    await trigger_replenishment_events([item.id], db, user=current_user["username"])

    await manager.broadcast({"type": "new_stock_movement", "data": {
        "sku": item.sku, "item_name": item.name, "type": "INWARD",
        "quantity": req.quantity, "destination": "Central Store",
        "remaining": item.quantity, "timestamp": now_str
    }})
    stats = _compute_stats(db)
    await manager.broadcast({"type": "stats_update", "data": stats})

    return {"status": "success", "sku": item.sku, "quantity_added": req.quantity,
            "current_quantity": item.quantity, "movement_id": movement.movement_id}


@app.post("/api/stock/out")
async def stock_out(
    req: StockOutRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_roles(["admin", "manager", "storekeeper"]))
):
    """Dispatch stock from inventory. Rejects if insufficient stock."""
    item = None
    if req.item_id:
        item = db.query(Inventory).filter(Inventory.id == req.item_id).first()
    if not item and req.sku:
        item = db.query(Inventory).filter(Inventory.sku == req.sku).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found.")

    # Idempotent replay for offline queue
    if req.client_id:
        existing = db.query(StockMovement).filter(StockMovement.client_id == req.client_id).first()
        if existing:
            return {
                "status": "idempotent_replay",
                "message": "Stock dispatch already processed.",
                "sku": item.sku,
                "current_quantity": item.quantity,
                "movement_id": existing.movement_id
            }

    if item.quantity < req.quantity:
        raise HTTPException(status_code=400, detail=f"Insufficient stock. Available: {item.quantity}, requested: {req.quantity}")

    item.quantity -= req.quantity
    item.last_updated = datetime.datetime.now().isoformat()
    now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")

    movement = StockMovement(
        item_id=item.id, type="OUT", quantity=req.quantity,
        reference=req.invoice_no or "DISP-ISSUE",
        party=req.customer or "Welding Line",
        performed_by=current_user["username"], timestamp=now_str,
        balance_after=item.quantity,
        client_id=req.client_id
    )
    db.add(movement)
    db.add(AuditLog(
        timestamp=datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        action="STOCK_OUT", user=current_user["username"],
        target_id=item.sku,
        details=f"Dispatched {req.quantity} units of {item.name}. Balance: {item.quantity}."
    ))
    db.commit()

    # Requirement C: Event trigger after stock out
    await trigger_replenishment_events([item.id], db, user=current_user["username"])

    await manager.broadcast({"type": "new_stock_movement", "data": {
        "sku": item.sku, "item_name": item.name, "type": "OUTWARD",
        "quantity": req.quantity, "destination": req.customer or "Welding Line",
        "remaining": item.quantity, "timestamp": now_str
    }})
    stats = _compute_stats(db)
    await manager.broadcast({"type": "stats_update", "data": stats})

    return {"status": "success", "sku": item.sku, "quantity_dispatched": req.quantity,
            "current_quantity": item.quantity, "movement_id": movement.movement_id}


# ─── Stock Movements Ledger API ───────────────────────────────────────

@app.get("/api/stock-movements")
async def get_stock_movements(
    item_id: Optional[int] = None,
    sku: Optional[str] = None,
    type: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    page: Optional[int] = None,
    limit: Optional[int] = None,
    db: Session = Depends(get_db)
):
    """Return historical stock movement ledger entries with optional filters and pagination."""
    q = db.query(StockMovement).join(Inventory)
    if item_id:
        q = q.filter(StockMovement.item_id == item_id)
    if sku:
        q = q.filter(Inventory.sku == sku)
    if type:
        t_upper = type.upper()
        if t_upper in ("IN", "INWARD", "RECEIPT"):
            q = q.filter(StockMovement.type == "IN")
        elif t_upper in ("OUT", "OUTWARD", "DISPATCH"):
            q = q.filter(StockMovement.type == "OUT")
        else:
            q = q.filter(StockMovement.type == t_upper)
    if start_date:
        q = q.filter(StockMovement.timestamp >= start_date)
    if end_date:
        q = q.filter(StockMovement.timestamp <= end_date + " 23:59:59")

    q = q.order_by(StockMovement.id.desc())

    def _mov_dict(m):
        return {
            "id": m.id,
            "movement_id": m.movement_id,
            "item_id": m.item_id,
            "sku": m.sku,
            "item_name": m.item_name,
            "type": m.type,
            "movement_type": m.movement_type,
            "quantity": m.quantity,
            "reference": m.reference,
            "party": m.party,
            "destination_or_source": m.destination_or_source,
            "performed_by": m.performed_by,
            "operator": m.operator,
            "timestamp": m.timestamp,
            "balance_after": m.balance_after,
            "notes": m.notes
        }

    if page is not None:
        page_num = max(1, page)
        page_size = max(1, limit or 50)
        total = q.count()
        movements = q.offset((page_num - 1) * page_size).limit(page_size).all()
        return {
            "movements": [_mov_dict(m) for m in movements],
            "total": total,
            "page": page_num,
            "limit": page_size,
            "pages": (total + page_size - 1) // page_size if page_size else 1
        }

    movements = q.limit(limit or 100).all()
    return [_mov_dict(m) for m in movements]

@app.post("/api/stock-movements")
async def record_stock_movement(
    data: StockMovementCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_roles(["admin", "manager", "storekeeper"]))
):
    """Record a new stock inward, dispatch, or return."""
    item = db.query(Inventory).filter(Inventory.sku == data.sku).first()
    if not item:
        raise HTTPException(status_code=404, detail="SKU not found in inventory catalog.")

    # Idempotent replay for offline queue
    if data.client_id:
        existing = db.query(StockMovement).filter(StockMovement.client_id == data.client_id).first()
        if existing:
            return {
                "status": "idempotent_replay",
                "message": "Stock movement already processed.",
                "sku": item.sku,
                "current_quantity": item.quantity,
                "movement_id": existing.movement_id
            }

    raw_type = (data.type or data.movement_type or "OUTWARD").upper()
    if raw_type in ["OUT", "OUTWARD", "DISPATCH"]:
        m_type = "OUT"
        if item.quantity < data.quantity:
            raise HTTPException(status_code=400, detail=f"Insufficient stock on hand ({item.quantity} available). Stock cannot be negative.")
        item.quantity -= data.quantity
    elif raw_type in ["IN", "INWARD", "RECEIPT", "RETURN"]:
        m_type = "IN"
        item.quantity += data.quantity
    else:
        m_type = "ADJUST"

    item.last_updated = datetime.datetime.now().isoformat()
    now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")
    party_val = data.party or data.destination_or_source or "Central Store"
    operator_val = current_user.get("username") or data.performed_by or data.operator or "storekeeper"

    movement = StockMovement(
        item_id=item.id,
        type=m_type,
        quantity=data.quantity,
        reference=data.reference or f"REF-{random.randint(100, 999)}",
        party=party_val,
        performed_by=operator_val,
        timestamp=now_str,
        balance_after=item.quantity,
        client_id=data.client_id
    )
    db.add(movement)
    db.add(AuditLog(
        timestamp=datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        action=f"STOCK_{movement.movement_type}",
        user=operator_val,
        target_id=item.sku,
        details=f"{movement.movement_type} of {data.quantity} units for {item.name}. Ref: {data.reference}"
    ))
    db.commit()

    if m_type == "OUT":
        triggered, po, alert = check_and_trigger_auto_reorder(item, db, user=operator_val)
        if triggered and alert:
            await manager.broadcast({"type": "low_stock", "data": alert})
            await manager.broadcast({"type": "reorder_alert", "data": alert})

    # WebSocket broadcast
    await manager.broadcast({
        "type": "new_stock_movement",
        "data": {
            "movement_id": movement.movement_id,
            "sku": item.sku,
            "item_name": item.name,
            "type": movement.movement_type,
            "quantity": data.quantity,
            "destination": party_val,
            "remaining": item.quantity,
            "timestamp": movement.timestamp
        }
    })
    stats = _compute_stats(db)
    await manager.broadcast({"type": "stats_update", "data": stats})

    return {"status": "success", "movement_id": movement.movement_id, "remaining_quantity": item.quantity}


# ─── Purchase Orders & Procurement API ───────────────────────────────

def _po_to_dict(p: Procurement) -> dict:
    overdue = False
    days_late = 0
    if p.status in ("APPROVED", "PARTIALLY_RECEIVED") and p.expected_date:
        try:
            exp_d = datetime.date.fromisoformat(str(p.expected_date)[:10])
            today_d = datetime.date.today()
            if exp_d < today_d:
                overdue = True
                days_late = (today_d - exp_d).days
        except Exception:
            pass

    return {
        "id": p.id,
        "po_number": p.po_number,
        "supplier_id": p.supplier_id,
        "vendor_id": p.vendor_id,
        "vendor_name": p.vendor_name,
        "item": p.item,
        "amount": p.amount,
        "total_value": p.total_value,
        "quantity": p.quantity,
        "date": p.date,
        "created_at": p.created_at,
        "expected_date": p.expected_date,
        "status": p.status,
        "auto_generated": p.auto_generated,
        "auto_approved": bool(getattr(p, "auto_approved", False)),
        "overdue": overdue,
        "days_late": days_late,
        "department": p.department,
        "source": p.source,
        "items": [
            {
                "id": it.id,
                "item_id": it.item_id,
                "sku": it.item.sku if it.item else "",
                "name": it.item.name if it.item else "",
                "category": it.item.category if it.item else "",
                "qty": it.qty,
                "received_qty": getattr(it, "received_qty", 0) or 0,
                "outstanding_qty": max(0, it.qty - (getattr(it, "received_qty", 0) or 0)),
                "unit_cost": it.unit_cost,
                "total": round(it.qty * it.unit_cost, 2),
                "reason": getattr(it, "reason", "") or ""
            }
            for it in p.items
        ] if p.items else []
    }

@app.get("/api/procurement")
async def get_procurement(db: Session = Depends(get_db)):
    """Return all Purchase Orders."""
    orders = db.query(Procurement).order_by(Procurement.id.desc()).all()
    return [_po_to_dict(p) for p in orders]


@app.get("/api/procurement/sample-documents")
async def get_sample_documents(
    current_user: dict = Depends(require_roles(["admin", "manager", "storekeeper"]))
):
    """List available demo delivery documents with descriptions."""
    return [
        {
            "key": "sample_challan_clean",
            "title": "Clean Delivery Challan",
            "supplier": "Abicor Binzel",
            "po_ref": "ANI-PO-2026-0008",
            "description": "Clean shipment with exact matching items, quantities, and pricing.",
            "flags": []
        },
        {
            "key": "sample_challan_short",
            "title": "Short Delivery Challan",
            "supplier": "Ador Welding",
            "po_ref": "ANI-PO-2026-0007",
            "description": "Partial delivery shipment where 300 of 450 units are dispatched.",
            "flags": ["quantity_mismatch"]
        },
        {
            "key": "sample_invoice_price_hike",
            "title": "Tax Invoice with Price Increase",
            "supplier": "Abicor Binzel",
            "po_ref": "ANI-PO-2026-0008",
            "description": "Invoice with +16.2% price variance and an unapproved extra line item.",
            "flags": ["price_variance", "not_on_po"]
        }
    ]

@app.get("/api/procurement/{po_id}")
async def get_purchase_order(po_id: str, db: Session = Depends(get_db)):
    """Return a single Purchase Order with full details and line items."""
    po = None
    if po_id.isdigit():
        po = db.query(Procurement).filter(Procurement.id == int(po_id)).first()
    if not po:
        po = db.query(Procurement).filter(Procurement.po_number == po_id).first()
    if not po and po_id.startswith("PO-2026-"):
        po = db.query(Procurement).filter(
            Procurement.po_number == po_id.replace("PO-2026-", "ANI-PO-2026-0")
        ).first()
    if not po:
        raise HTTPException(status_code=404, detail="Purchase Order not found.")
    return _po_to_dict(po)

@app.post("/api/procurement")
async def create_purchase_order(
    po_data: CreatePORequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_roles(["admin", "manager"]))
):
    """Create a new formal purchase order (admin or manager only)."""
    supplier_id = po_data.supplier_id or po_data.vendor_id or "V001"
    vendor = db.query(Vendor).filter(Vendor.id == supplier_id).first()
    vendor_name = vendor.name if vendor else "Approved Supplier"

    po_count = db.query(Procurement).count()
    po_num = po_data.po_number or f"ANI-PO-2026-{po_count + 1:04d}"

    expected_d = (datetime.date.today() + datetime.timedelta(days=vendor.lead_time_days if vendor else 3)).isoformat()

    po = Procurement(
        po_number=po_num,
        supplier_id=supplier_id,
        status="DRAFT",
        created_at=datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        expected_date=expected_d,
        total_value=0.0,
        auto_generated=False,
        department=po_data.department or "Central Store"
    )
    db.add(po)
    db.flush()

    line_items_total = 0.0
    if po_data.items:
        for it in po_data.items:
            inv_it = None
            if isinstance(it, dict):
                if it.get("item_id"):
                    inv_it = db.query(Inventory).filter(Inventory.id == it["item_id"]).first()
                elif it.get("sku"):
                    inv_it = db.query(Inventory).filter(Inventory.sku == it["sku"]).first()
                qty = it.get("qty", 1)
                cost = it.get("unit_cost") if it.get("unit_cost") is not None else (inv_it.unit_cost if inv_it else 0.0)
            else:
                qty = getattr(it, "qty", 1)
                cost = getattr(it, "unit_cost", None) or 0.0
                if getattr(it, "item_id", None):
                    inv_it = db.query(Inventory).filter(Inventory.id == it.item_id).first()
                elif getattr(it, "sku", None):
                    inv_it = db.query(Inventory).filter(Inventory.sku == it.sku).first()
                if inv_it and cost == 0.0:
                    cost = inv_it.unit_cost

            if inv_it:
                db.add(POItem(
                    po_id=po.id,
                    item_id=inv_it.id,
                    qty=qty,
                    unit_cost=cost
                ))
                line_items_total += (qty * cost)
    else:
        inv_it = db.query(Inventory).filter(Inventory.name == po_data.item).first() or db.query(Inventory).first()
        qty = po_data.quantity or 1
        cost = inv_it.unit_cost if inv_it else 100.0
        if inv_it:
            db.add(POItem(
                po_id=po.id,
                item_id=inv_it.id,
                qty=qty,
                unit_cost=cost
            ))
            line_items_total = qty * cost

    po.total_value = round(line_items_total if line_items_total > 0 else (po_data.amount or 0.0), 2)

    db.add(AuditLog(
        timestamp=datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        action="PO_CREATED",
        user=current_user["username"],
        target_id=po_num,
        details=f"Raised Purchase Order {po_num} with {vendor_name} (Rs. {po.total_value:,.2f})."
    ))
    db.commit()

    await manager.broadcast({"type": "po_created", "data": _po_to_dict(po)})
    stats = _compute_stats(db)
    await manager.broadcast({"type": "stats_update", "data": stats})

    return {"status": "success", "id": po.id, "po_id": po.po_number, "po_number": po.po_number, "vendor_name": vendor_name, "total_value": po.total_value}

@app.post("/api/procurement/{po_id}/approve")
async def approve_purchase_order(
    po_id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_roles(["admin", "manager"]))
):
    """Approve a Purchase Order (admin/manager only, storekeeper blocked)."""
    po = None
    if po_id.isdigit():
        po = db.query(Procurement).filter(Procurement.id == int(po_id)).first()
    if not po:
        po = db.query(Procurement).filter(Procurement.po_number == po_id).first()
    if not po:
        raise HTTPException(status_code=404, detail="Purchase Order not found.")

    if po.status in ("RECEIVED", "CANCELLED"):
        raise HTTPException(status_code=400, detail=f"Cannot approve PO with status {po.status}.")

    po.status = "APPROVED"

    db.add(AuditLog(
        timestamp=datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        action="PO_APPROVED",
        user=current_user["username"],
        target_id=po.po_number,
        details=f"Approved Purchase Order {po.po_number}."
    ))
    db.commit()
    queue_po_approval_email(po, db)

    await manager.broadcast({"type": "po_status_change", "data": {"id": po.id, "po_number": po.po_number, "status": "APPROVED"}})
    stats = _compute_stats(db)
    await manager.broadcast({"type": "stats_update", "data": stats})

    return {"status": "success", "po_number": po.po_number, "status": "APPROVED", "new_status": "APPROVED"}

@app.post("/api/procurement/{po_id}/receive")
async def receive_purchase_order(
    po_id: str,
    req: Optional[POReceiveRequest] = None,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_roles(["admin", "manager", "storekeeper"]))
):
    """Receive a Purchase Order, adding stock to inventory, supporting partial receipts."""
    po = None
    if po_id.isdigit():
        po = db.query(Procurement).filter(Procurement.id == int(po_id)).first()
    if not po:
        po = db.query(Procurement).filter(Procurement.po_number == po_id).first()
    if not po:
        raise HTTPException(status_code=404, detail="Purchase Order not found.")

    if po.status == "RECEIVED":
        raise HTTPException(status_code=400, detail="Purchase Order has already been fully received.")
    if po.status == "CANCELLED":
        raise HTTPException(status_code=400, detail="Cannot receive a cancelled Purchase Order.")

    now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")
    now_iso = datetime.datetime.now().isoformat()
    supplier_name = po.supplier.name if po.supplier else "Supplier"

    custom_received = {}
    if req and req.items:
        for item_rcv in req.items:
            custom_received[item_rcv.item_id] = item_rcv.qty_received

    for line in po.items:
        curr_rcv = getattr(line, "received_qty", 0) or 0
        outstanding = max(0, line.qty - curr_rcv)
        if req and req.items:
            rcv_qty = custom_received.get(line.item_id, 0)
        else:
            rcv_qty = outstanding

        if rcv_qty <= 0:
            continue

        actual_rcv = min(rcv_qty, outstanding) if outstanding > 0 else rcv_qty
        line.received_qty = curr_rcv + actual_rcv

        inv_item = line.item
        if inv_item:
            inv_item.quantity += actual_rcv
            inv_item.last_updated = now_iso

            movement = StockMovement(
                item_id=inv_item.id,
                type="IN",
                quantity=actual_rcv,
                reference=po.po_number,
                party=supplier_name,
                performed_by=current_user["username"],
                timestamp=now_str,
                balance_after=inv_item.quantity
            )
            db.add(movement)

            db.add(AuditLog(
                timestamp=datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                action="STOCK_IN",
                user=current_user["username"],
                target_id=inv_item.sku,
                details=f"Received {actual_rcv} units from PO {po.po_number}. New balance: {inv_item.quantity}."
            ))

    all_fully_received = all((getattr(l, "received_qty", 0) or 0) >= l.qty for l in po.items) if po.items else True
    po.status = "RECEIVED" if all_fully_received else "PARTIALLY_RECEIVED"

    db.add(AuditLog(
        timestamp=datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        action="PO_RECEIVED" if all_fully_received else "PO_PARTIALLY_RECEIVED",
        user=current_user["username"],
        target_id=po.po_number,
        details=f"{'Fully received' if all_fully_received else 'Partially received'} items for Purchase Order {po.po_number} into Central Store."
    ))
    db.commit()

    # Requirement C: Event trigger after PO receive
    await trigger_replenishment_events([l.item_id for l in po.items], db, user=current_user["username"])

    await manager.broadcast({"type": "po_status_change", "data": {"id": po.id, "po_number": po.po_number, "status": po.status}})
    stats = _compute_stats(db)
    await manager.broadcast({"type": "stats_update", "data": stats})

    return {"status": "success", "po_number": po.po_number, "status": po.status, "new_status": po.status}

@app.post("/api/procurement/{po_id}/cancel")
async def cancel_purchase_order(
    po_id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_roles(["admin", "manager"]))
):
    """Cancel a Purchase Order."""
    po = None
    if po_id.isdigit():
        po = db.query(Procurement).filter(Procurement.id == int(po_id)).first()
    if not po:
        po = db.query(Procurement).filter(Procurement.po_number == po_id).first()
    if not po:
        raise HTTPException(status_code=404, detail="Purchase Order not found.")

    if po.status == "RECEIVED":
        raise HTTPException(status_code=400, detail="Cannot cancel an already received Purchase Order.")

    po.status = "CANCELLED"
    po_item_ids = [line.item_id for line in po.items]

    db.add(AuditLog(
        timestamp=datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        action="PO_CANCELLED",
        user=current_user["username"],
        target_id=po.po_number,
        details=f"Cancelled Purchase Order {po.po_number}."
    ))
    db.commit()

    # Requirement C: Event trigger after PO cancel (items on cancelled PO)
    await trigger_replenishment_events(po_item_ids, db, user=current_user["username"])

    await manager.broadcast({"type": "po_status_change", "data": {"id": po.id, "po_number": po.po_number, "status": "CANCELLED"}})
    stats = _compute_stats(db)
    await manager.broadcast({"type": "stats_update", "data": stats})

    return {"status": "success", "po_number": po.po_number, "status": "CANCELLED", "new_status": "CANCELLED"}


# ─── Delivery Document Scanning & AI Verification ─────────────────────

@app.post("/api/procurement/scan-document")
async def scan_delivery_document(
    file: Optional[UploadFile] = File(None),
    sample_key: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_roles(["admin", "manager", "storekeeper"]))
):
    """Upload delivery challan / invoice, perform vision OCR, and match with open POs."""
    if sample_key and sample_key in CANNED_SAMPLES:
        sample_data = CANNED_SAMPLES[sample_key]
        filename = f"{sample_key}.pdf"
        sample_path = os.path.join(SAMPLES_DIR, filename)
        if os.path.exists(sample_path):
            with open(sample_path, "rb") as sf:
                file_bytes = sf.read()
        else:
            file_bytes = b"SAMPLE_DOCUMENT"
        file_path, content_hash, safe_fn = save_uploaded_document(file_bytes, filename, "application/pdf")
        extraction = DeliveryDocExtraction(**sample_data)
    elif file:
        file_bytes = await file.read()
        if not file_bytes:
            raise HTTPException(status_code=400, detail="Uploaded file is empty.")
        try:
            file_path, content_hash, safe_fn = save_uploaded_document(
                file_bytes, file.filename or "document.pdf", file.content_type or "application/pdf"
            )
        except ValueError as ve:
            raise HTTPException(status_code=400, detail=str(ve))
        extraction = extract_document_data(file_bytes, file.filename or "", file.content_type or "")
    else:
        raise HTTPException(status_code=400, detail="Please provide a delivery document file or select a sample document.")

    # Cross-reference match with open POs
    matched_result = match_extraction_with_po(extraction, db)

    # Persist DocExtraction record in PENDING_REVIEW state
    now_iso = datetime.datetime.now().isoformat()
    doc_rec = DocExtraction(
        created_at=now_iso,
        uploaded_by=current_user["username"],
        file_path=file_path,
        content_hash=content_hash,
        document_number=extraction.document_number,
        document_date=extraction.document_date,
        supplier_name=extraction.supplier_name,
        po_reference=extraction.po_reference,
        matched_po_id=matched_result["po"]["id"],
        raw_extraction=extraction.model_dump_json(),
        matched_lines=json.dumps(matched_result["lines"]),
        status="PENDING_REVIEW",
        fields_corrected=0
    )
    db.add(doc_rec)
    db.commit()
    db.refresh(doc_rec)

    matched_result["extraction_id"] = doc_rec.id
    matched_result["file_name"] = os.path.basename(file_path)
    matched_result["file_url"] = f"/api/uploads/{os.path.basename(file_path)}"

    return matched_result


@app.post("/api/procurement/scan-document/{extraction_id}/confirm")
async def confirm_scanned_delivery(
    extraction_id: int,
    req: ScanDocConfirmRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_roles(["admin", "manager", "storekeeper"]))
):
    """Confirm reviewed document, execute receipt on PO, attach doc, and record audit trail."""
    try:
        res = confirm_and_receive_delivery(
            extraction_id=extraction_id,
            reviewed_lines=req.reviewed_lines,
            fields_corrected=req.fields_corrected,
            db=db,
            user=current_user["username"]
        )
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))

    # Event triggers and real-time broadcasts
    stats = _compute_stats(db)
    await manager.broadcast({"type": "stats_update", "data": stats})
    await manager.broadcast({"type": "inventory_updated"})
    await manager.broadcast({"type": "po_status_change", "data": {"status": res.get("po_status")}})

    return res


@app.get("/api/uploads/{filename}")
async def get_uploaded_document(
    filename: str,
    current_user: dict = Depends(get_current_user)
):
    """Serve uploaded delivery documents securely. Requires authenticated user."""
    safe_name = os.path.basename(filename)
    target_path = os.path.join(UPLOAD_DIR, safe_name)
    if not os.path.exists(target_path):
        raise HTTPException(status_code=404, detail="Requested document not found.")
    return FileResponse(target_path)


@app.get("/api/procurement/scan-document/accuracy")
async def get_doc_scan_accuracy(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_roles(["admin", "manager", "storekeeper"]))
):
    """Return document scanning verification accuracy metrics and correction analytics."""
    return get_scan_accuracy_report(db)


@app.get("/api/pdf/dispatch/{movement_id}")
async def download_dispatch_note_pdf(movement_id: str, db: Session = Depends(get_db)):
    """Generate official Goods Dispatch Note / Issue Challan PDF."""
    movement = None
    if movement_id.isdigit():
        movement = db.query(StockMovement).filter(StockMovement.id == int(movement_id)).first()
    if not movement and movement_id.startswith("MOV-"):
        try:
            m_id = int(movement_id.replace("MOV-", ""))
            movement = db.query(StockMovement).filter(StockMovement.id == m_id).first()
        except ValueError:
            pass
    if not movement:
        movement = db.query(StockMovement).filter(StockMovement.reference == movement_id).first()
    if not movement:
        raise HTTPException(status_code=404, detail="Stock movement record not found.")

    dispatch_data = {
        "movement_id": movement.movement_id,
        "timestamp": movement.timestamp,
        "party": movement.party or "Assembly Shop Floor",
        "reference": movement.reference or "Store Issue",
        "performed_by": movement.performed_by or "storekeeper",
        "items": [
            {
                "sku": movement.sku,
                "name": movement.item_name,
                "category": movement.item.category if movement.item else "Welding Spares",
                "quantity": movement.quantity,
                "unit": movement.item.unit if movement.item else "pcs"
            }
        ]
    }
    pdf_bytes = generate_dispatch_note_pdf(dispatch_data)
    filename = f"Anishka_Dispatch_{movement.movement_id}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )

@app.get("/api/pdf/dashboard-report")
@app.get("/api/v2/generate-report")
async def download_valuation_report_pdf(db: Session = Depends(get_db)):
    """Generate executive inventory valuation report PDF."""
    stats = _compute_stats(db)
    low_stock = db.query(Inventory).filter(Inventory.quantity <= Inventory.reorder_level).all()
    low_stock_list = [{"sku": i.sku, "name": i.name, "category": i.category, "quantity": i.quantity, "reorder_level": i.reorder_level} for i in low_stock]

    items = db.query(Inventory).all()
    cat_breakdown = defaultdict(float)
    for i in items:
        cat_breakdown[i.category] += (i.quantity * i.unit_price)

    pdf_bytes = generate_dashboard_report_pdf(stats, low_stock_list, dict(cat_breakdown))
    filename = f"Anishka_Inventory_Valuation_{datetime.date.today().isoformat()}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )

@app.get("/api/pdf/bulk-procurement")
@app.get("/api/procurement/download/all")
async def download_bulk_po_pdf(db: Session = Depends(get_db)):
    """Generate and stream a multi-page PDF containing all purchase orders."""
    pos = db.query(Procurement).all()
    po_list = [
        {"id": p.id, "date": p.date, "vendor_name": p.vendor_name, "item": p.item, "amount": p.amount, "quantity": p.quantity, "status": p.status}
        for p in pos
    ]
    pdf_bytes = generate_bulk_pdf(po_list)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="Anishka_All_Purchase_Orders.pdf"'}
    )

@app.get("/api/procurement/{po_id}/pdf")
@app.get("/api/pdf/{po_id}")
async def download_po_pdf(po_id: str, db: Session = Depends(get_db)):
    """Generate and stream a professional Purchase Order PDF."""
    po = db.query(Procurement).filter(
        (Procurement.po_number == po_id) | (Procurement.id == po_id)
    ).first()
    if not po and po_id.startswith("PO-2026-"):
        po = db.query(Procurement).filter(
            Procurement.po_number == po_id.replace("PO-2026-", "ANI-PO-2026-0")
        ).first()
    if not po:
        raise HTTPException(status_code=404, detail="Purchase Order not found")

    po_data = {
        "id": po.po_number or str(po.id),
        "date": po.date,
        "vendor_name": po.vendor_name,
        "vendor_id": po.vendor_id,
        "item": po.item,
        "quantity": po.quantity,
        "amount": po.amount,
        "department": po.department
    }
    pdf_bytes = generate_document_pdf(po_data, document_type="po")
    filename = f"Anishka_PO_{po.po_number or po.id}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )


# ─── Suppliers / Vendors API ──────────────────────────────────────────

def _supplier_to_dict(s: Vendor, db: Session) -> dict:
    open_pos = db.query(Procurement).filter(
        Procurement.supplier_id == s.id,
        Procurement.status.in_(["DRAFT", "APPROVED"])
    ).all()
    open_count = len(open_pos)
    open_val = round(sum(p.total_value or 0.0 for p in open_pos), 2)

    return {
        "id": s.id,
        "name": s.name,
        "contact_person": s.contact_person or "Sales Manager",
        "phone": s.phone or s.contact_phone,
        "city": s.city or "Delhi-NCR",
        "lead_time_days": s.lead_time_days or 3,
        "rating": s.rating or 4.5,
        "category": s.category,
        "risk_level": s.risk_level,
        "approved": s.approved,
        "avg_order": s.avg_order,
        "trust_score": s.trust_score,
        "contact_email": s.contact_email,
        "contact_phone": s.contact_phone,
        "open_po_count": open_count,
        "open_po_value": open_val
    }

@app.get("/api/vendors")
@app.get("/api/suppliers")
async def get_suppliers(db: Session = Depends(get_db)):
    """Return all approved welding suppliers and OEMs with open PO counts and values."""
    suppliers = db.query(Vendor).all()
    return [_supplier_to_dict(s, db) for s in suppliers]

@app.post("/api/vendors")
@app.post("/api/suppliers")
async def create_supplier(
    payload: dict,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_roles(["admin", "manager"]))
):
    """Register a new supplier or distributor (admin or manager only)."""
    s_id = payload.get("id") or f"V{db.query(Vendor).count() + 1:03d}"
    supplier = Vendor(
        id=s_id,
        name=payload["name"],
        contact_person=payload.get("contact_person", "Sales Manager"),
        phone=payload.get("phone", "+91 124 400 0000"),
        city=payload.get("city", "Delhi-NCR"),
        lead_time_days=int(payload.get("lead_time_days", 3)),
        rating=float(payload.get("rating", 4.5)),
        category=payload.get("category", "Welding Supplies"),
        approved=payload.get("approved", True),
        avg_order=float(payload.get("avg_order", 0)),
        contact_email=payload.get("contact_email", "sales@supplier.com")
    )
    db.add(supplier)
    db.add(AuditLog(
        timestamp=datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        action="SUPPLIER_ADDED",
        user=current_user["username"],
        target_id=s_id,
        details=f"Registered supplier {payload['name']} ({supplier.city})."
    ))
    db.commit()
    return {"status": "success", "id": s_id, "name": payload["name"]}

@app.put("/api/vendors/{vendor_id}")
@app.put("/api/suppliers/{vendor_id}")
async def update_supplier(
    vendor_id: str,
    payload: dict,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_roles(["admin", "manager"]))
):
    """Update supplier details (admin or manager only)."""
    supplier = db.query(Vendor).filter(Vendor.id == vendor_id).first()
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found.")

    if "name" in payload:
        supplier.name = payload["name"]
    if "contact_person" in payload:
        supplier.contact_person = payload["contact_person"]
    if "phone" in payload:
        supplier.phone = payload["phone"]
    if "city" in payload:
        supplier.city = payload["city"]
    if "lead_time_days" in payload:
        supplier.lead_time_days = int(payload["lead_time_days"])
    if "rating" in payload:
        supplier.rating = float(payload["rating"])
    if "category" in payload:
        supplier.category = payload["category"]
    if "contact_email" in payload:
        supplier.contact_email = payload["contact_email"]

    db.add(AuditLog(
        timestamp=datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        action="SUPPLIER_UPDATED",
        user=current_user["username"],
        target_id=supplier.id,
        details=f"Updated supplier record for {supplier.name}."
    ))
    db.commit()
    return {"status": "success", "supplier": _supplier_to_dict(supplier, db)}


# ─── Low-Stock Replenishment Reports & Export Engine ──────────────────

@app.get("/api/export/low-stock/pdf")
async def export_low_stock_pdf(db: Session = Depends(get_db)):
    """Generate low-stock replenishment alert report PDF."""
    items = db.query(Inventory).filter(Inventory.is_active == True).all()
    status_map = compute_items_status_map(items, db)
    low_stock_items = [
        {
            "sku": i.sku,
            "name": i.name,
            "category": i.category,
            "quantity": i.quantity,
            "reorder_level": i.reorder_level,
            "reorder_qty": i.reorder_qty,
            "status": status_map.get(i.id, "LOW")
        }
        for i in items
        if status_map.get(i.id) in ("LOW", "CRITICAL", "OUT")
    ]
    stats = _compute_stats(db)
    pdf_bytes = generate_low_stock_report_pdf(stats, low_stock_items)
    filename = f"Anishka_Low_Stock_{datetime.date.today().isoformat()}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )

@app.get("/api/export/low-stock/excel")
async def export_low_stock_excel(db: Session = Depends(get_db)):
    """Generate low-stock replenishment report Excel."""
    items = db.query(Inventory).filter(Inventory.is_active == True).all()
    status_map = compute_items_status_map(items, db)
    low_items = [i for i in items if status_map.get(i.id) in ("LOW", "CRITICAL", "OUT")]

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Low Stock Spares"

    header_fill = PatternFill(start_color="00234B", end_color="00234B", fill_type="solid")
    header_font = Font(name="Calibri", size=11, bold=True, color="FFFFFF")

    headers = ["SKU", "Part Name", "Category", "On Hand Qty", "Reorder Level", "Suggested Order Qty", "Status", "Supplier"]
    ws.append(headers)
    for cell in ws[1]:
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal="center", vertical="center")

    for row_idx, i in enumerate(low_items, start=2):
        s = status_map.get(i.id, "LOW")
        supp_name = i.supplier.name if i.supplier else "Authorized OEM"
        ws.append([i.sku, i.name, i.category, i.quantity, i.reorder_level, i.reorder_qty or 50, s, supp_name])

    output = io.BytesIO()
    wb.save(output)
    output.seek(0)
    filename = f"Anishka_Low_Stock_{datetime.date.today().isoformat()}.xlsx"
    return Response(
        content=output.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )

@app.get("/api/export/low-stock/csv")
async def export_low_stock_csv(db: Session = Depends(get_db)):
    """Generate low-stock replenishment report CSV."""
    items = db.query(Inventory).filter(Inventory.is_active == True).all()
    status_map = compute_items_status_map(items, db)
    low_items = [i for i in items if status_map.get(i.id) in ("LOW", "CRITICAL", "OUT")]

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["SKU", "Part Name", "Category", "On Hand Qty", "Reorder Level", "Suggested Order Qty", "Status", "Supplier"])
    for i in low_items:
        s = status_map.get(i.id, "LOW")
        supp_name = i.supplier.name if i.supplier else "Authorized OEM"
        writer.writerow([i.sku, i.name, i.category, i.quantity, i.reorder_level, i.reorder_qty or 50, s, supp_name])

    output.seek(0)
    filename = f"Anishka_Low_Stock_{datetime.date.today().isoformat()}.csv"
    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )


# ─── Bulk CSV Import & Template ──────────────────────────────────────

@app.get("/api/import/sample")
async def get_import_sample_template():
    """Download sample CSV template for bulk welding spares catalog import."""
    sample_csv = (
        "sku,name,category,unit,compatible_with,location,quantity,reorder_level,reorder_qty,unit_cost,selling_price,supplier_id\r\n"
        "CT-M8-12,M8 Contact Tip 1.2mm CuCrZr,MIG Welding,pcs,Binzel MB 36KD/501D,R1-B01,500,100,500,32.0,55.0,V001\r\n"
        "NZ-501D-CON,Conical Nozzle NW 16mm 501D,MIG Welding,pcs,Binzel MB 501D,R1-B03,120,40,100,145.0,220.0,V001\r\n"
        "DF-36KD-CER,Gas Diffuser Ceramic Standard,MIG Welding,pcs,Binzel MB 36KD,R1-B05,250,50,200,48.0,85.0,V001\r\n"
        "TE-WL20-24,Lanthanated Tungsten 2.4mm Blue,TIG Welding,pcs,WP-17/18/26 Torches,R2-B02,80,25,50,95.0,160.0,V002\r\n"
    )
    return Response(
        content=sample_csv,
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="Anishka_Spares_Import_Template.csv"'}
    )

@app.post("/api/import/csv")
async def import_csv_catalog(
    request: Request,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_roles(["admin", "manager"]))
):
    """Import inventory catalog items from CSV with row-by-row error validation."""
    body = await request.body()
    content_str = body.decode("utf-8", errors="replace")

    # If multipart, extract file content
    if "WebKitFormBoundary" in content_str or "form-data;" in content_str:
        lines = content_str.splitlines()
        csv_lines = []
        capture = False
        for l in lines:
            if capture:
                if l.startswith("------"):
                    break
                csv_lines.append(l)
            elif l == "":
                capture = True
        content_str = "\n".join(csv_lines)

    f = io.StringIO(content_str)
    reader = csv.DictReader(f)

    if not reader.fieldnames:
        raise HTTPException(status_code=400, detail="CSV file is empty or missing headers.")

    # Validate header fields
    req_cols = {"sku", "name", "category"}
    actual_cols = {col.strip().lower() for col in reader.fieldnames if col}
    if not req_cols.issubset(actual_cols):
        raise HTTPException(status_code=400, detail=f"CSV missing required columns: {req_cols - actual_cols}")

    total_rows = 0
    imported_count = 0
    imported_item_ids = []
    errors = []
    seen_skus_in_batch = set()

    for idx, row in enumerate(reader, start=2): # row 1 is header
        total_rows += 1
        sku = (row.get("sku") or row.get("SKU") or "").strip()
        name = (row.get("name") or row.get("Name") or "").strip()
        category = (row.get("category") or row.get("Category") or "").strip()

        if not sku:
            errors.append({"row": idx, "sku": "", "error": "Missing required SKU."})
            continue
        if not name:
            errors.append({"row": idx, "sku": sku, "error": "Missing required item name."})
            continue
        if not category:
            errors.append({"row": idx, "sku": sku, "error": "Missing required category."})
            continue

        if sku in seen_skus_in_batch:
            errors.append({"row": idx, "sku": sku, "error": f"Duplicate SKU '{sku}' within CSV file."})
            continue
        seen_skus_in_batch.add(sku)

        # Parse numeric fields safely
        try:
            qty = int(row.get("quantity") or 0)
            reorder_lvl = int(row.get("reorder_level") or 10)
            reorder_q = int(row.get("reorder_qty") or 50)
            unit_c = float(row.get("unit_cost") or 0.0)
            selling_p = float(row.get("selling_price") or (unit_c * 1.4 if unit_c > 0 else 0.0))
        except (ValueError, TypeError) as e:
            errors.append({"row": idx, "sku": sku, "error": f"Invalid numeric field value: {e}"})
            continue

        unit_val = (row.get("unit") or "pcs").strip()
        compatible_val = (row.get("compatible_with") or "").strip()
        location_val = (row.get("location") or "R1-B01").strip()
        supplier_id_val = (row.get("supplier_id") or "").strip()
        if supplier_id_val:
            sup = db.query(Vendor).filter(Vendor.id == supplier_id_val).first()
            if not sup:
                errors.append({"row": idx, "sku": sku, "error": f"Supplier '{supplier_id_val}' does not exist in suppliers database."})
                continue
        else:
            supplier_id_val = None

        existing = db.query(Inventory).filter(Inventory.sku == sku).first()
        if existing:
            existing.name = name
            existing.category = category
            existing.unit = unit_val
            existing.compatible_with = compatible_val
            existing.location = location_val
            existing.quantity = qty
            existing.reorder_level = reorder_lvl
            existing.reorder_qty = reorder_q
            existing.unit_cost = unit_c
            existing.selling_price = selling_p
            existing.supplier_id = supplier_id_val
            existing.last_updated = datetime.datetime.now().isoformat()
            existing.is_active = True
        else:
            item = Inventory(
                sku=sku,
                name=name,
                category=category,
                unit=unit_val,
                compatible_with=compatible_val,
                location=location_val,
                quantity=qty,
                reorder_level=reorder_lvl,
                reorder_qty=reorder_q,
                unit_cost=unit_c,
                selling_price=selling_p,
                supplier_id=supplier_id_val,
                last_updated=datetime.datetime.now().isoformat(),
                is_active=True
            )
            db.add(item)
        imported_count += 1
        db.flush()
        target_id = existing.id if existing else item.id
        if target_id:
            imported_item_ids.append(target_id)

    db.add(AuditLog(
        timestamp=datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        action="CATALOG_IMPORTED",
        user=current_user["username"],
        target_id="BULK_IMPORT",
        details=f"Processed CSV: {imported_count} imported/updated, {len(errors)} errors out of {total_rows} rows."
    ))
    db.commit()

    # Requirement C: Event trigger after CSV import for every imported row
    await trigger_replenishment_events(imported_item_ids, db, user=current_user["username"])

    stats = _compute_stats(db)
    await manager.broadcast({"type": "stats_update", "data": stats})

    return {
        "status": "completed",
        "total_rows": total_rows,
        "imported": imported_count,
        "errors": errors
    }


# ─── Standard CSV Export Engine ───────────────────────────────────────

@app.get("/api/export/csv/{export_type}")
@app.get("/api/export/{export_type}")
async def export_csv(export_type: str, db: Session = Depends(get_db)):
    """Export catalog, movements, suppliers, or audit logs to CSV."""
    output = io.StringIO()
    writer = csv.writer(output)

    if export_type in ["inventory", "stock"]:
        items = db.query(Inventory).all()
        writer.writerow(["SKU", "Name", "Category", "Quantity", "Unit Price (INR)", "Reorder Level", "Location", "Last Updated"])
        for i in items:
            writer.writerow([i.sku, i.name, i.category, i.quantity, i.unit_price, i.reorder_level, i.location, i.last_updated])
        filename = "Anishka_Inventory_Catalog.csv"

    elif export_type in ["movements", "transactions"]:
        movements = db.query(StockMovement).order_by(StockMovement.id.desc()).all()
        writer.writerow(["Movement ID", "Timestamp", "Type", "SKU", "Item Name", "Quantity", "Reference", "Destination/Source", "Operator", "Notes"])
        for m in movements:
            writer.writerow([m.movement_id, m.timestamp, m.movement_type, m.sku, m.item_name, m.quantity, m.reference, m.destination_or_source, m.operator, m.notes])
        filename = "Anishka_Stock_Movements.csv"

    elif export_type in ["procurement", "pos"]:
        pos = db.query(Procurement).all()
        writer.writerow(["PO Number", "Date", "Supplier", "Item", "Quantity", "Amount (INR)", "Status", "Department"])
        for p in pos:
            writer.writerow([p.id, p.date, p.vendor_name, p.item, p.quantity, p.amount, p.status, p.department])
        filename = "Anishka_Purchase_Orders.csv"

    elif export_type in ["suppliers", "vendors"]:
        suppliers = db.query(Vendor).all()
        writer.writerow(["Supplier ID", "Supplier Name", "Category", "Reliability", "Trust Score", "Contact Email", "Contact Phone"])
        for s in suppliers:
            writer.writerow([s.id, s.name, s.category, s.risk_level, s.trust_score, s.contact_email, s.contact_phone])
        filename = "Anishka_Suppliers_Directory.csv"

    elif export_type in ["audit", "logs"]:
        logs = db.query(AuditLog).order_by(AuditLog.id.desc()).all()
        writer.writerow(["Timestamp", "User", "Action", "Target ID", "Details"])
        for l in logs:
            writer.writerow([l.timestamp, l.user, l.action, l.target_id, l.details])
        filename = "Anishka_Audit_Trail.csv"

    else:
        raise HTTPException(status_code=400, detail="Invalid export type.")

    output.seek(0)
    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )

@app.get("/api/export/excel/{export_type}")
@app.get("/api/export/comprehensive")
async def export_excel(export_type: str = "comprehensive", db: Session = Depends(get_db)):
    """Generate a multi-tab professional Excel audit workbook."""
    wb = openpyxl.Workbook()
    wb.remove(wb.active)  # Remove default blank sheet

    # Colors
    header_fill = PatternFill(start_color="00234B", end_color="00234B", fill_type="solid")
    header_font = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
    thin_border = Border(
        left=Side(style='thin', color='D1D5DB'),
        right=Side(style='thin', color='D1D5DB'),
        top=Side(style='thin', color='D1D5DB'),
        bottom=Side(style='thin', color='D1D5DB')
    )

    # Sheet 1: Inventory Catalog
    ws1 = wb.create_sheet(title="Inventory Catalog")
    ws1.append(["SKU", "Item Description", "Category", "In-Stock Qty", "Unit Price (INR)", "Total Value (INR)", "Reorder Level", "Location", "Status"])
    for cell in ws1[1]:
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal="center", vertical="center")

    items = db.query(Inventory).order_by(Inventory.category, Inventory.name).all()
    for row_idx, item in enumerate(items, start=2):
        val = item.quantity * item.unit_price
        status_text = "Out of Stock" if item.quantity == 0 else ("Low Stock" if item.quantity <= item.reorder_level else "In Stock")
        ws1.append([item.sku, item.name, item.category, item.quantity, item.unit_price, val, item.reorder_level, item.location, status_text])
        for col in range(1, 10):
            ws1.cell(row=row_idx, column=col).border = thin_border

    # Sheet 2: Stock Movements Ledger
    ws2 = wb.create_sheet(title="Stock Movements")
    ws2.append(["Movement ID", "Timestamp", "Type", "SKU", "Item Name", "Quantity", "Reference", "Destination / Source", "Operator"])
    for cell in ws2[1]:
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal="center", vertical="center")

    movements = db.query(StockMovement).order_by(StockMovement.id.desc()).all()
    for row_idx, m in enumerate(movements, start=2):
        ws2.append([m.movement_id, m.timestamp, m.movement_type, m.sku, m.item_name, m.quantity, m.reference, m.destination_or_source, m.operator])
        for col in range(1, 10):
            ws2.cell(row=row_idx, column=col).border = thin_border

    # Sheet 3: Purchase Orders
    ws3 = wb.create_sheet(title="Purchase Orders")
    ws3.append(["PO Number", "Date", "Supplier", "Item", "Quantity", "Amount (INR)", "Status", "Department"])
    for cell in ws3[1]:
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal="center", vertical="center")

    pos = db.query(Procurement).all()
    for row_idx, p in enumerate(pos, start=2):
        ws3.append([p.id, p.date, p.vendor_name, p.item, p.quantity, p.amount, p.status, p.department])
        for col in range(1, 9):
            ws3.cell(row=row_idx, column=col).border = thin_border

    # Sheet 4: Suppliers
    ws4 = wb.create_sheet(title="Suppliers")
    ws4.append(["Supplier ID", "Supplier Name", "Category", "Reliability", "Trust Rating", "Email", "Phone"])
    for cell in ws4[1]:
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal="center", vertical="center")

    suppliers = db.query(Vendor).all()
    for row_idx, s in enumerate(suppliers, start=2):
        ws4.append([s.id, s.name, s.category, s.risk_level, f"{s.trust_score}%", s.contact_email, s.contact_phone])
        for col in range(1, 8):
            ws4.cell(row=row_idx, column=col).border = thin_border

    # Auto-adjust column widths
    for sheet in [ws1, ws2, ws3, ws4]:
        for col in sheet.columns:
            max_len = max(len(str(cell.value or '')) for cell in col)
            col_letter = get_column_letter(col[0].column)
            sheet.column_dimensions[col_letter].width = max(max_len + 3, 12)

    output = io.BytesIO()
    wb.save(output)
    output.seek(0)

    filename = f"Anishka_Inventory_Workbook_{datetime.date.today().isoformat()}.xlsx"
    return Response(
        content=output.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )


# ─── Groq AI Copilot API ──────────────────────────────────────────────

@app.post("/api/ai/chat")
@limiter.limit("20/minute")
async def ai_chat_endpoint(
    request: Request,
    req: AIChatRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Conversational AI Copilot agent with tool calling and SSE streaming."""
    user = current_user.get("username", "storekeeper")
    role = current_user.get("role", "storekeeper")

    accept_hdr = request.headers.get("Accept", "")
    if req.stream or "text/event-stream" in accept_hdr:
        from fastapi.responses import StreamingResponse
        gen = stream_chat_agent(
            user_message=req.message,
            db=db,
            user=user,
            role=role,
            conversation_history=req.conversation_history,
            session_id=req.session_id
        )
        return StreamingResponse(
            gen,
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no"
            }
        )
    else:
        result = run_chat_agent(
            user_message=req.message,
            db=db,
            user=user,
            role=role,
            conversation_history=req.conversation_history,
            session_id=req.session_id
        )
        return result

@app.get("/api/ai/health")
async def ai_health():
    """Verify Groq API connectivity and models."""
    return check_ai_health()

@app.get("/api/ai/usage")
async def ai_usage_stats(db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    """Return AI token usage statistics from AIChatLog."""
    logs = db.query(AIChatLog).all()
    total_requests = len(logs)
    total_tokens = sum(l.total_tokens or 0 for l in logs)
    prompt_tokens = sum(l.prompt_tokens or 0 for l in logs)
    comp_tokens = sum(l.completion_tokens or 0 for l in logs)
    
    by_user = {}
    by_model = {}
    for l in logs:
        by_user[l.user] = by_user.get(l.user, 0) + (l.total_tokens or 0)
        by_model[l.model] = by_model.get(l.model, 0) + (l.total_tokens or 0)
    
    configured_model = os.environ.get("GROQ_MODEL", "llama-3.3-70b-versatile")
    
    return {
        "total_requests": total_requests,
        "total_tokens": total_tokens,
        "prompt_tokens": prompt_tokens,
        "completion_tokens": comp_tokens,
        "by_user": by_user,
        "by_model": by_model,
        "configured_model": configured_model
    }

# ─── Audit Trail API ──────────────────────────────────────────────────

@app.get("/api/audit", dependencies=[Depends(require_roles(["admin", "manager"]))])
@app.get("/api/audit-logs", dependencies=[Depends(require_roles(["admin", "manager"]))])
async def get_audit_trail(limit: int = 100, db: Session = Depends(get_db)):
    """Fetch immutable audit records."""
    logs = db.query(AuditLog).order_by(AuditLog.id.desc()).limit(limit).all()
    return [
        {
            "id": l.id,
            "timestamp": l.timestamp,
            "user": l.user,
            "action": l.action,
            "target": l.target_id,
            "details": l.details
        }
        for l in logs
    ]


# ─── Simulator Controls API ───────────────────────────────────────────

@app.get("/api/simulator/status")
async def get_simulator_status():
    """Get the current running state of the background simulator."""
    global simulator_running
    return {"status": "success", "simulator_running": simulator_running}

@app.post("/api/simulator/toggle")
async def toggle_simulator(current_user: dict = Depends(require_roles(["admin", "manager"]))):
    """Toggle background stock movement simulation."""
    global simulator_running
    simulator_running = not simulator_running
    await manager.broadcast({
        "type": "connection_info",
        "data": {"clients": len(manager.active_connections), "simulator": simulator_running}
    })
    return {"status": "success", "simulator_running": simulator_running}

@app.post("/api/simulator/start")
async def start_simulator(current_user: dict = Depends(require_roles(["admin", "manager"]))):
    global simulator_running
    simulator_running = True
    return {"status": "success", "simulator_running": True}

@app.post("/api/simulator/stop")
async def stop_simulator(current_user: dict = Depends(require_roles(["admin", "manager"]))):
    global simulator_running
    simulator_running = False
    return {"status": "success", "simulator_running": False}

@app.post("/api/demo/reset")
async def reset_demo_data(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_roles(["admin"]))
):
    """Reset catalog to clean factory default state with realistic welding spares."""
    from seed_data import seed_database
    seed_database(db)
    stats_payload = _compute_stats(db)
    await manager.broadcast({"type": "demo_reset", "data": {"message": "Catalog refreshed"}})
    await manager.broadcast({"type": "stats_update", "data": stats_payload})
    return {"status": "success", "message": "Demo data reset successfully"}



# ─── Automation Settings & Run API ────────────────────────────────────

@app.get("/api/settings/automation")
async def get_automation_settings_endpoint(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Return current automation configuration for any authenticated user."""
    return get_automation_settings_dict(db)

@app.put("/api/settings/automation")
async def update_automation_settings_endpoint(
    req: AutomationSettingsUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_roles(["admin", "manager"]))
):
    """Update automation settings with range validation, audit logging, and job rescheduling."""
    # Validate ranges
    if req.scan_interval_minutes is not None:
        if req.scan_interval_minutes < 1 or req.scan_interval_minutes > 1440:
            raise HTTPException(status_code=400, detail="Scan interval must be between 1 and 1440 minutes.")
    if req.safety_days is not None:
        if req.safety_days < 0 or req.safety_days > 365:
            raise HTTPException(status_code=400, detail="Safety days must be between 0 and 365.")
    if req.auto_approve_limit is not None:
        if req.auto_approve_limit < 0:
            raise HTTPException(status_code=400, detail="Auto-approve limit cannot be negative.")
    if req.auto_approve_min_supplier_rating is not None:
        if req.auto_approve_min_supplier_rating < 0.0 or req.auto_approve_min_supplier_rating > 5.0:
            raise HTTPException(status_code=400, detail="Supplier rating must be between 0.0 and 5.0.")
    if req.digest_time is not None:
        parts = req.digest_time.split(":")
        if len(parts) != 2 or not parts[0].isdigit() or not parts[1].isdigit():
            raise HTTPException(status_code=400, detail="Digest time must be in HH:MM format.")
        dh, dm = int(parts[0]), int(parts[1])
        if dh < 0 or dh > 23 or dm < 0 or dm > 59:
            raise HTTPException(status_code=400, detail="Digest time must be between 00:00 and 23:59.")

    now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    updates = req.dict(exclude_unset=True)
    for key, val in updates.items():
        if val is None:
            continue
        str_val = "true" if val is True else ("false" if val is False else str(val))
        setting = db.query(AppSetting).filter(AppSetting.key == key).first()
        if not setting:
            setting = AppSetting(key=key, value=str_val, updated_by=current_user["username"], updated_at=now_str)
            db.add(setting)
        else:
            setting.value = str_val
            setting.updated_by = current_user["username"]
            setting.updated_at = now_str

    db.add(AuditLog(
        timestamp=now_str,
        action="AUTOMATION_SETTINGS_UPDATED",
        user=current_user["username"],
        target_id="AUTOMATION_SETTINGS",
        details=f"Updated automation settings: {', '.join(f'{k}={v}' for k, v in updates.items())}"
    ))
    db.commit()

    # Reschedule APScheduler job if scan interval changed
    if req.scan_interval_minutes is not None and scheduler.running:
        try:
            scheduler.reschedule_job(
                "automation_cycle",
                trigger="interval",
                minutes=max(1, req.scan_interval_minutes)
            )
            logger.info(f"[Automation] Rescheduled cycle to {req.scan_interval_minutes} minutes.")
        except Exception as e:
            logger.warn(f"[Automation] Could not reschedule job: {e}")

    # Reschedule Daily Digest job if digest_time changed
    if req.digest_time is not None and scheduler.running:
        try:
            dh, dm = int(req.digest_time.split(":")[0]), int(req.digest_time.split(":")[1])
            scheduler.reschedule_job(
                "daily_digest_job",
                trigger="cron",
                hour=dh,
                minute=dm
            )
            logger.info(f"[Daily Digest] Rescheduled digest job to {req.digest_time}.")
        except Exception as e:
            logger.warn(f"[Daily Digest] Could not reschedule digest job: {e}")

    settings_dict = get_automation_settings_dict(db)
    await manager.broadcast({"type": "automation_settings_updated", "data": settings_dict})
    return {"status": "success", "settings": settings_dict}

@app.post("/api/automation/run-now")
async def trigger_automation_run_now(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_roles(["admin", "manager"]))
):
    """Trigger an immediate automation cycle execution (manager/admin only)."""
    result = await run_automation_cycle(trigger="manual")
    return {
        "status": "success",
        "scanned": result.get("scanned", 0),
        "drafted": result.get("drafted", 0),
        "auto_approved": result.get("auto_approved", 0),
        "skipped_open_po": result.get("skipped_open_po", 0),
        "overdue": result.get("overdue", 0),
        "summary": result.get("summary", "")
    }

@app.get("/api/automation/status")
async def get_automation_status(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Return automation state, last run, next run, and 7-day aggregate counts."""
    settings = get_automation_settings_dict(db)
    last_run_rec = db.query(AutomationRun).order_by(AutomationRun.id.desc()).first()
    last_run_dict = None
    if last_run_rec:
        last_run_dict = {
            "id": last_run_rec.id,
            "started_at": last_run_rec.started_at,
            "trigger": last_run_rec.trigger,
            "scanned": last_run_rec.scanned,
            "drafted": last_run_rec.drafted,
            "auto_approved": last_run_rec.auto_approved,
            "overdue": last_run_rec.overdue,
            "summary": last_run_rec.summary
        }

    # Next run time
    next_run_str = None
    if scheduler.running:
        job = scheduler.get_job("automation_cycle")
        if job and job.next_run_time:
            next_run_str = job.next_run_time.isoformat()

    # This week's counts (last 7 days)
    seven_days_ago = (datetime.datetime.now() - datetime.timedelta(days=7)).strftime("%Y-%m-%d %H:%M:%S")
    week_runs = db.query(AutomationRun).filter(AutomationRun.started_at >= seven_days_ago).all()
    this_week_counts = {
        "scanned": sum(r.scanned for r in week_runs),
        "drafted": sum(r.drafted for r in week_runs),
        "auto_approved": sum(r.auto_approved for r in week_runs),
        "overdue": week_runs[-1].overdue if week_runs else 0,
        "runs": len(week_runs)
    }

    return {
        "enabled": settings["auto_reorder_enabled"],
        "last_run": last_run_dict,
        "next_run": next_run_str,
        "this_week_counts": this_week_counts
    }


# ─── Barcode & QR Label PDF Endpoints ─────────────────────────────────

@app.get("/api/labels/items/pdf")
async def export_item_labels_pdf(
    item_ids: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    all: Optional[int] = Query(1),
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_roles(["admin", "manager", "storekeeper"]))
):
    """Generate printable 3x8 PDF sheet of item QR labels with SKU, name, bin, and category."""
    q = db.query(Inventory).filter(Inventory.is_active == True)
    if item_ids:
        ids = [int(x.strip()) for x in item_ids.split(",") if x.strip().isdigit()]
        if ids:
            q = q.filter(Inventory.id.in_(ids))
    elif category and category.lower() != "all":
        q = q.filter(Inventory.category == category)

    items = q.order_by(Inventory.sku).all()
    if not items:
        raise HTTPException(status_code=404, detail="No active inventory items found for label generation.")

    item_dicts = [
        {
            "id": it.id,
            "sku": it.sku,
            "name": it.name,
            "category": it.category,
            "location": it.location or "Central Store"
        }
        for it in items
    ]

    pdf_bytes = generate_item_labels_pdf(item_dicts)
    filename = f"Anishka_Item_Labels_{datetime.date.today().isoformat()}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{filename}"'}
    )


@app.get("/api/labels/bins/pdf")
async def export_bin_labels_pdf(
    bins: Optional[str] = Query(None),
    all: Optional[int] = Query(1),
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_roles(["admin", "manager", "storekeeper"]))
):
    """Generate printable 2x4 PDF sheet of bin location QR tags."""
    bin_list = []
    if bins:
        bin_list = [b.strip() for b in bins.split(",") if b.strip()]
    else:
        locs = db.query(Inventory.location).filter(Inventory.location.isnot(None), Inventory.location != "").distinct().all()
        bin_list = [l[0] for l in locs if l[0]]
        if not bin_list:
            bin_list = ["BIN-A1", "BIN-A2", "BIN-B1", "BIN-B2", "BIN-C1", "BIN-C2", "BIN-D1", "BIN-D2"]

    bin_dicts = [
        {
            "bin": b,
            "rack": b.split("-")[0] if "-" in b else "RACK-1",
            "zone": "Sector-10 Central Warehouse"
        }
        for b in bin_list
    ]

    pdf_bytes = generate_bin_labels_pdf(bin_dicts)
    filename = f"Anishka_Bin_Labels_{datetime.date.today().isoformat()}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{filename}"'}
    )


# ─── Cycle Count & Physical Audit Endpoints ─────────────────────────

def _cycle_count_to_dict(cc: CycleCount, db: Session) -> dict:
    items = []
    for it in cc.items:
        inv = it.item or db.query(Inventory).filter(Inventory.id == it.item_id).first()
        items.append({
            "id": it.id,
            "item_id": it.item_id,
            "sku": inv.sku if inv else f"ITEM-{it.item_id}",
            "name": inv.name if inv else "",
            "category": inv.category if inv else "",
            "bin_location": inv.location if inv else "Central Store",
            "system_qty": it.system_qty,
            "counted_qty": it.counted_qty,
            "variance_qty": it.variance_qty,
            "unit_cost": it.unit_cost,
            "variance_value": it.variance_value,
            "discrepancy_reason": it.discrepancy_reason,
            "scanned_at": it.scanned_at
        })
    return {
        "id": cc.id,
        "count_no": cc.count_no,
        "type": cc.type,
        "target_name": cc.target_name,
        "status": cc.status,
        "created_by": cc.created_by,
        "created_at": cc.created_at,
        "approved_by": cc.approved_by,
        "approved_at": cc.approved_at,
        "approval_notes": cc.approval_notes,
        "total_items": cc.total_items,
        "variance_items": cc.variance_items,
        "total_variance_value": cc.total_variance_value,
        "total_system_qty": sum(it.system_qty for it in cc.items),
        "total_counted_qty": sum((it.counted_qty if it.counted_qty is not None else it.system_qty) for it in cc.items),
        "total_variance_qty": sum((it.variance_qty or 0) for it in cc.items),
        "posted_at": cc.posted_at,
        "items": items
    }


@app.get("/api/cycle-counts")
async def list_cycle_counts(
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_roles(["admin", "manager", "storekeeper"]))
):
    """List all cycle count audit sheets."""
    q = db.query(CycleCount)
    if status:
        q = q.filter(CycleCount.status == status.upper())
    counts = q.order_by(CycleCount.id.desc()).all()
    return [_cycle_count_to_dict(c, db) for c in counts]


@app.post("/api/cycle-counts", status_code=201)
async def create_cycle_count(
    req: CycleCountCreateRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_roles(["admin", "manager", "storekeeper"]))
):
    """Generate a new cycle count audit sheet by category, bin, or full warehouse."""
    q = db.query(Inventory).filter(Inventory.is_active == True)
    if req.type == "CATEGORY" and req.target_name:
        q = q.filter(Inventory.category == req.target_name)
    elif req.type == "BIN" and req.target_name:
        q = q.filter(Inventory.location == req.target_name)

    items = q.order_by(Inventory.sku).all()
    if not items:
        items = db.query(Inventory).filter(Inventory.is_active == True).limit(50).all()

    now_iso = datetime.datetime.now().isoformat()
    count_no = f"CC-{datetime.date.today().year}-{random.randint(1000, 9999)}"

    cc = CycleCount(
        count_no=count_no,
        type=req.type.upper(),
        target_name=req.target_name or "All Warehouse",
        status="OPEN",
        created_by=current_user["username"],
        created_at=now_iso,
        approval_notes=req.notes or "",
        total_items=len(items),
        variance_items=0,
        total_variance_value=0.0
    )
    db.add(cc)
    db.flush()

    for item in items:
        cc_item = CycleCountItem(
            cycle_count_id=cc.id,
            item_id=item.id,
            system_qty=item.quantity,
            counted_qty=item.quantity,
            variance_qty=0,
            unit_cost=item.unit_cost or 0.0,
            variance_value=0.0,
            discrepancy_reason=None,
            scanned_at=None
        )
        db.add(cc_item)

    db.add(AuditLog(
        timestamp=datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        action="CYCLE_COUNT_CREATED",
        user=current_user["username"],
        target_id=count_no,
        details=f"Created {req.type} count sheet {count_no} ({req.target_name}) with {len(items)} items."
    ))
    db.commit()
    db.refresh(cc)
    return _cycle_count_to_dict(cc, db)


@app.get("/api/cycle-counts/{cc_id}")
async def get_cycle_count(
    cc_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_roles(["admin", "manager", "storekeeper"]))
):
    """Retrieve detailed count sheet with line items and variance calculations."""
    cc = db.query(CycleCount).filter(CycleCount.id == cc_id).first()
    if not cc:
        raise HTTPException(status_code=404, detail="Cycle count sheet not found.")
    return _cycle_count_to_dict(cc, db)


@app.post("/api/cycle-counts/{cc_id}/count")
async def update_cycle_count_items(
    cc_id: int,
    req: dict,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_roles(["admin", "manager", "storekeeper"]))
):
    """Update counted quantities and discrepancy reasons for items in sheet."""
    cc = db.query(CycleCount).filter(CycleCount.id == cc_id).first()
    if not cc:
        raise HTTPException(status_code=404, detail="Cycle count sheet not found.")
    if cc.status in ["APPROVED", "POSTED"]:
        raise HTTPException(status_code=400, detail="Cannot edit an approved cycle count sheet.")

    items_input = req.get("items") or req.get("counts") or []
    item_map = {it.id: it for it in cc.items}

    var_items = 0
    total_var_val = 0.0

    for inp in items_input:
        it_id = inp.get("item_id")
        cc_item = item_map.get(it_id)
        if not cc_item:
            for ci in cc.items:
                if ci.item_id == it_id:
                    cc_item = ci
                    break

        if cc_item:
            counted = inp.get("counted_qty", cc_item.system_qty)
            cc_item.counted_qty = counted
            cc_item.variance_qty = counted - cc_item.system_qty
            cc_item.variance_value = cc_item.variance_qty * (cc_item.unit_cost or 0.0)
            if "discrepancy_reason" in inp:
                cc_item.discrepancy_reason = inp["discrepancy_reason"]
            cc_item.scanned_at = datetime.datetime.now().isoformat()

    for ci in cc.items:
        if (ci.variance_qty or 0) != 0:
            var_items += 1
            total_var_val += (ci.variance_value or 0.0)

    cc.variance_items = var_items
    cc.total_variance_value = total_var_val
    db.commit()
    db.refresh(cc)
    return _cycle_count_to_dict(cc, db)


@app.post("/api/cycle-counts/{cc_id}/submit")
async def submit_cycle_count(
    cc_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_roles(["admin", "manager", "storekeeper"]))
):
    """Submit count sheet for managerial review and approval."""
    cc = db.query(CycleCount).filter(CycleCount.id == cc_id).first()
    if not cc:
        raise HTTPException(status_code=404, detail="Cycle count sheet not found.")
    if cc.status in ["APPROVED", "POSTED"]:
        raise HTTPException(status_code=400, detail="Sheet already approved.")

    cc.status = "SUBMITTED"
    db.add(AuditLog(
        timestamp=datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        action="CYCLE_COUNT_SUBMITTED",
        user=current_user["username"],
        target_id=cc.count_no,
        details=f"Submitted cycle count sheet {cc.count_no} for approval. Total variance items: {cc.variance_items}."
    ))
    db.commit()
    db.refresh(cc)
    return _cycle_count_to_dict(cc, db)


@app.post("/api/cycle-counts/{cc_id}/approve")
async def approve_cycle_count(
    cc_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_roles(["admin", "manager"]))
):
    """Manager/Admin approves sheet and automatically posts physical variance adjustments to ledger."""
    cc = db.query(CycleCount).filter(CycleCount.id == cc_id).first()
    if not cc:
        raise HTTPException(status_code=404, detail="Cycle count sheet not found.")
    if cc.status in ["APPROVED", "POSTED"]:
        return _cycle_count_to_dict(cc, db)

    now_iso = datetime.datetime.now().isoformat()
    now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")

    for it in cc.items:
        var = it.variance_qty or 0
        if var != 0:
            inv = it.item or db.query(Inventory).filter(Inventory.id == it.item_id).first()
            if inv:
                prev_qty = inv.quantity
                inv.quantity = (it.counted_qty if it.counted_qty is not None else inv.quantity)
                inv.last_updated = now_iso

                db.add(StockMovement(
                    item_id=inv.id,
                    type="ADJUST",
                    quantity=abs(var),
                    reference=f"Cycle Count {cc.count_no}",
                    party="Physical Audit",
                    performed_by=f"{current_user['username']} via Cycle Count",
                    timestamp=now_str,
                    balance_after=inv.quantity,
                    client_id=f"cc-{cc.id}-{it.id}"
                ))

                db.add(AuditLog(
                    timestamp=datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                    action="CYCLE_COUNT_POSTED",
                    user=current_user["username"],
                    target_id=inv.sku,
                    details=f"Reconciled {inv.sku} from {prev_qty} to {inv.quantity} via sheet {cc.count_no}. Reason: {it.discrepancy_reason or 'Variance'}"
                ))

    cc.status = "APPROVED"
    cc.approved_by = current_user["username"]
    cc.approved_at = now_iso
    cc.posted_at = now_iso
    db.commit()
    db.refresh(cc)

    stats = _compute_stats(db)
    await manager.broadcast({"type": "stats_update", "data": stats})
    return _cycle_count_to_dict(cc, db)


@app.post("/api/cycle-counts/{cc_id}/reject")
async def reject_cycle_count(
    cc_id: int,
    req: CycleCountActionRequest = CycleCountActionRequest(),
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_roles(["admin", "manager"]))
):
    """Reject cycle count sheet requiring recounts."""
    cc = db.query(CycleCount).filter(CycleCount.id == cc_id).first()
    if not cc:
        raise HTTPException(status_code=404, detail="Cycle count sheet not found.")
    if cc.status in ["APPROVED", "POSTED"]:
        raise HTTPException(status_code=400, detail="Cannot reject already approved cycle count.")

    cc.status = "REJECTED"
    cc.approval_notes = req.reason or req.notes or "Count sheet rejected by manager"
    db.add(AuditLog(
        timestamp=datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        action="CYCLE_COUNT_REJECTED",
        user=current_user["username"],
        target_id=cc.count_no,
        details=f"Cycle count sheet {cc.count_no} rejected: {cc.approval_notes}"
    ))
    db.commit()
    db.refresh(cc)
    return _cycle_count_to_dict(cc, db)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)

# ─── EXTRA AUTOMATION ENDPOINTS (OUTBOX, DIGEST, REORDER REVIEW, DEAD STOCK) ───

@app.get("/api/outbox")
async def get_outbox_messages(
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Retrieve queued, sent, and simulated email outbox messages."""
    records = db.query(Outbox).order_by(Outbox.id.desc()).limit(limit).all()
    return [{
        "id": r.id,
        "created_at": r.created_at,
        "to_email": r.to_email,
        "subject": r.subject,
        "body": r.body,
        "attachment_name": r.attachment_name,
        "status": r.status,
        "related_po": r.related_po,
        "channel": getattr(r, "channel", "EMAIL") or "EMAIL",
        "sender": getattr(r, "sender", "system") or "system",
        "recipient_phone": getattr(r, "recipient_phone", "") or "",
        "template_lang": getattr(r, "template_lang", "en") or "en",
        "ref_type": getattr(r, "ref_type", "") or "",
        "ref_id": getattr(r, "ref_id", "") or ""
    } for r in records]


@app.post("/api/outbox/{outbox_id}/resend")
async def resend_outbox_message(
    outbox_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_roles(["admin", "manager"]))
):
    """Re-dispatch or re-simulate an outbox email (admin/manager only)."""
    rec = db.query(Outbox).filter(Outbox.id == outbox_id).first()
    if not rec:
        raise HTTPException(status_code=404, detail="Outbox message not found.")

    smtp_host = os.environ.get("SMTP_HOST")
    smtp_user = os.environ.get("SMTP_USER")
    smtp_pass = os.environ.get("SMTP_PASS")
    smtp_from = os.environ.get("SMTP_FROM")
    has_smtp = bool(smtp_host and smtp_user and smtp_pass and smtp_from)

    rec.created_at = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    if has_smtp:
        rec.status = "QUEUED"
        db.commit()
        def _bg_resend(oid, subj, body, to_addr):
            from database import SessionLocal
            bg_db = SessionLocal()
            try:
                import smtplib
                from email.mime.text import MIMEText
                from email.mime.multipart import MIMEMultipart
                msg = MIMEMultipart()
                msg["Subject"] = subj
                msg["From"] = smtp_from
                msg["To"] = to_addr
                msg.attach(MIMEText(body, "plain"))
                server = smtplib.SMTP(smtp_host, int(os.environ.get("SMTP_PORT", 587)), timeout=10)
                server.starttls()
                server.login(smtp_user, smtp_pass)
                server.send_message(msg)
                server.quit()
                r = bg_db.query(Outbox).filter(Outbox.id == oid).first()
                if r:
                    r.status = "SENT"
                    bg_db.commit()
            except Exception:
                r = bg_db.query(Outbox).filter(Outbox.id == oid).first()
                if r:
                    r.status = "FAILED"
                    bg_db.commit()
            finally:
                bg_db.close()
        import threading
        threading.Thread(target=_bg_resend, args=(rec.id, rec.subject, rec.body, rec.to_email), daemon=True).start()
    else:
        rec.status = "SIMULATED"
        db.commit()

    return {"status": "success", "message": f"Outbox message {rec.id} re-processed.", "new_status": rec.status}


@app.get("/api/digest/latest")
async def get_latest_daily_digest(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Fetch the latest daily operations digest summary."""
    rec = db.query(Outbox).filter(Outbox.related_po == "DAILY_DIGEST").order_by(Outbox.id.desc()).first()
    if rec:
        return {
            "status": "success",
            "date": rec.created_at[:10],
            "created_at": rec.created_at,
            "subject": rec.subject,
            "body": rec.body,
            "status_label": rec.status
        }
    data = generate_daily_digest(db, triggered_by="on_demand")
    return {
        "status": "success",
        "date": data["date"],
        "created_at": data["timestamp"],
        "subject": f"Daily Inventory & Operations Digest - {data['date']}",
        "body": data["body"],
        "status_label": "SIMULATED"
    }


@app.post("/api/digest/run-now")
async def trigger_daily_digest_now(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_roles(["admin", "manager"]))
):
    """Generate an immediate daily operations digest (admin/manager only)."""
    data = generate_daily_digest(db, triggered_by="manual")
    return {"status": "success", "digest": data}


@app.get("/api/inventory/reorder-level-suggestions")
async def get_reorder_level_suggestions(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """
    Review Reorder Levels:
    Returns items where suggested reorder level differs by more than 25% from current level.
    """
    items = db.query(Inventory).filter(Inventory.is_active == True).all()
    suggestions = []
    for it in items:
        res = compute_suggested_reorder_level(it, db)
        if res["requires_review"]:
            suggestions.append(res)
    suggestions.sort(key=lambda x: abs(x["diff"]), reverse=True)
    return {
        "count": len(suggestions),
        "items": suggestions
    }


@app.get("/api/inventory/dead-stock")
async def get_dead_stock_endpoint(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Return dead stock items with idle days, tied up capital, and suggested recovery actions."""
    return get_dead_stock_analysis(db)


@app.get("/api/export/dead-stock/csv")
async def export_dead_stock_csv(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Export dead stock analysis as CSV."""
    data = get_dead_stock_analysis(db)
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "SKU", "Part Name", "Category", "Quantity", "Unit Cost (INR)",
        "Tied-Up Value (INR)", "Days Inactive", "Suggested Action", "Supplier"
    ])
    for it in data["items"]:
        writer.writerow([
            it["sku"],
            it["name"],
            it["category"],
            it["quantity"],
            f"{it['unit_cost']:.2f}",
            f"{it['tied_up_value']:.2f}",
            it["days_idle"],
            it["suggested_action"],
            it["supplier_name"]
        ])
    output.seek(0)
    filename = f"dead_stock_report_{datetime.date.today().isoformat()}.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


# ─── Sales Module Helpers & Serializers ───────────────────────────────

def get_customer_outstanding(customer_id: int, db: Session) -> float:
    """Compute total customer outstanding: unpaid invoices + confirmed uninvoiced orders."""
    invoices = db.query(Invoice).filter(Invoice.customer_id == customer_id, Invoice.status != "CANCELLED").all()
    total_invoiced = sum(inv.total for inv in invoices)
    invoice_ids = [inv.id for inv in invoices]
    payments = db.query(Payment).filter(Payment.invoice_id.in_(invoice_ids)).all() if invoice_ids else []
    total_paid = sum(p.amount for p in payments)
    outstanding_invoices = max(0.0, total_invoiced - total_paid)

    uninvoiced_orders = db.query(SalesOrder).filter(
        SalesOrder.customer_id == customer_id,
        SalesOrder.status.in_(["CONFIRMED", "PARTIALLY_DISPATCHED", "DISPATCHED"])
    ).all()
    uninv_total = sum(o.grand_total for o in uninvoiced_orders if not o.invoices)

    return round(outstanding_invoices + uninv_total, 2)


def generate_next_invoice_no(db: Session) -> str:
    """Generate Indian Financial Year invoice number e.g. ANI/2026-27/0001."""
    now = datetime.datetime.now()
    if now.month >= 4:
        fy = f"{now.year}-{(now.year + 1) % 100:02d}"
    else:
        fy = f"{now.year - 1}-{now.year % 100:02d}"

    prefix = f"ANI/{fy}/"
    existing = db.query(Invoice.invoice_no).filter(Invoice.invoice_no.like(f"{prefix}%")).all()
    max_seq = 0
    for (inv_no,) in existing:
        try:
            seq_part = int(inv_no.split("/")[-1])
            if seq_part > max_seq:
                max_seq = seq_part
        except Exception:
            pass
    return f"{prefix}{max_seq + 1:04d}"


def generate_next_so_no(db: Session, is_quote: bool = False) -> str:
    """Generate unique sequential quotation or sales order reference."""
    now = datetime.datetime.now()
    prefix = f"ANI-QT-{now.year}-" if is_quote else f"ANI-SO-{now.year}-"
    existing = db.query(SalesOrder.order_no).filter(SalesOrder.order_no.like(f"{prefix}%")).all()
    max_seq = 0
    for (so_no,) in existing:
        try:
            seq_part = int(so_no.split("-")[-1])
            if seq_part > max_seq:
                max_seq = seq_part
        except Exception:
            pass
    return f"{prefix}{max_seq + 1:04d}"


def _customer_to_dict(c: Customer, db: Session) -> dict:
    outstanding = get_customer_outstanding(c.id, db)
    open_orders = db.query(SalesOrder).filter(
        SalesOrder.customer_id == c.id,
        SalesOrder.status.in_(["QUOTE", "CONFIRMED", "PARTIALLY_DISPATCHED", "DISPATCHED"])
    ).count()
    inv_count = db.query(Invoice).filter(Invoice.customer_id == c.id).count()
    return {
        "id": c.id,
        "name": c.name,
        "gstin": c.gstin or "",
        "state": c.state,
        "city": c.city,
        "contact_person": c.contact_person or "",
        "phone": c.phone or "",
        "email": c.email or "",
        "price_tier": c.price_tier,
        "credit_limit": c.credit_limit,
        "credit_days": c.credit_days,
        "is_active": c.is_active,
        "whatsapp_opt_out": getattr(c, "whatsapp_opt_out", False) or False,
        "outstanding_balance": outstanding,
        "open_orders_count": open_orders,
        "total_invoices": inv_count
    }


def _sales_order_to_dict(so: SalesOrder, is_privileged: bool = False) -> dict:
    items_out = []
    for it in so.items:
        line_taxable = round(it.qty * it.unit_price * (1.0 - (it.discount_pct / 100.0)), 2)
        line_tax = round(line_taxable * (it.gst_rate / 100.0), 2)
        item_obj = it.item
        unit_cost = item_obj.unit_cost if item_obj else 0.0
        line_data = {
            "id": it.id,
            "item_id": it.item_id,
            "sku": item_obj.sku if item_obj else "",
            "name": item_obj.name if item_obj else "Welding Spare",
            "unit": item_obj.unit if item_obj else "pcs",
            "hsn_code": getattr(item_obj, "hsn_code", "8466"),
            "qty": it.qty,
            "dispatched_qty": it.dispatched_qty or 0,
            "unit_price": it.unit_price,
            "discount_pct": it.discount_pct,
            "gst_rate": it.gst_rate,
            "taxable": line_taxable,
            "tax_amount": line_tax,
            "line_total": round(line_taxable + line_tax, 2)
        }
        if is_privileged:
            margin = it.unit_price - unit_cost
            margin_pct = round((margin / it.unit_price * 100.0), 1) if it.unit_price > 0 else 0.0
            line_data["unit_cost"] = unit_cost
            line_data["margin"] = round(margin, 2)
            line_data["margin_per_unit"] = round(margin, 2)
            line_data["margin_pct"] = margin_pct
        items_out.append(line_data)

    computed_subtotal = round(sum(it["taxable"] for it in items_out), 2)
    computed_tax = round(sum(it["tax_amount"] for it in items_out), 2)
    computed_grand = round(computed_subtotal + computed_tax, 2)

    subtotal = so.total_taxable if (so.total_taxable is not None and so.total_taxable > 0) else computed_subtotal
    tax = so.total_tax if (so.total_tax is not None and so.total_tax > 0) else computed_tax
    grand = so.grand_total if (so.grand_total is not None and so.grand_total > 0) else computed_grand

    if not so.total_taxable or not so.grand_total:
        so.total_taxable = subtotal
        so.total_tax = tax
        so.grand_total = grand

    return {
        "id": so.id,
        "order_no": so.order_no,
        "customer_id": so.customer_id,
        "customer_name": so.customer.name if so.customer else "Customer",
        "customer_gstin": so.customer.gstin if so.customer else "",
        "customer_state": so.customer.state if so.customer else "Haryana",
        "customer_city": so.customer.city if so.customer else "",
        "status": so.status,
        "created_by": so.created_by,
        "created_at": so.created_at,
        "valid_until": so.valid_until or "",
        "notes": so.notes or "",
        "override_reason": so.override_reason or "",
        "total_taxable": subtotal,
        "subtotal": subtotal,
        "total_tax": tax,
        "total_gst": tax,
        "grand_total": grand,
        "total_amount": grand,
        "total": grand,
        "items": items_out
    }


def _invoice_to_dict(inv: Invoice) -> dict:
    payments = [
        {"id": p.id, "amount": p.amount, "mode": p.mode, "reference": p.reference or "", "date": p.date, "recorded_by": p.recorded_by}
        for p in inv.payments
    ]
    paid_sum = round(sum(p["amount"] for p in payments), 2)
    bal_due = max(0.0, round(inv.total - paid_sum, 2))
    taxable = inv.taxable_value or 0.0
    total = inv.total or 0.0
    cgst = inv.cgst or 0.0
    sgst = inv.sgst or 0.0
    igst = inv.igst or 0.0

    if (taxable == 0 or total == 0) and inv.order and inv.order.items:
        items_taxable = round(sum(it.qty * it.unit_price * (1.0 - (it.discount_pct / 100.0)) for it in inv.order.items), 2)
        items_tax = round(sum((it.qty * it.unit_price * (1.0 - (it.discount_pct / 100.0))) * (it.gst_rate / 100.0) for it in inv.order.items), 2)
        taxable = items_taxable
        total = round(items_taxable + items_tax, 2)
        is_intra = (inv.place_of_supply or "").strip().lower() in ("haryana", "")
        if is_intra:
            cgst = round(items_tax / 2.0, 2)
            sgst = round(items_tax / 2.0, 2)
            igst = 0.0
        else:
            cgst = 0.0
            sgst = 0.0
            igst = items_tax
        inv.taxable_value = taxable
        inv.cgst = cgst
        inv.sgst = sgst
        inv.igst = igst
        inv.total = total

    return {
        "id": inv.id,
        "invoice_no": inv.invoice_no,
        "order_id": inv.order_id,
        "order_no": inv.order.order_no if inv.order else "",
        "customer_id": inv.customer_id,
        "customer_name": inv.customer.name if inv.customer else "Customer",
        "customer_gstin": inv.customer.gstin if inv.customer else "",
        "customer_state": inv.customer.state if inv.customer else "",
        "customer_city": inv.customer.city if inv.customer else "",
        "date": inv.date,
        "place_of_supply": inv.place_of_supply,
        "taxable_value": taxable,
        "cgst": cgst,
        "sgst": sgst,
        "igst": igst,
        "total": total,
        "status": inv.status,
        "paid_amount": paid_sum,
        "balance_due": max(0.0, round(total - paid_sum, 2)),
        "payments": payments
    }


# ─── Customers API Endpoints ──────────────────────────────────────────

@app.get("/api/customers")
async def get_customers(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """List all active industrial customers with outstanding balances."""
    custs = db.query(Customer).order_by(Customer.name.asc()).all()
    return [_customer_to_dict(c, db) for c in custs]


@app.post("/api/customers")
async def create_customer(
    req: CustomerCreateRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_roles(["admin", "manager"]))
):
    """Onboard a new industrial client (admin/manager)."""
    if not req.name or not req.name.strip():
        raise HTTPException(status_code=400, detail="Customer name is required.")

    c = Customer(
        name=req.name.strip(),
        gstin=req.gstin.strip().upper() if req.gstin else None,
        state=req.state.strip(),
        city=req.city.strip(),
        contact_person=req.contact_person.strip() if req.contact_person else None,
        phone=req.phone.strip() if req.phone else None,
        email=req.email.strip().lower() if req.email else None,
        price_tier=req.price_tier or "Standard",
        credit_limit=req.credit_limit if req.credit_limit is not None else 100000.0,
        credit_days=req.credit_days if req.credit_days is not None else 30,
        is_active=True,
        whatsapp_opt_out=bool(req.whatsapp_opt_out) if req.whatsapp_opt_out is not None else False
    )
    db.add(c)
    db.add(AuditLog(
        timestamp=datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        action="CUSTOMER_CREATED",
        user=current_user["username"],
        target_id=c.name,
        details=f"Onboarded client '{c.name}' in {c.city}, {c.state}. Credit limit: Rs. {c.credit_limit:,.2f}."
    ))
    db.commit()
    db.refresh(c)
    d = _customer_to_dict(c, db)
    return {**d, "customer": d}


@app.get("/api/customers/{customer_id}")
async def get_single_customer(
    customer_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Retrieve detailed customer profile."""
    c = db.query(Customer).filter(Customer.id == customer_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Customer not found.")
    return _customer_to_dict(c, db)


@app.put("/api/customers/{customer_id}")
async def update_customer(
    customer_id: int,
    req: CustomerUpdateRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_roles(["admin", "manager"]))
):
    """Update customer details & credit terms (admin/manager)."""
    c = db.query(Customer).filter(Customer.id == customer_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Customer not found.")

    changes = []
    for field in ["name", "gstin", "state", "city", "contact_person", "phone", "email", "price_tier", "credit_limit", "credit_days", "is_active", "whatsapp_opt_out"]:
        val = getattr(req, field)
        if val is not None:
            old = getattr(c, field)
            setattr(c, field, val)
            changes.append(f"{field}: {old} -> {val}")

    db.add(AuditLog(
        timestamp=datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        action="CUSTOMER_UPDATED",
        user=current_user["username"],
        target_id=c.name,
        details=f"Updated customer '{c.name}': {'; '.join(changes[:4])}"
    ))
    db.commit()
    db.refresh(c)
    return {"status": "success", "customer": _customer_to_dict(c, db)}


@app.get("/api/customers/{customer_id}/ledger")
async def get_customer_ledger(
    customer_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Retrieve financial ledger of invoices (debit) and payments (credit) with running balance."""
    c = db.query(Customer).filter(Customer.id == customer_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Customer not found.")

    invoices = db.query(Invoice).filter(Invoice.customer_id == customer_id, Invoice.status != "CANCELLED").all()
    inv_ids = [inv.id for inv in invoices]
    payments = db.query(Payment).filter(Payment.invoice_id.in_(inv_ids)).all() if inv_ids else []

    txns = []
    for inv in invoices:
        txns.append({
            "type": "INVOICE",
            "date": inv.date,
            "ref": inv.invoice_no,
            "reference": inv.invoice_no,
            "details": f"Tax Invoice against order {inv.order.order_no if inv.order else 'Direct'}",
            "debit": inv.total,
            "credit": 0.0,
            "status": inv.status
        })

    for p in payments:
        inv_ref = p.invoice.invoice_no if p.invoice else ""
        txns.append({
            "type": "PAYMENT",
            "date": p.date,
            "ref": p.reference or f"PMT-{p.id}",
            "reference": p.reference or f"PMT-{p.id}",
            "details": f"Payment received via {p.mode} for {inv_ref}",
            "debit": 0.0,
            "credit": p.amount,
            "status": "SETTLED"
        })

    txns.sort(key=lambda x: x["date"])

    running_bal = 0.0
    for t in txns:
        running_bal += t["debit"] - t["credit"]
        t["running_balance"] = round(running_bal, 2)

    outstanding = get_customer_outstanding(customer_id, db)
    return {
        "customer": _customer_to_dict(c, db),
        "credit_limit": c.credit_limit,
        "outstanding": outstanding,
        "outstanding_balance": outstanding,
        "credit_utilization_pct": round(outstanding / c.credit_limit * 100, 1) if c.credit_limit > 0 else 0.0,
        "transactions": txns
    }


# ─── Sales Orders & Quotations Endpoints ──────────────────────────────

@app.get("/api/sales/orders")
async def get_sales_orders(
    status: Optional[str] = None,
    customer_id: Optional[int] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """List quotations and sales orders. Shows line margins to manager/admin only."""
    is_priv = current_user.get("role") in ("admin", "manager")
    q = db.query(SalesOrder).order_by(SalesOrder.id.desc())
    if status and status != "all":
        q = q.filter(SalesOrder.status == status.upper())
    if customer_id:
        q = q.filter(SalesOrder.customer_id == customer_id)
    if search:
        s_fmt = f"%{search.lower()}%"
        q = q.join(Customer).filter((func.lower(SalesOrder.order_no).like(s_fmt)) | (func.lower(Customer.name).like(s_fmt)))

    orders = q.all()
    return [_sales_order_to_dict(so, is_privileged=is_priv) for so in orders]


@app.get("/api/sales/orders/{order_id}")
async def get_single_sales_order(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Retrieve single sales order details."""
    is_priv = current_user.get("role") in ("admin", "manager")
    so = db.query(SalesOrder).filter(SalesOrder.id == order_id).first()
    if not so:
        raise HTTPException(status_code=404, detail="Sales Order not found.")
    return _sales_order_to_dict(so, is_privileged=is_priv)


@app.post("/api/sales/orders")
async def create_sales_order(
    req: SalesOrderCreateRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_roles(["admin", "manager"]))
):
    """Create a Quotation or Sales Order (admin/manager)."""
    cust = db.query(Customer).filter(Customer.id == req.customer_id).first()
    if not cust:
        raise HTTPException(status_code=400, detail="Customer not found.")

    if not req.items:
        raise HTTPException(status_code=400, detail="Order must include at least one item.")

    if req.is_quote is not None:
        is_quote = bool(req.is_quote)
    elif req.status:
        is_quote = (req.status.upper() == "QUOTE")
    else:
        is_quote = True
    order_no = generate_next_so_no(db, is_quote=is_quote)
    now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    valid_until = req.valid_until
    if not valid_until:
        valid_until = (datetime.date.today() + datetime.timedelta(days=15)).isoformat()

    so = SalesOrder(
        order_no=order_no,
        customer_id=cust.id,
        status="QUOTE" if is_quote else "CONFIRMED",
        created_by=current_user["username"],
        created_at=now_str,
        valid_until=valid_until,
        notes=req.notes
    )
    db.add(so)
    db.flush()

    total_taxable = 0.0
    total_tax = 0.0

    for it_in in req.items:
        inv_item = db.query(Inventory).filter(Inventory.id == it_in.item_id).first()
        if not inv_item:
            raise HTTPException(status_code=400, detail=f"Item ID {it_in.item_id} not found in inventory catalog.")

        price = it_in.unit_price if it_in.unit_price is not None else (inv_item.selling_price or inv_item.unit_price or 0.0)
        disc = it_in.discount_pct or 0.0
        line_taxable = round(it_in.qty * price * (1.0 - (disc / 100.0)), 2)
        gst_pct = getattr(inv_item, "gst_rate", 18.0) or 18.0
        line_tax = round(line_taxable * (gst_pct / 100.0), 2)

        total_taxable += line_taxable
        total_tax += line_tax

        # If created directly as CONFIRMED, check and reserve
        if not is_quote:
            avail = (inv_item.quantity or 0) - (getattr(inv_item, "reserved_qty", 0) or 0)
            if avail < it_in.qty:
                raise HTTPException(
                    status_code=400,
                    detail=f"Insufficient available stock for SKU {inv_item.sku}. Available: {avail}, Requested: {it_in.qty}."
                )
            inv_item.reserved_qty = (inv_item.reserved_qty or 0) + it_in.qty

        so_item = SalesOrderItem(
            order_id=so.id,
            item_id=inv_item.id,
            qty=it_in.qty,
            unit_price=price,
            discount_pct=disc,
            gst_rate=gst_pct,
            dispatched_qty=0
        )
        db.add(so_item)

    so.total_taxable = round(total_taxable, 2)
    so.total_tax = round(total_tax, 2)
    so.grand_total = round(total_taxable + total_tax, 2)

    # If confirming, check credit limit
    if not is_quote:
        curr_out = get_customer_outstanding(cust.id, db)
        if curr_out + so.grand_total > cust.credit_limit:
            raise HTTPException(
                status_code=400,
                detail=f"Customer credit limit exceeded. Limit: Rs. {cust.credit_limit:,.2f}, Total with order: Rs. {curr_out + so.grand_total:,.2f}. Manager override required."
            )

    action = "QUOTE_CREATED" if is_quote else "SO_CREATED"
    db.add(AuditLog(
        timestamp=now_str,
        action=action,
        user=current_user["username"],
        target_id=so.order_no,
        details=f"Raised {'Quotation' if is_quote else 'Sales Order'} {so.order_no} for {cust.name}. Total: Rs. {so.grand_total:,.2f}."
    ))
    db.commit()
    db.refresh(so)
    d = _sales_order_to_dict(so, is_privileged=True)
    return {**d, "order": d}


@app.post("/api/sales/orders/{order_id}/confirm")
async def confirm_sales_order(
    order_id: int,
    req: SalesOrderConfirmRequest = None,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_roles(["admin", "manager"]))
):
    """Confirm quotation into Sales Order: reserves stock & validates credit limit (admin/manager)."""
    so = db.query(SalesOrder).filter(SalesOrder.id == order_id).first()
    if not so:
        raise HTTPException(status_code=404, detail="Sales Order not found.")

    if so.status != "QUOTE":
        raise HTTPException(status_code=400, detail=f"Cannot confirm order in status '{so.status}'. Must be 'QUOTE'.")

    cust = so.customer

    # 1. Check Credit Limit
    curr_out = get_customer_outstanding(cust.id, db)
    total_exposure = curr_out + so.grand_total
    override_reason = req.override_reason if req else None

    if total_exposure > cust.credit_limit:
        if not override_reason or not override_reason.strip():
            raise HTTPException(
                status_code=400,
                detail=f"Credit limit exceeded. Customer credit limit is Rs. {cust.credit_limit:,.2f}, exposure would reach Rs. {total_exposure:,.2f}. Manager override with reason required."
            )
        so.override_reason = override_reason.strip()

    # 2. Check stock availability for all items before reserving
    for line in so.items:
        inv_item = line.item
        avail = (inv_item.quantity or 0) - (getattr(inv_item, "reserved_qty", 0) or 0)
        if avail < line.qty:
            raise HTTPException(
                status_code=400,
                detail=f"Insufficient stock for {inv_item.sku} ({inv_item.name}). Available: {avail}, Ordered: {line.qty}."
            )

    # 3. Reserve stock
    for line in so.items:
        line.item.reserved_qty = (line.item.reserved_qty or 0) + line.qty

    # Keep order_no unchanged (status transitions QUOTE -> CONFIRMED)

    so.status = "CONFIRMED"
    now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    db.add(AuditLog(
        timestamp=now_str,
        action="SO_CONFIRMED",
        user=current_user["username"],
        target_id=so.order_no,
        details=f"Confirmed Sales Order {so.order_no} for {cust.name}. Reserved stock for {len(so.items)} lines. Total: Rs. {so.grand_total:,.2f}." + (f" Override: {so.override_reason}" if so.override_reason else "")
    ))
    db.commit()
    db.refresh(so)
    d = _sales_order_to_dict(so, is_privileged=True)
    return {**d, "order": d}


@app.post("/api/sales/orders/{order_id}/dispatch")
async def dispatch_sales_order(
    order_id: int,
    req: SalesOrderDispatchRequest = None,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_roles(["admin", "manager", "storekeeper"]))
):
    """Dispatch goods from store (storekeeper/manager/admin). Creates OUT stock movement and updates reserved qty."""
    so = db.query(SalesOrder).filter(SalesOrder.id == order_id).first()
    if not so:
        raise HTTPException(status_code=404, detail="Sales Order not found.")

    if so.status not in ("CONFIRMED", "PARTIALLY_DISPATCHED"):
        raise HTTPException(status_code=400, detail=f"Cannot dispatch order in '{so.status}' status. Must be CONFIRMED or PARTIALLY_DISPATCHED.")

    now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")
    now_full = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    # Map requested dispatch qtys
    req_map = {}
    if req and req.items:
        for it in req.items:
            req_map[it.get("item_id")] = it.get("dispatch_qty", 0)

    total_dispatched_this_batch = 0

    for line in so.items:
        remaining = line.qty - (line.dispatched_qty or 0)
        if remaining <= 0:
            continue

        disp_qty = req_map.get(line.item_id, remaining)
        disp_qty = min(disp_qty, remaining)

        if disp_qty > 0:
            inv_item = line.item
            if inv_item.quantity < disp_qty:
                raise HTTPException(status_code=400, detail=f"Insufficient physical quantity for {inv_item.sku}. On hand: {inv_item.quantity}, dispatch requested: {disp_qty}.")

            line.dispatched_qty = (line.dispatched_qty or 0) + disp_qty
            inv_item.quantity = max(0, inv_item.quantity - disp_qty)
            inv_item.reserved_qty = max(0, (inv_item.reserved_qty or 0) - disp_qty)
            inv_item.last_updated = datetime.datetime.now().isoformat()

            # Record official stock movement
            mov = StockMovement(
                item_id=inv_item.id,
                type="OUT",
                quantity=disp_qty,
                reference=f"DISPATCH-{so.order_no}",
                party=so.customer.name,
                performed_by=current_user["username"],
                timestamp=now_str,
                balance_after=inv_item.quantity
            )
            db.add(mov)
            total_dispatched_this_batch += disp_qty

    if total_dispatched_this_batch == 0:
        raise HTTPException(status_code=400, detail="No quantities were eligible for dispatch.")

    # Check if fully dispatched
    all_done = all(line.dispatched_qty >= line.qty for line in so.items)
    so.status = "DISPATCHED" if all_done else "PARTIALLY_DISPATCHED"

    db.add(AuditLog(
        timestamp=now_full,
        action="SO_DISPATCHED",
        user=current_user["username"],
        target_id=so.order_no,
        details=f"Dispatched {total_dispatched_this_batch} units for {so.order_no} to {so.customer.name}. New status: {so.status}."
    ))
    db.commit()
    db.refresh(so)
    d = _sales_order_to_dict(so, is_privileged=True)
    return {**d, "order": d}


@app.post("/api/sales/orders/{order_id}/invoice")
async def invoice_sales_order(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_roles(["admin", "manager"]))
):
    """Generate GST Tax Invoice from Sales Order (admin/manager)."""
    so = db.query(SalesOrder).filter(SalesOrder.id == order_id).first()
    if not so:
        raise HTTPException(status_code=404, detail="Sales Order not found.")

    if so.status not in ("CONFIRMED", "PARTIALLY_DISPATCHED", "DISPATCHED"):
        raise HTTPException(status_code=400, detail=f"Cannot invoice order in status '{so.status}'.")

    # Check for existing invoice
    existing_inv = db.query(Invoice).filter(Invoice.order_id == so.id, Invoice.status != "CANCELLED").first()
    if existing_inv:
        return {"status": "success", "invoice": _invoice_to_dict(existing_inv), "message": "Invoice already exists."}

    company_state = os.getenv("COMPANY_STATE", "Haryana").strip().lower()
    cust_state = (so.customer.state or "").strip().lower()
    is_intra = (cust_state == company_state)

    cgst_val = round(so.total_tax / 2.0, 2) if is_intra else 0.0
    sgst_val = round(so.total_tax / 2.0, 2) if is_intra else 0.0
    igst_val = round(so.total_tax, 2) if not is_intra else 0.0

    inv_no = generate_next_invoice_no(db)
    now_d = datetime.date.today().isoformat()
    now_full = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    inv = Invoice(
        invoice_no=inv_no,
        order_id=so.id,
        customer_id=so.customer_id,
        date=now_d,
        place_of_supply=so.customer.state,
        taxable_value=so.total_taxable,
        cgst=cgst_val,
        sgst=sgst_val,
        igst=igst_val,
        total=so.grand_total,
        status="UNPAID"
    )
    db.add(inv)

    if so.status == "DISPATCHED":
        so.status = "INVOICED"

    db.add(AuditLog(
        timestamp=now_full,
        action="INVOICE_CREATED",
        user=current_user["username"],
        target_id=inv.invoice_no,
        details=f"Generated Tax Invoice {inv.invoice_no} for order {so.order_no} ({so.customer.name}). Total: Rs. {inv.total:,.2f}."
    ))
    db.commit()
    db.refresh(inv)
    d = _invoice_to_dict(inv)
    return {**d, "invoice": d}


@app.post("/api/sales/orders/{order_id}/cancel")
async def cancel_sales_order(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_roles(["admin", "manager"]))
):
    """Cancel sales order and release any reserved stock (admin/manager)."""
    so = db.query(SalesOrder).filter(SalesOrder.id == order_id).first()
    if not so:
        raise HTTPException(status_code=404, detail="Sales Order not found.")

    if so.status in ("DISPATCHED", "INVOICED"):
        raise HTTPException(status_code=400, detail="Cannot cancel an order that has already been dispatched or invoiced.")

    # Release any reserved stock
    if so.status in ("CONFIRMED", "PARTIALLY_DISPATCHED"):
        for line in so.items:
            unreleased = max(0, line.qty - (line.dispatched_qty or 0))
            if unreleased > 0:
                line.item.reserved_qty = max(0, (line.item.reserved_qty or 0) - unreleased)

    so.status = "CANCELLED"
    now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    db.add(AuditLog(
        timestamp=now_str,
        action="SO_CANCELLED",
        user=current_user["username"],
        target_id=so.order_no,
        details=f"Cancelled Sales Order {so.order_no} for {so.customer.name}. Released reserved inventory."
    ))
    db.commit()
    db.refresh(so)
    d = _sales_order_to_dict(so, is_privileged=True)
    return {**d, "order": d}


@app.get("/api/sales/orders/{order_id}/quote-pdf")
async def download_quote_pdf(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Generate and stream formal quotation PDF."""
    so = db.query(SalesOrder).filter(SalesOrder.id == order_id).first()
    if not so:
        raise HTTPException(status_code=404, detail="Sales Order not found.")

    order_dict = _sales_order_to_dict(so, is_privileged=False)
    order_dict["customer"] = {
        "name": so.customer.name,
        "gstin": so.customer.gstin,
        "city": so.customer.city,
        "state": so.customer.state,
        "contact_person": so.customer.contact_person,
        "phone": so.customer.phone
    }
    pdf_bytes = generate_quotation_pdf(order_dict)
    filename = f"{so.order_no}_Quotation.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{filename}"'}
    )


# ─── Invoices & Payments Endpoints ────────────────────────────────────

@app.get("/api/invoices")
async def get_invoices(
    status: Optional[str] = None,
    customer_id: Optional[int] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """List Tax Invoices with payment balance status."""
    q = db.query(Invoice).order_by(Invoice.id.desc())
    if status and status != "all":
        q = q.filter(Invoice.status == status.upper())
    if customer_id:
        q = q.filter(Invoice.customer_id == customer_id)
    if search:
        s_fmt = f"%{search.lower()}%"
        q = q.join(Customer).filter((func.lower(Invoice.invoice_no).like(s_fmt)) | (func.lower(Customer.name).like(s_fmt)))

    invs = q.all()
    return [_invoice_to_dict(inv) for inv in invs]


@app.get("/api/invoices/{invoice_id}")
async def get_single_invoice(
    invoice_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Retrieve single invoice details and payment history."""
    inv = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found.")
    return _invoice_to_dict(inv)


@app.post("/api/invoices/{invoice_id}/payments")
async def record_invoice_payment(
    invoice_id: int,
    req: PaymentCreateRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_roles(["admin", "manager"]))
):
    """Record customer payment against Tax Invoice (admin/manager)."""
    inv = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found.")

    if req.amount <= 0:
        raise HTTPException(status_code=400, detail="Payment amount must be greater than zero.")

    now_d = req.date or datetime.date.today().isoformat()
    now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    pmt = Payment(
        invoice_id=inv.id,
        amount=round(req.amount, 2),
        mode=req.mode or "NEFT/RTGS",
        reference=req.reference,
        date=now_d,
        recorded_by=current_user["username"]
    )
    db.add(pmt)
    db.flush()

    total_paid = sum(p.amount for p in inv.payments)
    if total_paid >= inv.total:
        inv.status = "PAID"
    elif total_paid > 0:
        inv.status = "PARTIALLY_PAID"

    db.add(AuditLog(
        timestamp=now_str,
        action="PAYMENT_RECORDED",
        user=current_user["username"],
        target_id=inv.invoice_no,
        details=f"Recorded Rs. {req.amount:,.2f} payment via {pmt.mode} for {inv.invoice_no} ({inv.customer.name}). Ref: {pmt.reference or 'N/A'}. New status: {inv.status}."
    ))
    db.commit()
    db.refresh(inv)
    return {"status": "success", "invoice": _invoice_to_dict(inv)}


@app.get("/api/invoices/{invoice_id}/pdf")
async def download_invoice_pdf(
    invoice_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Generate and stream Indian GST Tax Invoice PDF with Anishka letterhead."""
    inv = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found.")

    inv_dict = _invoice_to_dict(inv)
    inv_dict["customer"] = {
        "name": inv.customer.name,
        "gstin": inv.customer.gstin,
        "city": inv.customer.city,
        "state": inv.customer.state,
        "contact_person": inv.customer.contact_person,
        "phone": inv.customer.phone
    }
    items_list = []
    if inv.order and inv.order.items:
        for it in inv.order.items:
            item_obj = it.item
            line_taxable = round(it.qty * it.unit_price * (1.0 - (it.discount_pct / 100.0)), 2)
            gst_pct = getattr(item_obj, "gst_rate", 18.0) or 18.0
            items_list.append({
                "sku": item_obj.sku if item_obj else "",
                "name": item_obj.name if item_obj else "Welding Spare",
                "hsn_code": getattr(item_obj, "hsn_code", "8466"),
                "qty": it.qty,
                "unit": item_obj.unit if item_obj else "pcs",
                "unit_price": it.unit_price,
                "taxable": line_taxable,
                "gst_rate": gst_pct,
                "total": round(line_taxable * (1 + gst_pct / 100.0), 2)
            })
    inv_dict["items"] = items_list

    pdf_bytes = generate_tax_invoice_pdf(inv_dict)
    clean_no = inv.invoice_no.replace("/", "-")
    filename = f"{clean_no}_Tax_Invoice.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{filename}"'}
    )


# ─── SALES OPPORTUNITIES & WHATSAPP COMMUNICATIONS API ───────────────────────

@app.get("/api/sales/opportunities")
async def get_sales_opportunities(
    window_days: Optional[int] = 14,
    confidence: Optional[str] = None,
    stock_status: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """
    Computes and returns predictive re-order opportunities for industrial welding customers.
    Filters by window_days (7, 14, 30, -1 for overdue, None for all), confidence level, or stock coverage.
    """
    return compute_sales_opportunities(
        db=db,
        window_days=window_days,
        confidence_filter=confidence,
        stock_status_filter=stock_status
    )


@app.post("/api/sales/opportunities/{opp_id}/quote")
async def create_quote_from_opportunity(
    opp_id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_roles(["admin", "manager"]))
):
    """
    Converts an identified predictive re-order opportunity into a formal sales quotation (status=QUOTE).
    """
    opp_data = compute_sales_opportunities(db=db, window_days=None)
    target_opp = next((o for o in opp_data["opportunities"] if o["id"] == opp_id), None)
    if not target_opp:
        raise HTTPException(status_code=404, detail="Opportunity not found.")

    count = db.query(SalesOrder).count() + 1
    order_no = f"ANI-QT-{datetime.date.today().year}-{count:04d}"

    so = SalesOrder(
        order_no=order_no,
        customer_id=target_opp["customer_id"],
        status="QUOTE",
        created_by=current_user.get("username", "manager"),
        created_at=datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        valid_until=(datetime.date.today() + datetime.timedelta(days=15)).isoformat(),
        notes=f"Auto-generated quotation from predictive cadence opportunity {opp_id}. Cadence: {target_opp['cadence_days']}d.",
        total_taxable=target_opp["taxable_value"],
        total_tax=target_opp["gst_amount"],
        grand_total=target_opp["expected_value"]
    )
    db.add(so)
    db.flush()

    soi = SalesOrderItem(
        order_id=so.id,
        item_id=target_opp["item_id"],
        qty=target_opp["usual_qty"],
        unit_price=target_opp["unit_price"],
        discount_pct=0.0,
        gst_rate=target_opp["gst_rate"]
    )
    db.add(soi)

    db.add(AuditLog(
        timestamp=datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        action="SALES_QUOTE_CREATED_FROM_OPPORTUNITY",
        user=current_user["username"],
        target_id=order_no,
        details=f"Created quotation {order_no} for customer '{target_opp['customer_name']}' from opportunity {opp_id} (value: Rs. {target_opp['expected_value']:,.2f})."
    ))
    db.commit()
    db.refresh(so)
    return _sales_order_to_dict(so, is_privileged=True)


@app.get("/api/sales/funnel")
async def get_sales_funnel_metrics(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """
    Returns end-to-end sales opportunity funnel metrics:
    Opportunities Identified -> Messages Sent -> Quotes Created -> Orders Won.
    """
    return compute_sales_funnel(db)


@app.post("/api/communications/whatsapp/preview")
async def preview_whatsapp_message(
    req: WhatsAppPreviewRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """
    Renders an editable WhatsApp message preview in English or Hindi,
    returns recipient details, opt-out status, and wa.me deep-link.
    """
    context = {}
    phone = ""
    opted_out = False

    if req.template_type == "opportunity":
        opp_data = compute_sales_opportunities(db=db, window_days=None)
        target = next((o for o in opp_data["opportunities"] if o["id"] == req.ref_id), None)
        if target:
            context = target
            phone = target["customer_phone"]
            opted_out = target.get("whatsapp_opt_out", False)
        elif req.customer_id:
            c = db.query(Customer).filter(Customer.id == req.customer_id).first()
            if c:
                context = {"customer_name": c.name, "contact_person": c.contact_person}
                phone = c.phone or ""
                opted_out = getattr(c, "whatsapp_opt_out", False)

    elif req.template_type == "po":
        po = db.query(Procurement).filter(
            (Procurement.po_number == req.ref_id) | (Procurement.id == req.ref_id)
        ).first()
        if not po:
            raise HTTPException(status_code=404, detail="Purchase order not found.")
        sup = getattr(po, "supplier", None) or db.query(Vendor).filter(Vendor.id == po.supplier_id).first()
        sup_name = sup.name if sup else (po.supplier_id or "Valued Supplier")
        phone = sup.phone if sup else ""
        item_count = len(po.items) if getattr(po, "items", None) else 1
        grand_total = getattr(po, "total_value", 0.0) or 0.0
        delivery_date = getattr(po, "expected_date", None) or (po.created_at[:10] if po.created_at else "3 Days")
        context = {
            "supplier_name": sup_name,
            "po_no": po.po_number,
            "item_count": item_count,
            "grand_total": grand_total,
            "delivery_date": delivery_date
        }

    clean_phone = clean_whatsapp_phone(phone)
    msg_text = req.custom_text if req.custom_text else get_whatsapp_template(req.template_type, context, lang=req.lang or "en")
    wa_link = build_whatsapp_link(clean_phone, msg_text) if clean_phone else ""

    return {
        "status": "success",
        "template_type": req.template_type,
        "ref_id": req.ref_id,
        "lang": req.lang or "en",
        "recipient_phone": clean_phone,
        "opted_out": opted_out,
        "message": msg_text,
        "wa_link": wa_link
    }


@app.post("/api/communications/whatsapp/send")
async def send_whatsapp_message_api(
    req: WhatsAppSendRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_roles(["admin", "manager", "storekeeper"]))
):
    """
    Sends or simulates dispatching a WhatsApp message (English/Hindi).
    Enforces customer opt-out policy and logs transaction in Outbox with sender identity.
    """
    res = send_or_simulate_whatsapp_message(
        db=db,
        recipient_phone=req.phone,
        message_text=req.message,
        sender=current_user.get("username", "system"),
        ref_type=req.template_type.upper(),
        ref_id=req.ref_id,
        customer_id=req.customer_id,
        supplier_id=req.supplier_id,
        lang=req.lang or "en"
    )
    if res.get("status") == "opted_out":
        raise HTTPException(status_code=400, detail=res["message"])
    if res.get("status") == "error":
        raise HTTPException(status_code=400, detail=res["message"])
    return res


@app.put("/api/customers/{customer_id}/whatsapp-opt")
async def update_customer_whatsapp_opt(
    customer_id: int,
    req: CustomerOptOutRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_roles(["admin", "manager"]))
):
    """Update customer's WhatsApp messaging consent/opt-out status."""
    cust = db.query(Customer).filter(Customer.id == customer_id).first()
    if not cust:
        raise HTTPException(status_code=404, detail="Customer not found.")
    cust.whatsapp_opt_out = bool(req.opt_out)
    db.add(AuditLog(
        timestamp=datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        action="CUSTOMER_WHATSAPP_OPT_CHANGED",
        user=current_user["username"],
        target_id=cust.name,
        details=f"Customer '{cust.name}' WhatsApp opt_out set to {req.opt_out}."
    ))
    db.commit()
    db.refresh(cust)
    return {
        "status": "success",
        "customer_id": cust.id,
        "customer_name": cust.name,
        "whatsapp_opt_out": cust.whatsapp_opt_out,
        "message": "Opt-out status updated successfully."
    }


# ===========================================================================
# BUSINESS REPORTS (GST, TALLY VOUCHERS, OWNER SUMMARY)
# ===========================================================================

class TallySettingsUpdateRequest(BaseModel):
    tally_company_name: Optional[str] = None
    tally_sales_ledger: Optional[str] = None
    tally_purchase_ledger: Optional[str] = None
    tally_output_cgst_ledger: Optional[str] = None
    tally_output_sgst_ledger: Optional[str] = None
    tally_output_igst_ledger: Optional[str] = None
    tally_input_cgst_ledger: Optional[str] = None
    tally_input_sgst_ledger: Optional[str] = None
    tally_input_igst_ledger: Optional[str] = None
    tally_round_off_ledger: Optional[str] = None
    tally_cash_ledger: Optional[str] = None
    tally_bank_ledger: Optional[str] = None


class OwnerSummaryDispatchRequest(BaseModel):
    recipient_email: Optional[str] = None
    from_date: Optional[str] = None
    to_date: Optional[str] = None


@app.get("/api/reports/gst/sales-register")
async def get_gst_sales_register_api(
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    month: Optional[str] = None,
    format: str = "json",
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_roles(["admin", "manager"]))
):
    """GST Sales Register listing all invoices, customer GSTIN, POS, and tax breakdown."""
    if format.lower() == "csv":
        csv_data = export_sales_register_csv(db=db, from_date=from_date, to_date=to_date, month=month)
        fname = f"GST_Sales_Register_{month or (from_date + '_' + to_date if from_date and to_date else 'all')}.csv"
        return Response(content=csv_data, media_type="text/csv", headers={"Content-Disposition": f'attachment; filename="{fname}"'})
    return get_gst_sales_register(db=db, from_date=from_date, to_date=to_date, month=month)


@app.get("/api/reports/gst/purchase-register")
async def get_gst_purchase_register_api(
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    month: Optional[str] = None,
    format: str = "json",
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_roles(["admin", "manager"]))
):
    """GST Purchase Register listing all supplier purchase orders and tax breakdown."""
    if format.lower() == "csv":
        csv_data = export_purchase_register_csv(db=db, from_date=from_date, to_date=to_date, month=month)
        fname = f"GST_Purchase_Register_{month or (from_date + '_' + to_date if from_date and to_date else 'all')}.csv"
        return Response(content=csv_data, media_type="text/csv", headers={"Content-Disposition": f'attachment; filename="{fname}"'})
    return get_gst_purchase_register(db=db, from_date=from_date, to_date=to_date, month=month)


@app.get("/api/reports/gst/gstr1")
async def get_gstr1_summary_api(
    month: Optional[str] = None,
    format: str = "json",
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_roles(["admin", "manager"]))
):
    """GSTR-1 B2B and B2C summary for chosen month, exportable to official offline CSV format."""
    chosen_month = month or datetime.date.today().strftime("%Y-%m")
    if format.lower() == "b2b_csv":
        csv_data = export_gstr1_b2b_csv(db=db, month=chosen_month)
        return Response(content=csv_data, media_type="text/csv", headers={"Content-Disposition": f'attachment; filename="GSTR1_B2B_{chosen_month}.csv"'})
    elif format.lower() == "b2c_csv":
        csv_data = export_gstr1_b2c_csv(db=db, month=chosen_month)
        return Response(content=csv_data, media_type="text/csv", headers={"Content-Disposition": f'attachment; filename="GSTR1_B2CS_{chosen_month}.csv"'})
    return get_gstr1_summary(db=db, month=chosen_month)


@app.get("/api/reports/gst/hsn-summary")
async def get_hsn_summary_api(
    month: Optional[str] = None,
    format: str = "json",
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_roles(["admin", "manager"]))
):
    """HSN-wise sales summary for chosen month, exportable to CSV."""
    chosen_month = month or datetime.date.today().strftime("%Y-%m")
    if format.lower() == "csv":
        csv_data = export_hsn_summary_csv(db=db, month=chosen_month)
        return Response(content=csv_data, media_type="text/csv", headers={"Content-Disposition": f'attachment; filename="GST_HSN_Summary_{chosen_month}.csv"'})
    return get_hsn_summary(db=db, month=chosen_month)


@app.get("/api/reports/tally/settings")
async def get_tally_settings_api(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_roles(["admin", "manager"]))
):
    """Retrieve Tally ledger mappings."""
    return get_tally_ledger_settings(db)


@app.post("/api/reports/tally/settings")
async def update_tally_settings_api(
    req: TallySettingsUpdateRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_roles(["admin", "manager"]))
):
    """Update Tally ledger configurations."""
    update_data = {k: v for k, v in req.model_dump().items() if v is not None}
    updated = save_tally_ledger_settings(db=db, settings=update_data, username=current_user["username"])
    db.add(AuditLog(
        timestamp=datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        action="TALLY_SETTINGS_UPDATED",
        user=current_user["username"],
        target_id="Tally",
        details="Updated Tally ledger mappings in AppSettings."
    ))
    db.commit()
    return updated


@app.get("/api/reports/tally/vouchers")
async def get_tally_vouchers_api(
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    type: str = "both",
    format: str = "xml",
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_roles(["admin", "manager"]))
):
    """Export Sales and Purchase vouchers in Tally XML or CSV format."""
    v_type = type.lower() if type.lower() in ("sales", "purchase", "both") else "both"
    period_tag = f"{from_date or 'start'}_to_{to_date or 'today'}"

    if format.lower() == "csv":
        csv_data = generate_tally_csv_vouchers(db=db, from_date=from_date, to_date=to_date, voucher_type=v_type)
        return Response(
            content=csv_data,
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="Tally_Vouchers_{v_type}_{period_tag}.csv"'}
        )

    xml_data = generate_tally_xml_vouchers(db=db, from_date=from_date, to_date=to_date, voucher_type=v_type)
    return Response(
        content=xml_data,
        media_type="application/xml",
        headers={"Content-Disposition": f'attachment; filename="Tally_Vouchers_{v_type}_{period_tag}.xml"'}
    )


@app.get("/api/reports/owner-summary")
async def get_owner_summary_api(
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_roles(["admin", "manager"]))
):
    """
    Weekly business summary for business owner.
    Computes all numbers in verified code; LLM synthesizes narrative only.
    """
    metrics = compute_owner_summary_metrics(db=db, from_date=from_date, to_date=to_date)
    narrative = generate_owner_summary_narrative(metrics)
    return {
        "period": metrics["period"],
        "metrics": metrics,
        "narrative": narrative,
        "disclaimer": STATUTORY_GST_NOTICE
    }


@app.get("/api/reports/owner-summary/pdf")
async def get_owner_summary_pdf_api(
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_roles(["admin", "manager"]))
):
    """Delivers executive business summary as a high-resolution PDF document."""
    metrics = compute_owner_summary_metrics(db=db, from_date=from_date, to_date=to_date)
    narrative = generate_owner_summary_narrative(metrics)
    pdf_bytes = generate_owner_summary_pdf(metrics=metrics, narrative=narrative)
    fname = f"Executive_Weekly_Summary_{datetime.date.today().strftime('%Y%m%d')}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'}
    )


@app.post("/api/reports/owner-summary/dispatch")
async def dispatch_owner_summary_api(
    req: OwnerSummaryDispatchRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_roles(["admin", "manager"]))
):
    """Dispatches executive owner summary to Outbox for delivery."""
    metrics = compute_owner_summary_metrics(db=db, from_date=req.from_date, to_date=req.to_date)
    narrative = generate_owner_summary_narrative(metrics)
    res = dispatch_owner_summary_outbox(
        db=db,
        metrics=metrics,
        narrative=narrative,
        recipient_email=req.recipient_email,
        sender=current_user["username"]
    )
    db.add(AuditLog(
        timestamp=datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        action="OWNER_SUMMARY_DISPATCHED",
        user=current_user["username"],
        target_id=res["recipient_email"],
        details=f"Dispatched Weekly Executive Summary ({metrics['period']['from_date']} to {metrics['period']['to_date']}) to Outbox."
    ))
    db.commit()
    return res


# =============================================================================
# PILOT READINESS MODULES: SECURITY, USER MANAGEMENT, IMPORT WIZARD, BACKUP
# =============================================================================

# --- Pydantic Models ---

class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str

class CreateUserRequest(BaseModel):
    username: str
    role: str
    full_name: Optional[str] = None
    password: str
    must_change_password: Optional[bool] = True

class UpdateUserRequest(BaseModel):
    role: Optional[str] = None
    full_name: Optional[str] = None
    is_active: Optional[bool] = None
    new_password: Optional[str] = None
    must_change_password: Optional[bool] = None

class ImportCommitPayload(BaseModel):
    import_type: str
    filename: str
    rows: list = []

class BackupCreatePayload(BaseModel):
    tag: Optional[str] = "manual"
    retention_days: Optional[int] = 14

class BackupRestorePayload(BaseModel):
    filename: str
    force: Optional[bool] = False


# --- 1. Password Management & Security Endpoints ---

@app.post("/api/auth/change-password")
async def api_change_password(
    req: ChangePasswordRequest,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Change password for the currently logged-in user with complexity validation."""
    username = current_user["username"]
    user = db.query(UserRole).filter(UserRole.username == username).first()

    # If user record doesn't exist yet (e.g. legacy seed account), create it now
    if not user:
        valid_defaults = {"admin": "admin@2026", "manager": "manager@2026", "storekeeper": "storekeeper@2026"}
        if username in valid_defaults and req.old_password == valid_defaults[username]:
            user = UserRole(
                username=username,
                password=hash_password(valid_defaults[username]),
                role=current_user.get("role", username),
                full_name=current_user.get("full_name", username),
                created_at=datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            )
            db.add(user)
            db.commit()
            db.refresh(user)
        else:
            raise HTTPException(status_code=400, detail="Invalid current password.")

    if not verify_password(req.old_password, user.password):
        raise HTTPException(status_code=400, detail="Current password does not match.")

    # Validate complexity
    is_valid, msg = validate_password_complexity(req.new_password)
    if not is_valid:
        raise HTTPException(status_code=422, detail=msg)

    # Hash new password with Argon2/bcrypt
    user.password = hash_password(req.new_password)
    user.must_change_password = False
    
    db.add(AuditLog(
        timestamp=datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        action="PASSWORD_CHANGED",
        user=username,
        target_id=username,
        details="User successfully changed password."
    ))
    db.commit()

    return {"status": "success", "message": "Password updated successfully."}


# --- 2. User Management Endpoints (Admin Only) ---

@app.get("/api/users", dependencies=[Depends(require_roles(["admin"]))])
async def api_list_users(db: Session = Depends(get_db)):
    """List all registered users (passwords omitted)."""
    users = db.query(UserRole).order_by(UserRole.id.asc()).all()
    res = []
    for u in users:
        res.append({
            "id": u.id,
            "username": u.username,
            "role": u.role,
            "full_name": u.full_name or u.username,
            "is_active": getattr(u, "is_active", True),
            "must_change_password": getattr(u, "must_change_password", False),
            "created_at": u.created_at,
            "last_login": getattr(u, "last_login", None)
        })
    return res


@app.post("/api/users", dependencies=[Depends(require_roles(["admin"]))])
async def api_create_user(
    req: CreateUserRequest,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a new user with role and Argon2/bcrypt password hashing."""
    if req.role not in ("admin", "manager", "storekeeper"):
        raise HTTPException(status_code=400, detail="Invalid role. Must be 'admin', 'manager', or 'storekeeper'.")

    clean_uname = req.username.strip().lower()
    existing = db.query(UserRole).filter(UserRole.username == clean_uname).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Username '{clean_uname}' already exists.")

    new_user = UserRole(
        username=clean_uname,
        password=hash_password(req.password),
        role=req.role,
        full_name=req.full_name or clean_uname.title(),
        created_at=datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        must_change_password=bool(req.must_change_password),
        is_active=True
    )
    db.add(new_user)
    db.add(AuditLog(
        timestamp=datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        action="USER_CREATED",
        user=current_user["username"],
        target_id=clean_uname,
        details=f"Created user {clean_uname} with role {req.role}."
    ))
    db.commit()
    db.refresh(new_user)

    return {
        "status": "success",
        "id": new_user.id,
        "username": new_user.username,
        "role": new_user.role,
        "full_name": new_user.full_name,
        "must_change_password": new_user.must_change_password
    }


@app.put("/api/users/{user_id}", dependencies=[Depends(require_roles(["admin"]))])
async def api_update_user(
    user_id: int,
    req: UpdateUserRequest,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update user role, full name, active status, or reset password."""
    user = db.query(UserRole).filter(UserRole.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    if req.role:
        if req.role not in ("admin", "manager", "storekeeper"):
            raise HTTPException(status_code=400, detail="Invalid role.")
        user.role = req.role

    if req.full_name is not None:
        user.full_name = req.full_name

    if req.is_active is not None:
        # Prevent self-deactivation
        if user.username == current_user["username"] and not req.is_active:
            raise HTTPException(status_code=400, detail="You cannot deactivate your own account.")
        user.is_active = req.is_active

    if req.new_password:
        user.password = hash_password(req.new_password)
        user.must_change_password = True

    if req.must_change_password is not None:
        user.must_change_password = req.must_change_password

    db.add(AuditLog(
        timestamp=datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        action="USER_UPDATED",
        user=current_user["username"],
        target_id=user.username,
        details=f"Updated settings for user {user.username}."
    ))
    db.commit()

    return {
        "status": "success",
        "id": user.id,
        "username": user.username,
        "role": user.role,
        "full_name": user.full_name,
        "is_active": user.is_active,
        "must_change_password": user.must_change_password
    }


@app.delete("/api/users/{user_id}", dependencies=[Depends(require_roles(["admin"]))])
async def api_delete_user(
    user_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Deactivate user account (soft delete for audit integrity)."""
    user = db.query(UserRole).filter(UserRole.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    if user.username == current_user["username"]:
        raise HTTPException(status_code=400, detail="You cannot delete your own account.")

    user.is_active = False
    db.add(AuditLog(
        timestamp=datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        action="USER_DEACTIVATED",
        user=current_user["username"],
        target_id=user.username,
        details=f"Deactivated account {user.username}."
    ))
    db.commit()

    return {"status": "success", "message": f"User {user.username} deactivated."}


# --- 3. Data Import Wizard Endpoints (Admin & Manager) ---

@app.get("/api/import/template")
async def api_download_import_template(
    type: str = "items",
    format: str = "csv"
):
    """Download pre-populated sample templates for Items, Suppliers, or Opening Stock."""
    if type not in ("items", "suppliers", "opening_stock"):
        raise HTTPException(status_code=400, detail="Invalid import type. Allowed: items, suppliers, opening_stock.")

    content, filename, media_type = generate_template(type, format)
    return Response(
        content=content,
        media_type=media_type,
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@app.post("/api/import/preview", dependencies=[Depends(require_roles(["admin", "manager"]))])
async def api_import_preview(
    file: UploadFile = File(...),
    import_type: str = Form("items"),
    column_mapping: Optional[str] = Form(None),
    db: Session = Depends(get_db)
):
    """Upload and validate dataset row-by-row before committing."""
    if import_type not in ("items", "suppliers", "opening_stock"):
        raise HTTPException(status_code=400, detail="Invalid import type.")

    file_bytes = await file.read()
    if len(file_bytes) == 0:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    try:
        df = parse_file_to_dataframe(file_bytes, file.filename)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to read file: {e}")

    parsed_mapping = None
    if column_mapping:
        try:
            parsed_mapping = json.loads(column_mapping)
        except Exception:
            pass

    validation = validate_import_data(df, import_type, parsed_mapping, db)
    validation["filename"] = file.filename
    return validation


@app.post("/api/import/commit", dependencies=[Depends(require_roles(["admin", "manager"]))])
async def api_import_commit(
    payload: ImportCommitPayload,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Commit validated import rows with an undo-able batch ID."""
    if payload.import_type not in ("items", "suppliers", "opening_stock"):
        raise HTTPException(status_code=400, detail="Invalid import type.")

    if not payload.rows:
        raise HTTPException(status_code=400, detail="No rows provided for commit.")

    try:
        result = commit_import_batch(
            validated_rows=payload.rows,
            import_type=payload.import_type,
            filename=payload.filename,
            username=current_user["username"],
            db=db
        )
        return result
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Import failed during commit: {e}")


@app.post("/api/import/rollback/{batch_id}", dependencies=[Depends(require_roles(["admin"]))])
async def api_import_rollback(
    batch_id: str,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Roll back a committed import batch and restore previous inventory levels."""
    try:
        res = rollback_import_batch(batch_id, current_user["username"], db)
        return res
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Rollback failed: {e}")


@app.get("/api/import/batches", dependencies=[Depends(require_roles(["admin", "manager"]))])
async def api_list_import_batches(db: Session = Depends(get_db)):
    """List historical import batches for management."""
    return list_import_batches(db)


# --- 4. Backup & Disaster Recovery Endpoints (Admin Only) ---

@app.get("/api/backup/list", dependencies=[Depends(require_roles(["admin"]))])
async def api_list_backups():
    """List all available database backup archives."""
    return list_backups()


@app.post("/api/backup/create", dependencies=[Depends(require_roles(["admin"]))])
async def api_create_backup(
    payload: BackupCreatePayload = BackupCreatePayload(),
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Trigger an immediate database backup archive."""
    try:
        res = create_backup(tag=payload.tag or "manual", retention_days=payload.retention_days or 14)
        db.add(AuditLog(
            timestamp=datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            action="BACKUP_CREATED",
            user=current_user["username"],
            target_id=res["filename"],
            details=f"Created {res['db_type']} backup {res['filename']} ({res['size_kb']} KB)."
        ))
        db.commit()
        return res
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Backup generation failed: {e}")


@app.get("/api/backup/download/{filename}", dependencies=[Depends(require_roles(["admin"]))])
async def api_download_backup(filename: str):
    """Download a specific backup file."""
    safe_name = os.path.basename(filename)
    path = os.path.join(BACKUP_DIR, safe_name)
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Backup file not found.")

    media_type = "application/x-sqlite3" if safe_name.endswith(".db") else "text/plain"
    return FileResponse(path, filename=safe_name, media_type=media_type)


@app.post("/api/backup/restore", dependencies=[Depends(require_roles(["admin"]))])
async def api_restore_backup(
    payload: BackupRestorePayload,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Restore database from a specified backup file (admin only)."""
    safe_name = os.path.basename(payload.filename)
    path = os.path.join(BACKUP_DIR, safe_name)
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail=f"Backup file '{safe_name}' not found.")

    try:
        res = restore_backup(path, force=payload.force or False)
        db.add(AuditLog(
            timestamp=datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            action="DATABASE_RESTORED",
            user=current_user["username"],
            target_id=safe_name,
            details=f"Restored database from {safe_name}. Pre-restore snapshot: {res.get('safety_snapshot')}."
        ))
        db.commit()
        return res
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Restore operation failed: {e}")


# ---------------------------------------------------------------------------
# BUSINESS IMPACT & ROI / PILOT KPI TRACKER / PRICING API
# ---------------------------------------------------------------------------

from business_impact import (
    get_pilot_kpis, create_pilot_kpi, update_pilot_kpi, delete_pilot_kpi,
    calculate_roi, calculate_unit_economics,
    DEFAULT_SUBSCRIPTION_PLANS, DEFAULT_ROI_BENCHMARKS, DEFAULT_UNIT_ECONOMICS
)

class PilotKPICreate(BaseModel):
    kpi_name: str
    category: Optional[str] = "Operations"
    unit: Optional[str] = ""
    higher_is_better: Optional[bool] = False
    baseline_value: float
    baseline_date: Optional[str] = None
    measured_value: Optional[float] = None
    measured_date: Optional[str] = None
    target_value: Optional[float] = None
    notes: Optional[str] = None

class PilotKPIUpdate(BaseModel):
    kpi_name: Optional[str] = None
    category: Optional[str] = None
    unit: Optional[str] = None
    higher_is_better: Optional[bool] = None
    baseline_value: Optional[float] = None
    baseline_date: Optional[str] = None
    measured_value: Optional[float] = None
    measured_date: Optional[str] = None
    target_value: Optional[float] = None
    notes: Optional[str] = None

@app.get("/api/business-impact/pilot-kpis", dependencies=[Depends(require_roles(["admin", "manager"]))])
async def api_get_pilot_kpis(db: Session = Depends(get_db)):
    """Retrieve all pilot KPIs with before/after comparisons and improvement status."""
    return get_pilot_kpis(db)

@app.post("/api/business-impact/pilot-kpis", dependencies=[Depends(require_roles(["admin", "manager"]))])
async def api_create_pilot_kpi(req: PilotKPICreate, current_user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    """Add a new KPI reading to track for the pilot."""
    return create_pilot_kpi(db, req.model_dump(), current_user["username"])

@app.put("/api/business-impact/pilot-kpis/{kpi_id}", dependencies=[Depends(require_roles(["admin", "manager"]))])
async def api_update_pilot_kpi(kpi_id: int, req: PilotKPIUpdate, current_user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    """Update baseline, measured value, or notes for a pilot KPI."""
    try:
        return update_pilot_kpi(db, kpi_id, req.model_dump(exclude_unset=True), current_user["username"])
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

@app.delete("/api/business-impact/pilot-kpis/{kpi_id}", dependencies=[Depends(require_roles(["admin"]))])
async def api_delete_pilot_kpi(kpi_id: int, db: Session = Depends(get_db)):
    """Delete a pilot KPI reading (admin only)."""
    deleted = delete_pilot_kpi(db, kpi_id)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"Pilot KPI {kpi_id} not found.")
    return {"status": "success", "message": f"Pilot KPI {kpi_id} deleted."}

@app.post("/api/business-impact/roi-calculator", dependencies=[Depends(require_roles(["admin", "manager"]))])
async def api_roi_calculator(payload: dict):
    """
    Compute operational and financial ROI with transparent formulas.
    Inputs are provided by user (no prefilled invented numbers).
    """
    inputs = payload.get("inputs", {})
    formulas = payload.get("formula_parameters", {})
    return calculate_roi(inputs, formulas)

@app.get("/api/business-impact/roi-benchmarks", dependencies=[Depends(require_roles(["admin", "manager"]))])
async def api_get_roi_benchmarks():
    """Return default benchmark formula multipliers and labels for the ROI calculator."""
    return {
        "benchmarks": DEFAULT_ROI_BENCHMARKS,
        "descriptions": {
            "time_reduction_pct": "Expected % reduction in stock counting and manual PO creation time",
            "stockout_reduction_pct": "Expected % reduction in stockouts through automated ROP alerts",
            "order_loss_per_stockout": "% of stockout incidents resulting in lost orders vs delayed supply",
            "gross_margin_rate": "Typical gross margin % on industrial welding spares",
            "inventory_holding_rate": "Annual cost % of capital, warehouse space, and obsolescence",
            "dead_stock_reduction_pct": "% of dead/slow inventory converted back to working capital",
            "annual_software_cost": "Reference annual ERP software subscription investment (₹)"
        }
    }

@app.get("/api/business-impact/pricing-plans", dependencies=[Depends(require_roles(["admin", "manager"]))])
async def api_pricing_plans():
    """Return configurable SaaS subscription tiers and features."""
    return {"plans": DEFAULT_SUBSCRIPTION_PLANS}

class UnitEconomicsPayload(BaseModel):
    plan_price_monthly: Optional[float] = 9999.0
    hosting_server_per_customer: Optional[float] = 650.0
    llm_ai_tokens_per_customer: Optional[float] = 450.0
    whatsapp_cloud_api_per_customer: Optional[float] = 300.0
    support_ops_per_customer: Optional[float] = 1200.0
    fixed_overhead_monthly: Optional[float] = 45000.0

@app.post("/api/business-impact/unit-economics", dependencies=[Depends(require_roles(["admin", "manager"]))])
async def api_unit_economics(payload: Optional[UnitEconomicsPayload] = None):
    """Calculate unit economics, contribution margins, and break-even customer count."""
    data = payload.model_dump(exclude_unset=True) if payload else {}
    return calculate_unit_economics(data)
