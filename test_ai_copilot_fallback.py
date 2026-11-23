import pytest
from database import SessionLocal
from ai_copilot import run_fallback_agent

@pytest.fixture
def db():
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()

def test_suggestion_chip_1_zero_stock_reorder(db):
    """Chip 1: 'Analyze items with zero stock and recommend purchase orders'"""
    prompt = "Analyze items with zero stock and recommend purchase orders"
    res = run_fallback_agent(prompt, db)
    assert res["status"] == "success"
    tool_names = [tc["tool"] for tc in res.get("tool_calls", [])]
    assert "get_low_stock" in tool_names
    assert len(res["response"]) > 10

def test_suggestion_chip_2_overdue_debtors(db):
    """Chip 2: 'Who are our top 3 overdue debtor customers?'"""
    prompt = "Who are our top 3 overdue debtor customers?"
    res = run_fallback_agent(prompt, db)
    assert res["status"] == "success"
    tool_names = [tc["tool"] for tc in res.get("tool_calls", [])]
    assert "get_receivables" in tool_names
    assert "Accounts Receivable" in res["response"] or "Outstanding" in res["response"]

def test_suggestion_chip_3_abc_xyz_distribution(db):
    """Chip 3: 'Show ABC-XYZ distribution summary for Class-A parts'"""
    prompt = "Show ABC-XYZ distribution summary for Class-A parts"
    res = run_fallback_agent(prompt, db)
    assert res["status"] == "success"
    tool_names = [tc["tool"] for tc in res.get("tool_calls", [])]
    assert "abc_xyz_analysis" in tool_names
    assert "ABC-XYZ" in res["response"]

def test_suggestion_chip_4_weekly_sales_and_invoices(db):
    """Chip 4: 'What is our total weekly sales revenue and invoice count?'"""
    prompt = "What is our total weekly sales revenue and invoice count?"
    res = run_fallback_agent(prompt, db)
    assert res["status"] == "success"
    tool_names = [tc["tool"] for tc in res.get("tool_calls", [])]
    assert "owner_summary" in tool_names
    assert "Total Sales Revenue" in res["response"]

def test_direct_low_on_stock_mapping(db):
    res = run_fallback_agent("What is low on stock?", db)
    assert res["status"] == "success"
    tool_names = [tc["tool"] for tc in res.get("tool_calls", [])]
    assert "get_low_stock" in tool_names

def test_direct_who_owes_us_money_mapping(db):
    res = run_fallback_agent("who owes us money", db)
    assert res["status"] == "success"
    tool_names = [tc["tool"] for tc in res.get("tool_calls", [])]
    assert "get_receivables" in tool_names

def test_direct_summarise_this_week_mapping(db):
    res = run_fallback_agent("summarise this week", db)
    assert res["status"] == "success"
    tool_names = [tc["tool"] for tc in res.get("tool_calls", [])]
    assert "owner_summary" in tool_names
