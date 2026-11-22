"""
Realistic Seed Data Generator for Anishka Inventory (Anishka Industries, Gurugram).
Specialized in MIG welding, TIG welding, and robotics welding spares.

Includes:
- ~62 Welding Spares SKUs across 5 core categories
- 14 Industrial Suppliers across Delhi-NCR, Pune, Ahmedabad, Chennai
- 90 Days of chronological stock movements with sequential balance_after tracking
- Historical RECEIVED POs, active APPROVED POs, and 2 DRAFT auto-POs with line items
- 3 RBAC Users: admin (admin@2026), manager (manager@2026), storekeeper (storekeeper@2026)
- Initial immutable Audit Logs
"""
import datetime
import random
from sqlalchemy.orm import Session
from database import (
    Vendor, Inventory, StockMovement, Procurement, POItem,
    AuditLog, UserRole, SessionLocal, engine, Base,
    Customer, SalesOrder, SalesOrderItem, Invoice, Payment
)

def seed_database(db: Session = None):
    """Cleanly populate the database with realistic industrial welding spares data."""
    # Dispose active connections and recreate all tables cleanly
    engine.dispose()
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)

    close_db = False
    if db is None:
        db = SessionLocal()
        close_db = True

    now = datetime.datetime.now()

    # ─── 1. SEED RBAC USERS ──────────────────────────────────────────────
    users_data = [
        {
            "username": "admin",
            "password": "admin@2026",
            "role": "admin",
            "full_name": "Anishka Admin - Store Director",
            "created_at": (now - datetime.timedelta(days=90)).isoformat()
        },
        {
            "username": "manager",
            "password": "manager@2026",
            "role": "manager",
            "full_name": "Procurement & Quality Manager",
            "created_at": (now - datetime.timedelta(days=90)).isoformat()
        },
        {
            "username": "storekeeper",
            "password": "storekeeper@2026",
            "role": "storekeeper",
            "full_name": "Senior Storekeeper - Central Warehouse",
            "created_at": (now - datetime.timedelta(days=90)).isoformat()
        }
    ]
    for u in users_data:
        db.add(UserRole(**u))
    db.commit()

    # ─── 2. SEED 14 INDUSTRIAL SUPPLIERS ─────────────────────────────────
    suppliers_data = [
        {
            "id": "V001",
            "name": "Abicor Binzel Tech India Pvt Ltd",
            "contact_person": "Rajesh Sharma",
            "phone": "+91 98110 23451",
            "city": "Delhi-NCR",
            "lead_time_days": 2,
            "rating": 4.9,
            "category": "MIG Torches & Robotic Spares",
            "contact_email": "delhi.sales@binzel-abicor.in",
            "approved": True,
            "avg_order": 145000.0
        },
        {
            "id": "V002",
            "name": "Panasonic Smart Factory Solutions India",
            "contact_person": "Amitabh Verma",
            "phone": "+91 98101 87654",
            "city": "Delhi-NCR",
            "lead_time_days": 3,
            "rating": 4.8,
            "category": "Robotics & MIG Welding Systems",
            "contact_email": "welding.sales@in.panasonic.com",
            "approved": True,
            "avg_order": 280000.0
        },
        {
            "id": "V003",
            "name": "Fronius India Welding Technology Pvt Ltd",
            "contact_person": "Sandeep Kulkarni",
            "phone": "+91 98220 54321",
            "city": "Pune",
            "lead_time_days": 4,
            "rating": 4.9,
            "category": "TPS/i Robotic Torches & Spares",
            "contact_email": "contact.india@fronius.com",
            "approved": True,
            "avg_order": 310000.0
        },
        {
            "id": "V004",
            "name": "ESAB India Limited",
            "contact_person": "K. Ramanathan",
            "phone": "+91 98400 98765",
            "city": "Chennai",
            "lead_time_days": 5,
            "rating": 4.7,
            "category": "Consumables & Heavy MIG Torches",
            "contact_email": "orders@esab.co.in",
            "approved": True,
            "avg_order": 190000.0
        },
        {
            "id": "V005",
            "name": "Ador Welding Limited",
            "contact_person": "Nitin Joshi",
            "phone": "+91 98231 11223",
            "city": "Pune",
            "lead_time_days": 3,
            "rating": 4.6,
            "category": "Welding Wire & TIG Electrodes",
            "contact_email": "corporate@adorwelding.com",
            "approved": True,
            "avg_order": 165000.0
        },
        {
            "id": "V006",
            "name": "TBi Industries India Pvt Ltd",
            "contact_person": "Vikram Malhotra",
            "phone": "+91 98115 67890",
            "city": "Delhi-NCR",
            "lead_time_days": 2,
            "rating": 4.7,
            "category": "MIG Contact Tips & Diffusers",
            "contact_email": "info@tbi-industries.in",
            "approved": True,
            "avg_order": 85000.0
        },
        {
            "id": "V007",
            "name": "D&H Secheron Electrodes Pvt Ltd",
            "contact_person": "Bhavin Patel",
            "phone": "+91 98250 33445",
            "city": "Ahmedabad",
            "lead_time_days": 4,
            "rating": 4.5,
            "category": "Tungsten Electrodes & Filler Rods",
            "contact_email": "ahmedabad@dnhsecheron.net",
            "approved": True,
            "avg_order": 95000.0
        },
        {
            "id": "V008",
            "name": "Tregaskiss & Bernard Robotic Spares",
            "contact_person": "Mahesh Deshmukh",
            "phone": "+91 98229 88776",
            "city": "Pune",
            "lead_time_days": 4,
            "rating": 4.8,
            "category": "Robotic Reamer Blades & Nozzles",
            "contact_email": "robotic.sales@tregaskiss.in",
            "approved": True,
            "avg_order": 220000.0
        },
        {
            "id": "V009",
            "name": "Weldcraft TIG Spares Corporation",
            "contact_person": "Gaurav Chawla",
            "phone": "+91 98108 44332",
            "city": "Delhi-NCR",
            "lead_time_days": 2,
            "rating": 4.5,
            "category": "TIG Torches, Collets & Gas Lenses",
            "contact_email": "orders@weldcraftspares.com",
            "approved": True,
            "avg_order": 75000.0
        },
        {
            "id": "V010",
            "name": "Cruxweld Industrial Systems",
            "contact_person": "Anil Aggarwal",
            "phone": "+91 98112 99001",
            "city": "Delhi-NCR",
            "lead_time_days": 1,
            "rating": 4.4,
            "category": "MIG Machine Spares & Wire Feeders",
            "contact_email": "support@cruxweld.com",
            "approved": True,
            "avg_order": 110000.0
        },
        {
            "id": "V011",
            "name": "Sharp Weld Consumables & Wire",
            "contact_person": "Jatin Shah",
            "phone": "+91 98240 77665",
            "city": "Ahmedabad",
            "lead_time_days": 3,
            "rating": 4.3,
            "category": "MIG Wire ER70S-6 & SS308L",
            "contact_email": "sales@sharpweld.in",
            "approved": True,
            "avg_order": 250000.0
        },
        {
            "id": "V012",
            "name": "Dynamic Robotic Automation Systems",
            "contact_person": "Prasad Shinde",
            "phone": "+91 98230 45678",
            "city": "Pune",
            "lead_time_days": 5,
            "rating": 4.6,
            "category": "Robotic Cable Assemblies & Dresspacks",
            "contact_email": "spares@dynamicrobotics.co.in",
            "approved": True,
            "avg_order": 340000.0
        },
        {
            "id": "V013",
            "name": "South India Welding Spares & Liners",
            "contact_person": "S. Venkat",
            "phone": "+91 98410 22334",
            "city": "Chennai",
            "lead_time_days": 6,
            "rating": 4.2,
            "category": "Steel & Teflon Torch Liners",
            "contact_email": "chennai.desk@siwelding.com",
            "approved": True,
            "avg_order": 65000.0
        },
        {
            "id": "V014",
            "name": "Gurugram Industrial Gas & Safety Equipment",
            "contact_person": "Sunil Yadav",
            "phone": "+91 98180 55667",
            "city": "Delhi-NCR",
            "lead_time_days": 1,
            "rating": 4.5,
            "category": "Safety Helmets, Gloves & Anti-Spatter",
            "contact_email": "khandsa.safety@gmail.com",
            "approved": True,
            "avg_order": 55000.0
        }
    ]
    for s in suppliers_data:
        db.add(Vendor(**s))
    db.commit()

    # ─── 3. SEED ~62 INDUSTRIAL WELDING SPARES CATALOG ───────────────────
    # Definitions specify initial target quantities and characteristics:
    # - profile: 'fast_mover', 'standard', 'slow_mover', 'low_stock', 'out_of_stock', 'dead_stock'
    items_catalog = [
        # ── Category 1: MIG Welding (18 SKUs) ──
        {
            "sku": "MIG-CT-M6-08",
            "name": "CuCrZr M6 Contact Tip 0.8mm (Binzel Style)",
            "category": "MIG Welding", "unit": "pcs",
            "compatible_with": "MB 15AK / MB 24KD / MB 25AK",
            "location": "R1-B01", "reorder_level": 80, "reorder_qty": 200,
            "unit_cost": 22.0, "selling_price": 38.0, "supplier_id": "V001",
            "profile": "fast_mover", "target_qty": 420
        },
        {
            "sku": "MIG-CT-M6-10",
            "name": "CuCrZr M6 Contact Tip 1.0mm (Binzel Style)",
            "category": "MIG Welding", "unit": "pcs",
            "compatible_with": "MB 24KD / MB 25AK / MB 36KD",
            "location": "R1-B02", "reorder_level": 80, "reorder_qty": 200,
            "unit_cost": 24.0, "selling_price": 40.0, "supplier_id": "V001",
            "profile": "fast_mover", "target_qty": 380
        },
        {
            "sku": "MIG-CT-M8-10",
            "name": "Heavy Duty CuCrZr M8 Contact Tip 1.0mm",
            "category": "MIG Welding", "unit": "pcs",
            "compatible_with": "MB 36KD / MB 501D / Panasonic 350A",
            "location": "R1-B03", "reorder_level": 60, "reorder_qty": 150,
            "unit_cost": 32.0, "selling_price": 52.0, "supplier_id": "V006",
            "profile": "fast_mover", "target_qty": 290
        },
        {
            "sku": "MIG-CT-M8-12",
            "name": "Heavy Duty CuCrZr M8 Contact Tip 1.2mm",
            "category": "MIG Welding", "unit": "pcs",
            "compatible_with": "MB 36KD / MB 501D / Fronius TPS",
            "location": "R1-B04", "reorder_level": 70, "reorder_qty": 150,
            "unit_cost": 34.0, "selling_price": 55.0, "supplier_id": "V001",
            "profile": "low_stock", "target_qty": 45  # Low stock (<= 70)
        },
        {
            "sku": "MIG-CT-M8-16",
            "name": "Heavy Duty CuCrZr M8 Contact Tip 1.6mm",
            "category": "MIG Welding", "unit": "pcs",
            "compatible_with": "MB 501D / Heavy Fabrication Gantry",
            "location": "R1-B05", "reorder_level": 30, "reorder_qty": 100,
            "unit_cost": 38.0, "selling_price": 62.0, "supplier_id": "V006",
            "profile": "standard", "target_qty": 140
        },
        {
            "sku": "MIG-NZ-CON15",
            "name": "Conical Gas Nozzle MB 15AK 12mm Bore",
            "category": "MIG Welding", "unit": "pcs",
            "compatible_with": "MB 15AK MIG Torch",
            "location": "R1-B06", "reorder_level": 40, "reorder_qty": 100,
            "unit_cost": 85.0, "selling_price": 135.0, "supplier_id": "V001",
            "profile": "standard", "target_qty": 160
        },
        {
            "sku": "MIG-NZ-CON24",
            "name": "Conical Gas Nozzle MB 24KD 12.5mm Bore",
            "category": "MIG Welding", "unit": "pcs",
            "compatible_with": "MB 24KD Torch",
            "location": "R1-B07", "reorder_level": 35, "reorder_qty": 80,
            "unit_cost": 110.0, "selling_price": 175.0, "supplier_id": "V001",
            "profile": "low_stock", "target_qty": 22  # Low stock (<= 35)
        },
        {
            "sku": "MIG-NZ-CON36",
            "name": "Conical Gas Nozzle MB 36KD 16mm Bore",
            "category": "MIG Welding", "unit": "pcs",
            "compatible_with": "MB 36KD Torch",
            "location": "R1-B08", "reorder_level": 35, "reorder_qty": 80,
            "unit_cost": 145.0, "selling_price": 225.0, "supplier_id": "V006",
            "profile": "fast_mover", "target_qty": 185
        },
        {
            "sku": "MIG-NZ-CYL36",
            "name": "Cylindrical Gas Nozzle MB 36KD 19mm Bore",
            "category": "MIG Welding", "unit": "pcs",
            "compatible_with": "MB 36KD Heavy Deposition",
            "location": "R1-B09", "reorder_level": 20, "reorder_qty": 50,
            "unit_cost": 155.0, "selling_price": 240.0, "supplier_id": "V006",
            "profile": "standard", "target_qty": 85
        },
        {
            "sku": "MIG-NZ-WAT501",
            "name": "Water-Cooled Gas Nozzle MB 501D 16mm Bore",
            "category": "MIG Welding", "unit": "pcs",
            "compatible_with": "MB 501D Water-Cooled Torch",
            "location": "R1-B10", "reorder_level": 25, "reorder_qty": 60,
            "unit_cost": 210.0, "selling_price": 320.0, "supplier_id": "V001",
            "profile": "standard", "target_qty": 95
        },
        {
            "sku": "MIG-DF-24KD",
            "name": "Ceramic Gas Diffuser MB 24KD (White)",
            "category": "MIG Welding", "unit": "pcs",
            "compatible_with": "MB 24KD Torch",
            "location": "R1-B11", "reorder_level": 50, "reorder_qty": 120,
            "unit_cost": 45.0, "selling_price": 75.0, "supplier_id": "V001",
            "profile": "fast_mover", "target_qty": 310
        },
        {
            "sku": "MIG-DF-36KD",
            "name": "DMC Heavy Duty Gas Diffuser MB 36KD (Black)",
            "category": "MIG Welding", "unit": "pcs",
            "compatible_with": "MB 36KD Torch",
            "location": "R1-B12", "reorder_level": 40, "reorder_qty": 100,
            "unit_cost": 55.0, "selling_price": 90.0, "supplier_id": "V006",
            "profile": "fast_mover", "target_qty": 240
        },
        {
            "sku": "MIG-LIN-ST-03",
            "name": "Insulated Steel Torch Liner 3.0m (0.8-1.0mm Wire)",
            "category": "MIG Welding", "unit": "pcs",
            "compatible_with": "MB 15AK / MB 24KD 3-Meter Torches",
            "location": "R1-B13", "reorder_level": 25, "reorder_qty": 60,
            "unit_cost": 165.0, "selling_price": 265.0, "supplier_id": "V013",
            "profile": "standard", "target_qty": 115
        },
        {
            "sku": "MIG-LIN-ST-05",
            "name": "Insulated Steel Torch Liner 5.0m (1.2-1.6mm Wire)",
            "category": "MIG Welding", "unit": "pcs",
            "compatible_with": "MB 36KD / MB 501D 5-Meter Torches",
            "location": "R1-B14", "reorder_level": 25, "reorder_qty": 60,
            "unit_cost": 215.0, "selling_price": 340.0, "supplier_id": "V013",
            "profile": "fast_mover", "target_qty": 140
        },
        {
            "sku": "MIG-LIN-TEF-05",
            "name": "Teflon Liner 5.0m for 1.6mm Aluminum Wire (Yellow)",
            "category": "MIG Welding", "unit": "pcs",
            "compatible_with": "Aluminum MIG Torches 5M",
            "location": "R1-B15", "reorder_level": 10, "reorder_qty": 25,
            "unit_cost": 480.0, "selling_price": 720.0, "supplier_id": "V006",
            "profile": "dead_stock", "target_qty": 18  # DEAD STOCK #1 (No movements 60+ days)
        },
        {
            "sku": "MIG-TR-24KD-3M",
            "name": "Complete Air-Cooled MIG Torch MB 24KD 3-Meter",
            "category": "MIG Welding", "unit": "pcs",
            "compatible_with": "Euro Central Connector Machines",
            "location": "R1-B16", "reorder_level": 8, "reorder_qty": 20,
            "unit_cost": 2400.0, "selling_price": 3600.0, "supplier_id": "V001",
            "profile": "standard", "target_qty": 28
        },
        {
            "sku": "MIG-TR-36KD-5M",
            "name": "Complete Air-Cooled MIG Torch MB 36KD 5-Meter",
            "category": "MIG Welding", "unit": "pcs",
            "compatible_with": "Euro Central Connector Machines 350A+",
            "location": "R1-B17", "reorder_level": 6, "reorder_qty": 15,
            "unit_cost": 3800.0, "selling_price": 5600.0, "supplier_id": "V001",
            "profile": "slow_mover", "target_qty": 19
        },
        {
            "sku": "MIG-TR-501D-8M",
            "name": "Water-Cooled MIG Torch MB 501D 8-Meter Heavy Duty",
            "category": "MIG Welding", "unit": "pcs",
            "compatible_with": "Heavy Duty Water Cooler Systems 500A",
            "location": "R1-B18", "reorder_level": 2, "reorder_qty": 5,
            "unit_cost": 9500.0, "selling_price": 13500.0, "supplier_id": "V001",
            "profile": "dead_stock", "target_qty": 3  # DEAD STOCK #2 (No movements 60+ days)
        },

        # ── Category 2: TIG Welding (15 SKUs) ──
        {
            "sku": "TIG-TE-WT20-16",
            "name": "Tungsten Electrode 2% Thoriated WT20 1.6x175mm (Red)",
            "category": "TIG Welding", "unit": "pcs",
            "compatible_with": "WP-17 / WP-26 / WP-9 / WP-18 DC TIG",
            "location": "R2-B01", "reorder_level": 50, "reorder_qty": 150,
            "unit_cost": 48.0, "selling_price": 75.0, "supplier_id": "V007",
            "profile": "fast_mover", "target_qty": 280
        },
        {
            "sku": "TIG-TE-WT20-24",
            "name": "Tungsten Electrode 2% Thoriated WT20 2.4x175mm (Red)",
            "category": "TIG Welding", "unit": "pcs",
            "compatible_with": "WP-17 / WP-26 / WP-18 DC TIG Stainless/Carbon",
            "location": "R2-B02", "reorder_level": 60, "reorder_qty": 200,
            "unit_cost": 72.0, "selling_price": 115.0, "supplier_id": "V007",
            "profile": "fast_mover", "target_qty": 360
        },
        {
            "sku": "TIG-TE-WT20-32",
            "name": "Tungsten Electrode 2% Thoriated WT20 3.2x175mm (Red)",
            "category": "TIG Welding", "unit": "pcs",
            "compatible_with": "WP-26 / WP-18 Heavy Wall Pipe TIG",
            "location": "R2-B03", "reorder_level": 30, "reorder_qty": 100,
            "unit_cost": 115.0, "selling_price": 180.0, "supplier_id": "V007",
            "profile": "standard", "target_qty": 140
        },
        {
            "sku": "TIG-TE-WL20-24",
            "name": "Tungsten Electrode 2% Lanthanated WL20 2.4mm (Blue)",
            "category": "TIG Welding", "unit": "pcs",
            "compatible_with": "Universal AC/DC TIG (Non-Radioactive)",
            "location": "R2-B04", "reorder_level": 40, "reorder_qty": 120,
            "unit_cost": 88.0, "selling_price": 140.0, "supplier_id": "V005",
            "profile": "fast_mover", "target_qty": 210
        },
        {
            "sku": "TIG-TE-WC20-24",
            "name": "Tungsten Electrode 2% Ceriated WC20 2.4mm (Grey)",
            "category": "TIG Welding", "unit": "pcs",
            "compatible_with": "Low Ampere Sheet Metal & Orbital TIG",
            "location": "R2-B05", "reorder_level": 30, "reorder_qty": 100,
            "unit_cost": 82.0, "selling_price": 130.0, "supplier_id": "V005",
            "profile": "standard", "target_qty": 125
        },
        {
            "sku": "TIG-TE-WP-GRN",
            "name": "Pure Tungsten Electrode Green WP 3.2mm (AC Aluminum)",
            "category": "TIG Welding", "unit": "pcs",
            "compatible_with": "Conventional Transformer AC Aluminum TIG",
            "location": "R2-B06", "reorder_level": 20, "reorder_qty": 50,
            "unit_cost": 95.0, "selling_price": 145.0, "supplier_id": "V007",
            "profile": "dead_stock", "target_qty": 45  # DEAD STOCK #3 (No movements 60+ days)
        },
        {
            "sku": "TIG-CC-NO05",
            "name": "Alumina Ceramic Gas Cup #5 (5/16\" Bore)",
            "category": "TIG Welding", "unit": "pcs",
            "compatible_with": "WP-17 / WP-26 / WP-18 Torches",
            "location": "R2-B07", "reorder_level": 40, "reorder_qty": 100,
            "unit_cost": 28.0, "selling_price": 48.0, "supplier_id": "V009",
            "profile": "standard", "target_qty": 190
        },
        {
            "sku": "TIG-CC-NO06",
            "name": "Alumina Ceramic Gas Cup #6 (3/8\" Bore)",
            "category": "TIG Welding", "unit": "pcs",
            "compatible_with": "WP-17 / WP-26 / WP-18 Torches",
            "location": "R2-B08", "reorder_level": 50, "reorder_qty": 120,
            "unit_cost": 28.0, "selling_price": 48.0, "supplier_id": "V009",
            "profile": "fast_mover", "target_qty": 260
        },
        {
            "sku": "TIG-CC-NO08",
            "name": "Alumina Ceramic Gas Cup #8 (1/2\" Bore)",
            "category": "TIG Welding", "unit": "pcs",
            "compatible_with": "WP-17 / WP-26 / WP-18 Torches",
            "location": "R2-B09", "reorder_level": 40, "reorder_qty": 100,
            "unit_cost": 32.0, "selling_price": 54.0, "supplier_id": "V009",
            "profile": "fast_mover", "target_qty": 220
        },
        {
            "sku": "TIG-COL-16",
            "name": "Copper TIG Collet 1.6mm (WP-17/26)",
            "category": "TIG Welding", "unit": "pcs",
            "compatible_with": "WP-17, WP-18, WP-26 Torches",
            "location": "R2-B10", "reorder_level": 35, "reorder_qty": 100,
            "unit_cost": 22.0, "selling_price": 38.0, "supplier_id": "V009",
            "profile": "standard", "target_qty": 175
        },
        {
            "sku": "TIG-COL-24",
            "name": "Copper TIG Collet 2.4mm (WP-17/26)",
            "category": "TIG Welding", "unit": "pcs",
            "compatible_with": "WP-17, WP-18, WP-26 Torches",
            "location": "R2-B11", "reorder_level": 45, "reorder_qty": 120,
            "unit_cost": 24.0, "selling_price": 42.0, "supplier_id": "V009",
            "profile": "fast_mover", "target_qty": 230
        },
        {
            "sku": "TIG-CB-24",
            "name": "Brass TIG Collet Body 2.4mm (WP-17/26)",
            "category": "TIG Welding", "unit": "pcs",
            "compatible_with": "WP-17, WP-18, WP-26 Torches",
            "location": "R2-B12", "reorder_level": 25, "reorder_qty": 60,
            "unit_cost": 58.0, "selling_price": 95.0, "supplier_id": "V009",
            "profile": "low_stock", "target_qty": 12  # Low stock (<= 25)
        },
        {
            "sku": "TIG-GL-KIT32",
            "name": "Pyrex Glass Cup Gas Lens Kit 3.2mm WP-17/26",
            "category": "TIG Welding", "unit": "set",
            "compatible_with": "Titanium / Inconel Precision TIG",
            "location": "R2-B13", "reorder_level": 8, "reorder_qty": 25,
            "unit_cost": 650.0, "selling_price": 980.0, "supplier_id": "V009",
            "profile": "out_of_stock", "target_qty": 0  # OUT OF STOCK #1
        },
        {
            "sku": "TIG-BC-LNG",
            "name": "Long Back Cap with O-Ring (57Y02)",
            "category": "TIG Welding", "unit": "pcs",
            "compatible_with": "WP-17 / WP-18 / WP-26",
            "location": "R2-B14", "reorder_level": 20, "reorder_qty": 50,
            "unit_cost": 65.0, "selling_price": 110.0, "supplier_id": "V009",
            "profile": "standard", "target_qty": 88
        },
        {
            "sku": "TIG-TR-WP26-4M",
            "name": "Air-Cooled TIG Torch WP-26 4-Meter Flexible Neck",
            "category": "TIG Welding", "unit": "pcs",
            "compatible_with": "Two-Pin Switch + 3/8G Dinse 35-50",
            "location": "R2-B15", "reorder_level": 5, "reorder_qty": 15,
            "unit_cost": 2850.0, "selling_price": 4200.0, "supplier_id": "V009",
            "profile": "slow_mover", "target_qty": 16
        },

        # ── Category 3: Robotics Spares (13 SKUs) ──
        {
            "sku": "ROB-SN-22",
            "name": "Robotic Torch Swan Neck 22° Binzel/Panasonic Type",
            "category": "Robotics Spares", "unit": "pcs",
            "compatible_with": "ABB IRB 1600ID / Panasonic TA-1400",
            "location": "R3-B01", "reorder_level": 4, "reorder_qty": 10,
            "unit_cost": 5200.0, "selling_price": 7800.0, "supplier_id": "V001",
            "profile": "slow_mover", "target_qty": 8
        },
        {
            "sku": "ROB-SN-45",
            "name": "Robotic Torch Swan Neck 45° KUKA/Fanuc Type",
            "category": "Robotics Spares", "unit": "pcs",
            "compatible_with": "Fanuc Arc Mate 100iD / KUKA KR-CYBERTECH",
            "location": "R3-B02", "reorder_level": 3, "reorder_qty": 8,
            "unit_cost": 5600.0, "selling_price": 8400.0, "supplier_id": "V002",
            "profile": "low_stock", "target_qty": 2  # Low stock (<= 3)
        },
        {
            "sku": "ROB-CT-SLV-12",
            "name": "Silver-Plated Robotic Contact Tip 1.2mm M8",
            "category": "Robotics Spares", "unit": "pcs",
            "compatible_with": "Automated High-Duty Robot Torches",
            "location": "R3-B03", "reorder_level": 50, "reorder_qty": 150,
            "unit_cost": 85.0, "selling_price": 140.0, "supplier_id": "V008",
            "profile": "fast_mover", "target_qty": 165
        },
        {
            "sku": "ROB-NZ-CL50",
            "name": "Robotic Pneumatic Reamer Blade 15mm (Tregaskiss Style)",
            "category": "Robotics Spares", "unit": "pcs",
            "compatible_with": "Tregaskiss Tough Gun TT3 Torch Cleaner",
            "location": "R3-B04", "reorder_level": 6, "reorder_qty": 20,
            "unit_cost": 1450.0, "selling_price": 2150.0, "supplier_id": "V008",
            "profile": "out_of_stock", "target_qty": 0  # OUT OF STOCK #2
        },
        {
            "sku": "ROB-RM-BLD-13",
            "name": "Binzel BRS Robotic Torch Reamer Cutter Blade 13mm",
            "category": "Robotics Spares", "unit": "pcs",
            "compatible_with": "Binzel BRS-CC / BRS-FP Cleaning Station",
            "location": "R3-B05", "reorder_level": 5, "reorder_qty": 15,
            "unit_cost": 1650.0, "selling_price": 2450.0, "supplier_id": "V001",
            "profile": "standard", "target_qty": 14
        },
        {
            "sku": "ROB-COL-SENS",
            "name": "Robotic Collision Sensor Safety Clutch CAT2",
            "category": "Robotics Spares", "unit": "pcs",
            "compatible_with": "Standard Robot Flange ISO 9409-1-50",
            "location": "R3-B06", "reorder_level": 2, "reorder_qty": 5,
            "unit_cost": 18500.0, "selling_price": 26500.0, "supplier_id": "V001",
            "profile": "slow_mover", "target_qty": 5
        },
        {
            "sku": "ROB-ASP-INJ",
            "name": "Anti-Spatter Injector Pump Assembly for Station",
            "category": "Robotics Spares", "unit": "pcs",
            "compatible_with": "Automated Cleaning Bays / Reamers",
            "location": "R3-B07", "reorder_level": 3, "reorder_qty": 8,
            "unit_cost": 6800.0, "selling_price": 9800.0, "supplier_id": "V012",
            "profile": "slow_mover", "target_qty": 7
        },
        {
            "sku": "ROB-CBL-12M",
            "name": "Robotic Corrugated Coaxial Cable Assembly 12-Meter",
            "category": "Robotics Spares", "unit": "pcs",
            "compatible_with": "Hollow-Wrist Arc Welding Robots (ABB/Fanuc)",
            "location": "R3-B08", "reorder_level": 2, "reorder_qty": 5,
            "unit_cost": 16800.0, "selling_price": 23500.0, "supplier_id": "V012",
            "profile": "dead_stock", "target_qty": 4  # DEAD STOCK #4 (No movements 60+ days)
        },
        {
            "sku": "ROB-WF-RL12",
            "name": "Robotic Wire Feeder Drive Rolls 1.2mm V-Groove",
            "category": "Robotics Spares", "unit": "set",
            "compatible_with": "Panasonic / Fronius WF Units",
            "location": "R3-B09", "reorder_level": 6, "reorder_qty": 15,
            "unit_cost": 1250.0, "selling_price": 1850.0, "supplier_id": "V002",
            "profile": "standard", "target_qty": 22
        },
        {
            "sku": "ROB-GAS-NOZ-SL",
            "name": "Heavy Duty Slip-On Robotic Nozzle 16mm",
            "category": "Robotics Spares", "unit": "pcs",
            "compatible_with": "ABIROB A360 / Tregaskiss TOUGH GUN",
            "location": "R3-B10", "reorder_level": 30, "reorder_qty": 80,
            "unit_cost": 340.0, "selling_price": 520.0, "supplier_id": "V008",
            "profile": "fast_mover", "target_qty": 110
        },
        {
            "sku": "ROB-WIRE-CONDUIT",
            "name": "Low-Friction Quick-Disconnect Wire Conduit 10m",
            "category": "Robotics Spares", "unit": "mtr",
            "compatible_with": "Bulk Drum Wire Feeds to Robot Base",
            "location": "R3-B11", "reorder_level": 20, "reorder_qty": 50,
            "unit_cost": 280.0, "selling_price": 420.0, "supplier_id": "V012",
            "profile": "standard", "target_qty": 65
        },
        {
            "sku": "ROB-CAL-POINTER",
            "name": "Tool Center Point (TCP) Calibration Pointer Kit",
            "category": "Robotics Spares", "unit": "set",
            "compatible_with": "Robot Cell Alignment & Teaching",
            "location": "R3-B12", "reorder_level": 2, "reorder_qty": 5,
            "unit_cost": 4200.0, "selling_price": 6200.0, "supplier_id": "V012",
            "profile": "slow_mover", "target_qty": 6
        },
        {
            "sku": "ROB-TCP-TEST",
            "name": "TCP Mechanical Gauge Check Block",
            "category": "Robotics Spares", "unit": "pcs",
            "compatible_with": "Robotic Welding Fixtures",
            "location": "R3-B13", "reorder_level": 2, "reorder_qty": 5,
            "unit_cost": 3100.0, "selling_price": 4600.0, "supplier_id": "V002",
            "profile": "slow_mover", "target_qty": 5
        },

        # ── Category 4: Welding Wire & Consumables (9 SKUs) ──
        {
            "sku": "WIR-MIG-70S-08",
            "name": "Copper Coated MIG Wire AWS ER70S-6 0.8mm (15kg)",
            "category": "Welding Wire", "unit": "kg",
            "compatible_with": "Automotive Sheet Metal Fab (15kg Spool)",
            "location": "R4-B01", "reorder_level": 150, "reorder_qty": 450,
            "unit_cost": 115.0, "selling_price": 155.0, "supplier_id": "V011",
            "profile": "fast_mover", "target_qty": 600  # 40 spools = 600kg
        },
        {
            "sku": "WIR-MIG-70S-10",
            "name": "Copper Coated MIG Wire AWS ER70S-6 1.0mm (15kg)",
            "category": "Welding Wire", "unit": "kg",
            "compatible_with": "Structural & Automotive MIG (15kg Spool)",
            "location": "R4-B02", "reorder_level": 200, "reorder_qty": 600,
            "unit_cost": 112.0, "selling_price": 150.0, "supplier_id": "V011",
            "profile": "fast_mover", "target_qty": 750  # 50 spools
        },
        {
            "sku": "WIR-MIG-70S-12",
            "name": "Copper Coated MIG Wire AWS ER70S-6 1.2mm (15kg)",
            "category": "Welding Wire", "unit": "kg",
            "compatible_with": "Heavy Fabrication & Robotics (15kg Spool)",
            "location": "R4-B03", "reorder_level": 250, "reorder_qty": 750,
            "unit_cost": 110.0, "selling_price": 148.0, "supplier_id": "V004",
            "profile": "fast_mover", "target_qty": 900  # 60 spools
        },
        {
            "sku": "WIR-MIG-SS308",
            "name": "Stainless Steel MIG Wire ER308L 1.2mm (15kg)",
            "category": "Welding Wire", "unit": "kg",
            "compatible_with": "SS Exhaust Systems & Food Grade Tanks",
            "location": "R4-B04", "reorder_level": 60, "reorder_qty": 150,
            "unit_cost": 410.0, "selling_price": 540.0, "supplier_id": "V005",
            "profile": "low_stock", "target_qty": 45  # Low stock (<= 60)
        },
        {
            "sku": "WIR-MIG-SS316",
            "name": "Stainless Steel MIG Wire ER316L 1.2mm (15kg)",
            "category": "Welding Wire", "unit": "kg",
            "compatible_with": "Chemical & Marine Grade SS Fabrication",
            "location": "R4-B05", "reorder_level": 45, "reorder_qty": 120,
            "unit_cost": 490.0, "selling_price": 630.0, "supplier_id": "V005",
            "profile": "standard", "target_qty": 120
        },
        {
            "sku": "WIR-MIG-AL4043",
            "name": "Aluminum MIG Wire ER4043 1.2mm (7kg Spool)",
            "category": "Welding Wire", "unit": "kg",
            "compatible_with": "Automotive Aluminum Castings & Frames",
            "location": "R4-B06", "reorder_level": 28, "reorder_qty": 70,
            "unit_cost": 520.0, "selling_price": 680.0, "supplier_id": "V004",
            "profile": "standard", "target_qty": 56
        },
        {
            "sku": "WIR-TIG-70S-16",
            "name": "Mild Steel TIG Filler Rod ER70S-6 1.6mm (5kg)",
            "category": "Welding Wire", "unit": "kg",
            "compatible_with": "Pressure Pipe Root Pass TIG",
            "location": "R4-B07", "reorder_level": 30, "reorder_qty": 80,
            "unit_cost": 160.0, "selling_price": 225.0, "supplier_id": "V007",
            "profile": "standard", "target_qty": 95
        },
        {
            "sku": "WIR-TIG-70S-24",
            "name": "Mild Steel TIG Filler Rod ER70S-6 2.4mm (5kg)",
            "category": "Welding Wire", "unit": "kg",
            "compatible_with": "Structural & Pressure Vessel TIG",
            "location": "R4-B08", "reorder_level": 40, "reorder_qty": 100,
            "unit_cost": 155.0, "selling_price": 218.0, "supplier_id": "V007",
            "profile": "fast_mover", "target_qty": 130
        },
        {
            "sku": "WIR-TIG-308-24",
            "name": "Stainless Steel TIG Filler Rod ER308L 2.4mm (5kg)",
            "category": "Welding Wire", "unit": "kg",
            "compatible_with": "SS Dairy & Architectural Piping",
            "location": "R4-B09", "reorder_level": 35, "reorder_qty": 90,
            "unit_cost": 440.0, "selling_price": 580.0, "supplier_id": "V005",
            "profile": "standard", "target_qty": 85
        },

        # ── Category 5: Safety & Accessories (7 SKUs) ──
        {
            "sku": "WLD-SAF-HLM-AD",
            "name": "Auto-Darkening Welding Helmet DIN 9-13 True-Color",
            "category": "Safety & Accessories", "unit": "pcs",
            "compatible_with": "MIG / TIG / MMA All Process",
            "location": "R5-B01", "reorder_level": 10, "reorder_qty": 25,
            "unit_cost": 1850.0, "selling_price": 2750.0, "supplier_id": "V014",
            "profile": "standard", "target_qty": 34
        },
        {
            "sku": "WLD-SAF-PAPR",
            "name": "PAPR Heavy Duty Welding Respirator Filter Unit",
            "category": "Safety & Accessories", "unit": "set",
            "compatible_with": "Confined Space & Stainless Steel Welding",
            "location": "R5-B02", "reorder_level": 4, "reorder_qty": 12,
            "unit_cost": 4200.0, "selling_price": 6100.0, "supplier_id": "V014",
            "profile": "out_of_stock", "target_qty": 0  # OUT OF STOCK #3
        },
        {
            "sku": "WLD-SAF-GLV16",
            "name": "Premium Split Cowhide 16\" MIG Welding Gloves",
            "category": "Safety & Accessories", "unit": "set",
            "compatible_with": "Heavy Duty Thermal & Spatter Protection",
            "location": "R5-B03", "reorder_level": 40, "reorder_qty": 120,
            "unit_cost": 180.0, "selling_price": 285.0, "supplier_id": "V014",
            "profile": "fast_mover", "target_qty": 190
        },
        {
            "sku": "WLD-SAF-TIGLV",
            "name": "Ultra-Dexterity Goatskin TIG Welding Gloves (L)",
            "category": "Safety & Accessories", "unit": "set",
            "compatible_with": "Precision TIG Torch Manipulation",
            "location": "R5-B04", "reorder_level": 30, "reorder_qty": 80,
            "unit_cost": 240.0, "selling_price": 375.0, "supplier_id": "V014",
            "profile": "standard", "target_qty": 95
        },
        {
            "sku": "WLD-SAF-SPRY",
            "name": "Water-Based Anti-Spatter Spray 500ml Can",
            "category": "Safety & Accessories", "unit": "pcs",
            "compatible_with": "MIG Torch Nozzles & Workpiece Jigs",
            "location": "R5-B05", "reorder_level": 60, "reorder_qty": 150,
            "unit_cost": 120.0, "selling_price": 195.0, "supplier_id": "V014",
            "profile": "fast_mover", "target_qty": 280
        },
        {
            "sku": "WLD-SAF-PASTE",
            "name": "Non-Toxic Anti-Spatter Dip Gel 300g",
            "category": "Safety & Accessories", "unit": "pcs",
            "compatible_with": "Hot MIG Torch Nozzle Dip Protection",
            "location": "R5-B06", "reorder_level": 40, "reorder_qty": 100,
            "unit_cost": 95.0, "selling_price": 150.0, "supplier_id": "V014",
            "profile": "standard", "target_qty": 140
        },
        {
            "sku": "WLD-ACC-MAGCLP",
            "name": "Heavy Duty Magnetic Earth Ground Clamp 600A",
            "category": "Safety & Accessories", "unit": "pcs",
            "compatible_with": "Rotary / Fabrication Return Lead Cable",
            "location": "R5-B07", "reorder_level": 12, "reorder_qty": 30,
            "unit_cost": 480.0, "selling_price": 750.0, "supplier_id": "V010",
            "profile": "standard", "target_qty": 42
        }
    ]

    # Insert items into database
    created_items: dict[str, Inventory] = {}
    for item_meta in items_catalog:
        inv_item = Inventory(
            sku=item_meta["sku"],
            name=item_meta["name"],
            category=item_meta["category"],
            unit=item_meta["unit"],
            compatible_with=item_meta["compatible_with"],
            location=item_meta["location"],
            quantity=item_meta["target_qty"],
            reorder_level=item_meta["reorder_level"],
            reorder_qty=item_meta["reorder_qty"],
            unit_cost=item_meta["unit_cost"],
            selling_price=item_meta["selling_price"],
            supplier_id=item_meta["supplier_id"],
            last_updated=(now - datetime.timedelta(hours=random.randint(1, 48))).isoformat(),
            is_active=True
        )
        db.add(inv_item)
        db.flush()
        created_items[inv_item.sku] = inv_item

    db.commit()

    # ─── 4. SEED 90 DAYS OF CHRONOLOGICAL STOCK MOVEMENTS ───────────────
    # We guarantee mathematical consistency: running balance matches balance_after,
    # and the final balance_after equals the item's target quantity!
    all_movements: list[StockMovement] = []

    # Typical shop floor destinations in Gurugram manufacturing belt
    destinations = [
        "Robotic Welding Cell #1 (Auto Exhaust Line)",
        "Robotic Welding Cell #2 (Chassis Fabrication)",
        "Robotic Welding Cell #3 (Seat Frames)",
        "TIG Piping Station B (Exhaust Manifold)",
        "MIG Heavy Fab Bay 3 (Trailer Subframe)",
        "Structural Assembly Line 4",
        "Toolroom Maintenance & Die Repair",
        "Hero MotoCorp Ancillary Fab Unit",
        "Maruti Suzuki Vendor Cluster - Manesar",
        "Central Welding Workshop Bay 1"
    ]

    # Process movements per item
    for item_meta in items_catalog:
        sku = item_meta["sku"]
        db_item = created_items[sku]
        profile = item_meta["profile"]
        final_qty = item_meta["target_qty"]
        supp_name = next((s["name"] for s in suppliers_data if s["id"] == db_item.supplier_id), "Authorized OEM")

        item_movs = []

        if profile == "dead_stock":
            # Exactly 4 dead-stock items with NO movement in 60+ days!
            # Single initial receipt at Day -85
            receipt_date = (now - datetime.timedelta(days=85, hours=random.randint(1, 8)))
            m = StockMovement(
                item_id=db_item.id,
                type="IN",
                quantity=final_qty,
                reference=f"GRN-2026-{random.randint(100, 399)}",
                party=supp_name,
                performed_by="storekeeper",
                timestamp=receipt_date.strftime("%Y-%m-%d %H:%M"),
                balance_after=final_qty
            )
            item_movs.append((receipt_date, m))

        elif profile == "out_of_stock":
            # Reached 0 within the last 3-8 days with no inward receipt since
            # Step 1: Start at day -75 with batch
            start_qty = db_item.reorder_qty * 2
            curr = start_qty
            t1 = now - datetime.timedelta(days=75)
            item_movs.append((t1, StockMovement(
                item_id=db_item.id, type="IN", quantity=start_qty,
                reference=f"GRN-2026-{random.randint(100, 499)}",
                party=supp_name, performed_by="storekeeper",
                timestamp=t1.strftime("%Y-%m-%d %H:%M"), balance_after=curr
            )))

            # Step 2: intermediate dispatches
            disp1 = start_qty // 2
            curr -= disp1
            t2 = now - datetime.timedelta(days=40)
            item_movs.append((t2, StockMovement(
                item_id=db_item.id, type="OUT", quantity=disp1,
                reference=f"DISP-2026-{random.randint(1000, 2999)}",
                party="Robotic Welding Cell #1 (Auto Exhaust Line)", performed_by="storekeeper",
                timestamp=t2.strftime("%Y-%m-%d %H:%M"), balance_after=curr
            )))

            # Final dispatch draining to exactly 0 at day -4
            disp2 = curr
            curr = 0
            t3 = now - datetime.timedelta(days=4, hours=random.randint(2, 6))
            item_movs.append((t3, StockMovement(
                item_id=db_item.id, type="OUT", quantity=disp2,
                reference=f"DISP-2026-{random.randint(3000, 4999)}",
                party="Robotic Welding Cell #2 (Chassis Fabrication)", performed_by="storekeeper",
                timestamp=t3.strftime("%Y-%m-%d %H:%M"), balance_after=0
            )))

        elif profile == "low_stock":
            # Starts healthy, heavy consumption pulled it down below reorder level
            # 3 movements: Inward at -70, Outward at -35, Outward at -5
            inward = final_qty + 120
            curr = inward
            t1 = now - datetime.timedelta(days=70)
            item_movs.append((t1, StockMovement(
                item_id=db_item.id, type="IN", quantity=inward,
                reference=f"GRN-2026-{random.randint(100, 499)}",
                party=supp_name, performed_by="storekeeper",
                timestamp=t1.strftime("%Y-%m-%d %H:%M"), balance_after=curr
            )))

            disp1 = 70
            curr -= disp1
            t2 = now - datetime.timedelta(days=32)
            item_movs.append((t2, StockMovement(
                item_id=db_item.id, type="OUT", quantity=disp1,
                reference=f"DISP-2026-{random.randint(1000, 2999)}",
                party=random.choice(destinations), performed_by="storekeeper",
                timestamp=t2.strftime("%Y-%m-%d %H:%M"), balance_after=curr
            )))

            disp2 = curr - final_qty
            curr -= disp2
            t3 = now - datetime.timedelta(days=random.randint(1, 6))
            item_movs.append((t3, StockMovement(
                item_id=db_item.id, type="OUT", quantity=disp2,
                reference=f"DISP-2026-{random.randint(3000, 4999)}",
                party=random.choice(destinations), performed_by="storekeeper",
                timestamp=t3.strftime("%Y-%m-%d %H:%M"), balance_after=curr
            )))

        elif profile == "fast_mover":
            # 6-8 movements across 90 days (multiple IN and OUT)
            curr = int(final_qty * 0.7)
            t_start = now - datetime.timedelta(days=88)
            item_movs.append((t_start, StockMovement(
                item_id=db_item.id, type="IN", quantity=curr,
                reference=f"GRN-2026-{random.randint(100, 200)}",
                party=supp_name, performed_by="storekeeper",
                timestamp=t_start.strftime("%Y-%m-%d %H:%M"), balance_after=curr
            )))

            days_schedule = [75, 60, 45, 30, 18, 5]
            for idx, d in enumerate(days_schedule):
                t_event = now - datetime.timedelta(days=d, hours=random.randint(1, 10))
                if idx in [1, 4]:
                    # Replenishment
                    qty_in = db_item.reorder_qty
                    curr += qty_in
                    item_movs.append((t_event, StockMovement(
                        item_id=db_item.id, type="IN", quantity=qty_in,
                        reference=f"ANI-PO-2026-{100 + idx:04d}",
                        party=supp_name, performed_by="storekeeper",
                        timestamp=t_event.strftime("%Y-%m-%d %H:%M"), balance_after=curr
                    )))
                else:
                    # Dispatch
                    qty_out = random.randint(20, 60)
                    if curr - qty_out < 10:
                        qty_out = max(curr - 10, 5)
                    curr -= qty_out
                    item_movs.append((t_event, StockMovement(
                        item_id=db_item.id, type="OUT", quantity=qty_out,
                        reference=f"DISP-2026-{random.randint(1000, 4999)}",
                        party=random.choice(destinations), performed_by="storekeeper",
                        timestamp=t_event.strftime("%Y-%m-%d %H:%M"), balance_after=curr
                    )))

            # Adjust to match final_qty
            diff = final_qty - curr
            t_fin = now - datetime.timedelta(days=1, hours=random.randint(1, 4))
            if diff > 0:
                curr += diff
                item_movs.append((t_fin, StockMovement(
                    item_id=db_item.id, type="IN", quantity=diff,
                    reference=f"GRN-2026-{random.randint(800, 999)}",
                    party=supp_name, performed_by="storekeeper",
                    timestamp=t_fin.strftime("%Y-%m-%d %H:%M"), balance_after=curr
                )))
            elif diff < 0:
                curr -= abs(diff)
                item_movs.append((t_fin, StockMovement(
                    item_id=db_item.id, type="OUT", quantity=abs(diff),
                    reference=f"DISP-2026-{random.randint(5000, 6999)}",
                    party=random.choice(destinations), performed_by="storekeeper",
                    timestamp=t_fin.strftime("%Y-%m-%d %H:%M"), balance_after=curr
                )))

        else:
            # Standard & Slow Movers: 2-3 movements
            start_qty = final_qty + random.randint(10, 30)
            curr = start_qty
            t1 = now - datetime.timedelta(days=random.randint(75, 85))
            item_movs.append((t1, StockMovement(
                item_id=db_item.id, type="IN", quantity=start_qty,
                reference=f"GRN-2026-{random.randint(100, 499)}",
                party=supp_name, performed_by="storekeeper",
                timestamp=t1.strftime("%Y-%m-%d %H:%M"), balance_after=curr
            )))

            disp = start_qty - final_qty
            if disp > 0:
                t2 = now - datetime.timedelta(days=random.randint(10, 35))
                curr -= disp
                item_movs.append((t2, StockMovement(
                    item_id=db_item.id, type="OUT", quantity=disp,
                    reference=f"DISP-2026-{random.randint(1000, 4999)}",
                    party=random.choice(destinations), performed_by="storekeeper",
                    timestamp=t2.strftime("%Y-%m-%d %H:%M"), balance_after=curr
                )))

        for _, m in item_movs:
            all_movements.append(m)

    # Sort all movements chronologically
    all_movements.sort(key=lambda m: m.timestamp)
    for m in all_movements:
        db.add(m)
    db.commit()

    # ─── 5. SEED PURCHASE ORDERS & PO LINE ITEMS ─────────────────────────
    # Historical RECEIVED POs, active APPROVED POs, and 2 DRAFT auto-POs
    pos_meta = [
        {
            "po_number": "ANI-PO-2026-0001",
            "supplier_id": "V001",
            "status": "RECEIVED",
            "days_ago": 80,
            "expected_days": 77,
            "auto_generated": False,
            "items": [
                ("MIG-CT-M6-08", 200, 22.0),
                ("MIG-NZ-CON24", 50, 110.0),
                ("MIG-DF-24KD", 100, 45.0)
            ]
        },
        {
            "po_number": "ANI-PO-2026-0002",
            "supplier_id": "V007",
            "status": "RECEIVED",
            "days_ago": 65,
            "expected_days": 61,
            "auto_generated": False,
            "items": [
                ("TIG-TE-WT20-16", 150, 48.0),
                ("TIG-TE-WT20-24", 200, 72.0)
            ]
        },
        {
            "po_number": "ANI-PO-2026-0003",
            "supplier_id": "V004",
            "status": "RECEIVED",
            "days_ago": 50,
            "expected_days": 45,
            "auto_generated": False,
            "items": [
                ("WIR-MIG-70S-12", 600, 110.0),
                ("WIR-MIG-AL4043", 50, 520.0)
            ]
        },
        {
            "po_number": "ANI-PO-2026-0004",
            "supplier_id": "V002",
            "status": "RECEIVED",
            "days_ago": 35,
            "expected_days": 32,
            "auto_generated": False,
            "items": [
                ("ROB-SN-22", 10, 5200.0),
                ("ROB-WF-RL12", 15, 1250.0)
            ]
        },
        {
            "po_number": "ANI-PO-2026-0005",
            "supplier_id": "V014",
            "status": "RECEIVED",
            "days_ago": 20,
            "expected_days": 19,
            "auto_generated": False,
            "items": [
                ("WLD-SAF-GLV16", 100, 180.0),
                ("WLD-SAF-SPRY", 150, 120.0)
            ]
        },
        {
            "po_number": "ANI-PO-2026-0006",
            "supplier_id": "V006",
            "status": "RECEIVED",
            "days_ago": 12,
            "expected_days": 10,
            "auto_generated": False,
            "items": [
                ("MIG-CT-M8-10", 150, 32.0),
                ("MIG-DF-36KD", 100, 55.0)
            ]
        },
        # Active APPROVED POs
        {
            "po_number": "ANI-PO-2026-0007",
            "supplier_id": "V011",
            "status": "APPROVED",
            "days_ago": 2,
            "expected_days": -2,  # Arriving in 2 days
            "auto_generated": False,
            "items": [
                ("WIR-MIG-70S-08", 450, 115.0),
                ("WIR-MIG-70S-10", 600, 112.0)
            ]
        },
        {
            "po_number": "ANI-PO-2026-0008",
            "supplier_id": "V001",
            "status": "APPROVED",
            "days_ago": 1,
            "expected_days": -1,  # Arriving in 1 day
            "auto_generated": False,
            "items": [
                ("MIG-CT-M8-12", 200, 34.0),
                ("MIG-NZ-CON36", 80, 145.0)
            ]
        },
        # Exactly 2 DRAFT auto-POs linked to low-stock / out-of-stock items
        {
            "po_number": "ANI-PO-2026-0009",
            "supplier_id": "V008",
            "status": "DRAFT",
            "days_ago": 0,
            "expected_days": -4,
            "auto_generated": True,
            "items": [
                ("ROB-NZ-CL50", 20, 1450.0),   # Out of stock!
                ("ROB-SN-45", 8, 5600.0)       # Low stock!
            ]
        },
        {
            "po_number": "ANI-PO-2026-0010",
            "supplier_id": "V009",
            "status": "DRAFT",
            "days_ago": 0,
            "expected_days": -3,
            "auto_generated": True,
            "items": [
                ("TIG-GL-KIT32", 25, 650.0),   # Out of stock!
                ("TIG-CB-24", 60, 58.0)        # Low stock!
            ]
        }
    ]

    for p in pos_meta:
        c_date = (now - datetime.timedelta(days=p["days_ago"])).strftime("%Y-%m-%d")
        e_date = (now - datetime.timedelta(days=p["expected_days"])).strftime("%Y-%m-%d")
        total_val = sum(qty * cost for _, qty, cost in p["items"])

        po = Procurement(
            po_number=p["po_number"],
            supplier_id=p["supplier_id"],
            status=p["status"],
            created_at=f"{c_date} 10:00:00",
            expected_date=e_date,
            total_value=round(total_val, 2),
            auto_generated=p["auto_generated"],
            department="Central Store"
        )
        db.add(po)
        db.flush()

        for sku, qty, cost in p["items"]:
            inv_ref = created_items.get(sku)
            if inv_ref:
                line_item = POItem(
                    po_id=po.id,
                    item_id=inv_ref.id,
                    qty=qty,
                    unit_cost=cost
                )
                db.add(line_item)

    db.commit()

    # ─── 6. SEED AUDIT LOGS ──────────────────────────────────────────────
    audit_entries = [
        {
            "timestamp": (now - datetime.timedelta(days=90)).strftime("%Y-%m-%d %H:%M:%S"),
            "action": "SYSTEM_INIT",
            "user": "admin",
            "target_id": "SYSTEM",
            "details": "Initialized Anishka Inventory database for Gurugram facility."
        },
        {
            "timestamp": (now - datetime.timedelta(days=90)).strftime("%Y-%m-%d %H:%M:%S"),
            "action": "USER_CREATED",
            "user": "admin",
            "target_id": "USERS",
            "details": "Provisioned RBAC accounts for admin, manager, and storekeeper."
        },
        {
            "timestamp": (now - datetime.timedelta(days=80)).strftime("%Y-%m-%d 11:30:00"),
            "action": "PO_RECEIVED",
            "user": "storekeeper",
            "target_id": "ANI-PO-2026-0001",
            "details": "Goods received into Central Store from Abicor Binzel Tech India."
        },
        {
            "timestamp": (now - datetime.timedelta(days=1)).strftime("%Y-%m-%d 14:15:00"),
            "action": "PO_APPROVED",
            "user": "manager",
            "target_id": "ANI-PO-2026-0008",
            "details": "Approved replenishment PO for contact tips and nozzles."
        },
        {
            "timestamp": now.strftime("%Y-%m-%d %H:%M:%S"),
            "action": "AUTO_PO_GENERATED",
            "user": "system",
            "target_id": "ANI-PO-2026-0009",
            "details": "Automated draft replenishment order triggered for low/out-of-stock robotic spares."
        }
    ]
    for a in audit_entries:
        db.add(AuditLog(**a))
    db.commit()


    # ─── 7. SEED 12 INDUSTRIAL CUSTOMERS ─────────────────────────────────
    customers_data = [
        {
            "name": "Maruti Suzuki India Ancillary Units Ltd",
            "gstin": "06AAACM1234A1Z1",
            "state": "Haryana",
            "city": "Gurugram",
            "contact_person": "Vikas Malhotra",
            "phone": "+91 98110 54321",
            "email": "procurement@marutiancillary.in",
            "price_tier": "OEM Tier-1",
            "credit_limit": 500000.0,
            "credit_days": 45
        },
        {
            "name": "Hero MotoCorp Robotic Welding Division",
            "gstin": "06AAACH5678B1Z2",
            "state": "Haryana",
            "city": "Dharuhera",
            "contact_person": "Ramesh Chawla",
            "phone": "+91 98101 23456",
            "email": "welding.dharuhera@heromotors.com",
            "price_tier": "OEM Tier-1",
            "credit_limit": 400000.0,
            "credit_days": 30
        },
        {
            "name": "Tata AutoComp Systems Ltd - Pune Gantry Bay",
            "gstin": "27AAACT9012C1Z3",
            "state": "Maharashtra",
            "city": "Pune",
            "contact_person": "Anand Deshmukh",
            "phone": "+91 98220 98765",
            "email": "anand.deshmukh@tataautocomp.com",
            "price_tier": "Wholesale",
            "credit_limit": 600000.0,
            "credit_days": 45
        },
        {
            "name": "Bharat Seats Ltd - Robotic Body Shell Plant",
            "gstin": "06AAACB3456D1Z4",
            "state": "Haryana",
            "city": "Gurugram",
            "contact_person": "Gaurav Sen",
            "phone": "+91 98102 34567",
            "email": "purchases@bharatseats.com",
            "price_tier": "Standard",
            "credit_limit": 250000.0,
            "credit_days": 30
        },
        {
            "name": "Escorts Kubota India Ltd - Agri Machinery Bay",
            "gstin": "06AAACE7890E1Z5",
            "state": "Haryana",
            "city": "Faridabad",
            "contact_person": "Sunil Varma",
            "phone": "+91 98115 67890",
            "email": "procurement@escortskubota.com",
            "price_tier": "OEM Tier-1",
            "credit_limit": 450000.0,
            "credit_days": 45
        },
        {
            "name": "Badve Engineering Ltd - Automotive Press Bay",
            "gstin": "27AAACB1122F1Z6",
            "state": "Maharashtra",
            "city": "Pune",
            "contact_person": "Sachin Kadam",
            "phone": "+91 98224 55667",
            "email": "sachin.kadam@badvegroup.com",
            "price_tier": "Wholesale",
            "credit_limit": 450000.0,
            "credit_days": 45
        },
        {
            "name": "Gestamp Automotive India Pvt Ltd",
            "gstin": "27AAACG3344G1Z7",
            "state": "Maharashtra",
            "city": "Pune",
            "contact_person": "Pradeep Rao",
            "phone": "+91 98226 77889",
            "email": "prao@in.gestamp.com",
            "price_tier": "OEM Tier-1",
            "credit_limit": 700000.0,
            "credit_days": 60
        },
        {
            "name": "Sona Comstar Drivetrain Automation Bay",
            "gstin": "06AAACS5566H1Z8",
            "state": "Haryana",
            "city": "Gurugram",
            "contact_person": "Deepak Khurana",
            "phone": "+91 98118 99001",
            "email": "dkhurana@sonacomstar.com",
            "price_tier": "OEM Tier-1",
            "credit_limit": 300000.0,
            "credit_days": 30
        },
        {
            "name": "Subros Ltd Auto Aircon Gantry Plant",
            "gstin": "09AAACS7788I1Z9",
            "state": "Uttar Pradesh",
            "city": "Noida",
            "contact_person": "Manish Gupta",
            "phone": "+91 98103 11223",
            "email": "mgupta@subros.com",
            "price_tier": "Standard",
            "credit_limit": 200000.0,
            "credit_days": 30
        },
        {
            "name": "Omax Autos Sheet Metal Fabrication Facility",
            "gstin": "06AAACO9900J1Z0",
            "state": "Haryana",
            "city": "Bawal",
            "contact_person": "Sunil Tomar",
            "phone": "+91 98114 33445",
            "email": "purchases@omaxauto.com",
            "price_tier": "Standard",
            "credit_limit": 250000.0,
            "credit_days": 30
        },
        {
            "name": "Varroc Engineering Robotic Body Systems",
            "gstin": "27AAACV2233K1Z1",
            "state": "Maharashtra",
            "city": "Pune",
            "contact_person": "Nitin Patil",
            "phone": "+91 98228 44556",
            "email": "npatil@varroc.com",
            "price_tier": "Wholesale",
            "credit_limit": 500000.0,
            "credit_days": 45
        },
        {
            "name": "Lumax Auto Technologies Lighting & Sheet Metal",
            "gstin": "06AAACL4455L1Z2",
            "state": "Haryana",
            "city": "Faridabad",
            "contact_person": "Ajay Mathur",
            "phone": "+91 98119 55667",
            "email": "amathur@lumaxautotech.com",
            "price_tier": "Standard",
            "credit_limit": 150000.0,
            "credit_days": 30
        }
    ]
    created_custs = []
    for c in customers_data:
        cust = Customer(**c)
        db.add(cust)
        db.flush()
        created_custs.append(cust)

    # ─── 8. SEED 20 SALES ORDERS ACROSS PAST 12 MONTHS ───────────────────
    # Orders cover QUOTE, CONFIRMED, DISPATCHED, and INVOICED
    so_configs = [
        # (days_ago, cust_idx, status, items_list[(sku, qty, price, disc)], is_paid, pay_delay)
        (330, 0, "INVOICED", [("MIG-CT-M6-08", 200, 38.0, 5.0), ("MIG-NZ-CON24", 40, 175.0, 0.0)], True, 20),
        (310, 2, "INVOICED", [("ROB-SN-45", 4, 8200.0, 5.0), ("ROB-CT-AG12", 50, 240.0, 0.0)], True, 25),
        (280, 1, "INVOICED", [("WIR-MIG-70S-08", 100, 175.0, 0.0), ("MIG-DF-24KD", 50, 72.0, 0.0)], True, 18),
        (250, 4, "INVOICED", [("TIG-TE-WT20-24", 80, 115.0, 0.0), ("TIG-CB-24", 40, 95.0, 0.0)], True, 30),
        (220, 6, "INVOICED", [("ROB-NZ-CL50", 15, 2200.0, 8.0), ("ROB-RC-14", 8, 3800.0, 5.0)], True, 35),
        (190, 3, "INVOICED", [("MIG-CT-M8-10", 150, 52.0, 0.0), ("MIG-NZ-CON36", 30, 225.0, 0.0)], True, 20),
        (160, 5, "INVOICED", [("WIR-MIG-70S-12", 120, 185.0, 5.0), ("MIG-LN-ST12", 20, 320.0, 0.0)], True, 28),
        (130, 7, "INVOICED", [("ROB-CD-ROB", 6, 7500.0, 0.0), ("ROB-PI-500", 12, 1850.0, 0.0)], True, 22),
        (100, 0, "INVOICED", [("MIG-CT-M8-12", 180, 55.0, 5.0), ("MIG-DF-501D", 40, 135.0, 0.0)], True, 30),
        # Unpaid / Partially Paid Invoices in 60+ Days Bucket (75 - 90 days ago)
        (85, 2, "INVOICED", [("ROB-SN-22", 6, 8500.0, 5.0), ("ROB-CT-AG16", 60, 260.0, 0.0)], False, 0),
        (72, 8, "INVOICED", [("TIG-TC-WP26", 8, 2800.0, 0.0), ("TIG-GL-KIT24", 15, 950.0, 0.0)], False, 0),
        # Unpaid in 31 - 60 Days Bucket (35 - 50 days ago)
        (48, 1, "INVOICED", [("WIR-MIG-70S-08", 150, 175.0, 5.0), ("MIG-NZ-CON24", 50, 175.0, 0.0)], False, 0),
        (38, 4, "INVOICED", [("TIG-TE-WL15-24", 100, 130.0, 0.0), ("TIG-GC-06", 60, 48.0, 0.0)], False, 0),
        # Unpaid in 0 - 30 Days Bucket (10 - 25 days ago)
        (22, 6, "INVOICED", [("ROB-NZ-CL50", 10, 2200.0, 5.0), ("ROB-RC-16", 6, 4200.0, 0.0)], False, 0),
        (12, 0, "INVOICED", [("MIG-CT-M6-10", 250, 40.0, 0.0), ("MIG-DF-24KD", 60, 72.0, 0.0)], True, 3),
        (9, 2, "INVOICED", [("ROB-SN-45", 3, 8200.0, 5.0), ("ROB-CT-AG12", 40, 240.0, 0.0)], True, 2),
        # Recent Invoices in Last 7 Days (Days 1, 2, 4, 6 - at least 4 invoices in the last 7 days)
        (6, 5, "INVOICED", [("WIR-MIG-70S-12", 80, 185.0, 5.0), ("MIG-LN-ST12", 15, 320.0, 0.0)], True, 2),
        (4, 7, "INVOICED", [("ROB-CD-ROB", 4, 7500.0, 0.0), ("ROB-PI-500", 8, 1850.0, 0.0)], False, 0),
        (2, 3, "INVOICED", [("MIG-CT-M8-10", 120, 52.0, 0.0), ("MIG-NZ-CON36", 25, 225.0, 0.0)], True, 1),
        (1, 1, "INVOICED", [("WIR-MIG-70S-08", 120, 175.0, 5.0), ("MIG-DF-24KD", 40, 72.0, 0.0)], True, 0),
        # Recently Dispatched Order
        (6, 3, "DISPATCHED", [("WIR-SS-308L-12", 30, 420.0, 0.0), ("MIG-LN-TF12", 15, 680.0, 0.0)], False, 0),
        # Confirmed Active Orders (Stock Reserved)
        (3, 5, "CONFIRMED", [("ROB-SN-45", 1, 8200.0, 0.0), ("ROB-CT-AG12", 30, 240.0, 0.0)], False, 0),
        (2, 7, "CONFIRMED", [("MIG-CT-M8-10", 100, 52.0, 0.0), ("MIG-NZ-CON36", 20, 225.0, 0.0)], False, 0),
        # Pending Quotations
        (4, 9, "QUOTE", [("TIG-TC-WP18", 5, 4800.0, 10.0), ("TIG-GL-KIT32", 10, 1050.0, 5.0)], False, 0),
        (1, 11, "QUOTE", [("SAF-GLV-MIG", 50, 280.0, 0.0), ("SAF-APR-LTH", 15, 950.0, 0.0)], False, 0)
    ]

    inv_counter = 1
    company_state = "Haryana"

    for idx, (days_ago, c_idx, status, items_info, is_paid, pay_delay) in enumerate(so_configs, 1):
        c = created_custs[c_idx]
        c_date = (now - datetime.timedelta(days=days_ago)).strftime("%Y-%m-%d %H:%M:%S")
        v_date = (now - datetime.timedelta(days=days_ago - 15)).strftime("%Y-%m-%d")
        order_no = f"ANI-SO-2026-{idx:04d}" if status != "QUOTE" else f"ANI-QT-2026-{idx:04d}"

        so = SalesOrder(
            order_no=order_no,
            customer_id=c.id,
            status=status,
            created_by="manager",
            created_at=c_date,
            valid_until=v_date,
            notes=f"Automotive production spares order for {c.name[:30]}"
        )
        db.add(so)
        db.flush()

        total_taxable = 0.0
        total_tax = 0.0

        for sku, qty, price, disc in items_info:
            inv_item = created_items.get(sku)
            item_id = inv_item.id if inv_item else 1
            line_taxable = qty * price * (1.0 - (disc / 100.0))
            gst_pct = getattr(inv_item, "gst_rate", 18.0) or 18.0
            line_tax = line_taxable * (gst_pct / 100.0)

            total_taxable += line_taxable
            total_tax += line_tax

            disp_q = qty if status in ("DISPATCHED", "INVOICED") else 0
            if status == "CONFIRMED" and inv_item:
                inv_item.reserved_qty = (inv_item.reserved_qty or 0) + qty

            so_line = SalesOrderItem(
                order_id=so.id,
                item_id=item_id,
                qty=qty,
                unit_price=price,
                discount_pct=disc,
                gst_rate=gst_pct,
                dispatched_qty=disp_q
            )
            db.add(so_line)

        so.total_taxable = round(total_taxable, 2)
        so.total_tax = round(total_tax, 2)
        so.grand_total = round(total_taxable + total_tax, 2)
        db.flush()

        # If INVOICED, create Invoice record
        if status == "INVOICED":
            is_intra = (c.state or "").strip().lower() == company_state.lower()
            cgst_v = round(total_tax / 2.0, 2) if is_intra else 0.0
            sgst_v = round(total_tax / 2.0, 2) if is_intra else 0.0
            igst_v = round(total_tax, 2) if not is_intra else 0.0

            inv_record = Invoice(
                invoice_no=f"ANI/2026-27/{inv_counter:04d}",
                order_id=so.id,
                customer_id=c.id,
                date=c_date[:10],
                place_of_supply=c.state,
                taxable_value=so.total_taxable,
                cgst=cgst_v,
                sgst=sgst_v,
                igst=igst_v,
                total=so.grand_total,
                status="PAID" if is_paid else "UNPAID"
            )
            inv_counter += 1
            db.add(inv_record)
            db.flush()

            if is_paid:
                pay_date = (now - datetime.timedelta(days=max(0, days_ago - pay_delay))).strftime("%Y-%m-%d")
                payment = Payment(
                    invoice_id=inv_record.id,
                    amount=inv_record.total,
                    mode="NEFT/RTGS",
                    reference=f"HDFC-UTR-{500000 + inv_counter}",
                    date=pay_date,
                    recorded_by="manager"
                )
                db.add(payment)

    db.commit()


    print("[SUCCESS] Anishka Inventory database reseeded successfully:")
    print(f"  - Items (SKUs): {db.query(Inventory).count()}")
    print(f"  - Suppliers: {db.query(Vendor).count()}")
    print(f"  - Stock Movements: {db.query(StockMovement).count()}")
    print(f"  - Purchase Orders: {db.query(Procurement).count()}")
    print(f"  - PO Line Items: {db.query(POItem).count()}")
    print(f"  - User Roles: {db.query(UserRole).count()}")
    print(f"  - Customers: {db.query(Customer).count()}")
    print(f"  - Sales Orders: {db.query(SalesOrder).count()}")
    print(f"  - Invoices: {db.query(Invoice).count()}")
    print(f"  - Payments: {db.query(Payment).count()}")
    if close_db:
        db.close()

if __name__ == "__main__":
    seed_database()
