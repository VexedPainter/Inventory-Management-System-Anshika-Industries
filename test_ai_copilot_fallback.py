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

def test_direct_stock_valuation_mapping(db):
    res = run_fallback_agent("what is our current stock valuation?", db)
    assert res["status"] == "success"
    tool_names = [tc["tool"] for tc in res.get("tool_calls", [])]
    assert "business_kpis" in tool_names
    assert "Total Stock Valuation" in res["response"]

def test_direct_asset_turns_mapping(db):
    res = run_fallback_agent("calculate asset turns and efficiency", db)
    assert res["status"] == "success"
    tool_names = [tc["tool"] for tc in res.get("tool_calls", [])]
    assert "business_kpis" in tool_names
    assert "Asset / Inventory Turns" in res["response"]

def test_direct_inventory_value_mapping(db):
    res = run_fallback_agent("tell me our total inventory value", db)
    assert res["status"] == "success"
    tool_names = [tc["tool"] for tc in res.get("tool_calls", [])]
    assert "business_kpis" in tool_names
    assert "Total Stock Valuation" in res["response"]


# ─── Hinglish / Hindi Intent Tests (Offline Mode) ──────────────────────

def test_hinglish_stock_order_karna_hai(db):
    """'stock order karna hai / kaise kare' -> reorder guidance (low stock + draft PO proposal)"""
    res = run_fallback_agent("stock order karna hai kaise kare", db)
    assert res["status"] == "success"
    assert res["mode"] == "offline"
    tool_names = [tc["tool"] for tc in res.get("tool_calls", [])]
    assert "get_low_stock" in tool_names
    assert res["proposed_action"] is not None
    assert res["proposed_action"]["action_type"] == "create_draft_po"
    assert any(w in res["response"] for w in ["PO", "stock", "Stock", "low"])

def test_hinglish_kitna_stock_bacha_hai(db):
    """'kitna stock / kitna bacha' -> item search or low stock"""
    res = run_fallback_agent("kitna stock bacha hai warehouse mein", db)
    assert res["status"] == "success"
    assert res["mode"] == "offline"
    tool_names = [tc["tool"] for tc in res.get("tool_calls", [])]
    assert "get_low_stock" in tool_names or "search_items" in tool_names or "get_item" in tool_names
    assert any(w in res["response"] for w in ["bacha", "Stock", "stock", "low"])

def test_hinglish_kisne_paise_dene_hain(db):
    """'kisne paise dene hain / baki' -> receivables"""
    res = run_fallback_agent("kisne paise dene hain kiska baki hai", db)
    assert res["status"] == "success"
    assert res["mode"] == "offline"
    tool_names = [tc["tool"] for tc in res.get("tool_calls", [])]
    assert "get_receivables" in tool_names
    assert any(w in res["response"] for w in ["Receivable", "baki", "overdue", "Accounts"])

def test_hinglish_is_hafte_ka_summary(db):
    """'is hafte ka summary' -> owner summary"""
    res = run_fallback_agent("is hafte ka summary dikhao", db)
    assert res["status"] == "success"
    assert res["mode"] == "offline"
    tool_names = [tc["tool"] for tc in res.get("tool_calls", [])]
    assert "owner_summary" in tool_names
    assert any(w in res["response"] for w in ["Sales", "Revenue", "Summary", "Invoices"])

def test_hinglish_trend_velocity_movement(db):
    """'trend / velocity / movement' -> movement trend and turnover summary"""
    res = run_fallback_agent("stock movement trend aur velocity kya hai", db)
    assert res["status"] == "success"
    assert res["mode"] == "offline"
    tool_names = [tc["tool"] for tc in res.get("tool_calls", [])]
    assert "business_kpis" in tool_names
    assert any(w in res["response"] for w in ["Turnover", "turnover", "DSI", "Velocity"])


# ─── Dual-Mode Tests (Live Mode & Error Raising Mode) ──────────────────

from unittest.mock import patch, MagicMock
from ai_copilot import run_chat_agent, classify_groq_error

def test_classify_groq_error_types():
    assert classify_groq_error(Exception("401 invalid_api_key provided")) == "invalid API key"
    assert classify_groq_error(Exception("404 model_not_found")) == "model not found"
    assert classify_groq_error(Exception("429 rate_limit exceeded")) == "rate limited"
    assert classify_groq_error(Exception("quota exhausted")) == "quota exceeded"
    assert classify_groq_error(Exception("connection timeout")) == "connection error"

@pytest.mark.parametrize("phrase", [
    "stock order karna hai kaise kare",
    "kitna stock bacha hai",
    "kisne paise dene hain",
    "is hafte ka summary",
    "trend velocity movement summary",
])
def test_phrase_in_live_mode(db, phrase):
    """Verify phrase handling when live Groq model responds successfully."""
    mock_choice = MagicMock()
    mock_choice.message.tool_calls = None
    mock_choice.message.content = f"Live response for {phrase}"
    mock_completion = MagicMock()
    mock_completion.choices = [mock_choice]
    mock_completion.usage.prompt_tokens = 20
    mock_completion.usage.completion_tokens = 30
    mock_completion.usage.total_tokens = 50

    mock_client = MagicMock()
    mock_client.chat.completions.create.return_value = mock_completion

    with patch.dict("os.environ", {"GROQ_API_KEY": "gsk_test_key_valid"}):
        with patch("groq.Groq", return_value=mock_client):
            res = run_chat_agent(phrase, db)
            assert res["status"] == "success"
            assert res["mode"] == "live"
            assert res["reason"] is None
            assert "Live response" in res["response"]

@pytest.mark.parametrize("phrase", [
    "stock order karna hai kaise kare",
    "kitna stock bacha hai",
    "kisne paise dene hain",
    "is hafte ka summary",
    "trend velocity movement summary",
])
def test_phrase_in_offline_fallback_mode_on_groq_exception(db, phrase):
    """When Groq call raises, verify mode: 'offline', error reason is recorded, and fallback works."""
    with patch.dict("os.environ", {"GROQ_API_KEY": "gsk_test_key"}):
        with patch("groq.Groq", side_effect=Exception("401 invalid_api_key provided")):
            res = run_chat_agent(phrase, db)
            assert res["status"] == "success"
            assert res["mode"] == "offline"
            assert res["reason"] == "invalid API key"
            assert len(res["response"]) > 10

def test_groq_rate_limit_exception_sets_reason(db):
    """When Groq is rate-limited, reason must be 'rate limited'."""
    with patch.dict("os.environ", {"GROQ_API_KEY": "gsk_test_key"}):
        with patch("groq.Groq", side_effect=Exception("429 rate_limit exceeded")):
            res = run_chat_agent("who owes us money", db)
            assert res["mode"] == "offline"
            assert res["reason"] == "rate limited"
            assert "get_receivables" in [tc["tool"] for tc in res["tool_calls"]]

def test_groq_model_not_found_exception_sets_reason(db):
    """When model not found, reason must be 'model not found'."""
    with patch.dict("os.environ", {"GROQ_API_KEY": "gsk_test_key"}):
        with patch("groq.Groq", side_effect=Exception("404 model_not_found: model does not exist")):
            res = run_chat_agent("stock order karna hai", db)
            assert res["mode"] == "offline"
            assert res["reason"] == "model not found"
            assert res["proposed_action"] is not None
