# PLAN.md: Transition Plan from ShadowSync to "Anishka Inventory"

**Product Name:** Anishka Inventory  
**Target Enterprise:** Anishka Industries  
**Location:** Milestone Khandsa Road, Sector-10, Gurugram, Haryana  
**Domain:** Specialized Supplier of MIG Welding, TIG Welding, and Robotics Welding Spares (torches, contact tips, nozzles, diffusers, liners, tungsten electrodes, welding wire, robotic torch spares)  
**Architecture:** FastAPI + SQLAlchemy ORM (SQLite) + Vanilla JS SPA + Chart.js + WebSocket + Groq AI Copilot + Kinetic Ledger Design System

---

## 1. Executive Summary & Conversion Strategy

The objective is to refactor the procurement fraud-detection platform (ShadowSync) into a dedicated, enterprise-grade Inventory Management System: **Anishka Inventory**. 

The existing technical stack—FastAPI backend, SQLite/SQLAlchemy ORM, real-time WebSockets, vanilla JS SPA with Chart.js, JWT authentication with Role-Based Access Control (RBAC), immutable audit logging, multi-format exports (PDF, Excel, CSV), and Groq LLM integration—will be preserved and repurposed. All fraud-detection, shadow spend analysis, collusion graph, and external SAP/Firebase connectors will be extracted and archived into `_archive/`. The app remains fully runnable at every stage via `uvicorn app:app --reload`.

---

## 2. (a) What to KEEP

| Component | Current Implementation | Role in Anishka Inventory |
| :--- | :--- | :--- |
| **Inventory Table & API** | `Inventory` ORM model, `/api/inventory`, `/api/inventory/reorders`, `/api/inventory/reorder` | Core catalog of welding spares (MIG, TIG, Robotic spares, tips, nozzles, liners, wire) with SKU, stock levels, reorder thresholds, and bin locations. |
| **Authentication & RBAC** | JWT / session cookie authentication, `UserRole`, `ROLE_PERMISSIONS`, `/api/login`, `/api/logout`, `/login` | Access control with roles: `admin` (Owner/Store Manager with full control), `analyst` (Inventory Executive / Dispatch Operator), `auditor` (Read-only Viewer / Auditor). |
| **Audit Logging** | `AuditLog` ORM model, `/api/audit`, `/api/audit-logs` | Immutable audit trail tracking inventory adjustments, stock movements, PO generation, supplier changes, and logins. |
| **Suppliers (formerly Vendors)** | `Vendor` ORM model, `/api/vendors` | Repurposed as welding equipment OEMs and distributor partners (e.g., Abicor Binzel, Panasonic, Fronius, ESAB, Ador Welding, TBi Industries). |
| **Purchase Orders & Procurement** | `Procurement` and `PurchaseOrderDraft` models, `/api/procurement`, `/api/pdf/{po_id}` | Formal purchase orders for spare part replenishments with downloadable PDF POs. |
| **WebSocket Updates** | `/ws` WebSocket connection, client registry, JSON event broadcasts | Real-time push notifications for stock adjustments, inward receipts, outward dispatches, and reorder warnings. |
| **Export Engine** | `pdf_generator.py` (FPDF2), `openpyxl`, CSV export endpoints (`/api/export/csv/{type}`, `/api/export/excel/{type}`) | Professional PDF stock valuation reports, printable PO slips, multi-tab Excel inventory ledgers, and CSV records. |
| **AI Copilot** | `ai_copilot.py` (Groq API client `llama-3.3-70b-versatile`), `/api/ai/chat`, `/api/ai/health` | Rebranded as **Anishka AI Copilot**: contextual assistant trained on welding technical specs (torch compatibility, tip thread sizes, nozzle bore diameters, shielding gas requirements, reorder forecasting). |
| **Inventory Simulator** | Background `asyncio` loop in `lifespan`, `/api/simulator/toggle` | Re-engineered to simulate live welding spares consumption, store dispatches, and supplier deliveries instead of credit-card expense leaks. |
| **Kinetic Ledger Design System** | `static/styles.css` (Navy `#00234B`, Teal `#006A6A`, Amber `#FFBF00`), dark/light theme switch, animated badges, ghost borders | Preserved aesthetic and UX for industrial manufacturing inventory control. |

---

## 3. (b) What to REMOVE (To be archived into `_archive/`)

The following fraud-detection and unneeded legacy features are to be eliminated from active code and relocated to `_archive/`:

### Files to Move into `_archive/`:
1. `detection.py` — Shadow procurement detection engine and rule-based heuristic tests.
2. `ai_module.py` — Scikit-learn Isolation Forest anomaly scoring and shadow spend ML model.
3. `vendor_graph.py` — NetworkX vendor collusion ring detector and supplier network disruption graph.
4. `analytics.py` — Department shadow risk forecasting.
5. `recalibration.py` — Trust score penalty calculations from analyst feedback.
6. `connectors/sap.py` & `connectors/push.py` — SAP ERP RFC connector and Firebase Cloud Messaging push stub.
7. `lp_endpoints.py` — Legacy loophole test endpoints.
8. `production_data.py` — Synthetic shadow purchase scenario datasets.
9. `test_lp_endpoints.js` & `test_ztfg.js` — Shadow loophole integration test scripts.
10. `loopholes*.txt` — Shadow procurement scenario notes.

### Database Tables to Remove from `database.py`:
- `shadow_purchases` (`ShadowPurchase`)
- `risk_snapshots` (`RiskSnapshot`)
- `risk_metrics` (`RiskMetric`)
- `recommendations` (`ActionRecommendation`)
- `behavior_metrics` (`BehaviorMetric`)
- `user_feedback` (`UserFeedback`)
- `vendor_contracts` (`VendorContract`)
- `trend_metrics` (`TrendMetric`)
- `action_logs` (`ActionLog`)
- `unified_events` (`UnifiedEvent`)
- `living_risk_scores` (`LivingRiskScore`)
- `trust_momentum` (`TrustMomentum`)
- `shift_roster` (`ShiftRoster`)
- `warehouse_access` (`WarehouseAccess`)
- `parts_compatibility` (`PartsCompatibility`)
- `machine_criticality` (`MachineCriticality`)
- `risk_score_history` (`RiskScoreHistory`)
- `machine_usage_log` (`MachineUsageLog`)
- `depletion_alerts` (`DepletionAlerts`)
- `signal_events` (`SignalEvents`)
- `user_trust_metrics` (`UserTrustMetrics`)

*Note:* Remove `shadow_id` foreign key from `AuditLog` so it functions independently for inventory actions.

### Backend Endpoints to Remove from `app.py`:
- `/api/shadows`, `/api/detect-shadow`, `/api/resolve/{shadow_id}`, `/api/dismiss/{shadow_id}`
- `/api/priority-queue`, `/api/action`, `/api/action-queue`, `/api/root-cause`
- `/api/telemetry/risk-heatmap`, `/api/telemetry/vendor-trust-timeline`, `/api/telemetry/shadow-velocity`, `/api/telemetry/summary`
- `/api/vendor-rings*`, `/api/supplier-network`
- `/api/ml/status`, `/api/ml/retrain`, `/api/admin/retrain`
- `/api/connectors/sap/*`, `/api/mobile/*`
- `/api/analytics/esg-report`, `/api/analytics/dept-risk`
- `/api/vendors/{vendor_id}/upload-contract`, `/api/vendors/{vendor_id}/check-compliance`
- `/api/signals/*`

### Frontend Elements to Remove from `static/index.html` & `static/app.js`:
- "Priority Queue" tab (`#tab-priority`) and related JS functions (`fetchPriorityQueue`, `renderPriorityTable`, `fetchRootCause`).
- "Telemetric Alerts / Integrity Alerts" tab (`#tab-shadows`) and related functions (`fetchShadows`, `renderShadowTable`).
- Collusion graph panels, ESG & carbon widgets, vendor ring modals, and contract upload modals.
- Dead function invocations in `fetchAllData()`.

---

## 4. (c) The New 8-Tab Navigation Structure

The application will feature an 8-tab operational structure tailored for Anishka Industries:

```
┌────────────────────────────────────────────────────────────────────────┐
│  ANISHKA INVENTORY  —  Industrial Welding Spares Management            │
├──────────────┬─────────────────────────────────────────────────────────┤
│  Navigation  │  Active Workspace                                       │
├──────────────┼─────────────────────────────────────────────────────────┤
│ 1. Dashboard │  KPI Cards: Inventory Valuation, SKUs, Low Stock, POs   │
│              │  Charts: Stock by Category, Dispatch vs Inward, Status  │
│              │  Live Stock Activity Feed & Low-Stock Alerts            │
├──────────────┼─────────────────────────────────────────────────────────┤
│ 2. Inventory │  Full Welding Spares Catalog (MIG, TIG, Robotics)       │
│              │  SKU, Category, Stock Qty, Unit Price (₹), Reorder Level│
│              │  Quick Stock Adjustment & Add New Spare Modal           │
├──────────────┼─────────────────────────────────────────────────────────┤
│ 3. Movements │  Stock Inward / Outward / Dispatch Ledger               │
│              │  Record Goods Receipt (GRN) or Shop Floor Dispatch      │
│              │  Quantity, Destination, Operator, Timestamp             │
├──────────────┼─────────────────────────────────────────────────────────┤
│ 4. POs       │  Purchase Orders for Replenishment                      │
│              │  PO #, Supplier, Parts List, Amount (₹), Status         │
│              │  Download Professional PDF PO & Export PO Register      │
├──────────────┼─────────────────────────────────────────────────────────┤
│ 5. Suppliers │  Welding OEMs & Distributor Directory                   │
│              │  Name, Category, Reliability Rating, Total Orders       │
│              │  Add Supplier, Supplier Contact Details                 │
├──────────────┼─────────────────────────────────────────────────────────┤
│ 6. Reports   │  Export Central & Analytics Hub                         │
│              │  Download Valuation PDF, Stock Register Excel, CSV Log  │
├──────────────┼─────────────────────────────────────────────────────────┤
│ 7. AI Copilot│  Anishka AI Assistant (Groq LLaMA 3.3)                  │
│              │  Welding Torch & Spares Technical Compatibility QA      │
│              │  Consumption Velocity & Smart Reorder Advisory          │
├──────────────┼─────────────────────────────────────────────────────────┤
│ 8. Audit     │  Immutable Operation Log                                │
│              │  Stock edits, PO authorizations, user logins, timestamps │
└──────────────┴─────────────────────────────────────────────────────────┘
```

---

## 5. Welding Catalog & Domain Data Model

Anishka Industries specializes in MIG, TIG, and Robotic welding spares. Seed inventory and category configurations:

1. **MIG Welding Spares:**
   - Contact Tips (CuCrZr M6 0.8mm, M6 1.0mm, M8 1.2mm, M8 1.6mm)
   - Gas Nozzles (Conical, Cylindrical, Tapered, Spot Welding Nozzles)
   - Gas Diffusers (Ceramic, DMC / Brass M6 / M8)
   - Torch Liners (Steel wire liners 1.2mm, Teflon liners for Aluminum wire)
   - MIG Torches (MB 15AK, MB 24KD, MB 36KD, MB 501D Water-Cooled)
2. **TIG Welding Spares:**
   - Tungsten Electrodes (2% Thoriated Red, 2% Ceriated Grey, 1.5% Lanthanated Gold, Pure Green)
   - Ceramic Gas Cups / Alumina Nozzles (#4, #5, #6, #7, #8, #10)
   - Collets & Collet Bodies (1.6mm, 2.4mm, 3.2mm)
   - TIG Torch Bodies (WP-17, WP-26 Air-Cooled, WP-18 Water-Cooled, Flexible Neck)
   - Back Caps (Long, Medium, Short)
3. **Robotics Welding Spares:**
   - Robotic Torches & Necks (22°, 45° Swan Neck for ABB / Fanuc / Yaskawa / KUKA)
   - Heavy-Duty Robotic Contact Tips (Silver-plated, CuCrZr)
   - Robotic Torch Cleaning Station Blades & Reamer Cutters
   - Anti-Spatter Injectors & Clamping Blocks
   - Robotic Cable Assemblies & Corrugated Conduit
4. **Welding Consumables & Wire:**
   - MIG Welding Wire Spools (ER70S-6 0.8mm / 1.2mm, Stainless Steel ER308L / ER316L, Aluminum ER4043)
   - TIG Filler Rods (ER70S-6, ER308L, ER4043)

---

## 6. Execution Plan & Validation Milestones

- **Step 1 (Complete):** Deep inspection of codebase; creation of `PLAN.md`.
- **Step 2 (Execution):**
  - Create `_archive/` and move deprecated fraud detection and connector files.
  - Clean `database.py`: remove shadow tables and obsolete foreign keys.
  - Refactor `app.py`: remove shadow endpoints, wire up Stock Movements and POs, update background simulator for welding spare events.
  - Clean `static/index.html` and `static/app.js`: update tabs to the new 8-tab layout, eliminate broken references, ensure clean console and error-free boot.
- **Step 3 (Rebranding):**
  - Rebrand title, logo, header, sidebar, login page, and README to "Anishka Inventory" / "Anishka Industries".
  - Subtitle: "Anishka Industries, Milestone Khandsa Road, Sector-10, Gurugram".
  - Retain dark/light mode toggle.
  - Verify server boot: `uvicorn app:app --reload` with zero import errors.


---

## 🚀 Status Update: Pilot Readiness & Business Impact Completed

### ✅ Completed Capabilities (Test Suite: 255/255 Passing)

1. **Business Impact & ROI Calculator (`/api/business-impact/*`)**:
   - Zero-invention ROI calculator with placeholders *"replace with Anishka's real numbers"*.
   - Editable benchmark multipliers (time reduction %, stockout reduction %, loss rate %, margin %, holding rate %, dead stock release %, annual software cost).
   - Transparent mathematical audit trail showing the exact equations evaluated.
   - Comprehensive pilot KPI tracker with 5 core operational metrics, before-and-after baseline vs measured values, delta computations, and status indicators.
   - Dynamic SVG horizontal bar chart for visual comparison.
   - SaaS subscription tiers (Starter, Industrial Growth, OEM Enterprise) and customer unit economics margin calculator.

2. **Enterprise Security & Access Control**:
   - Argon2id / bcrypt password hashing with legacy migration.
   - Login rate limiting (SlowAPI) and progressive lockout protection.
   - Forced change of default password on first login.
   - Admin user management with role-based access control (`admin`, `manager`, `storekeeper`).
   - Secure cookie attributes and hardened security headers.

3. **Data Management & Backup Engine**:
   - Multi-format catalog, supplier, and opening stock import wizard with row validation and batch rollback.
   - Hot atomic SQLite WAL & PostgreSQL backup snapshots with automatic retention and download endpoint.
   - System `/api/health` monitoring DB connection latency, migrations, and background automation scheduler.
   - Full GitHub Actions CI matrix for automated testing on push.
