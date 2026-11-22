"""
import_wizard.py
================
Enterprise Data Import Wizard for Anishka Industries ERP:
- Supports Item Catalog, Supplier Directory, and Opening Stock imports
- Accepts CSV and Excel (.xlsx) formats with automatic encoding detection
- Intelligent column alias mapping & row-by-row validation with preview
- Transactional commit with unique, undo-able Import Batch ID
- Full rollback / undo capability restoring historical stock levels
- Pre-populated CSV and Excel template generators
"""

import io
import csv
import json
import uuid
import datetime
from typing import Dict, List, Any, Optional, Tuple

import pandas as pd
from sqlalchemy.orm import Session

from database import (
    Inventory, Vendor, StockMovement, ImportBatch, AuditLog, SessionLocal
)

# ---------------------------------------------------------------------------
# Column Alias Dictionaries
# ---------------------------------------------------------------------------

ITEMS_ALIASES: Dict[str, List[str]] = {
    "sku": ["sku", "item_code", "part_no", "part_number", "code", "item_no", "material_code"],
    "name": ["name", "item_name", "description", "product_name", "title", "item_description"],
    "category": ["category", "cat", "group", "item_group", "type", "classification"],
    "unit": ["unit", "uom", "unit_of_measure", "measure", "base_unit"],
    "quantity": ["quantity", "qty", "stock", "opening_stock", "current_stock", "count", "balance"],
    "unit_cost": ["unit_cost", "cost", "purchase_price", "cost_price", "rate", "buying_price"],
    "selling_price": ["selling_price", "sale_price", "price", "mrp", "list_price"],
    "reorder_level": ["reorder_level", "min_stock", "rop", "reorder_point", "safety_stock"],
    "reorder_qty": ["reorder_qty", "order_qty", "moq", "reorder_quantity"],
    "location": ["location", "bin", "shelf", "warehouse_location", "rack", "bin_location"],
    "supplier_id": ["supplier_id", "vendor_id", "supplier", "vendor", "supplier_code"],
    "compatible_with": ["compatible_with", "model", "compatibility", "machine", "compatible"],
    "hsn_code": ["hsn_code", "hsn", "sac", "hsn_sac"],
    "gst_rate": ["gst_rate", "tax_rate", "gst_%", "tax_%", "gst"]
}

SUPPLIERS_ALIASES: Dict[str, List[str]] = {
    "id": ["id", "supplier_id", "vendor_id", "code", "vendor_code"],
    "name": ["name", "supplier_name", "vendor_name", "company", "firm_name"],
    "contact_person": ["contact_person", "contact", "person", "poc", "representative"],
    "phone": ["phone", "mobile", "contact_no", "tel", "telephone"],
    "email": ["email", "mail", "contact_email", "vendor_email"],
    "city": ["city", "location", "address", "district"],
    "state": ["state", "province"],
    "gstin": ["gstin", "gst_no", "gst_number", "tax_id"],
    "category": ["category", "supplies", "type", "specialization"],
    "lead_time_days": ["lead_time_days", "lead_time", "lead_days", "delivery_days"]
}

OPENING_STOCK_ALIASES: Dict[str, List[str]] = {
    "sku": ["sku", "item_code", "part_no", "code", "item_no"],
    "quantity": ["quantity", "qty", "opening_stock", "physical_count", "stock_count"],
    "unit_cost": ["unit_cost", "cost", "valuation_rate", "cost_price", "rate"],
    "location": ["location", "bin", "rack", "shelf", "warehouse_bin"]
}


# ---------------------------------------------------------------------------
# File Parsing & Auto-Mapping
# ---------------------------------------------------------------------------

def _normalize_header(hdr: str) -> str:
    """Normalize column header for alias matching."""
    return "".join(c.lower() if c.isalnum() else "_" for c in str(hdr).strip()).strip("_")


def auto_map_columns(file_headers: List[str], import_type: str) -> Tuple[Dict[str, str], List[str]]:
    """
    Match incoming file headers to canonical ERP fields.
    Returns: (mapped: {file_header: canonical_field}, unmapped: [file_header])
    """
    alias_dict = {
        "items": ITEMS_ALIASES,
        "suppliers": SUPPLIERS_ALIASES,
        "opening_stock": OPENING_STOCK_ALIASES
    }.get(import_type, ITEMS_ALIASES)

    mapped: Dict[str, str] = {}
    used_canonicals = set()

    for raw_hdr in file_headers:
        norm = _normalize_header(raw_hdr)
        matched = False
        for canonical, aliases in alias_dict.items():
            if canonical in used_canonicals:
                continue
            for alias in aliases:
                if norm == alias or norm == _normalize_header(alias):
                    mapped[raw_hdr] = canonical
                    used_canonicals.add(canonical)
                    matched = True
                    break
            if matched:
                break

    unmapped = [h for h in file_headers if h not in mapped]
    return mapped, unmapped


def parse_file_to_dataframe(file_bytes: bytes, filename: str) -> pd.DataFrame:
    """Read CSV or Excel bytes into a clean Pandas DataFrame."""
    lower_fn = filename.lower()
    if lower_fn.endswith(".csv"):
        for enc in ["utf-8", "utf-8-sig", "latin1", "cp1252"]:
            try:
                df = pd.read_csv(io.BytesIO(file_bytes), encoding=enc)
                df = df.dropna(how="all")  # drop empty rows
                return df
            except Exception:
                continue
        raise ValueError("Could not decode CSV file. Ensure it is UTF-8 or standard CSV.")
    elif lower_fn.endswith((".xlsx", ".xls")):
        df = pd.read_excel(io.BytesIO(file_bytes), engine="openpyxl")
        df = df.dropna(how="all")
        return df
    else:
        raise ValueError("Unsupported file format. Please upload .csv or .xlsx file.")


# ---------------------------------------------------------------------------
# Row-by-Row Validation & Preview
# ---------------------------------------------------------------------------

def validate_import_data(
    df: pd.DataFrame,
    import_type: str,
    column_mapping: Optional[Dict[str, str]],
    db: Session
) -> Dict[str, Any]:
    """
    Validate dataset row-by-row and generate validation preview.
    """
    # Auto-map if no custom mapping provided
    auto_map, unmapped = auto_map_columns(list(df.columns), import_type)
    mapping = column_mapping if column_mapping else auto_map

    # Rename dataframe columns according to active mapping
    reverse_map = {orig: target for orig, target in mapping.items() if target}
    renamed_df = df.rename(columns=reverse_map)

    # Preload existing references for fast foreign key / uniqueness checks
    existing_skus = {s[0] for s in db.query(Inventory.sku).all()}
    existing_supplier_ids = {s[0] for s in db.query(Vendor.id).all()}

    preview_rows = []
    errors_summary = []
    valid_count = 0
    error_count = 0
    warning_count = 0
    seen_identifiers = set()

    for idx, row in renamed_df.iterrows():
        row_num = int(idx) + 2  # 1-based, account for header row
        row_errors = []
        row_warnings = []
        row_data = row.to_dict()

        # Clean NaN values
        for k, v in list(row_data.items()):
            if pd.isna(v):
                row_data[k] = None

        if import_type == "items":
            sku = str(row_data.get("sku") or "").strip()
            name = str(row_data.get("name") or "").strip()

            if not sku:
                row_errors.append("SKU / Item Code is required.")
            elif sku in seen_identifiers:
                row_errors.append(f"Duplicate SKU '{sku}' within file.")
            else:
                seen_identifiers.add(sku)

            if not name:
                row_errors.append("Item Name is required.")

            if sku and sku in existing_skus:
                row_warnings.append(f"SKU '{sku}' already exists in catalog. Committing will update existing record.")

            # Validate numeric constraints
            for field in ["quantity", "unit_cost", "selling_price", "reorder_level", "reorder_qty"]:
                val = row_data.get(field)
                if val is not None:
                    try:
                        num = float(val)
                        if num < 0:
                            row_errors.append(f"{field.replace('_', ' ').title()} cannot be negative ({num}).")
                        row_data[field] = num
                    except (ValueError, TypeError):
                        row_errors.append(f"{field.replace('_', ' ').title()} must be a valid number.")

            # Validate supplier_id if provided
            sup_id = str(row_data.get("supplier_id") or "").strip()
            if sup_id and sup_id not in existing_supplier_ids:
                row_warnings.append(f"Supplier ID '{sup_id}' not found in registered suppliers. Set to Unassigned.")

        elif import_type == "suppliers":
            sup_id = str(row_data.get("id") or "").strip()
            name = str(row_data.get("name") or "").strip()

            if not sup_id:
                # Auto-generate V### if omitted
                sup_id = f"V{len(existing_supplier_ids) + len(seen_identifiers) + 1:03d}"
                row_data["id"] = sup_id

            if sup_id in seen_identifiers:
                row_errors.append(f"Duplicate Supplier ID '{sup_id}' in file.")
            else:
                seen_identifiers.add(sup_id)

            if not name:
                row_errors.append("Supplier / Company Name is required.")

            if sup_id in existing_supplier_ids:
                row_warnings.append(f"Supplier ID '{sup_id}' already exists. Committing will update record.")

            # Lead time validation
            lead = row_data.get("lead_time_days")
            if lead is not None:
                try:
                    num = int(lead)
                    if num < 1:
                        row_warnings.append("Lead time less than 1 day adjusted to 1 day.")
                    row_data["lead_time_days"] = max(1, num)
                except (ValueError, TypeError):
                    row_data["lead_time_days"] = 3

        elif import_type == "opening_stock":
            sku = str(row_data.get("sku") or "").strip()
            qty = row_data.get("quantity")

            if not sku:
                row_errors.append("SKU is required.")
            elif sku not in existing_skus:
                row_errors.append(f"SKU '{sku}' not found in active item catalog. Create item first.")

            if qty is None:
                row_errors.append("Opening stock quantity is required.")
            else:
                try:
                    num = float(qty)
                    if num < 0:
                        row_errors.append(f"Opening stock quantity cannot be negative ({num}).")
                    row_data["quantity"] = int(num)
                except (ValueError, TypeError):
                    row_errors.append("Quantity must be a valid number.")

            cost = row_data.get("unit_cost")
            if cost is not None:
                try:
                    row_data["unit_cost"] = float(cost)
                except (ValueError, TypeError):
                    pass

        status = "error" if row_errors else ("warning" if row_warnings else "valid")
        if status == "valid":
            valid_count += 1
        elif status == "warning":
            warning_count += 1
            valid_count += 1  # Warnings can still be committed
        else:
            error_count += 1
            errors_summary.append({"row": row_num, "errors": row_errors})

        preview_rows.append({
            "row_num": row_num,
            "status": status,
            "data": row_data,
            "errors": row_errors,
            "warnings": row_warnings
        })

    return {
        "import_type": import_type,
        "total_rows": len(df),
        "valid_count": valid_count,
        "warning_count": warning_count,
        "error_count": error_count,
        "can_commit": error_count == 0 and valid_count > 0,
        "column_mapping": mapping,
        "unmapped_columns": unmapped,
        "preview_rows": preview_rows[:100],  # Return up to 100 rows for preview
        "errors_summary": errors_summary[:50]
    }


# ---------------------------------------------------------------------------
# Transactional Commit & Batch Tracking
# ---------------------------------------------------------------------------

def commit_import_batch(
    validated_rows: List[Dict[str, Any]],
    import_type: str,
    filename: str,
    username: str,
    db: Session
) -> Dict[str, Any]:
    """
    Commit validated import rows inside a database transaction tagged with a batch_id.
    Stores historical state for opening stock to enable full undo/rollback.
    """
    batch_id = f"BATCH-{datetime.datetime.now().strftime('%Y%m%d%H%M%S')}-{uuid.uuid4().hex[:6].upper()}"
    now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    committed_count = 0
    undo_metadata: List[Dict[str, Any]] = []

    for row_info in validated_rows:
        if row_info.get("status") == "error":
            continue

        data = row_info.get("data", {})

        if import_type == "items":
            sku = str(data.get("sku")).strip()
            item = db.query(Inventory).filter(Inventory.sku == sku).first()

            if item:
                # Track prior values for undo
                undo_metadata.append({
                    "action": "update",
                    "sku": sku,
                    "previous_name": item.name,
                    "previous_qty": item.quantity,
                    "previous_cost": item.unit_cost,
                    "previous_price": item.selling_price
                })
                item.name = data.get("name") or item.name
                item.category = data.get("category") or item.category
                item.unit = data.get("unit") or item.unit
                if data.get("quantity") is not None:
                    item.quantity = float(data.get("quantity"))
                if data.get("unit_cost") is not None:
                    item.unit_cost = float(data.get("unit_cost"))
                if data.get("selling_price") is not None:
                    item.selling_price = float(data.get("selling_price"))
                if data.get("reorder_level") is not None:
                    item.reorder_level = int(data.get("reorder_level"))
                if data.get("reorder_qty") is not None:
                    item.reorder_qty = int(data.get("reorder_qty"))
                item.location = data.get("location") or item.location
                item.compatible_with = data.get("compatible_with") or item.compatible_with
                item.hsn_code = str(data.get("hsn_code") or item.hsn_code or "8466")
                item.gst_rate = float(data.get("gst_rate") or item.gst_rate or 18.0)
                item.import_batch_id = batch_id
                item.last_updated = now_str
            else:
                undo_metadata.append({"action": "create", "sku": sku})
                new_item = Inventory(
                    sku=sku,
                    name=data.get("name"),
                    category=data.get("category") or "Consumables",
                    unit=data.get("unit") or "PCS",
                    quantity=float(data.get("quantity") or 0),
                    unit_cost=float(data.get("unit_cost") or 0.0),
                    selling_price=float(data.get("selling_price") or 0.0),
                    reorder_level=int(data.get("reorder_level") or 10),
                    reorder_qty=int(data.get("reorder_qty") or 50),
                    location=data.get("location") or "A-01",
                    supplier_id=data.get("supplier_id"),
                    compatible_with=data.get("compatible_with") or "Universal",
                    hsn_code=str(data.get("hsn_code") or "8466"),
                    gst_rate=float(data.get("gst_rate") or 18.0),
                    is_active=True,
                    last_updated=now_str
                )
                db.add(new_item)

            # Record stock movement if initial qty > 0
            qty = float(data.get("quantity") or 0)
            if qty > 0:
                # Flush to ensure item has an ID
                db.flush()
                item_obj = item or new_item
                db.add(StockMovement(
                    item_id=item_obj.id,
                    type="IN",
                    quantity=int(qty),
                    balance_after=int(item_obj.quantity),
                    reference=f"Import [{batch_id}]",
                    performed_by=username,
                    timestamp=now_str,
                    ))
            committed_count += 1

        elif import_type == "suppliers":
            sup_id = str(data.get("id")).strip()
            sup = db.query(Vendor).filter(Vendor.id == sup_id).first()

            if sup:
                undo_metadata.append({"action": "update", "id": sup_id, "previous_name": sup.name})
                sup.name = data.get("name") or sup.name
                sup.contact_person = data.get("contact_person") or sup.contact_person
                sup.phone = data.get("phone") or sup.phone
                sup.email = data.get("email") or sup.email
                sup.city = data.get("city") or sup.city
                sup.state = data.get("state") or sup.state or "Haryana"
                sup.gstin = data.get("gstin") or sup.gstin
                sup.category = data.get("category") or sup.category
                if data.get("lead_time_days") is not None:
                    sup.lead_time_days = int(data.get("lead_time_days"))
                sup.import_batch_id = batch_id
            else:
                undo_metadata.append({"action": "create", "id": sup_id})
                new_sup = Vendor(
                    id=sup_id,
                    name=data.get("name"),
                    contact_person=data.get("contact_person") or "Procurement Manager",
                    phone=data.get("phone") or "+91 98110 00000",
                    email=data.get("email") or f"orders@{sup_id.lower()}.example",
                    city=data.get("city") or "Gurugram",
                    state=data.get("state") or "Haryana",
                    gstin=data.get("gstin") or "06AAACA0000A1Z1",
                    category=data.get("category") or "Torches & Spares",
                    lead_time_days=int(data.get("lead_time_days") or 3),
                    rating=5.0,
                    approved=True
                )
                db.add(new_sup)
            committed_count += 1

        elif import_type == "opening_stock":
            sku = str(data.get("sku")).strip()
            item = db.query(Inventory).filter(Inventory.sku == sku).first()
            if item:
                prev_qty = item.quantity
                new_qty = float(data.get("quantity", 0))
                undo_metadata.append({
                    "action": "stock_override",
                    "sku": sku,
                    "previous_qty": prev_qty,
                    "new_qty": new_qty
                })
                item.quantity = new_qty
                if data.get("unit_cost") is not None:
                    item.unit_cost = float(data.get("unit_cost"))
                if data.get("location"):
                    item.location = str(data.get("location"))
                item.import_batch_id = batch_id
                item.last_updated = now_str

                # Record stock adjustment movement
                delta = new_qty - prev_qty
                db.add(StockMovement(
                    item_id=item.id,
                    type="ADJUSTMENT",
                    quantity=int(delta),
                    balance_after=int(new_qty),
                    reference=f"Import [{batch_id}]",
                    performed_by=username,
                    timestamp=now_str,
                    ))
                committed_count += 1

    # Record the batch in ImportBatch
    batch_record = ImportBatch(
        batch_id=batch_id,
        import_type=import_type,
        filename=filename,
        created_at=now_str,
        created_by=username,
        records_count=committed_count,
        status="committed",
        details_json=json.dumps(undo_metadata)
    )
    db.add(batch_record)

    # Log to audit trail
    db.add(AuditLog(
        timestamp=now_str,
        action="DATA_IMPORT",
        user=username,
        target_id=batch_id,
        details=f"Committed {committed_count} {import_type} records from {filename}."
    ))

    db.commit()

    return {
        "status": "success",
        "batch_id": batch_id,
        "import_type": import_type,
        "records_count": committed_count,
        "filename": filename,
        "committed_at": now_str
    }


# ---------------------------------------------------------------------------
# Undo / Rollback
# ---------------------------------------------------------------------------

def rollback_import_batch(batch_id: str, username: str, db: Session) -> Dict[str, Any]:
    """
    Roll back an import batch cleanly:
    - Deactivates/removes created items or suppliers
    - Restores previous stock counts from saved snapshot
    """
    batch = db.query(ImportBatch).filter(ImportBatch.batch_id == batch_id).first()
    if not batch:
        raise ValueError(f"Import batch '{batch_id}' not found.")

    if batch.status == "rolled_back":
        raise ValueError(f"Batch '{batch_id}' has already been rolled back.")

    now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    undo_items: List[Dict[str, Any]] = json.loads(batch.details_json or "[]")
    reverted_count = 0

    if batch.import_type == "items":
        for entry in undo_items:
            action = entry.get("action")
            sku = entry.get("sku")
            item = db.query(Inventory).filter(Inventory.sku == sku).first()
            if not item:
                continue

            if action == "create":
                # Deactivate or delete created item
                item.is_active = False
                reverted_count += 1
            elif action == "update":
                item.name = entry.get("previous_name", item.name)
                item.quantity = entry.get("previous_qty", item.quantity)
                item.unit_cost = entry.get("previous_cost", item.unit_cost)
                item.selling_price = entry.get("previous_price", item.selling_price)
                reverted_count += 1

        # Delete batch stock movements
        db.query(StockMovement).filter(StockMovement.reference.like(f"%{batch_id}%")).delete()

    elif batch.import_type == "suppliers":
        for entry in undo_items:
            action = entry.get("action")
            sup_id = entry.get("id")
            sup = db.query(Vendor).filter(Vendor.id == sup_id).first()
            if sup and action == "create":
                sup.approved = False
                reverted_count += 1

    elif batch.import_type == "opening_stock":
        for entry in undo_items:
            sku = entry.get("sku")
            prev_qty = entry.get("previous_qty", 0)
            item = db.query(Inventory).filter(Inventory.sku == sku).first()
            if item:
                delta = prev_qty - item.quantity
                item.quantity = prev_qty
                db.add(StockMovement(
                    item_id=item.id,
                    type="ADJUSTMENT",
                    quantity=int(delta),
                    balance_after=int(prev_qty),
                    reference=f"Rollback [{batch_id}]",
                    performed_by=username,
                    timestamp=now_str
                ))
                reverted_count += 1

    batch.status = "rolled_back"
    db.add(AuditLog(
        timestamp=now_str,
        action="IMPORT_ROLLBACK",
        user=username,
        target_id=batch_id,
        details=f"Rolled back {reverted_count} entries for batch {batch_id}."
    ))

    db.commit()

    return {
        "status": "success",
        "batch_id": batch_id,
        "reverted_count": reverted_count,
        "rolled_back_at": now_str
    }


def list_import_batches(db: Session, limit: int = 50) -> List[Dict[str, Any]]:
    """List historical import batches for management and audit."""
    batches = db.query(ImportBatch).order_by(ImportBatch.id.desc()).limit(limit).all()
    return [
        {
            "id": b.id,
            "batch_id": b.batch_id,
            "import_type": b.import_type,
            "filename": b.filename,
            "records_count": b.records_count,
            "status": b.status,
            "created_at": b.created_at,
            "created_by": b.created_by
        }
        for b in batches
    ]


# ---------------------------------------------------------------------------
# Pre-populated Template Generators
# ---------------------------------------------------------------------------

SAMPLE_ITEMS = [
    {
        "sku": "BINZ-MB24-NOZ",
        "name": "MIG Conical Gas Nozzle MB24 KD NW 12.5mm",
        "category": "Consumables",
        "unit": "PCS",
        "quantity": 150,
        "unit_cost": 185.0,
        "selling_price": 280.0,
        "reorder_level": 30,
        "reorder_qty": 100,
        "location": "A-01-B2",
        "supplier_id": "V001",
        "compatible_with": "Abicor Binzel MB24 / Panasonic 350A",
        "hsn_code": "8466",
        "gst_rate": 18.0
    },
    {
        "sku": "TIG-COL-16-01",
        "name": "TIG Collet Body 1.6mm Brass Heavy Duty WP-26",
        "category": "Torch Spares",
        "unit": "PCS",
        "quantity": 200,
        "unit_cost": 42.0,
        "selling_price": 75.0,
        "reorder_level": 40,
        "reorder_qty": 200,
        "location": "A-02-C1",
        "supplier_id": "V002",
        "compatible_with": "WP-17 / WP-18 / WP-26",
        "hsn_code": "8466",
        "gst_rate": 18.0
    },
    {
        "sku": "ROBO-TIP-12-CR",
        "name": "Robotics M8 Contact Tip 1.2mm CuCrZr M8x30mm",
        "category": "Robotics Spares",
        "unit": "PCS",
        "quantity": 350,
        "unit_cost": 88.0,
        "selling_price": 145.0,
        "reorder_level": 60,
        "reorder_qty": 300,
        "location": "B-03-A1",
        "supplier_id": "V001",
        "compatible_with": "Panasonic / Fanuc / Yaskawa Robotic Torches",
        "hsn_code": "8466",
        "gst_rate": 18.0
    },
    {
        "sku": "SAFETY-GLV-01",
        "name": "Split Leather Welding Gauntlets Red 16 Inch",
        "category": "Safety Equipment",
        "unit": "PAIR",
        "quantity": 80,
        "unit_cost": 210.0,
        "selling_price": 340.0,
        "reorder_level": 25,
        "reorder_qty": 50,
        "location": "C-01-E4",
        "supplier_id": "V003",
        "compatible_with": "Universal Workshop Safety",
        "hsn_code": "4203",
        "gst_rate": 18.0
    }
]

SAMPLE_SUPPLIERS = [
    {
        "id": "V001",
        "name": "Abicor Binzel Tech India Pvt Ltd",
        "contact_person": "Rajesh Sharma",
        "phone": "+91 98110 23451",
        "email": "orders@abicorbinzel.example",
        "city": "Gurugram",
        "state": "Haryana",
        "gstin": "06AAACA1234F1Z5",
        "category": "MIG/TIG Torches & Spares",
        "lead_time_days": 2
    },
    {
        "id": "V002",
        "name": "ESAB India Industrial Supplies",
        "contact_person": "Pooja Varma",
        "phone": "+91 98110 98765",
        "email": "procurement@esab.example",
        "city": "Delhi-NCR",
        "state": "Delhi",
        "gstin": "07AAACE5678B1Z2",
        "category": "Electrodes & Flux",
        "lead_time_days": 4
    },
    {
        "id": "V003",
        "name": "Fronius India Welding Spares",
        "contact_person": "Amit Chawla",
        "phone": "+91 98220 54321",
        "email": "spares@fronius.example",
        "city": "Pune",
        "state": "Maharashtra",
        "gstin": "27AAACF9012C1Z8",
        "category": "Robotics & Inverters",
        "lead_time_days": 5
    }
]

SAMPLE_OPENING_STOCK = [
    {
        "sku": "BINZ-MB24-NOZ",
        "quantity": 150,
        "unit_cost": 185.0,
        "location": "A-01-B2"
    },
    {
        "sku": "TIG-COL-16-01",
        "quantity": 200,
        "unit_cost": 42.0,
        "location": "A-02-C1"
    },
    {
        "sku": "ROBO-TIP-12-CR",
        "quantity": 350,
        "unit_cost": 88.0,
        "location": "B-03-A1"
    }
]


def generate_template(import_type: str, file_format: str = "csv") -> Tuple[bytes, str, str]:
    """
    Generate downloadable CSV or Excel template pre-filled with sample data.
    Returns: (content_bytes, filename, media_type)
    """
    data_map = {
        "items": SAMPLE_ITEMS,
        "suppliers": SAMPLE_SUPPLIERS,
        "opening_stock": SAMPLE_OPENING_STOCK
    }
    rows = data_map.get(import_type, SAMPLE_ITEMS)
    df = pd.DataFrame(rows)

    if file_format.lower() == "xlsx":
        out = io.BytesIO()
        with pd.ExcelWriter(out, engine="openpyxl") as writer:
            df.to_excel(writer, index=False, sheet_name=import_type.title())
        content = out.getvalue()
        filename = f"anishka_{import_type}_template.xlsx"
        media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    else:
        out = io.StringIO()
        df.to_csv(out, index=False)
        content = out.getvalue().encode("utf-8")
        filename = f"anishka_{import_type}_template.csv"
        media_type = "text/csv; charset=utf-8"

    return content, filename, media_type
