"""
Database models and initialization for Anishka Inventory Management System.
Extended for Anishka Industries (Khandsa Road, Sector-10, Gurugram).
Specialized in MIG welding, TIG welding, and robotics welding spares.
"""
import os
import datetime
import uuid as _uuid
from sqlalchemy import (
    create_engine, Column, Integer, String, Float, Boolean, Text,
    ForeignKey, event
)
from sqlalchemy.orm import sessionmaker, relationship, declarative_base

Base = declarative_base()

# ─── Database Configuration ──────────────────────────────────────────
DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    f"sqlite:///{os.path.join(os.path.dirname(__file__), 'anishka_inventory.db')}"
)

# Cloud postgres provider normalization
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

if "sqlite" in DATABASE_URL:
    connect_args = {"check_same_thread": False, "timeout": 30}
    engine = create_engine(
        DATABASE_URL,
        connect_args=connect_args,
        pool_size=10,
        max_overflow=20
    )
else:
    connect_args = {}
    engine = create_engine(
        DATABASE_URL,
        connect_args=connect_args,
        pool_size=10,
        max_overflow=20,
        pool_pre_ping=True
    )

@event.listens_for(engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    if "sqlite" in DATABASE_URL:
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.execute("PRAGMA busy_timeout=5000")
        cursor.close()

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


# ─── Extended Models ─────────────────────────────────────────────────

class Vendor(Base):
    """
    Suppliers table: Authorized welding OEMs and industrial distributors.
    Mapped to __tablename__ = 'suppliers'.
    """
    __tablename__ = "suppliers"

    id = Column(String, primary_key=True)               # e.g. "V001", "V002"
    name = Column(String, unique=True, nullable=False)   # Supplier Company Name
    contact_person = Column(String, nullable=True)      # Contact Person Name
    phone = Column(String, nullable=True)               # Phone Number
    city = Column(String, nullable=True)                # City / Cluster (Delhi-NCR, Pune, Ahmedabad, Chennai)
    lead_time_days = Column(Integer, default=3)         # Average Lead Time in days
    rating = Column(Float, default=4.5)                 # Rating out of 5.0

    # Compatibility & Auxiliary Fields
    category = Column(String, nullable=True, default="Welding Equipment & Spares")
    approved = Column(Boolean, default=True)
    contact_email = Column(String, nullable=True, default="sales@supplier.com")
    email = Column(String(120), nullable=True)          # Official procurement order email
    gstin = Column(String(20), nullable=True)           # Supplier GSTIN (15 chars)
    state = Column(String(50), default="Haryana")       # State / Place of Supply
    avg_order = Column(Float, default=0.0)
    portal_token = Column(String, unique=True, default=lambda: str(_uuid.uuid4()))

    # Relationships
    items = relationship("Inventory", back_populates="supplier")
    purchase_orders = relationship("Procurement", back_populates="supplier")

    @property
    def trust_score(self) -> float:
        return round((self.rating / 5.0) * 100, 1) if self.rating else 90.0

    @property
    def risk_level(self) -> str:
        if (self.rating or 4.0) >= 4.4:
            return "Low"
        elif (self.rating or 4.0) >= 3.5:
            return "Medium"
        return "High"

    @property
    def contact_phone(self) -> str:
        return self.phone or "+91 124 400 0000"


class Inventory(Base):
    """
    Items table: Welding spares catalog for MIG, TIG, Robotics & Wire.
    Mapped to __tablename__ = 'items'.
    """
    __tablename__ = "items"

    id = Column(Integer, primary_key=True, autoincrement=True)
    sku = Column(String, unique=True, nullable=False, index=True)
    name = Column(String, nullable=False)
    category = Column(String, nullable=False)           # MIG Welding / TIG Welding / Robotics Spares / Welding Wire / Safety & Accessories
    unit = Column(String, default="pcs")                # pcs / kg / mtr / set
    compatible_with = Column(Text, nullable=True)       # Equipment / Torch compatibility string
    location = Column(String, default="R1-B1")          # Rack / Bin e.g. "R2-B4"
    quantity = Column(Integer, default=0)
    reorder_level = Column(Integer, default=10)
    reorder_qty = Column(Integer, default=50)
    unit_cost = Column(Float, default=0.0)              # Cost Price (₹)
    selling_price = Column(Float, default=0.0)          # Selling Price (₹)
    supplier_id = Column(String, ForeignKey("suppliers.id"), nullable=True)
    reserved_qty = Column(Integer, default=0, nullable=False) # Stock reserved for confirmed sales orders
    hsn_code = Column(String, default="8466", nullable=False) # HSN classification (placeholder)
    gst_rate = Column(Float, default=18.0, nullable=False)    # GST % rate
    last_updated = Column(String, nullable=True)        # ISO datetime
    is_active = Column(Boolean, default=True)
    import_batch_id = Column(String, nullable=True)

    # Relationships
    supplier = relationship("Vendor", back_populates="items")
    stock_movements = relationship("StockMovement", back_populates="item", cascade="all, delete-orphan")
    po_items = relationship("POItem", back_populates="item")
    sales_order_items = relationship("SalesOrderItem", back_populates="item")

    @property
    def available_quantity(self) -> int:
        return max(0, (self.quantity or 0) - (self.reserved_qty or 0))

    # Compatibility alias for unit_price
    @property
    def unit_price(self) -> float:
        return self.selling_price if self.selling_price else self.unit_cost

    @unit_price.setter
    def unit_price(self, val: float):
        self.selling_price = val


class StockMovement(Base):
    """
    Stock movements ledger: Inwards, Dispatches, and Adjustments.
    Mapped to __tablename__ = 'stock_movements'.
    """
    __tablename__ = "stock_movements"

    id = Column(Integer, primary_key=True, autoincrement=True)
    item_id = Column(Integer, ForeignKey("items.id"), nullable=False, index=True)
    type = Column(String, nullable=False)               # IN / OUT / ADJUST
    quantity = Column(Integer, nullable=False)
    reference = Column(String, nullable=True)           # PO no / invoice no / reason
    party = Column(String, nullable=True)               # Supplier or Customer / Assembly line name
    performed_by = Column(String, default="storekeeper")# User who performed action
    timestamp = Column(String, nullable=False)          # ISO datetime or formatted date
    balance_after = Column(Integer, default=0)          # Stock balance after this movement
    client_id = Column(String, nullable=True, unique=True, index=True) # Offline queue idempotency UUID

    # Relationships
    item = relationship("Inventory", back_populates="stock_movements")

    # Compatibility properties for legacy code & frontend
    @property
    def movement_id(self) -> str:
        return f"MOV-{self.id:05d}"

    @property
    def sku(self) -> str:
        return self.item.sku if self.item else ""

    @property
    def item_name(self) -> str:
        return self.item.name if self.item else ""

    @property
    def movement_type(self) -> str:
        return "INWARD" if self.type == "IN" else ("OUTWARD" if self.type == "OUT" else self.type)

    @property
    def destination_or_source(self) -> str:
        return self.party or "Central Store"

    @property
    def operator(self) -> str:
        return self.performed_by or "storekeeper"

    @property
    def user(self) -> str:
        return self.performed_by or "storekeeper"

    @user.setter
    def user(self, val: str):
        self.performed_by = val

    @property
    def source(self) -> str:
        return self.reference or ""

    @source.setter
    def source(self, val: str):
        self.reference = val

    @property
    def notes(self) -> str:
        return self.reference or ""

    @notes.setter
    def notes(self, val: str):
        self.reference = val


class Procurement(Base):
    """
    Purchase Orders table.
    Mapped to __tablename__ = 'purchase_orders'.
    """
    __tablename__ = "purchase_orders"

    id = Column(Integer, primary_key=True, autoincrement=True)
    po_number = Column(String, unique=True, nullable=False, index=True) # e.g. "PO-2026-001"
    supplier_id = Column(String, ForeignKey("suppliers.id"), nullable=False)
    status = Column(String, default="DRAFT")            # DRAFT / APPROVED / RECEIVED / CANCELLED
    created_at = Column(String, nullable=False)         # ISO datetime
    expected_date = Column(String, nullable=True)       # Expected delivery date
    total_value = Column(Float, default=0.0)            # Total amount in ₹
    auto_generated = Column(Boolean, default=False)     # True if system auto-drafted
    auto_approved = Column(Boolean, default=False)      # True if approved by automation rule

    # Auxiliary / compatibility fields
    department = Column(String, default="Central Store")
    delivery_challan_no = Column(String, nullable=True)
    delivery_doc_path = Column(String, nullable=True)

    # Relationships
    supplier = relationship("Vendor", back_populates="purchase_orders")
    items = relationship("POItem", back_populates="purchase_order", cascade="all, delete-orphan")

    # Compatibility properties
    @property
    def vendor_id(self) -> str:
        return self.supplier_id

    @property
    def vendor_name(self) -> str:
        return self.supplier.name if self.supplier else "Supplier"

    @property
    def date(self) -> str:
        return self.created_at[:10] if self.created_at else ""

    @property
    def amount(self) -> float:
        return self.total_value

    @property
    def quantity(self) -> int:
        return sum(it.qty for it in self.items) if self.items else 1

    @property
    def item(self) -> str:
        if self.items:
            names = [it.item.name for it in self.items if it.item]
            if names:
                return ", ".join(names[:2]) + ("..." if len(names) > 2 else "")
        return "Welding Equipment Spares"

    @property
    def source(self) -> str:
        return "Auto-Reorder" if self.auto_generated else "Manual"


class POItem(Base):
    """
    Purchase Order Line Items.
    Mapped to __tablename__ = 'po_items'.
    """
    __tablename__ = "po_items"

    id = Column(Integer, primary_key=True, autoincrement=True)
    po_id = Column(Integer, ForeignKey("purchase_orders.id"), nullable=False, index=True)
    item_id = Column(Integer, ForeignKey("items.id"), nullable=False, index=True)
    qty = Column(Integer, default=1, nullable=False)
    received_qty = Column(Integer, default=0, nullable=False)
    unit_cost = Column(Float, default=0.0, nullable=False)
    reason = Column(Text, nullable=True)

    # Relationships
    purchase_order = relationship("Procurement", back_populates="items")
    item = relationship("Inventory", back_populates="po_items")




class Customer(Base):
    """
    Industrial welding customers: OEMs, Tier-1 ancillaries, and fabrication bays.
    Mapped to __tablename__ = 'customers'.
    """
    __tablename__ = "customers"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String, nullable=False)
    gstin = Column(String, nullable=True)
    state = Column(String, nullable=False, default="Haryana")
    city = Column(String, nullable=False)
    contact_person = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    email = Column(String, nullable=True)
    price_tier = Column(String, default="Standard")  # Standard | Wholesale | OEM Tier-1
    credit_limit = Column(Float, default=100000.0)
    credit_days = Column(Integer, default=30)
    is_active = Column(Boolean, default=True)
    whatsapp_opt_out = Column(Boolean, default=False)

    # Relationships
    sales_orders = relationship("SalesOrder", back_populates="customer", cascade="all, delete-orphan")
    invoices = relationship("Invoice", back_populates="customer", cascade="all, delete-orphan")


class SalesOrder(Base):
    """
    Sales Orders & Quotations raised for industrial customers.
    Mapped to __tablename__ = 'sales_orders'.
    """
    __tablename__ = "sales_orders"

    id = Column(Integer, primary_key=True, autoincrement=True)
    order_no = Column(String, unique=True, nullable=False, index=True) # e.g. "ANI-SO-2026-0001" or "ANI-QT-2026-0001"
    customer_id = Column(Integer, ForeignKey("customers.id"), nullable=False, index=True)
    status = Column(String, default="QUOTE", nullable=False) # QUOTE | CONFIRMED | PARTIALLY_DISPATCHED | DISPATCHED | INVOICED | CANCELLED
    created_by = Column(String, nullable=False, default="manager")
    created_at = Column(String, nullable=False) # ISO datetime
    valid_until = Column(String, nullable=True) # Quotation validity date
    notes = Column(Text, nullable=True)
    override_reason = Column(Text, nullable=True) # Reason provided if confirmed above credit limit
    total_taxable = Column(Float, default=0.0)
    total_tax = Column(Float, default=0.0)
    grand_total = Column(Float, default=0.0)

    # Relationships
    customer = relationship("Customer", back_populates="sales_orders")
    items = relationship("SalesOrderItem", back_populates="order", cascade="all, delete-orphan")
    invoices = relationship("Invoice", back_populates="order")


class SalesOrderItem(Base):
    """
    Line items within a sales order or quotation.
    Mapped to __tablename__ = 'sales_order_items'.
    """
    __tablename__ = "sales_order_items"

    id = Column(Integer, primary_key=True, autoincrement=True)
    order_id = Column(Integer, ForeignKey("sales_orders.id"), nullable=False, index=True)
    item_id = Column(Integer, ForeignKey("items.id"), nullable=False, index=True)
    qty = Column(Integer, default=1, nullable=False)
    unit_price = Column(Float, default=0.0, nullable=False) # Selling price in ₹
    discount_pct = Column(Float, default=0.0)
    gst_rate = Column(Float, default=18.0)
    dispatched_qty = Column(Integer, default=0)

    # Relationships
    order = relationship("SalesOrder", back_populates="items")
    item = relationship("Inventory", back_populates="sales_order_items")


class Invoice(Base):
    """
    Tax Invoices generated per Indian GST specifications.
    Mapped to __tablename__ = 'invoices'.
    """
    __tablename__ = "invoices"

    id = Column(Integer, primary_key=True, autoincrement=True)
    invoice_no = Column(String, unique=True, nullable=False, index=True) # e.g. ANI/2026-27/0001
    order_id = Column(Integer, ForeignKey("sales_orders.id"), nullable=True, index=True)
    customer_id = Column(Integer, ForeignKey("customers.id"), nullable=False, index=True)
    date = Column(String, nullable=False) # YYYY-MM-DD
    place_of_supply = Column(String, nullable=False) # State name or code
    taxable_value = Column(Float, default=0.0)
    cgst = Column(Float, default=0.0)
    sgst = Column(Float, default=0.0)
    igst = Column(Float, default=0.0)
    total = Column(Float, default=0.0)
    status = Column(String, default="UNPAID", nullable=False) # UNPAID | PARTIALLY_PAID | PAID | CANCELLED

    # Relationships
    order = relationship("SalesOrder", back_populates="invoices")
    customer = relationship("Customer", back_populates="invoices")
    payments = relationship("Payment", back_populates="invoice", cascade="all, delete-orphan")


class Payment(Base):
    """
    Customer payments received against Tax Invoices.
    Mapped to __tablename__ = 'payments'.
    """
    __tablename__ = "payments"

    id = Column(Integer, primary_key=True, autoincrement=True)
    invoice_id = Column(Integer, ForeignKey("invoices.id"), nullable=False, index=True)
    amount = Column(Float, default=0.0, nullable=False)
    mode = Column(String, default="NEFT/RTGS") # NEFT/RTGS | Cheque | UPI | Cash
    reference = Column(String, nullable=True) # Bank UTR / Cheque Number
    date = Column(String, nullable=False) # YYYY-MM-DD
    recorded_by = Column(String, default="manager")

    # Relationships
    invoice = relationship("Invoice", back_populates="payments")

class AppSetting(Base):
    """Configuration settings for system automation and business logic."""
    __tablename__ = "app_settings"

    key = Column(String, primary_key=True)
    value = Column(String, nullable=False)
    updated_by = Column(String, nullable=True)
    updated_at = Column(String, nullable=True)


class AutomationRun(Base):
    """Log of automated replenishment scan cycles."""
    __tablename__ = "automation_runs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    started_at = Column(String, nullable=False)
    trigger = Column(String, default="scheduled")       # scheduled | manual | event
    scanned = Column(Integer, default=0)
    drafted = Column(Integer, default=0)
    auto_approved = Column(Integer, default=0)
    overdue = Column(Integer, default=0)
    summary = Column(Text, nullable=True)


class Outbox(Base):
    """Supplier and system communication email/WhatsApp outbox."""
    __tablename__ = "outbox"

    id = Column(Integer, primary_key=True, autoincrement=True)
    created_at = Column(String, nullable=False)
    to_email = Column(String, nullable=True, default="")
    subject = Column(String, nullable=False)
    body = Column(Text, nullable=False)
    attachment_name = Column(String, nullable=True)
    status = Column(String, default="SIMULATED", nullable=False)       # QUEUED | SENT | FAILED | SIMULATED
    related_po = Column(String, nullable=True)
    channel = Column(String, default="EMAIL", nullable=False)          # EMAIL | WHATSAPP
    sender = Column(String, default="system", nullable=False)          # User or role who dispatched
    recipient_phone = Column(String, nullable=True)                    # Normalized phone for WhatsApp
    template_lang = Column(String, nullable=True, default="en")        # en | hi
    ref_type = Column(String, nullable=True)                           # OPPORTUNITY | PO | SALES_ORDER
    ref_id = Column(String, nullable=True)                             # ID or reference code


# CommunicationLog alias for unified communications tracking
CommunicationLog = Outbox


class AuditLog(Base):
    """Immutable audit trail for all system and human operations."""
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    timestamp = Column(String, nullable=False)          # ISO format
    action = Column(String, nullable=False)             # STOCK_IN, STOCK_OUT, ADJUST, PO_CREATE, LOGIN
    user = Column(String, default="system")
    target_id = Column(String, nullable=True)           # SKU, PO No, etc.
    details = Column(Text, nullable=True)


class AIChatLog(Base):
    """Immutable log of AI Copilot chat sessions, token consumption, and tool calls."""
    __tablename__ = "ai_chat_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    created_at = Column(String, nullable=False)
    user = Column(String, default="anonymous")
    role = Column(String, default="storekeeper")
    model = Column(String, nullable=False)
    prompt_tokens = Column(Integer, default=0)
    completion_tokens = Column(Integer, default=0)
    total_tokens = Column(Integer, default=0)
    tool_calls = Column(Text, nullable=True)
    latency_ms = Column(Integer, default=0)


class DocExtraction(Base):
    """
    Scanned Delivery Document Extractions & Accuracy Tracking.
    Mapped to __tablename__ = 'doc_extractions'.
    """
    __tablename__ = "doc_extractions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    created_at = Column(String, nullable=False) # ISO datetime
    uploaded_by = Column(String, nullable=False)
    file_path = Column(String, nullable=False)
    content_hash = Column(String, nullable=False, index=True)
    document_number = Column(String, nullable=True, index=True)
    document_date = Column(String, nullable=True)
    supplier_name = Column(String, nullable=True)
    po_reference = Column(String, nullable=True)
    matched_po_id = Column(Integer, ForeignKey("purchase_orders.id"), nullable=True)
    raw_extraction = Column(Text, nullable=True) # JSON string of vision model output
    matched_lines = Column(Text, nullable=True)  # JSON string of lines with matching & confidence
    status = Column(String, default="PENDING_REVIEW") # PENDING_REVIEW / CONFIRMED / REJECTED
    fields_corrected = Column(Integer, default=0) # count of corrections user made during review
    confirmed_by = Column(String, nullable=True)
    confirmed_at = Column(String, nullable=True)

    po = relationship("Procurement")


class CycleCount(Base):
    """
    Physical Inventory Cycle Count Sheets.
    Tracks periodic inventory audits by category or bin location.
    """
    __tablename__ = "cycle_counts"

    id = Column(Integer, primary_key=True, autoincrement=True)
    count_no = Column(String, unique=True, nullable=False, index=True) # e.g. "CC-2026-0001"
    type = Column(String, default="CATEGORY") # CATEGORY | BIN | ALL
    target_name = Column(String, nullable=True) # e.g. "MIG Welding" or "R1-B01"
    status = Column(String, default="DRAFT") # DRAFT | IN_PROGRESS | PENDING_APPROVAL | APPROVED | REJECTED
    created_by = Column(String, default="storekeeper")
    created_at = Column(String, nullable=False) # ISO datetime
    approved_by = Column(String, nullable=True)
    approved_at = Column(String, nullable=True)
    approval_notes = Column(Text, nullable=True)
    total_items = Column(Integer, default=0)
    variance_items = Column(Integer, default=0)
    total_variance_value = Column(Float, default=0.0)
    posted_at = Column(String, nullable=True)

    # Relationships
    items = relationship("CycleCountItem", back_populates="cycle_count", cascade="all, delete-orphan")


class CycleCountItem(Base):
    """
    Individual item audit line within a cycle count sheet.
    """
    __tablename__ = "cycle_count_items"

    id = Column(Integer, primary_key=True, autoincrement=True)
    cycle_count_id = Column(Integer, ForeignKey("cycle_counts.id"), nullable=False, index=True)
    item_id = Column(Integer, ForeignKey("items.id"), nullable=False, index=True)
    system_qty = Column(Integer, default=0, nullable=False)
    counted_qty = Column(Integer, nullable=True) # None until physical count entered
    variance_qty = Column(Integer, default=0, nullable=False) # counted_qty - system_qty
    unit_cost = Column(Float, default=0.0, nullable=False)
    variance_value = Column(Float, default=0.0, nullable=False) # variance_qty * unit_cost
    discrepancy_reason = Column(Text, nullable=True)
    scanned_at = Column(String, nullable=True)

    # Relationships
    cycle_count = relationship("CycleCount", back_populates="items")
    item = relationship("Inventory")


class UserRole(Base):
    """RBAC User accounts with passwords and permissions."""
    __tablename__ = "user_roles"

    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String, unique=True, nullable=False)
    password = Column(String, nullable=False)
    role = Column(String, nullable=False)               # "admin" | "manager" | "storekeeper"
    full_name = Column(String, nullable=True)
    created_at = Column(String, nullable=True)
    must_change_password = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True)
    last_login = Column(String, nullable=True)
    failed_attempts = Column(Integer, default=0)
    locked_until = Column(String, nullable=True)


class ImportBatch(Base):
    """Track data import wizard batches for audit trail and rollback."""
    __tablename__ = "import_batches"

    id = Column(Integer, primary_key=True, autoincrement=True)
    batch_id = Column(String, unique=True, nullable=False, index=True)
    import_type = Column(String, nullable=False)        # "items" | "suppliers" | "opening_stock"
    filename = Column(String, nullable=True)
    created_at = Column(String, nullable=False)
    created_by = Column(String, nullable=True)
    records_count = Column(Integer, default=0)
    status = Column(String, default="committed")        # "committed" | "rolled_back"
    details_json = Column(Text, nullable=True)


class PilotReading(Base):
    """Tracks before/after pilot KPI readings for the Business Impact tracker."""
    __tablename__ = "pilot_readings"

    id = Column(Integer, primary_key=True, autoincrement=True)
    kpi_key = Column(String(80), nullable=False)        # e.g. "stockouts_per_month"
    kpi_name = Column(String(200), nullable=False)       # Human-readable label
    category = Column(String(80), default="Operations")  # Operations / Procurement / Sales
    unit = Column(String(40), default="")               # incidents/mo, mins, %, hours
    higher_is_better = Column(Boolean, default=False)   # False for "lower is better"
    baseline_value = Column(Float, nullable=False)      # Before-pilot measurement
    baseline_date = Column(String(20), nullable=True)   # ISO date string
    measured_value = Column(Float, nullable=True)       # After-pilot measurement
    measured_date = Column(String(20), nullable=True)   # ISO date string
    target_value = Column(Float, nullable=True)         # Goal value
    notes = Column(Text, nullable=True)
    recorded_by = Column(String(80), default="system")
    created_at = Column(String(30), nullable=True)
    updated_at = Column(String(30), nullable=True)


ROLE_PERMISSIONS = {
    "admin":       ["view_all", "adjust_stock", "stock_in", "stock_out", "create_po", "approve_po", "manage_suppliers", "manage_items", "export", "configure"],
    "manager":     ["view_all", "create_po", "approve_po", "export", "view_reports"],
    "storekeeper": ["view_all", "adjust_stock", "stock_in", "stock_out"],
}

# Type Aliases for code clarity
Item = Inventory
Supplier = Vendor
StockMovementRecord = StockMovement
PurchaseOrder = Procurement
PurchaseOrderItem = POItem
User = UserRole


DEFAULT_APP_SETTINGS = {
    "auto_reorder_enabled": "true",
    "scan_interval_minutes": "5",
    "smart_qty_enabled": "true",
    "safety_days": "14",
    "service_level": "95%",
    "safety_stock_method": "safety_days",
    "auto_approve_enabled": "false",
    "auto_approve_limit": "25000",
    "auto_approve_min_supplier_rating": "4.0",
    "overdue_alerts_enabled": "true",
    "email_on_approval": "true",
    "digest_time": "08:00",
    "owner_email": "owner@anishkaindustries.com",
    "tally_company_name": "Anishka Industries",
    "tally_sales_ledger": "Sales Account",
    "tally_purchase_ledger": "Purchase Account",
    "tally_output_cgst_ledger": "Output CGST",
    "tally_output_sgst_ledger": "Output SGST",
    "tally_output_igst_ledger": "Output IGST",
    "tally_input_cgst_ledger": "Input CGST",
    "tally_input_sgst_ledger": "Input SGST",
    "tally_input_igst_ledger": "Input IGST",
    "tally_round_off_ledger": "Round Off",
    "tally_cash_ledger": "Cash Account",
    "tally_bank_ledger": "HDFC Bank Ltd",
}

def seed_default_settings(db):
    """Seed default automation settings if missing."""
    now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    for key, val in DEFAULT_APP_SETTINGS.items():
        existing = db.query(AppSetting).filter(AppSetting.key == key).first()
        if not existing:
            db.add(AppSetting(
                key=key,
                value=val,
                updated_by="system",
                updated_at=now_str
            ))
    db.commit()


# ─── Database Initialization ─────────────────────────────────────────

def init_db(reseed: bool = False):
    """Create all tables and seed realistic welding data if empty or requested."""
    if reseed and "sqlite" in DATABASE_URL:
        db_path = DATABASE_URL.replace("sqlite:///", "")
        if os.path.exists(db_path):
            try:
                # Close any active connections by disposing engine
                engine.dispose()
                for ext in ["", "-shm", "-wal"]:
                    p = db_path + ext
                    if os.path.exists(p):
                        os.remove(p)
                print(f"[OK] Removed existing database: {db_path}")
            except Exception as e:
                print(f"[WARN] Could not delete DB file directly: {e}")

    Base.metadata.create_all(bind=engine)

    # SQLite migrations for added columns
    if "sqlite" in DATABASE_URL:
        with engine.connect() as conn:
            # po_items columns
            po_cols = [r[1] for r in conn.exec_driver_sql("PRAGMA table_info(po_items)").fetchall()]
            if "received_qty" not in po_cols:
                conn.exec_driver_sql("ALTER TABLE po_items ADD COLUMN received_qty INTEGER DEFAULT 0")
            if "reason" not in po_cols:
                conn.exec_driver_sql("ALTER TABLE po_items ADD COLUMN reason TEXT")

            # purchase_orders columns
            po_table_cols = [r[1] for r in conn.exec_driver_sql("PRAGMA table_info(purchase_orders)").fetchall()]
            if "auto_approved" not in po_table_cols:
                conn.exec_driver_sql("ALTER TABLE purchase_orders ADD COLUMN auto_approved BOOLEAN DEFAULT 0")
            if "delivery_challan_no" not in po_table_cols:
                conn.exec_driver_sql("ALTER TABLE purchase_orders ADD COLUMN delivery_challan_no VARCHAR")
            if "delivery_doc_path" not in po_table_cols:
                conn.exec_driver_sql("ALTER TABLE purchase_orders ADD COLUMN delivery_doc_path VARCHAR")

            # suppliers email, gstin, state columns
            sup_table_cols = [r[1] for r in conn.exec_driver_sql("PRAGMA table_info(suppliers)").fetchall()]
            if "email" not in sup_table_cols:
                conn.exec_driver_sql("ALTER TABLE suppliers ADD COLUMN email VARCHAR(120)")
            if "gstin" not in sup_table_cols:
                conn.exec_driver_sql("ALTER TABLE suppliers ADD COLUMN gstin VARCHAR(20)")
            if "state" not in sup_table_cols:
                conn.exec_driver_sql("ALTER TABLE suppliers ADD COLUMN state VARCHAR(50) DEFAULT 'Haryana'")
            if "import_batch_id" not in sup_table_cols:
                conn.exec_driver_sql("ALTER TABLE suppliers ADD COLUMN import_batch_id VARCHAR")

            # items columns: reserved_qty, hsn_code, gst_rate
            item_table_cols = [r[1] for r in conn.exec_driver_sql("PRAGMA table_info(items)").fetchall()]
            if "reserved_qty" not in item_table_cols:
                conn.exec_driver_sql("ALTER TABLE items ADD COLUMN reserved_qty INTEGER DEFAULT 0")
            if "hsn_code" not in item_table_cols:
                conn.exec_driver_sql("ALTER TABLE items ADD COLUMN hsn_code VARCHAR(30) DEFAULT '8466'")
            if "gst_rate" not in item_table_cols:
                conn.exec_driver_sql("ALTER TABLE items ADD COLUMN gst_rate FLOAT DEFAULT 18.0")
            if "import_batch_id" not in item_table_cols:
                conn.exec_driver_sql("ALTER TABLE items ADD COLUMN import_batch_id VARCHAR")

            # stock_movements columns: client_id
            sm_table_cols = [r[1] for r in conn.exec_driver_sql("PRAGMA table_info(stock_movements)").fetchall()]
            if "client_id" not in sm_table_cols:
                conn.exec_driver_sql("ALTER TABLE stock_movements ADD COLUMN client_id VARCHAR")
            if "import_batch_id" not in sm_table_cols:
                conn.exec_driver_sql("ALTER TABLE stock_movements ADD COLUMN import_batch_id VARCHAR")

            # customers columns: whatsapp_opt_out
            cust_table_cols = [r[1] for r in conn.exec_driver_sql("PRAGMA table_info(customers)").fetchall()]
            if "whatsapp_opt_out" not in cust_table_cols:
                conn.exec_driver_sql("ALTER TABLE customers ADD COLUMN whatsapp_opt_out BOOLEAN DEFAULT 0")

            # outbox columns: channel, sender, recipient_phone, template_lang, ref_type, ref_id
            outbox_cols = [r[1] for r in conn.exec_driver_sql("PRAGMA table_info(outbox)").fetchall()]
            if "channel" not in outbox_cols:
                conn.exec_driver_sql("ALTER TABLE outbox ADD COLUMN channel VARCHAR(20) DEFAULT 'EMAIL'")
            if "sender" not in outbox_cols:
                conn.exec_driver_sql("ALTER TABLE outbox ADD COLUMN sender VARCHAR(50) DEFAULT 'system'")
            if "recipient_phone" not in outbox_cols:
                conn.exec_driver_sql("ALTER TABLE outbox ADD COLUMN recipient_phone VARCHAR(30)")
            if "template_lang" not in outbox_cols:
                conn.exec_driver_sql("ALTER TABLE outbox ADD COLUMN template_lang VARCHAR(10) DEFAULT 'en'")
            if "ref_type" not in outbox_cols:
                conn.exec_driver_sql("ALTER TABLE outbox ADD COLUMN ref_type VARCHAR(30)")
            if "ref_id" not in outbox_cols:
                conn.exec_driver_sql("ALTER TABLE outbox ADD COLUMN ref_id VARCHAR(50)")

            # user_roles security columns
            ur_cols = [r[1] for r in conn.exec_driver_sql("PRAGMA table_info(user_roles)").fetchall()]
            if "must_change_password" not in ur_cols:
                conn.exec_driver_sql("ALTER TABLE user_roles ADD COLUMN must_change_password BOOLEAN DEFAULT 0")
            if "is_active" not in ur_cols:
                conn.exec_driver_sql("ALTER TABLE user_roles ADD COLUMN is_active BOOLEAN DEFAULT 1")
            if "last_login" not in ur_cols:
                conn.exec_driver_sql("ALTER TABLE user_roles ADD COLUMN last_login VARCHAR")
            if "failed_attempts" not in ur_cols:
                conn.exec_driver_sql("ALTER TABLE user_roles ADD COLUMN failed_attempts INTEGER DEFAULT 0")
            if "locked_until" not in ur_cols:
                conn.exec_driver_sql("ALTER TABLE user_roles ADD COLUMN locked_until VARCHAR")

    db = SessionLocal()
    try:
        # Check if already seeded
        has_items = db.query(Inventory).first()
        if not has_items or reseed:
            from seed_data import seed_database
            seed_database(db)
            print("[OK] Database initialized and seeded with complete welding catalog.")
        # Ensure all suppliers have demo order emails
        import re as _re
        for v in db.query(Vendor).all():
            if not v.email:
                slug = _re.sub(r'[^a-z0-9]', '', (v.name or v.id).lower())[:15]
                v.email = f"orders@{slug}.example"

        # Fix any existing items whose supplier_id is not a real supplier
        valid_supplier_ids = {v.id for v in db.query(Vendor.id).all()}
        for item in db.query(Inventory).filter(Inventory.supplier_id != None).all():
            if item.supplier_id not in valid_supplier_ids:
                item.supplier_id = None
        db.commit()
        seed_default_settings(db)
        try:
            from business_impact import seed_default_pilot_kpis
            seed_default_pilot_kpis(db)
        except Exception as e:
            print(f"[WARN] Could not seed default pilot KPIs: {e}")
    finally:
        db.close()


if __name__ == "__main__":
    init_db(reseed=True)
