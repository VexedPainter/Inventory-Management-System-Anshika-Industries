# Anishka Inventory — 5-Minute Demo Guide

**Anishka Industries · Industrial Welding Spares Management**  
Milestone Khandsa Road, Sector-10, Gurugram – 122001, Haryana

---

## 🚀 Setup (3 Commands)

```bash
# 1. Install dependencies
pip install -r requirements.txt

# 2. (Optional) Configure Groq AI — already set in .env
#    GROQ_API_KEY=your_key  |  GROQ_MODEL=qwen/qwen3.8-27b

# 3. Start the server
uvicorn app:app --reload
```

Open → **[http://localhost:8000](http://localhost:8000)**

---

## 🔐 Demo Logins

| Role | Username | Password | What you can do |
|:--|:--|:--|:--|
| **Admin (Store Director)** | `admin` | `admin@2026` | Everything — catalog, POs, resets, audit |
| **Manager (Procurement)** | `manager` | `manager@2026` | Create & approve POs, view reports |
| **Storekeeper** | `storekeeper` | `storekeeper@2026` | Stock in / stock out / cycle adjust |

---

## 🎬 5-Minute Demo Script

### Step 1 — Live Dashboard (60 sec)
1. Log in as **admin**.
2. Notice the **pulsing green LIVE pill** in the top bar — the simulator is running, dispatching and receiving welding spares in real time.
3. Watch the **Activity Feed** update automatically (no refresh needed).
4. The 4 KPI cards animate their counts on load:
   - **Total SKUs** · **Total Valuation (₹)** · **Low-Stock Items** · **Active Suppliers**
5. Click any KPI card to jump to filtered inventory (e.g., click "Low Stock" to see only LOW/CRITICAL/OUT items).

---

### Step 2 — Inventory Catalog + Item Drawer (60 sec)
1. Switch to the **Inventory** tab.
2. Type `"contact tip"` in the search box — watch real-time filter.
3. Click any row to open the **right-side drawer**:
   - Item details, unit cost, selling price, bin location, compatible machines
   - **30-Day Demand Forecast** chart (AI-calculated)
   - Last 5 stock movements for that item
4. Use the **Category pills** (MIG Spares, TIG Spares, Robotics, Wire & Consumables) to segment the catalog.
5. Use the **Status pills** to isolate items by OK / LOW / CRITICAL / OUT / DEAD.

---

### Step 3 — Stock Out → Dispatch Note PDF (60 sec)
1. Still on Inventory tab, find a **CRITICAL** or **LOW** item.
2. Click **Stock Out** (red button in the drawer or the action button on the row).
3. Enter quantity and reference number — submit.
4. A **Goods Dispatch Note PDF** link appears instantly in the success toast.
5. Click it to preview the printable dispatch document (letterhead, item table, stamp area).

---

### Step 4 — AI Copilot (45 sec)
1. Switch to the **AI Assistant** tab.
2. Click the suggestion chip: **"What should I reorder this week?"**
3. The assistant reads live inventory and responds with:
   - Specific SKUs below reorder level
   - Suggested quantities
   - Supplier recommendations
4. Try: **"Which MIG contact tips are critically low?"** for a domain-specific response.

---

### Step 5 — Create PO → Approve → Receive (60 sec)
1. Switch to **Purchase Orders** tab.
2. Click **+ New Purchase Order** (manager/admin only).
3. Select a supplier from the dropdown (e.g., Binzel India).
4. Add 2–3 line items using **+ Add Item** — the ₹ total updates live.
5. Submit → PO is created with ID format `ANI-PO-2026-XXXX`.
6. Click **Approve** on the new PO row → status changes to **APPROVED**.
7. Click **Receive** → stock is auto-added for each line item, IN movements are created.
8. Dispatch Note PDFs appear for each received movement.

---

### Step 6 — Reset Demo Data (15 sec)
1. Click the **⚡ Reset Demo Data** amber button (admin-only, top bar).
2. Confirm the prompt — 62 SKUs, 14 suppliers, 251 movements, and 10 POs are reseeded.
3. All connected browser tabs update instantly via WebSocket.

---

## 📊 What the System Tracks

| Capability | Detail |
|:--|:--|
| **62 Active SKUs** | MIG, TIG, Robotics, Wire & Consumables |
| **14 Authorised Suppliers** | Binzel, Panasonic, Fronius, ESAB, Ador, Lincoln Electric and more |
| **5 Stock Statuses** | OK · LOW · CRITICAL · OUT · DEAD (auto-calculated) |
| **Full Audit Trail** | Every action logged with acting user and timestamp |
| **Auto-Reorder Logic** | Skips items already on open DRAFT/APPROVED POs (no double orders) |
| **RBAC** | 3-tier role enforcement on every API endpoint |
| **Real-Time WebSockets** | Dashboard + activity feed update across all connected clients |

---

## 📁 Export Menu (Reports Tab)

| Export | Format | Content |
|:--|:--|:--|
| Low-Stock Replenishment Advisory | **PDF** | Items below reorder level, qty needed, preferred supplier |
| Low-Stock Replenishment Advisory | **Excel** | Same data in spreadsheet form |
| Low-Stock Replenishment Advisory | **CSV** | Raw data for ERP import |
| Executive Stock Valuation | **PDF** | Full catalog valuation with letterhead |
| Comprehensive Ledger | **Excel (.xlsx)** | 4-sheet workbook: Catalog, Movements, POs, Suppliers |
| All Purchase Orders Batch | **PDF** | Consolidated printable PO document |

---

## 🔗 Key API Endpoints (for developers)

```
GET  /api/dashboard          — Live KPIs and chart feeds
GET  /api/inventory          — Paginated, searchable catalog
POST /api/stock/out          — Issue stock (creates dispatch note)
POST /api/procurement        — Create PO with multi-item lines
POST /api/procurement/{id}/approve  — Approve PO
POST /api/procurement/{id}/receive  — Receive goods + auto stock-in
GET  /api/forecast/{item_id} — 30-day demand forecast
GET  /api/export/low-stock/pdf      — Low-stock advisory PDF
POST /api/ai/chat            — Groq-powered AI copilot
WS   /ws                     — WebSocket for live updates
```

---

*© 2026 Anishka Industries · Proprietary Commercial Software*
