"""
Sales Opportunities & Re-Order Cadence Intelligence Module for Anishka Inventory Management System.

Features:
1. Customer-Item Purchase Cadence (Median days between orders, last order date, usual quantity).
2. Predicted Next Order Date & Confidence Scoring (HIGH / MEDIUM / LOW).
3. 7 / 14 / 30 Day & Overdue Opportunity Listing with Suggested Quote Lines & Expected Value.
4. Stock Coverage & Shortfall Flagging (allows purchasing to act before customer runs out).
5. One-Click WhatsApp Messaging (English & Hindi prefilled editable templates, wa.me links).
6. Approved PO WhatsApp Dispatch to Suppliers (English & Hindi).
7. Outbox/Communications Audit Logging with sender, recipient, and channel.
8. WhatsApp Business Cloud API Integration behind env flags (default off, simulated).
9. Customer WhatsApp Opt-Out Compliance & Regulatory Notice.
10. Sales Opportunity Funnel Analytics on Dashboard (Identified -> Messaged -> Quoted -> Won).
"""

import os
import re
import math
import urllib.parse
import datetime
import statistics
from typing import Optional, List, Dict, Any
from sqlalchemy.orm import Session

from database import (
    Customer, SalesOrder, SalesOrderItem, Inventory, Vendor, Procurement,
    POItem, Outbox, AuditLog
)


# ─────────────────────────────────────────────────────────────────────────────
# 1. PHONE NUMBER NORMALIZATION & WA.ME DEEP-LINKS
# ─────────────────────────────────────────────────────────────────────────────

def clean_whatsapp_phone(phone: Optional[str]) -> str:
    """
    Normalizes contact phone number into international E.164 format without '+'.
    Standardizes Indian numbers:
    - 10 digits (e.g. '9822011111') -> '919822011111'
    - 11 digits starting with 0 (e.g. '09822011111') -> '919822011111'
    - Leading '+' stripped
    """
    if not phone:
        return ""
    digits = re.sub(r"[^\d]", "", str(phone))
    if not digits:
        return ""
    if len(digits) == 10:
        return f"91{digits}"
    if len(digits) == 11 and digits.startswith("0"):
        return f"91{digits[1:]}"
    if len(digits) == 12 and digits.startswith("91"):
        return digits
    return digits


def build_whatsapp_link(phone: str, text: str) -> str:
    """Generates a wa.me direct chat deep-link with pre-filled message text."""
    clean_phone = clean_whatsapp_phone(phone)
    encoded_text = urllib.parse.quote(text)
    return f"https://wa.me/{clean_phone}?text={encoded_text}"


# ─────────────────────────────────────────────────────────────────────────────
# 2. TEMPLATE GENERATION (ENGLISH & HINDI)
# ─────────────────────────────────────────────────────────────────────────────

def get_whatsapp_template(template_type: str, context: dict, lang: str = "en") -> str:
    """
    Builds pre-filled, editable WhatsApp message templates in English and Hindi.
    Supported types:
    - 'opportunity': Customer replenishment alert & quote proposal
    - 'po': Supplier approved purchase order dispatch notification
    """
    lang = (lang or "en").lower()

    if template_type == "opportunity":
        contact = context.get("contact_person") or context.get("customer_name") or "Valued Partner"
        cust_name = context.get("customer_name") or "Your Company"
        item_name = context.get("item_name") or "Welding Spares"
        sku = context.get("sku") or ""
        qty = context.get("usual_qty") or 10
        unit = context.get("unit") or "pcs"
        due_date = context.get("predicted_date") or "this week"
        val = context.get("expected_value", 0.0)

        if lang == "hi":
            return (
                f"नमस्ते {contact} ({cust_name}), अनिष्का इंडस्ट्रीज से सादर नमस्कार!\n\n"
                f"आपके नियमित उपभोग चक्र के अनुसार, आपकी विनिर्माण लाइन को {due_date} तक "
                f"*{item_name}* (SKU: {sku}) के नए बैच की आवश्यकता होगी।\n\n"
                f"• सामान्य ऑर्डर मात्रा: *{qty} {unit}*\n"
                f"• अनुमानित मूल्य: *₹{val:,.2f}* (GST सहित)\n"
                f"• स्टॉक स्थिति: हमारे मानेसर/गुरुग्राम गोदाम में तत्काल डिलीवरी हेतु उपलब्ध है।\n\n"
                f"क्या हम आपके लिए आधिकारिक कोटेशन तैयार कर भेजें? "
                f"कृपया 'हाँ' लिखकर उत्तर दें या सीधे 0124-4567890 पर संपर्क करें।\n\n"
                f"सधन्यवाद,\n"
                f"सेल्स एवं तकनीकी टीम, अनिष्का इंडस्ट्रीज"
            )
        else:
            return (
                f"Hello {contact} ({cust_name}), greetings from Anishka Industries!\n\n"
                f"Based on your plant's regular re-order schedule, your facility is likely due for replenishment of "
                f"*{item_name}* (SKU: {sku}) around *{due_date}*.\n\n"
                f"• Usual Order Volume: *{qty} {unit}*\n"
                f"• Estimated Quote Value: *Rs. {val:,.2f}* (incl. GST)\n"
                f"• Stock Status: Ready for immediate dispatch from Gurugram Central Depot.\n\n"
                f"Would you like us to generate and lock in this quotation for you? "
                f"Please reply 'YES' to receive the official quote or call us directly.\n\n"
                f"Best regards,\n"
                f"Industrial Sales Team, Anishka Industries"
            )

    elif template_type == "po":
        sup_name = context.get("supplier_name") or "Valued Supplier"
        po_no = context.get("po_no") or "PO-DRAFT"
        item_count = context.get("item_count") or 1
        grand_total = context.get("grand_total") or 0.0
        delivery_date = context.get("delivery_date") or "Immediate / 3 Days"

        if lang == "hi":
            return (
                f"प्रिय {sup_name},\n\n"
                f"अनिष्का इंडस्ट्रीज द्वारा खरीद आदेश *#{po_no}* स्वीकृत एवं जारी कर दिया गया है।\n\n"
                f"• कुल लाइन आइटम्स: *{item_count}*\n"
                f"• कुल मूल्य: *₹{grand_total:,.2f}* (GST सहित)\n"
                f"• अपेक्षित डिलीवरी तिथि: *{delivery_date}*\n\n"
                f"कृपया इस संदेश की पावती (acknowledgment) दें और डिस्पैच शेड्यूल की पुष्टि करें। "
                f"आधिकारिक पीओ दस्तावेज़ संलग्न/प्रणाली में उपलब्ध है।\n\n"
                f"धन्यवाद!\n"
                f"प्रोक्योरमेंट विभाग, अनिष्का इंडस्ट्रीज"
            )
        else:
            return (
                f"Dear {sup_name},\n\n"
                f"Purchase Order *#{po_no}* has been officially approved and issued by Anishka Industries.\n\n"
                f"• Total Line Items: *{item_count}*\n"
                f"• Total Amount: *Rs. {grand_total:,.2f}* (incl. GST)\n"
                f"• Target Delivery Date: *{delivery_date}*\n\n"
                f"Please acknowledge receipt of this purchase order and confirm dispatch timelines. "
                f"Full signed PO PDF is on file.\n\n"
                f"Thank you,\n"
                f"Procurement Dept, Anishka Industries"
            )

    # Fallback generic message
    return context.get("custom_text") or "Greetings from Anishka Industries."


# ─────────────────────────────────────────────────────────────────────────────
# 3. PURCHASE CADENCE & OPPORTUNITY COMPUTATION ENGINE
# ─────────────────────────────────────────────────────────────────────────────

def _parse_order_date(date_str: Any) -> Optional[datetime.date]:
    """Safely parses ISO datetime or date strings to date."""
    if not date_str:
        return None
    if isinstance(date_str, datetime.date):
        return date_str
    if isinstance(date_str, datetime.datetime):
        return date_str.date()
    try:
        clean = str(date_str).split("T")[0].split(" ")[0]
        return datetime.date.fromisoformat(clean)
    except Exception:
        return None


def compute_sales_opportunities(
    db: Session,
    window_days: Optional[int] = 14,
    min_orders: int = 1,
    confidence_filter: Optional[str] = None,
    stock_status_filter: Optional[str] = None
) -> Dict[str, Any]:
    """
    Computes purchase cadence per (Customer, Item) pair:
    - Median days between sequential orders
    - Last order date
    - Usual order quantity (median of historical orders)
    - Predicted next order date
    - Confidence level (HIGH, MEDIUM, LOW) based on frequency and cadence CV
    - Suggested quote lines & expected value
    - Current available stock coverage & shortfall alerts
    """
    today = datetime.date.today()

    # 1. Fetch all confirmed or historical sales orders (excluding cancelled)
    orders = db.query(SalesOrder).filter(
        SalesOrder.status.in_(["CONFIRMED", "PARTIALLY_DISPATCHED", "DISPATCHED", "INVOICED", "QUOTE"])
    ).all()

    # 2. Group by (customer_id, item_id)
    history: Dict[tuple, List[dict]] = {}
    for so in orders:
        dt = _parse_order_date(so.created_at)
        if not dt:
            continue
        for it in so.items:
            key = (so.customer_id, it.item_id)
            if key not in history:
                history[key] = []
            history[key].append({
                "date": dt,
                "qty": it.qty,
                "unit_price": it.unit_price,
                "discount_pct": it.discount_pct or 0.0,
                "gst_rate": it.gst_rate or 18.0,
                "order_no": so.order_no,
                "status": so.status
            })

    # Cache customers and items for quick lookup
    customers_map = {c.id: c for c in db.query(Customer).filter(Customer.is_active == True).all()}
    items_map = {i.id: i for i in db.query(Inventory).filter(Inventory.is_active == True).all()}

    opportunities: List[dict] = []
    total_pipeline_val = 0.0
    shortfall_count = 0
    covered_count = 0

    for (cust_id, it_id), records in history.items():
        customer = customers_map.get(cust_id)
        item = items_map.get(it_id)
        if not customer or not item:
            continue

        if len(records) < min_orders:
            continue

        # Sort chronologically
        records.sort(key=lambda r: r["date"])
        dates = [r["date"] for r in records]
        quantities = [r["qty"] for r in records]
        last_order_date = dates[-1]

        # Calculate cadence intervals
        if len(dates) >= 2:
            intervals = [(dates[i] - dates[i-1]).days for i in range(1, len(dates))]
            # Remove negative or zero intervals if orders placed on same day
            valid_intervals = [iv for iv in intervals if iv > 0]
            if valid_intervals:
                median_cadence = int(round(statistics.median(valid_intervals)))
                mean_cadence = statistics.mean(valid_intervals)
                std_cadence = statistics.stdev(valid_intervals) if len(valid_intervals) > 1 else 0.0
                cv = (std_cadence / mean_cadence) if mean_cadence > 0 else 0.0
            else:
                median_cadence = 30
                cv = 0.5
        else:
            # Single order: baseline category cadence
            median_cadence = 30
            cv = 0.8

        # Usual order quantity
        usual_qty = int(round(statistics.median(quantities))) if quantities else 1
        usual_qty = max(1, usual_qty)

        # Predicted next order date
        predicted_date = last_order_date + datetime.timedelta(days=median_cadence)
        days_until_due = (predicted_date - today).days

        # Confidence assignment
        if len(dates) >= 3 and cv <= 0.35:
            confidence = "HIGH"
            conf_reason = f"{len(dates)} repeat orders with consistent {median_cadence}d cycle (CV {cv:.2f})"
        elif len(dates) >= 2 or (len(dates) >= 3 and cv <= 0.70):
            confidence = "MEDIUM"
            conf_reason = f"{len(dates)} orders with ~{median_cadence}d cadence"
        else:
            confidence = "LOW"
            conf_reason = f"Initial order history; estimated at {median_cadence}d cycle"

        # Pricing calculation
        # Check tier discounts or last ordered price
        last_price = records[-1]["unit_price"] if records else (item.selling_price or item.unit_price or 100.0)
        tier = customer.price_tier or "Standard"
        if tier in ("OEM Tier-1", "Tier-1"):
            unit_price = round(last_price * 0.90, 2) if last_price == (item.selling_price or item.unit_price) else last_price
        elif tier == "Wholesale":
            unit_price = round(last_price * 0.95, 2) if last_price == (item.selling_price or item.unit_price) else last_price
        else:
            unit_price = round(last_price, 2)

        gst_rate = getattr(item, "gst_rate", 18.0) or 18.0
        line_taxable = round(usual_qty * unit_price, 2)
        line_gst = round(line_taxable * (gst_rate / 100.0), 2)
        expected_value = round(line_taxable + line_gst, 2)

        # Stock coverage check
        total_qty = item.quantity or 0
        reserved_qty = getattr(item, "reserved_qty", 0) or 0
        available_stock = max(0, total_qty - reserved_qty)

        if available_stock >= usual_qty:
            stock_status = "COVERED"
            shortfall_qty = 0
            covered_count += 1
        else:
            stock_status = "SHORTFALL"
            shortfall_qty = usual_qty - available_stock
            shortfall_count += 1

        # Due category
        if days_until_due < 0:
            due_category = "OVERDUE"
        elif days_until_due <= 7:
            due_category = "NEXT_7D"
        elif days_until_due <= 14:
            due_category = "NEXT_14D"
        elif days_until_due <= 30:
            due_category = "NEXT_30D"
        else:
            due_category = "FUTURE"

        opp = {
            "id": f"OPP-{cust_id}-{it_id}",
            "customer_id": cust_id,
            "customer_name": customer.name,
            "contact_person": customer.contact_person or customer.name,
            "customer_phone": customer.phone or "",
            "customer_phone_clean": clean_whatsapp_phone(customer.phone or ""),
            "customer_email": customer.email or "",
            "customer_city": customer.city,
            "customer_state": customer.state,
            "price_tier": customer.price_tier or "Standard",
            "whatsapp_opt_out": getattr(customer, "whatsapp_opt_out", False) or False,

            "item_id": it_id,
            "sku": item.sku,
            "item_name": item.name,
            "category": item.category,
            "unit": item.unit or "pcs",

            "cadence_days": median_cadence,
            "total_orders": len(records),
            "last_order_date": last_order_date.isoformat(),
            "predicted_date": predicted_date.isoformat(),
            "days_until_due": days_until_due,
            "due_category": due_category,

            "confidence": confidence,
            "confidence_reason": conf_reason,

            "usual_qty": usual_qty,
            "unit_price": unit_price,
            "gst_rate": gst_rate,
            "taxable_value": line_taxable,
            "gst_amount": line_gst,
            "expected_value": expected_value,

            "available_stock": available_stock,
            "total_stock": total_qty,
            "reserved_stock": reserved_qty,
            "stock_status": stock_status,
            "shortfall_qty": shortfall_qty,

            "suggested_lines": [
                {
                    "item_id": it_id,
                    "sku": item.sku,
                    "name": item.name,
                    "qty": usual_qty,
                    "unit": item.unit or "pcs",
                    "unit_price": unit_price,
                    "discount_pct": 0.0,
                    "gst_rate": gst_rate,
                    "taxable": line_taxable,
                    "total": expected_value
                }
            ]
        }

        # Apply filtering
        # Window filtering
        include = True
        if window_days is not None:
            if window_days == -1: # Overdue only
                if days_until_due >= 0:
                    include = False
            elif window_days == 7:
                if days_until_due > 7:
                    include = False
            elif window_days == 14:
                if days_until_due > 14:
                    include = False
            elif window_days == 30:
                if days_until_due > 30:
                    include = False

        if confidence_filter and opp["confidence"] != confidence_filter:
            include = False

        if stock_status_filter and opp["stock_status"] != stock_status_filter:
            include = False

        if include:
            opportunities.append(opp)
            total_pipeline_val += expected_value

    # Sort opportunities: Overdue & due soonest first, then highest expected value
    opportunities.sort(key=lambda x: (x["days_until_due"], -x["expected_value"]))

    return {
        "status": "success",
        "total_opportunities": len(opportunities),
        "total_expected_value": round(total_pipeline_val, 2),
        "shortfall_count": sum(1 for o in opportunities if o["stock_status"] == "SHORTFALL"),
        "covered_count": sum(1 for o in opportunities if o["stock_status"] == "COVERED"),
        "overdue_count": sum(1 for o in opportunities if o["days_until_due"] < 0),
        "next_7d_count": sum(1 for o in opportunities if 0 <= o["days_until_due"] <= 7),
        "next_14d_count": sum(1 for o in opportunities if 0 <= o["days_until_due"] <= 14),
        "opportunities": opportunities
    }


# ─────────────────────────────────────────────────────────────────────────────
# 4. ONE-CLICK WHATSAPP DISPATCH & COMMUNICATIONS OUTBOX LOGGING
# ─────────────────────────────────────────────────────────────────────────────

def send_or_simulate_whatsapp_message(
    db: Session,
    recipient_phone: str,
    message_text: str,
    sender: str = "system",
    ref_type: Optional[str] = None,
    ref_id: Optional[str] = None,
    customer_id: Optional[int] = None,
    supplier_id: Optional[str] = None,
    lang: str = "en"
) -> Dict[str, Any]:
    """
    Sends or simulates WhatsApp message dispatch.
    - Validates customer opt-out flag (enforces strict TRAI / WhatsApp compliance)
    - Checks env WHATSAPP_API_ENABLED
    - Dispatches via WhatsApp Business Cloud API if enabled & configured
    - Otherwise returns simulated status with wa.me link for manual one-click sending
    - Logs every transaction in Outbox with sender, recipient, timestamp, and status
    """
    clean_phone = clean_whatsapp_phone(recipient_phone)
    if not clean_phone:
        return {
            "status": "error",
            "message": "Invalid phone number provided.",
            "wa_link": ""
        }

    # Verify customer opt-out status
    if customer_id:
        cust = db.query(Customer).filter(Customer.id == customer_id).first()
        if cust and getattr(cust, "whatsapp_opt_out", False):
            return {
                "status": "opted_out",
                "message": f"Customer '{cust.name}' has opted out of WhatsApp messages.",
                "opted_out": True,
                "wa_link": ""
            }

    # Build direct wa.me link
    wa_link = build_whatsapp_link(clean_phone, message_text)

    # Check Cloud API configuration
    api_enabled = os.environ.get("WHATSAPP_API_ENABLED", "false").lower() in ("true", "1", "yes")
    phone_id = os.environ.get("WHATSAPP_PHONE_NUMBER_ID", "").strip()
    token = os.environ.get("WHATSAPP_ACCESS_TOKEN", "").strip()

    status = "SIMULATED"
    api_response = None

    if api_enabled and phone_id and token:
        try:
            import json
            import urllib.request

            url = f"https://graph.facebook.com/v19.0/{phone_id}/messages"
            headers = {
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json"
            }
            payload = {
                "messaging_product": "whatsapp",
                "recipient_type": "individual",
                "to": clean_phone,
                "type": "text",
                "text": {"preview_url": False, "body": message_text}
            }
            req = urllib.request.Request(url, data=json.dumps(payload).encode("utf-8"), headers=headers, method="POST")
            with urllib.request.urlopen(req, timeout=10) as resp:
                resp_data = json.loads(resp.read().decode("utf-8"))
                status = "SENT"
                api_response = resp_data
        except Exception as e:
            status = "FAILED"
            api_response = {"error": str(e)}

    # Log into Outbox / Communications table
    now_iso = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    subject = f"WhatsApp to {clean_phone} [{ref_type or 'MSG'}:{ref_id or ''}]"

    outbox_entry = Outbox(
        created_at=now_iso,
        to_email=f"wa:{clean_phone}",
        subject=subject,
        body=message_text,
        attachment_name=None,
        status=status,
        related_po=ref_id if ref_type == "PO" else None,
        channel="WHATSAPP",
        sender=sender or "system",
        recipient_phone=clean_phone,
        template_lang=lang or "en",
        ref_type=ref_type or "OPPORTUNITY",
        ref_id=str(ref_id) if ref_id else None
    )
    db.add(outbox_entry)

    # Write audit log
    db.add(AuditLog(
        timestamp=now_iso,
        action="WHATSAPP_COMMUNICATION_DISPATCHED",
        user=sender or "system",
        target_id=f"{ref_type}:{ref_id}" if ref_id else clean_phone,
        details=f"Dispatched WhatsApp to {clean_phone} via channel WHATSAPP. Status: {status}. Lang: {lang}."
    ))

    db.commit()
    db.refresh(outbox_entry)

    return {
        "status": "success" if status in ("SENT", "SIMULATED") else "failed",
        "dispatch_status": status,
        "outbox_id": outbox_entry.id,
        "recipient_phone": clean_phone,
        "wa_link": wa_link,
        "channel": "WHATSAPP",
        "sender": sender,
        "template_lang": lang,
        "ref_type": ref_type,
        "ref_id": ref_id,
        "api_enabled": api_enabled,
        "simulated": (status == "SIMULATED"),
        "api_response": api_response,
        "message": "WhatsApp link prepared and logged in communications outbox."
    }


# ─────────────────────────────────────────────────────────────────────────────
# 5. SALES OPPORTUNITY FUNNEL METRICS (DASHBOARD)
# ─────────────────────────────────────────────────────────────────────────────

def compute_sales_funnel(db: Session) -> Dict[str, Any]:
    """
    Computes end-to-end Sales Opportunity Funnel for the Executive Dashboard:
    1. Opportunities Identified (Count & Expected Pipeline ₹)
    2. Messages Sent (WhatsApp outreach count & estimated contacted ₹)
    3. Quotes Created (Sales Orders in QUOTE status count & grand_total ₹)
    4. Orders Won (Sales Orders in CONFIRMED/DISPATCHED/INVOICED count & realized ₹)
    5. Stage-to-stage conversion rates (%)
    """
    # 1. Opportunities Identified
    opp_data = compute_sales_opportunities(db, window_days=None)
    opps_count = opp_data["total_opportunities"]
    opps_value = opp_data["total_expected_value"]

    # 2. Messages Sent via WhatsApp
    wa_msgs = db.query(Outbox).filter(
        Outbox.channel == "WHATSAPP",
        Outbox.ref_type == "OPPORTUNITY"
    ).all()
    messages_count = len(wa_msgs)

    # Estimate value of contacted opportunities
    contacted_opp_ids = {m.ref_id for m in wa_msgs if m.ref_id}
    contacted_value = sum(
        o["expected_value"] for o in opp_data["opportunities"]
        if o["id"] in contacted_opp_ids
    )
    if contacted_value == 0 and messages_count > 0:
        avg_opp_val = (opps_value / opps_count) if opps_count > 0 else 15000.0
        contacted_value = round(messages_count * avg_opp_val, 2)

    # 3. Quotes Created
    quotes = db.query(SalesOrder).filter(SalesOrder.status == "QUOTE").all()
    quotes_count = len(quotes)
    quotes_value = round(sum(q.grand_total or 0.0 for q in quotes), 2)

    # 4. Orders Won
    won_orders = db.query(SalesOrder).filter(
        SalesOrder.status.in_(["CONFIRMED", "PARTIALLY_DISPATCHED", "DISPATCHED", "INVOICED"])
    ).all()
    won_count = len(won_orders)
    won_value = round(sum(o.grand_total or 0.0 for o in won_orders), 2)

    # Conversion percentages
    conv_id_to_msg = round((messages_count / opps_count * 100.0), 1) if opps_count > 0 else 0.0
    conv_msg_to_quote = round((quotes_count / max(1, messages_count) * 100.0), 1) if messages_count > 0 else 0.0
    conv_quote_to_won = round((won_count / max(1, quotes_count) * 100.0), 1) if quotes_count > 0 else 0.0
    overall_win_rate = round((won_count / max(1, opps_count + quotes_count) * 100.0), 1)

    return {
        "funnel_stages": [
            {
                "stage_key": "IDENTIFIED",
                "stage_name": "Opportunities Identified",
                "count": opps_count,
                "value": opps_value,
                "color": "#3DA9FF",
                "description": "Computed from re-order cadence & consumption intervals"
            },
            {
                "stage_key": "MESSAGED",
                "stage_name": "Outreach Messages Sent",
                "count": messages_count,
                "value": contacted_value,
                "color": "#25D366", # WhatsApp Green
                "description": "Dispatched via WhatsApp with prefilled quotes"
            },
            {
                "stage_key": "QUOTED",
                "stage_name": "Quotations Generated",
                "count": quotes_count,
                "value": quotes_value,
                "color": "#F59E0B",
                "description": "Active formal proposals submitted to buyers"
            },
            {
                "stage_key": "WON",
                "stage_name": "Orders Won & Realized",
                "count": won_count,
                "value": won_value,
                "color": "#10B981",
                "description": "Confirmed, dispatched, or tax-invoiced sales orders"
            }
        ],
        "conversion_rates": {
            "identified_to_messaged_pct": conv_id_to_msg,
            "messaged_to_quote_pct": conv_msg_to_quote,
            "quote_to_won_pct": conv_quote_to_won,
            "overall_win_rate_pct": overall_win_rate
        },
        "summary": {
            "total_pipeline_value": opps_value + quotes_value,
            "realized_revenue": won_value,
            "active_quotations_count": quotes_count,
            "uncontacted_opportunities_count": max(0, opps_count - messages_count)
        }
    }
