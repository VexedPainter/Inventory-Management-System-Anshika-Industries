# Anishka Industries ERP — Operational User Guide

> **Facility**: Milestone Khandsa Road, Sector-10, Gurugram, Haryana - 122001  
> **Specialization**: MIG/TIG Industrial Welding Spares, Consumables & Robotic Welding Torches  

This operational manual provides step-by-step instructions for each role in the enterprise: **Storekeeper**, **Manager**, and **System Administrator**.

---

## Quick Reference: Role Matrix

| Capability | Storekeeper | Manager | Administrator |
|---|:---:|:---:|:---:|
| Mobile Barcode Scanning & SKU Search | ✅ | ✅ | ✅ |
| Physical Stock Adjustments & Count In/Out | ✅ | ✅ | ✅ |
| PO Goods Receipt & Delivery Challan OCR | ✅ | ✅ | ✅ |
| Cycle Counting Sheets | ✅ | ✅ | ✅ |
| Approve Purchase Orders & Auto-Replenish | ❌ | ✅ | ✅ |
| Sales Quotes, Orders & Invoicing | ❌ | ✅ | ✅ |
| Sales Cadence & Predictive Opportunities | ❌ | ✅ | ✅ |
| GST Registers (Sales, Purchase, GSTR-1, HSN) | ❌ | ✅ | ✅ |
| Tally Prime XML / CSV Voucher Exports | ❌ | ✅ | ✅ |
| Data Import Wizard (Items, Suppliers, Stock) | ❌ | ✅ | ✅ |
| Import Batch Rollback / Undo | ❌ | ❌ | ✅ |
| User Provisioning & Role Assignments | ❌ | ❌ | ✅ |
| Database Hot Backup & Disaster Recovery | ❌ | ❌ | ✅ |

---

## 1. Storekeeper Operational Guide

### 1.1 Logging In & First-Time Password Rotation
1. Open your browser and navigate to `http://localhost:8000/login` (or the company server URL).
2. Enter your assigned username (`storekeeper`) and initial password (`storekeeper@2026`).
3. If logging in with the default password, a **Password Change Required** dialog will automatically appear.
4. Enter your current password and a new secure password (minimum 8 characters with at least one letter and one number or symbol).
5. Click **Update Password** to access the warehouse dashboard.

### 1.2 Barcode & QR Code Scanning (Desktop & Mobile PWA)
1. On your mobile device or tablet, open the ERP and tap **Install App** to add Anishka ERP to your home screen.
2. Tap the **📷 Scan Barcode** button in the top action bar.
3. Allow camera permissions and align the camera with the barcode or QR code on the spare box.
4. The system immediately retrieves:
   - Part SKU (e.g. `BINZ-MB24-NOZ`)
   - Exact warehouse bin location (e.g. `A-01-B2`)
   - Current physical quantity on hand
   - Minimum reorder threshold
5. Tap **Stock In** to add delivered goods or **Stock Out** to issue items to workshop technicians.

### 1.3 Receiving Goods Against a Purchase Order (3-Way OCR Match)
1. Navigate to **Purchase Orders** in the sidebar.
2. Find the approved PO matching the delivery (status: `APPROVED` or `PARTIALLY_RECEIVED`).
3. Click the **Receive Items** button.
4. Upload a photo or scan of the supplier's **Delivery Challan** or Invoice.
5. The built-in OCR engine automatically extracts:
   - Supplier Challan Number & Date
   - Delivered items and quantities
6. Review the extracted quantities against ordered quantities:
   - **Full Delivery**: Click **Receive All** to update inventory instantly.
   - **Partial Delivery**: Adjust the received quantity. The PO status updates to `PARTIALLY_RECEIVED` and flags remaining open items.

---

## 2. Manager Operational Guide

### 2.1 Approving Replenishments & Smart Safety Stock
1. Go to **Purchase Orders → Reorder Suggestions**.
2. The AI preventive analytics engine calculates daily demand variance and lead times:
   $$\text{Safety Stock} = Z_{\text{service}} \times \sigma_{\text{demand}} \times \sqrt{\text{Lead Time}}$$
   $$\text{Reorder Point} = (\text{Daily Demand} \times \text{Lead Time}) + \text{Safety Stock}$$
3. Review recommended draft orders. Click **Approve PO**.
4. The approved order is automatically staged in the **Email Outbox** for the supplier.

### 2.2 Predictive Sales Opportunities & WhatsApp Outreach
1. Navigate to **Sales & Quotes → Opportunities**.
2. The engine tracks each customer's historical order cadence (e.g. Haryana Auto Components orders contact tips every 14 days).
3. Customers predicted to reorder within the next 7 to 14 days are listed with:
   - Suggested items and quantities based on past consumption
   - Stock coverage badge (indicates whether current stock is sufficient or short)
4. Click **💬 Send on WhatsApp**:
   - Choose language tab: **English** or **हिन्दी (Hindi)**.
   - Review the pre-populated message with customer quotation lines.
   - Click **Open WhatsApp Web / App** to dispatch immediately to the customer's procurement contact.
   - All communications are logged in the communications outbox.

### 2.3 GST Registers & Compliance Review
1. Go to **Reports & Exports → GST Registers & Returns**.
2. Select the tax period month (e.g. `2026-11`).
3. Switch between register tabs:
   - **Sales Register**: All tax invoices with CGST (9%), SGST (9%), IGST (18%), and B2B/B2C categorization.
   - **Purchase Register**: Eligible Input Tax Credit (ITC) from vendor POs.
   - **GSTR-1 Summary**: Ready-to-file B2B invoice tables and B2CS state-wise aggregates.
   - **HSN Summary**: Quantity, taxable value, and tax amounts grouped by HSN code (e.g. `8466`, `4203`).
4. Click **Download CSV** for the active view to export for the company accountant.
5. *Note: Figures must be reviewed by the company's Chartered Accountant prior to official GST portal submission.*

### 2.4 Tally Prime / ERP 9 Voucher Export
1. Go to **Reports & Exports → Tally XML & CSV Export**.
2. Set your start and end dates, and select voucher type (`Sales`, `Purchase`, or `Both`).
3. Click **Export Tally XML**.
4. In Tally Prime: Press `Alt + O` $\to$ **Import** $\to$ **Vouchers** $\to$ Select the downloaded file.
5. In Tally ERP 9: Go to **Gateway of Tally → Import Data → Vouchers**.

---

## 3. Administrator Operational Guide

### 3.1 Data Import Wizard (Catalog, Vendors & Opening Stock)
1. Go to **Inventory Catalog** and click the **📥 Import Wizard** button in the toolbar.
2. **Step 1: Upload & Map**
   - Select dataset type: `Items & Spares Catalog`, `Authorized Suppliers`, or `Opening Physical Stock`.
   - Download the official template (`.csv` or `.xlsx`) to view expected columns.
   - Drag and drop your company's existing spreadsheet.
   - Click **Validate & Preview**.
3. **Step 2: Validation Preview**
   - The wizard verifies every row: checks for missing fields, duplicate SKUs, negative prices, and invalid supplier IDs.
   - Review summary metrics: Valid rows (green), Warnings (yellow), Errors (red).
   - If there are zero errors, click **Commit Import Batch**.
4. The system executes an atomic transaction, tagging every record with a unique batch code (e.g. `BATCH-202611221530-AB12`).

### 3.2 Undoing / Rolling Back an Import Batch
1. Open the **Import Wizard** and switch to **Batch History & Undo**.
2. Locate the batch you wish to revert.
3. Click **Undo Batch**:
   - For **Items**: Automatically deactivates newly created SKUs and cleans up stock records.
   - For **Opening Stock**: Restores each item's previous inventory count from the saved snapshot.
   - Logs an immutable rollback entry in the system audit trail.

### 3.3 User Management & Role Provisioning
1. Click **User Accounts** in the sidebar navigation.
2. View all active accounts, assigned roles, security flags, and last active timestamps.
3. Click **➕ Add New User**:
   - Provide username (e.g. `rajesh.s`), full name, and role (`storekeeper`, `manager`, or `admin`).
   - Assign a temporary password (min 8 characters).
   - Leave **Force password change on first login** checked.
   - Click **Create User**.
4. To reset a lost password, click the **Key** icon next to the user.
5. To revoke warehouse access, click **Disable** (soft delete preserving historical audit logs).

### 3.4 Database Hot Backups & Disaster Recovery
1. Go to **Reports & Exports → Database Backups**.
2. Click **➕ Create Backup Now** to trigger an immediate atomic snapshot.
3. The backup file is stored in `backups/` with a verified SHA256 checksum.
4. Click **⬇️ Download** to save the archive (`.db` or `.sql`) to external offline storage.
5. **Emergency Restore via CLI**:
   If the server needs to be restored to a prior state:
   ```bash
   # From the project root folder:
   python backup_manager.py restore anishka_backup_manual_20261122_120000.db
   ```
   *The restore command automatically creates a safety snapshot of the current state before applying the restore.*

### 3.5 System Health & API Observability
- Access `http://localhost:8000/api/health` in your browser or monitoring tool.
- The endpoint reports:
  ```json
  {
    "status": "healthy",
    "facility": "Anishka Industries, Gurugram",
    "version": "2.5.0-pilot",
    "database": {
      "status": "connected",
      "dialect": "sqlite",
      "latency_ms": 0.85
    },
    "scheduler": {
      "running": true,
      "jobs_count": 3,
      "jobs": ["automation_cycle", "nightly_backup_job", "daily_digest_job"]
    },
    "security": {
      "password_hashing": "argon2id/bcrypt",
      "rate_limiting": "active",
      "secure_cookies": false
    }
  }
  ```
