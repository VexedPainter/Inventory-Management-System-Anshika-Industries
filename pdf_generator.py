"""
Anishka Industries PDF Engine v7.0.
Generates audit-compliant, professionally formatted commercial documents,
Purchase Orders, and Executive Inventory Valuation Reports for Anishka Industries, Gurugram.
"""

from fpdf import FPDF
import datetime
import io
import os
import tempfile
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

class AnishkaPDF(FPDF):
    def clean_str(self, text):
        """Clean string to prevent FPDFUnicodeEncodingException using latin-1 fallback."""
        if not text:
            return ""
        try:
            return str(text).encode('latin-1', 'replace').decode('latin-1')
        except Exception:
            return str(text)

    def branding_header(self, title: str, doc_id: str, date: str):
        """Header banner for Anishka Industries."""
        # Top color accent bar
        self.set_fill_color(0, 35, 75)  # Navy Authority
        self.rect(0, 0, 216, 8, 'F')
        self.set_fill_color(0, 106, 106) # Teal
        self.rect(0, 8, 216, 2, 'F')

        self.set_xy(10, 16)
        # Logo Box
        self.set_fill_color(0, 35, 75)
        self.rect(10, 16, 18, 18, 'F')
        self.set_font("helvetica", "B", 13)
        self.set_text_color(255, 255, 255)
        self.set_xy(10, 19)
        self.cell(18, 12, "AI", align="C")

        # Company Info
        self.set_xy(32, 16)
        self.set_font("helvetica", "B", 14)
        self.set_text_color(0, 35, 75)
        self.cell(100, 6, "ANISHKA INDUSTRIES", ln=True)

        self.set_xy(32, 22)
        self.set_font("helvetica", "", 8)
        self.set_text_color(75, 85, 99)
        self.cell(100, 4, "Milestone Khandsa Road, Sector-10, Gurugram - 122001, Haryana", ln=True)
        self.set_xy(32, 26)
        self.cell(100, 4, "Supplier of MIG, TIG & Robotics Welding Spares | GSTIN: 06AAACA1234F1Z5", ln=True)

        # Document Title and Metadata Box (Right-aligned)
        self.set_xy(135, 16)
        self.set_font("helvetica", "B", 12)
        self.set_text_color(0, 106, 106)
        self.cell(70, 6, title, align="R", ln=True)

        self.set_xy(135, 22)
        self.set_font("helvetica", "B", 9)
        self.set_text_color(31, 41, 55)
        self.cell(70, 4, f"Ref #: {doc_id}", align="R", ln=True)
        self.set_xy(135, 26)
        self.set_font("helvetica", "", 8)
        self.set_text_color(107, 114, 128)
        self.cell(70, 4, f"Date: {date}", align="R", ln=True)

        self.set_draw_color(229, 231, 235)
        self.line(10, 38, 205, 38)
        self.set_y(44)

    def footer(self):
        """Footer on all document pages."""
        self.set_y(-18)
        self.set_draw_color(229, 231, 235)
        self.line(10, self.get_y(), 205, self.get_y())
        self.ln(3)

        self.set_font("helvetica", "", 8)
        self.set_text_color(107, 114, 128)
        self.cell(100, 4, "Anishka Inventory System · Anishka Industries Gurugram", align="L")
        self.cell(95, 4, f"Page {self.page_no()}/{{nb}}", align="R", ln=True)

        self.set_font("helvetica", "I", 7)
        self.set_text_color(156, 163, 175)
        self.cell(0, 4, "Generated via Anishka Inventory Management System | Khandsa Road, Sector-10, Gurugram", align="C")

    def _generate_stock_category_chart(self, category_data):
        """Generate pie or bar chart of stock by category."""
        if not category_data:
            return None
        try:
            labels = list(category_data.keys())
            values = list(category_data.values())

            plt.figure(figsize=(4, 3), dpi=100)
            colors = ['#00234B', '#006A6A', '#FFBF00', '#2563EB', '#10B981', '#7C3AED'][:len(labels)]
            plt.pie(values, labels=labels, autopct='%1.0f%%', startangle=140, colors=colors, textprops={'fontsize': 7})
            plt.title("Stock Valuation by Category", fontsize=9, fontweight='bold', pad=10)
            plt.tight_layout()

            tmp_file = tempfile.NamedTemporaryFile(delete=False, suffix=".png")
            plt.savefig(tmp_file.name)
            plt.close()
            return tmp_file.name
        except Exception:
            return None


def generate_document_pdf(data: dict, document_type: str = "po", audit_context: str = None) -> bytes:
    """Generate professional Purchase Order or Invoice PDF."""
    title = "PURCHASE ORDER" if document_type == "po" else "COMMERCIAL INVOICE"
    pdf = AnishkaPDF(orientation="P", unit="mm", format="Letter")
    pdf.alias_nb_pages()
    pdf.add_page()

    doc_id = str(data.get("id", "PO-2026-001"))
    date = str(data.get("date", datetime.date.today().isoformat()))
    pdf.branding_header(title=title, doc_id=doc_id, date=date)

    y_start = pdf.get_y()

    # Section Headers
    pdf.set_font("helvetica", "B", 9)
    pdf.set_text_color(55, 65, 81)
    pdf.cell(65, 6, "SUPPLIER / VENDOR", ln=0)
    pdf.cell(65, 6, "BILL TO / BUYER", ln=0)
    pdf.cell(65, 6, "DELIVERY DESTINATION", ln=1)

    pdf.set_font("helvetica", "", 9)
    pdf.set_text_color(31, 41, 55)

    vendor_name = data.get("vendor_name", data.get("vendor", "Supplier Entity"))

    # Supplier Block
    pdf.set_xy(10, y_start + 6)
    pdf.multi_cell(60, 4, f"{vendor_name}\nAuthorized OEM / Distributor\nSupplier ID: {data.get('vendor_id', 'V-001')}\nGurugram & NCR Hub")

    # Bill To Block
    pdf.set_xy(75, y_start + 6)
    pdf.multi_cell(60, 4, "Anishka Industries\nMilestone Khandsa Road, Sector-10\nGurugram - 122001, Haryana\naccounts@anishkaindustries.com")

    # Ship To Block
    pdf.set_xy(140, y_start + 6)
    pdf.multi_cell(60, 4, "Central Welding Spares Warehouse\nDock 1, Milestone Khandsa Road\nSector-10, Gurugram, Haryana\nAttn: Stores Incharge")

    pdf.ln(12)

    # Metadata Row
    pdf.set_fill_color(243, 244, 246)
    pdf.set_font("helvetica", "B", 8)
    pdf.cell(49, 7, "CURRENCY", border=1, align="C", fill=True)
    pdf.cell(49, 7, "PAYMENT TERMS", border=1, align="C", fill=True)
    pdf.cell(49, 7, "DELIVERY TIMELINE", border=1, align="C", fill=True)
    pdf.cell(48, 7, "REQUISITION DEPT", border=1, align="C", fill=True)
    pdf.ln()

    pdf.set_font("helvetica", "", 9)
    pdf.cell(49, 7, "INR (Rs.)", border=1, align="C")
    pdf.cell(49, 7, "30 Days Net", border=1, align="C")
    pdf.cell(49, 7, "3-5 Business Days", border=1, align="C")
    pdf.cell(48, 7, str(data.get("department", "Central Store")), border=1, align="C")
    pdf.ln(10)

    # Line Items Header
    pdf.set_fill_color(0, 35, 75)
    pdf.set_text_color(255, 255, 255)
    pdf.set_font("helvetica", "B", 9)
    pdf.cell(100, 8, " SPARE PART DESCRIPTION", border=0, fill=True)
    pdf.cell(25, 8, "QTY", border=0, align="C", fill=True)
    pdf.cell(35, 8, "UNIT PRICE (Rs.)", border=0, align="R", fill=True)
    pdf.cell(35, 8, "TOTAL AMOUNT (Rs.)", border=0, align="R", fill=True)
    pdf.ln()

    # Data Row
    pdf.set_text_color(17, 24, 39)
    pdf.set_font("helvetica", "", 9)

    item_name = data.get("item", data.get("description", "Industrial Welding Spares"))
    qty = int(data.get("quantity", 1))
    total_amount = float(data.get("amount", 0.0))
    unit_price = total_amount / qty if qty > 0 else total_amount

    pdf.cell(100, 8, f" {pdf.clean_str(item_name)[:50]}", border="B")
    pdf.cell(25, 8, str(qty), border="B", align="C")
    pdf.cell(35, 8, f"{unit_price:,.2f}", border="B", align="R")
    pdf.cell(35, 8, f"{total_amount:,.2f}", border="B", align="R")
    pdf.ln(12)

    # Totals Section
    pdf.set_x(125)
    pdf.set_font("helvetica", "B", 9)
    pdf.cell(35, 7, "SUBTOTAL:", border=0, align="R")
    pdf.cell(35, 7, f"Rs. {total_amount:,.2f}", border=0, align="R")
    pdf.ln(6)

    gst_amount = total_amount * 0.18
    pdf.set_x(125)
    pdf.cell(35, 7, "GST (18%):", border=0, align="R")
    pdf.cell(35, 7, f"Rs. {gst_amount:,.2f}", border=0, align="R")
    pdf.ln(6)

    grand_total = total_amount + gst_amount
    pdf.set_x(125)
    pdf.set_font("helvetica", "B", 11)
    pdf.set_text_color(0, 106, 106)
    pdf.cell(35, 8, "GRAND TOTAL:", border="T", align="R")
    pdf.cell(35, 8, f"Rs. {grand_total:,.2f}", border="T", align="R")
    pdf.ln(16)

    # Terms & Authorization
    pdf.set_text_color(55, 65, 81)
    pdf.set_font("helvetica", "B", 8)
    pdf.cell(0, 5, "TERMS & CONDITIONS:", ln=True)
    pdf.set_font("helvetica", "", 7)
    pdf.cell(0, 4, "1. Spares must adhere to OEM dimensional tolerances and be free from oxidation or surface defects.", ln=True)
    pdf.cell(0, 4, "2. Material test certificates (MTC) required for tungsten electrodes and welding wire spools.", ln=True)
    pdf.cell(0, 4, "3. Delivery to be made at Khandsa Road Warehouse, Sector-10, Gurugram between 9:00 AM - 6:00 PM.", ln=True)

    pdf.ln(12)
    pdf.set_font("helvetica", "B", 8)
    pdf.cell(90, 4, "Authorized Store Manager Signature", border="T", align="C")
    pdf.set_x(120)
    pdf.cell(75, 4, "Supplier Acceptance & Stamp", border="T", align="C")

    return bytes(pdf.output())


def generate_dashboard_report_pdf(stats: dict, low_stock_items: list = None, categories_breakdown: dict = None) -> bytes:
    """Generate Executive Inventory Valuation & Stock Report."""
    pdf = AnishkaPDF(orientation="P", unit="mm", format="Letter")
    pdf.alias_nb_pages()
    pdf.add_page()

    today = datetime.date.today().isoformat()
    pdf.branding_header(
        title="INVENTORY VALUATION & AUDIT",
        doc_id=f"VAL-{today.replace('-', '')}",
        date=today,
    )

    # 1. Executive Summary
    pdf.set_font("helvetica", "B", 12)
    pdf.set_text_color(0, 35, 75)
    pdf.cell(0, 8, "1.0 EXECUTIVE INVENTORY SUMMARY", ln=True)

    pdf.set_font("helvetica", "", 9)
    pdf.set_text_color(75, 85, 99)
    pdf.multi_cell(0, 5, f"Comprehensive inventory valuation report finalized on {today} for Anishka Industries, Gurugram. Covering specialized welding equipment spares across MIG, TIG, Robotics, and consumable lines.")
    pdf.ln(4)

    # KPI Row
    pdf.set_fill_color(243, 244, 246)
    pdf.set_font("helvetica", "B", 8)
    pdf.cell(49, 7, "TOTAL VALUATION", border=1, align="C", fill=True)
    pdf.cell(49, 7, "ACTIVE SKUS", border=1, align="C", fill=True)
    pdf.cell(49, 7, "LOW STOCK WARNINGS", border=1, align="C", fill=True)
    pdf.cell(48, 7, "ACTIVE SUPPLIERS", border=1, align="C", fill=True)
    pdf.ln()

    pdf.set_font("helvetica", "B", 11)
    pdf.set_text_color(0, 35, 75)
    pdf.cell(49, 9, f"Rs. {stats.get('total_inventory_value', 0):,.2f}", border=1, align="C")
    pdf.cell(49, 9, str(stats.get('total_skus', 0)), border=1, align="C")

    low_count = stats.get('low_stock_count', 0)
    pdf.set_text_color(185, 28, 28 if low_count > 0 else 55)
    pdf.cell(49, 9, str(low_count), border=1, align="C")

    pdf.set_text_color(0, 106, 106)
    pdf.cell(48, 9, str(stats.get('total_suppliers', 14)), border=1, align="C")
    pdf.ln(12)

    # 2. Low Stock Alerts Section
    pdf.set_font("helvetica", "B", 12)
    pdf.set_text_color(0, 35, 75)
    pdf.cell(0, 8, "2.0 LOW STOCK ITEMS & REORDER ADVISORY", ln=True)

    pdf.set_fill_color(0, 35, 75)
    pdf.set_text_color(255, 255, 255)
    pdf.set_font("helvetica", "B", 8)
    pdf.cell(30, 7, " SKU", fill=True)
    pdf.cell(80, 7, " ITEM NAME", fill=True)
    pdf.cell(30, 7, " CATEGORY", fill=True)
    pdf.cell(25, 7, " STOCK", align="C", fill=True)
    pdf.cell(30, 7, " REORDER LVL", align="C", fill=True)
    pdf.ln()

    pdf.set_font("helvetica", "", 8)
    pdf.set_text_color(31, 41, 55)

    if low_stock_items:
        for item in low_stock_items[:12]:
            pdf.cell(30, 7, f" {item.get('sku', '')}", border="B")
            pdf.cell(80, 7, f" {pdf.clean_str(item.get('name', ''))[:45]}", border="B")
            pdf.cell(30, 7, f" {item.get('category', '')}", border="B")
            pdf.cell(25, 7, str(item.get('quantity', 0)), border="B", align="C")
            pdf.cell(30, 7, str(item.get('reorder_level', 0)), border="B", align="C")
            pdf.ln()
    else:
        pdf.cell(195, 7, " All inventory spares are currently above reorder thresholds.", border="B", align="C")
        pdf.ln()

    # 3. Chart Section
    if categories_breakdown:
        chart_file = pdf._generate_stock_category_chart(categories_breakdown)
        if chart_file:
            pdf.ln(6)
            pdf.image(chart_file, x=58, y=pdf.get_y(), w=100)
            try:
                os.remove(chart_file)
            except Exception:
                pass

    return bytes(pdf.output())


    return bytes(pdf.output())


def generate_low_stock_report_pdf(stats_or_items, low_stock_items: list = None) -> bytes:
    """Generate official Low Stock & Replenishment Advisory PDF report."""
    if low_stock_items is None and isinstance(stats_or_items, list):
        low_stock_items = stats_or_items
    elif low_stock_items is None:
        low_stock_items = []

    pdf = AnishkaPDF(orientation="P", unit="mm", format="Letter")
    pdf.alias_nb_pages()
    pdf.add_page()

    today_str = datetime.date.today().isoformat()
    pdf.branding_header(title="LOW-STOCK ADVISORY", doc_id=f"LSR-{today_str}", date=today_str)

    pdf.set_font("helvetica", "B", 10)
    pdf.set_text_color(0, 35, 75)
    pdf.cell(0, 7, "1.0 REPLENISHMENT SUMMARY & URGENT PROCUREMENT NEEDS", ln=True)

    pdf.set_font("helvetica", "", 8.5)
    pdf.set_text_color(75, 85, 99)
    out_cnt = sum(1 for i in low_stock_items if i.get("status") == "OUT" or i.get("quantity", 0) <= 0)
    crit_cnt = sum(1 for i in low_stock_items if i.get("status") == "CRITICAL")
    low_cnt = len(low_stock_items) - out_cnt - crit_cnt

    summary_line = f"Total Items Requiring Action: {len(low_stock_items)}  |  Out of Stock: {out_cnt}  |  Critical: {crit_cnt}  |  Low Stock: {low_cnt}"
    pdf.cell(0, 5, summary_line, ln=True)
    pdf.ln(3)

    # Table Header
    pdf.set_fill_color(0, 35, 75)
    pdf.set_text_color(255, 255, 255)
    pdf.set_font("helvetica", "B", 8)
    pdf.cell(28, 7, " SKU", fill=True)
    pdf.cell(64, 7, " PART NAME", fill=True)
    pdf.cell(26, 7, " CATEGORY", fill=True)
    pdf.cell(20, 7, " ON HAND", align="C", fill=True)
    pdf.cell(20, 7, " REORDER", align="C", fill=True)
    pdf.cell(22, 7, " STATUS", align="C", fill=True)
    pdf.cell(16, 7, " SUGG.", align="C", fill=True)
    pdf.ln()

    pdf.set_font("helvetica", "", 8)
    pdf.set_text_color(31, 41, 55)

    if low_stock_items:
        for item in low_stock_items:
            sku = item.get("sku", "")
            name = pdf.clean_str(item.get("name", ""))[:35]
            cat = pdf.clean_str(item.get("category", ""))[:14]
            qty = str(item.get("quantity", 0))
            reorder = str(item.get("reorder_level", 0))
            status = item.get("status", "LOW")
            sugg = str(item.get("reorder_qty") or item.get("suggested_qty") or 50)

            # Highlight status text
            if status == "OUT":
                pdf.set_text_color(185, 28, 28)  # Red
            elif status == "CRITICAL":
                pdf.set_text_color(194, 65, 12)  # Dark Amber
            else:
                pdf.set_text_color(31, 41, 55)

            pdf.cell(28, 6.5, f" {sku}", border="B")
            pdf.cell(64, 6.5, f" {name}", border="B")
            pdf.cell(26, 6.5, f" {cat}", border="B")
            pdf.cell(20, 6.5, qty, border="B", align="C")
            pdf.cell(20, 6.5, reorder, border="B", align="C")
            pdf.cell(22, 6.5, status, border="B", align="C")
            pdf.set_text_color(31, 41, 55)
            pdf.cell(16, 6.5, sugg, border="B", align="C")
            pdf.ln()
    else:
        pdf.cell(196, 7, "All welding spares currently meet inventory target thresholds.", border="B", align="C")
        pdf.ln()

    return bytes(pdf.output())


def generate_dispatch_note_pdf(dispatch_data: dict) -> bytes:
    """Generate official Goods Dispatch Note / Issue Challan PDF."""
    pdf = AnishkaPDF(orientation="P", unit="mm", format="Letter")
    pdf.alias_nb_pages()
    pdf.add_page()

    doc_id = dispatch_data.get("movement_id") or dispatch_data.get("reference") or f"DISP-{datetime.date.today().isoformat()}"
    date_str = dispatch_data.get("timestamp") or datetime.date.today().isoformat()
    pdf.branding_header(title="GOODS DISPATCH NOTE", doc_id=doc_id, date=date_str)

    # Details Box
    pdf.set_fill_color(248, 250, 252)
    pdf.rect(10, 44, 196, 26, 'F')
    pdf.set_draw_color(226, 232, 240)
    pdf.rect(10, 44, 196, 26, 'D')

    pdf.set_xy(14, 48)
    pdf.set_font("helvetica", "B", 8.5)
    pdf.cell(40, 5, "Destination / Party:")
    pdf.set_font("helvetica", "", 8.5)
    pdf.cell(70, 5, pdf.clean_str(dispatch_data.get("party") or dispatch_data.get("destination") or "Shop Floor Line"))

    pdf.set_font("helvetica", "B", 8.5)
    pdf.cell(35, 5, "Reference / Invoice #:")
    pdf.set_font("helvetica", "", 8.5)
    pdf.cell(40, 5, pdf.clean_str(dispatch_data.get("reference") or "Internal Transfer"), ln=True)

    pdf.set_xy(14, 55)
    pdf.set_font("helvetica", "B", 8.5)
    pdf.cell(40, 5, "Issued By:")
    pdf.set_font("helvetica", "", 8.5)
    pdf.cell(70, 5, pdf.clean_str(dispatch_data.get("performed_by") or "Central Store"))

    pdf.set_font("helvetica", "B", 8.5)
    pdf.cell(35, 5, "Stock Movement ID:")
    pdf.set_font("helvetica", "", 8.5)
    pdf.cell(40, 5, pdf.clean_str(doc_id), ln=True)

    pdf.set_y(76)
    pdf.set_fill_color(0, 35, 75)
    pdf.set_text_color(255, 255, 255)
    pdf.set_font("helvetica", "B", 8.5)
    pdf.cell(30, 7, " SKU", fill=True)
    pdf.cell(90, 7, " DESCRIPTION", fill=True)
    pdf.cell(30, 7, " CATEGORY", fill=True)
    pdf.cell(26, 7, " QTY ISSUED", align="C", fill=True)
    pdf.cell(20, 7, " UNIT", align="C", fill=True)
    pdf.ln()

    pdf.set_font("helvetica", "", 8.5)
    pdf.set_text_color(31, 41, 55)

    items = dispatch_data.get("items")
    if not items:
        items = [{
            "sku": dispatch_data.get("sku", "N/A"),
            "name": dispatch_data.get("item_name", "Welding Spare"),
            "category": dispatch_data.get("category", "MIG/TIG Spares"),
            "quantity": dispatch_data.get("quantity", 1),
            "unit": dispatch_data.get("unit", "pcs")
        }]

    for item in items:
        pdf.cell(30, 7, f" {item.get('sku', '')}", border="B")
        pdf.cell(90, 7, f" {pdf.clean_str(item.get('name', ''))[:50]}", border="B")
        pdf.cell(30, 7, f" {pdf.clean_str(item.get('category', ''))[:16]}", border="B")
        pdf.cell(26, 7, str(item.get("quantity", 0)), border="B", align="C")
        pdf.cell(20, 7, str(item.get("unit", "pcs")), border="B", align="C")
        pdf.ln()

    # Sign-off boxes
    pdf.set_y(150)
    pdf.set_draw_color(209, 213, 219)
    pdf.rect(14, 150, 80, 24, 'D')
    pdf.rect(116, 150, 80, 24, 'D')

    pdf.set_xy(16, 168)
    pdf.set_font("helvetica", "I", 8)
    pdf.set_text_color(107, 114, 128)
    pdf.cell(76, 4, "Storekeeper Signature & Stamp", align="C")

    pdf.set_xy(118, 168)
    pdf.cell(76, 4, "Receiver / Production Incharge Signature", align="C")

    return bytes(pdf.output())


def generate_bulk_pdf(po_list: list) -> bytes:
    """Generate multi-document batch PDF for all purchase orders."""
    pdf = AnishkaPDF(orientation="P", unit="mm", format="Letter")
    pdf.alias_nb_pages()
    for po in po_list:
        pdf.add_page()
        doc_id = str(po.get("id") or po.get("po_number", "PO-2026-001"))
        date_str = str(po.get("date") or datetime.date.today().isoformat())
        pdf.branding_header(title="PURCHASE ORDER", doc_id=doc_id, date=date_str)
        pdf.set_font("helvetica", "B", 10)
        pdf.set_text_color(0, 35, 75)
        pdf.cell(0, 6, f"Supplier: {po.get('vendor_name', 'Approved Supplier')}", ln=True)
        pdf.set_font("helvetica", "", 9)
        pdf.set_text_color(55, 65, 81)
        pdf.cell(0, 5, f"Item / Description: {po.get('item', 'Industrial Welding Spares')}", ln=True)
        pdf.cell(0, 5, f"Quantity: {po.get('quantity', 1)}  |  Total Value: Rs. {po.get('amount', 0.0):,.2f}", ln=True)
        pdf.cell(0, 5, f"Status: {po.get('status', 'APPROVED')}", ln=True)
        pdf.ln(5)
    if not po_list:
        pdf.add_page()
        pdf.branding_header(title="PURCHASE ORDERS", doc_id="BATCH-000", date=datetime.date.today().isoformat())
        pdf.cell(0, 10, "No purchase orders available in the system.", ln=True, align="C")
    return bytes(pdf.output())



def number_to_indian_currency_words(amount: float) -> str:
    """Convert monetary number to Indian currency words (Crores, Lakhs, Thousands, Rupees)."""
    units = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
             "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
             "Seventeen", "Eighteen", "Nineteen"]
    tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"]

    def convert_upto_999(n: int) -> str:
        parts = []
        if n >= 100:
            parts.append(units[n // 100] + " Hundred")
            n %= 100
        if n >= 20:
            t = tens[n // 10]
            u = units[n % 10]
            parts.append(f"{t} {u}".strip() if u else t)
        elif n > 0:
            parts.append(units[n])
        return " ".join(parts).strip()

    amt_int = int(round(amount, 2))
    amt_paise = int(round((amount - amt_int) * 100))

    if amt_int == 0 and amt_paise == 0:
        return "Rupees Zero Only"

    crores = amt_int // 10000000
    amt_int %= 10000000
    lakhs = amt_int // 100000
    amt_int %= 100000
    thousands = amt_int // 1000
    amt_int %= 1000
    hundreds = amt_int

    words = []
    if crores > 0:
        words.append(convert_upto_999(crores) + " Crore")
    if lakhs > 0:
        words.append(convert_upto_999(lakhs) + " Lakh")
    if thousands > 0:
        words.append(convert_upto_999(thousands) + " Thousand")
    if hundreds > 0:
        words.append(convert_upto_999(hundreds))

    result = "Rupees " + " ".join(words).strip()
    if amt_paise > 0:
        result += f" and {convert_upto_999(amt_paise)} Paise"
    result += " Only"
    return result


def generate_tax_invoice_pdf(data: dict) -> bytes:
    """Generate Indian GST-Compliant Tax Invoice with Anishka letterhead."""
    pdf = AnishkaPDF(orientation="P", unit="mm", format="Letter")
    pdf.alias_nb_pages()
    pdf.add_page()

    inv_no = data.get("invoice_no", "INV-2026-0001")
    inv_date = data.get("date", datetime.date.today().isoformat())
    company_gstin = os.getenv("COMPANY_GSTIN", "06AAACA1234F1Z5")

    pdf.branding_header(
        title="TAX INVOICE",
        doc_id=inv_no,
        date=inv_date
    )

    cust = data.get("customer", {})
    pos = data.get("place_of_supply", cust.get("state", "Haryana"))

    # Buyer & Invoice Details (Two-column layout)
    y_start = pdf.get_y()
    pdf.set_fill_color(248, 250, 252)
    pdf.set_draw_color(226, 232, 240)
    pdf.rect(10, y_start, 95, 34, "FD")
    pdf.rect(110, y_start, 95, 34, "FD")

    # Left: Billed To Customer
    pdf.set_xy(14, y_start + 3)
    pdf.set_font("helvetica", "B", 8)
    pdf.set_text_color(0, 35, 75)
    pdf.cell(85, 4, "BILLED TO (BUYER):", ln=True)

    pdf.set_x(14)
    pdf.set_font("helvetica", "B", 10)
    pdf.set_text_color(17, 24, 39)
    pdf.cell(85, 5, pdf.clean_str(cust.get("name", "Valued Customer")[:45]), ln=True)

    pdf.set_x(14)
    pdf.set_font("helvetica", "", 8)
    pdf.set_text_color(75, 85, 99)
    pdf.cell(85, 4, f"GSTIN / UIN: {cust.get('gstin') or 'UNREGISTERED'}", ln=True)
    pdf.set_x(14)
    pdf.cell(85, 4, f"Location: {cust.get('city', '')}, {cust.get('state', '')}", ln=True)
    pdf.set_x(14)
    pdf.cell(85, 4, f"Contact: {cust.get('contact_person', 'Procurement Dept')} | {cust.get('phone', '')}", ln=True)

    # Right: Invoice & Supply Meta
    pdf.set_xy(114, y_start + 3)
    pdf.set_font("helvetica", "B", 8)
    pdf.set_text_color(0, 106, 106)
    pdf.cell(85, 4, "DISPATCH & TAX METADATA:", ln=True)

    pdf.set_x(114)
    pdf.set_font("helvetica", "", 8)
    pdf.set_text_color(75, 85, 99)
    pdf.cell(40, 4, "Place of Supply:")
    pdf.set_font("helvetica", "B", 8)
    pdf.set_text_color(17, 24, 39)
    pdf.cell(45, 4, pdf.clean_str(pos), ln=True)

    pdf.set_x(114)
    pdf.set_font("helvetica", "", 8)
    pdf.set_text_color(75, 85, 99)
    pdf.cell(40, 4, "Sales Order Ref:")
    pdf.set_font("helvetica", "B", 8)
    pdf.set_text_color(17, 24, 39)
    pdf.cell(45, 4, str(data.get("order_no", "Direct")), ln=True)

    pdf.set_x(114)
    pdf.set_font("helvetica", "", 8)
    pdf.set_text_color(75, 85, 99)
    pdf.cell(40, 4, "Supplier GSTIN:")
    pdf.set_font("helvetica", "B", 8)
    pdf.set_text_color(17, 24, 39)
    pdf.cell(45, 4, company_gstin, ln=True)

    pdf.set_x(114)
    pdf.set_font("helvetica", "", 8)
    pdf.set_text_color(75, 85, 99)
    pdf.cell(40, 4, "Payment Status:")
    status = data.get("status", "UNPAID")
    pdf.set_font("helvetica", "B", 8)
    if status == "PAID":
        pdf.set_text_color(16, 185, 129)
    elif status == "PARTIALLY_PAID":
        pdf.set_text_color(245, 158, 11)
    else:
        pdf.set_text_color(239, 68, 68)
    pdf.cell(45, 4, status, ln=True)

    pdf.set_y(y_start + 40)

    # Line Items Table Header
    is_igst = data.get("igst", 0.0) > 0
    pdf.set_fill_color(0, 35, 75)
    pdf.set_text_color(255, 255, 255)
    pdf.set_font("helvetica", "B", 8)

    # Cols: S.No(10), Description(60), HSN(18), Qty(14), Rate(22), Taxable(24), GST(20), Total(27) = 195
    pdf.cell(10, 7, "S.N", fill=True, align="C")
    pdf.cell(60, 7, "Item Description & SKU", fill=True, align="L")
    pdf.cell(18, 7, "HSN", fill=True, align="C")
    pdf.cell(14, 7, "Qty", fill=True, align="C")
    pdf.cell(22, 7, "Unit Price", fill=True, align="R")
    pdf.cell(24, 7, "Taxable", fill=True, align="R")
    pdf.cell(20, 7, "IGST" if is_igst else "CGST+SGST", fill=True, align="C")
    pdf.cell(27, 7, "Total (Rs.)", fill=True, align="R")
    pdf.ln()

    # Rows
    pdf.set_font("helvetica", "", 8)
    items = data.get("items", [])
    fill = False
    for idx, it in enumerate(items, 1):
        pdf.set_fill_color(249, 250, 251) if fill else pdf.set_fill_color(255, 255, 255)
        pdf.set_text_color(31, 41, 55)

        sku = it.get("sku", "")
        name = it.get("name", "Welding Spare")
        desc = f"{sku} - {name}"[:40]
        hsn = str(it.get("hsn_code", "8466"))
        qty = it.get("qty", 1)
        unit_p = it.get("unit_price", 0.0)
        taxable = it.get("taxable", qty * unit_p)
        gst_pct = it.get("gst_rate", 18.0)
        line_tot = it.get("total", taxable * (1 + gst_pct / 100.0))

        pdf.cell(10, 6, str(idx), fill=fill, align="C")
        pdf.cell(60, 6, pdf.clean_str(desc), fill=fill, align="L")
        pdf.cell(18, 6, hsn, fill=fill, align="C")
        pdf.cell(14, 6, str(qty), fill=fill, align="C")
        pdf.cell(22, 6, f"{unit_p:,.2f}", fill=fill, align="R")
        pdf.cell(24, 6, f"{taxable:,.2f}", fill=fill, align="R")
        pdf.cell(20, 6, f"{gst_pct:.1f}%", fill=fill, align="C")
        pdf.cell(27, 6, f"{line_tot:,.2f}", fill=fill, align="R")
        pdf.ln()
        fill = not fill

    # Totals Section
    pdf.ln(3)
    taxable_val = data.get("taxable_value", 0.0)
    cgst_val = data.get("cgst", 0.0)
    sgst_val = data.get("sgst", 0.0)
    igst_val = data.get("igst", 0.0)
    grand_total = data.get("total", taxable_val + cgst_val + sgst_val + igst_val)

    pdf.set_draw_color(209, 213, 219)
    pdf.set_x(120)
    pdf.set_font("helvetica", "", 8)
    pdf.set_text_color(75, 85, 99)
    pdf.cell(40, 5, "Total Taxable Amount:", align="R")
    pdf.cell(35, 5, f"Rs. {taxable_val:,.2f}", align="R", ln=True)

    if is_igst:
        pdf.set_x(120)
        pdf.cell(40, 5, "Integrated GST (IGST):", align="R")
        pdf.cell(35, 5, f"Rs. {igst_val:,.2f}", align="R", ln=True)
    else:
        pdf.set_x(120)
        pdf.cell(40, 5, "Central GST (CGST):", align="R")
        pdf.cell(35, 5, f"Rs. {cgst_val:,.2f}", align="R", ln=True)
        pdf.set_x(120)
        pdf.cell(40, 5, "State GST (SGST):", align="R")
        pdf.cell(35, 5, f"Rs. {sgst_val:,.2f}", align="R", ln=True)

    pdf.set_x(120)
    pdf.set_font("helvetica", "B", 10)
    pdf.set_text_color(0, 106, 106)
    pdf.cell(40, 7, "INVOICE TOTAL:", border="T", align="R")
    pdf.cell(35, 7, f"Rs. {grand_total:,.2f}", border="T", align="R", ln=True)

    # Amount in Words Box
    words = number_to_indian_currency_words(grand_total)
    pdf.ln(4)
    pdf.set_fill_color(243, 244, 246)
    pdf.set_font("helvetica", "B", 8)
    pdf.set_text_color(55, 65, 81)
    pdf.cell(195, 6, f" Amount in Words: {words}", fill=True, ln=True)

    # Bank Details & Signatory
    pdf.ln(5)
    pdf.set_font("helvetica", "B", 8)
    pdf.set_text_color(0, 35, 75)
    pdf.cell(100, 4, "BANK TRANSFER DETAILS (NEFT / RTGS):", ln=True)
    pdf.set_font("helvetica", "", 7)
    pdf.set_text_color(75, 85, 99)
    pdf.cell(100, 3.5, "Account Name: Anishka Industries", ln=True)
    pdf.cell(100, 3.5, "Bank: HDFC Bank Ltd | A/C No: 50200088992211 | IFSC: HDFC0001234", ln=True)
    pdf.cell(100, 3.5, "Branch: Milestone Khandsa Road, Sector-10, Gurugram", ln=True)

    pdf.set_xy(135, pdf.get_y() - 10)
    pdf.set_font("helvetica", "B", 8)
    pdf.set_text_color(0, 35, 75)
    pdf.cell(60, 4, "For ANISHKA INDUSTRIES", align="C", ln=True)
    pdf.set_xy(135, pdf.get_y() + 8)
    pdf.set_font("helvetica", "", 7)
    pdf.set_text_color(107, 114, 128)
    pdf.cell(60, 4, "Authorized Signatory / Finance Dept", border="T", align="C", ln=True)

    return bytes(pdf.output())


def generate_quotation_pdf(data: dict) -> bytes:
    """Generate Formal Commercial Quotation with Anishka letterhead."""
    pdf = AnishkaPDF(orientation="P", unit="mm", format="Letter")
    pdf.alias_nb_pages()
    pdf.add_page()

    order_no = data.get("order_no", "ANI-QT-2026-0001")
    date_str = data.get("created_at", datetime.date.today().isoformat())[:10]
    valid_until = data.get("valid_until", (datetime.date.today() + datetime.timedelta(days=15)).isoformat())

    pdf.branding_header(
        title="COMMERCIAL QUOTATION",
        doc_id=order_no,
        date=date_str
    )

    cust = data.get("customer", {})

    y_start = pdf.get_y()
    pdf.set_fill_color(248, 250, 252)
    pdf.set_draw_color(226, 232, 240)
    pdf.rect(10, y_start, 95, 30, "FD")
    pdf.rect(110, y_start, 95, 30, "FD")

    pdf.set_xy(14, y_start + 3)
    pdf.set_font("helvetica", "B", 8)
    pdf.set_text_color(0, 35, 75)
    pdf.cell(85, 4, "QUOTATION PREPARED FOR:", ln=True)

    pdf.set_x(14)
    pdf.set_font("helvetica", "B", 10)
    pdf.set_text_color(17, 24, 39)
    pdf.cell(85, 5, pdf.clean_str(cust.get("name", "Valued Customer")[:45]), ln=True)

    pdf.set_x(14)
    pdf.set_font("helvetica", "", 8)
    pdf.set_text_color(75, 85, 99)
    pdf.cell(85, 4, f"GSTIN: {cust.get('gstin') or 'UNREGISTERED'}", ln=True)
    pdf.set_x(14)
    pdf.cell(85, 4, f"Contact: {cust.get('contact_person', '')} ({cust.get('phone', '')})", ln=True)

    pdf.set_xy(114, y_start + 3)
    pdf.set_font("helvetica", "B", 8)
    pdf.set_text_color(0, 106, 106)
    pdf.cell(85, 4, "QUOTATION TERMS:", ln=True)

    pdf.set_x(114)
    pdf.set_font("helvetica", "", 8)
    pdf.set_text_color(75, 85, 99)
    pdf.cell(35, 4, "Validity:")
    pdf.set_font("helvetica", "B", 8)
    pdf.set_text_color(17, 24, 39)
    pdf.cell(50, 4, f"Valid until {valid_until}", ln=True)

    pdf.set_x(114)
    pdf.set_font("helvetica", "", 8)
    pdf.set_text_color(75, 85, 99)
    pdf.cell(35, 4, "Delivery:")
    pdf.set_font("helvetica", "", 8)
    pdf.cell(50, 4, "Ex-Warehouse Gurugram", ln=True)

    pdf.set_x(114)
    pdf.cell(35, 4, "Payment Terms:")
    pdf.cell(50, 4, f"{cust.get('credit_days', 30)} Days Credit from Dispatch", ln=True)

    pdf.set_y(y_start + 36)

    # Items Table
    pdf.set_fill_color(0, 35, 75)
    pdf.set_text_color(255, 255, 255)
    pdf.set_font("helvetica", "B", 8)

    pdf.cell(10, 7, "S.N", fill=True, align="C")
    pdf.cell(75, 7, "Item Description & SKU", fill=True, align="L")
    pdf.cell(15, 7, "Qty", fill=True, align="C")
    pdf.cell(25, 7, "Price / Unit", fill=True, align="R")
    pdf.cell(20, 7, "Disc %", fill=True, align="C")
    pdf.cell(25, 7, "Taxable", fill=True, align="R")
    pdf.cell(25, 7, "Total (Rs.)", fill=True, align="R")
    pdf.ln()

    items = data.get("items", [])
    fill = False
    for idx, it in enumerate(items, 1):
        pdf.set_fill_color(249, 250, 251) if fill else pdf.set_fill_color(255, 255, 255)
        pdf.set_text_color(31, 41, 55)

        sku = it.get("sku", "")
        name = it.get("name", "Welding Spare")
        desc = f"{sku} - {name}"[:45]
        qty = it.get("qty", 1)
        price = it.get("unit_price", 0.0)
        disc = it.get("discount_pct", 0.0)
        taxable = it.get("taxable", qty * price * (1 - disc / 100.0))
        gst = it.get("gst_rate", 18.0)
        tot = taxable * (1 + gst / 100.0)

        pdf.cell(10, 6, str(idx), fill=fill, align="C")
        pdf.cell(75, 6, pdf.clean_str(desc), fill=fill, align="L")
        pdf.cell(15, 6, str(qty), fill=fill, align="C")
        pdf.cell(25, 6, f"{price:,.2f}", fill=fill, align="R")
        pdf.cell(20, 6, f"{disc:.1f}%", fill=fill, align="C")
        pdf.cell(25, 6, f"{taxable:,.2f}", fill=fill, align="R")
        pdf.cell(25, 6, f"{tot:,.2f}", fill=fill, align="R")
        pdf.ln()
        fill = not fill

    pdf.ln(3)
    taxable_val = data.get("total_taxable", sum(it.get("taxable", 0.0) for it in items))
    tax_val = data.get("total_tax", 0.0)
    grand_tot = data.get("grand_total", taxable_val + tax_val)

    pdf.set_x(120)
    pdf.set_font("helvetica", "", 8)
    pdf.set_text_color(75, 85, 99)
    pdf.cell(40, 5, "Subtotal (Taxable):", align="R")
    pdf.cell(35, 5, f"Rs. {taxable_val:,.2f}", align="R", ln=True)

    pdf.set_x(120)
    pdf.cell(40, 5, "Estimated GST (18%):", align="R")
    pdf.cell(35, 5, f"Rs. {tax_val:,.2f}", align="R", ln=True)

    pdf.set_x(120)
    pdf.set_font("helvetica", "B", 10)
    pdf.set_text_color(0, 106, 106)
    pdf.cell(40, 7, "QUOTATION TOTAL:", border="T", align="R")
    pdf.cell(35, 7, f"Rs. {grand_tot:,.2f}", border="T", align="R", ln=True)

    words = number_to_indian_currency_words(grand_tot)
    pdf.ln(4)
    pdf.set_fill_color(243, 244, 246)
    pdf.set_font("helvetica", "B", 8)
    pdf.set_text_color(55, 65, 81)
    pdf.cell(195, 6, f" Amount in Words: {words}", fill=True, ln=True)

    notes = data.get("notes")
    if notes:
        pdf.ln(3)
        pdf.set_font("helvetica", "I", 7)
        pdf.set_text_color(107, 114, 128)
        pdf.cell(195, 4, f"Special Notes: {pdf.clean_str(notes)}", ln=True)

    pdf.ln(8)
    pdf.set_font("helvetica", "B", 8)
    pdf.set_text_color(0, 35, 75)
    pdf.cell(90, 4, "Prepared by Anishka Sales Department", border="T", align="C")
    pdf.set_x(120)
    pdf.cell(75, 4, "Customer Acceptance Signature", border="T", align="C")

    return bytes(pdf.output())


# ─── Barcode & QR Label Sheet Generator ──────────────────────────────

def generate_qr_image_bytes(data_str: str) -> io.BytesIO:
    """Generate high-contrast QR code image bytes in PNG format."""
    import qrcode
    qr = qrcode.QRCode(box_size=4, border=1)
    qr.add_data(data_str)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    return buf


def generate_item_labels_pdf(items: list[dict]) -> bytes:
    """
    Generate standard A4 sticker sheet of QR labels for selected items.
    Layout: 3 columns x 8 rows = 24 labels per sheet (62mm x 32mm each).
    Each label includes:
      - Header: ANISHKA INDUSTRIES • CENTRAL STORE
      - QR Code (encodes SKU for instant mobile scanner lookup)
      - SKU (bold legible)
      - Item Name
      - Bin Location
      - Category
    """
    pdf = FPDF(orientation="P", unit="mm", format="A4")
    pdf.set_auto_page_break(auto=False)

    cols, rows = 3, 8
    margin_x, margin_y = 7.0, 10.0
    lbl_w, lbl_h = 62.0, 32.0
    gap_x, gap_y = 4.0, 3.0
    labels_per_page = cols * rows

    for idx, item in enumerate(items):
        pos_on_page = idx % labels_per_page
        if pos_on_page == 0:
            pdf.add_page()

        c = pos_on_page % cols
        r = pos_on_page // cols
        x = margin_x + c * (lbl_w + gap_x)
        y = margin_y + r * (lbl_h + gap_y)

        # Label outer border & background
        pdf.set_draw_color(180, 195, 215)
        pdf.set_fill_color(255, 255, 255)
        pdf.rect(x, y, lbl_w, lbl_h, "DF")

        # Top banner
        pdf.set_fill_color(0, 35, 75)
        pdf.rect(x, y, lbl_w, 4.5, "F")
        pdf.set_xy(x + 2, y + 0.6)
        pdf.set_font("helvetica", "B", 6.5)
        pdf.set_text_color(255, 255, 255)
        pdf.cell(lbl_w - 4, 3.2, "ANISHKA INDUSTRIES | CENTRAL STORE", ln=0)

        sku_val = str(item.get("sku") or "UNKNOWN")
        name_val = str(item.get("name") or "")
        loc_val = str(item.get("location") or "R1-B01")
        cat_val = str(item.get("category") or "")

        # QR code on left
        try:
            qr_buf = generate_qr_image_bytes(sku_val)
            pdf.image(qr_buf, x=x + 1.5, y=y + 5.5, w=23.5, h=23.5)
        except Exception:
            pdf.rect(x + 1.5, y + 5.5, 23.5, 23.5)

        # Text details on right
        tx = x + 26.5
        tw = lbl_w - 28.0

        pdf.set_xy(tx, y + 5.5)
        pdf.set_font("helvetica", "B", 8.5)
        pdf.set_text_color(0, 35, 75)
        pdf.cell(tw, 4.0, sku_val[:18], ln=2)

        pdf.set_font("helvetica", "", 6.5)
        pdf.set_text_color(55, 65, 81)
        cleaned_name = name_val[:36].encode("latin-1", "replace").decode("latin-1")
        pdf.multi_cell(tw, 3.0, cleaned_name)

        pdf.set_xy(tx, y + 21.0)
        pdf.set_font("helvetica", "B", 7.5)
        pdf.set_text_color(0, 106, 106)
        pdf.cell(tw, 3.5, f"Bin: {loc_val[:14]}", ln=2)

        pdf.set_font("helvetica", "", 6.0)
        pdf.set_text_color(107, 114, 128)
        cleaned_cat = cat_val[:22].encode("latin-1", "replace").decode("latin-1")
        pdf.cell(tw, 3.0, cleaned_cat, ln=0)

    return bytes(pdf.output())


def generate_bin_labels_pdf(bins: list[dict]) -> bytes:
    """
    Generate standard A4 sheet of QR shelf/rack tags for warehouse bins.
    Layout: 2 columns x 4 rows = 8 large bin tags per sheet (92mm x 62mm each).
    Each tag includes:
      - Header: ANISHKA CENTRAL STORE • BIN LOCATION
      - Large QR Code (encodes BIN:<bin_code>)
      - Large Bold Bin Location Identifier
      - Sub-location / Rack details
      - Material category
    """
    pdf = FPDF(orientation="P", unit="mm", format="A4")
    pdf.set_auto_page_break(auto=False)

    cols, rows = 2, 4
    margin_x, margin_y = 9.0, 11.0
    lbl_w, lbl_h = 92.0, 62.0
    gap_x, gap_y = 8.0, 6.0
    labels_per_page = cols * rows

    for idx, b_item in enumerate(bins):
        pos_on_page = idx % labels_per_page
        if pos_on_page == 0:
            pdf.add_page()

        c = pos_on_page % cols
        r = pos_on_page // cols
        x = margin_x + c * (lbl_w + gap_x)
        y = margin_y + r * (lbl_h + gap_y)

        # Outer box
        pdf.set_draw_color(0, 35, 75)
        pdf.set_fill_color(255, 255, 255)
        pdf.rect(x, y, lbl_w, lbl_h, "DF")

        # Top Header Bar
        pdf.set_fill_color(0, 35, 75)
        pdf.rect(x, y, lbl_w, 8.0, "F")
        pdf.set_xy(x + 4, y + 1.8)
        pdf.set_font("helvetica", "B", 9.0)
        pdf.set_text_color(255, 255, 255)
        pdf.cell(lbl_w - 8, 5.0, "ANISHKA CENTRAL STORE | BIN LOCATION", ln=0)

        bin_code = str(b_item.get("code") or b_item.get("location") or "R1-B01")
        rack_label = str(b_item.get("rack") or bin_code.split("-")[0] if "-" in bin_code else "R1")
        cat_label = str(b_item.get("category") or "Welding Spares & Consumables")

        # Large QR code on left (encodes BIN:<bin_code>)
        try:
            qr_buf = generate_qr_image_bytes(f"BIN:{bin_code}")
            pdf.image(qr_buf, x=x + 3.0, y=y + 12.0, w=38.0, h=38.0)
        except Exception:
            pdf.rect(x + 3.0, y + 12.0, 38.0, 38.0)

        # Right side info
        rx = x + 44.0
        rw = lbl_w - 47.0

        pdf.set_xy(rx, y + 12.0)
        pdf.set_font("helvetica", "B", 8.0)
        pdf.set_text_color(107, 114, 128)
        pdf.cell(rw, 4.0, "BIN IDENTIFIER", ln=2)

        # Huge Bin Code
        pdf.set_font("helvetica", "B", 18.0)
        pdf.set_text_color(0, 35, 75)
        pdf.cell(rw, 8.0, bin_code, ln=2)

        # Rack Subtitle
        pdf.set_font("helvetica", "B", 9.0)
        pdf.set_text_color(0, 106, 106)
        pdf.cell(rw, 5.0, f"Rack / Shelf: {rack_label}", ln=2)

        pdf.set_xy(rx, y + 33.0)
        pdf.set_font("helvetica", "", 7.5)
        pdf.set_text_color(75, 85, 99)
        cleaned_cat = cat_label[:30].encode("latin-1", "replace").decode("latin-1")
        pdf.multi_cell(rw, 3.5, f"Storage: {cleaned_cat}")

        # Bottom footer bar on tag
        pdf.set_fill_color(240, 245, 250)
        pdf.rect(x + 1, y + lbl_h - 7.5, lbl_w - 2, 6.5, "F")
        pdf.set_xy(x + 4, y + lbl_h - 6.5)
        pdf.set_font("helvetica", "I", 6.5)
        pdf.set_text_color(107, 114, 128)
        now_date = datetime.datetime.now().strftime("%Y-%m-%d")
        pdf.cell(lbl_w - 8, 4.0, f"Scan QR code for instant stock lookup & movement | Verified {now_date}", ln=0)

    return bytes(pdf.output())
