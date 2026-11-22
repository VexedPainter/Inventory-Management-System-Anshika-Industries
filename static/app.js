/**
 * Anishka Inventory - Kinetic Ledger Frontend v7.0
 * Industrial Welding Spares Management System
 * Anishka Industries, Milestone Khandsa Road, Sector-10, Gurugram
 */

// ==============================================
//  GLOBAL STATE
// ==============================================
const state = {
    currentUser: null,
    simulatorRunning: false,
    activeTab: 'dashboard',
    
    // Inventory state
    invPage: 1,
    invLimit: 15,
    invSort: '',
    activeCategory: 'all',
    activeStatus: 'all',
    invFilter: '',
    invTotal: 0,
    cachedInventory: [],
    selectedDrawerItem: null,

    // Movement state
    movPage: 1,
    movLimit: 15,
    movTotal: 0,
    movType: 'all',
    movSearch: '',
    movStartDate: '',
    movEndDate: '',
    cachedMovements: [],
    lastMovementId: null,

    // Procurement state
    activePOStatus: 'all',
    cachedPOs: [],
    selectedPO: null,
    poCreateItems: [],

    // Suppliers state
    cachedSuppliers: [],

    // Alerts state
    alerts: [],

    // System & WebSocket
    ws: null,
    wsRetries: 0,
    maxRetries: 25,
    charts: {},
    toastTimer: null,
    mainChatHistory: [],
    drawerChatHistory: []
};

// ==============================================
//  INITIALIZATION & AUTHENTICATION
// ==============================================
document.addEventListener('DOMContentLoaded', () => {
    initAuth();
    initTheme();
    initKeyboardShortcuts();
    initCharts();
    connectWebSocket();
    initSimulatorStatus();
    fetchAllData();
    initSpeechRecognition();
    initOfflineQueue();
});

function initAuth() {
    const token = sessionStorage.getItem('ss_token');
    const userRaw = sessionStorage.getItem('ss_user');

    if (!token) {
        // If unauthenticated, redirect to login
        window.location.href = '/login';
        return;
    }

    try {
        state.currentUser = userRaw ? JSON.parse(userRaw) : { username: 'user', role: 'storekeeper' };
    } catch (e) {
        state.currentUser = { username: 'user', role: 'storekeeper' };
    }

    applyUserUI(state.currentUser);
    applyRBAC(state.currentUser.role);
}

function applyUserUI(user) {
    const nameEl = document.getElementById('sidebarUserName');
    const roleBadgeEl = document.getElementById('sidebarUserRoleBadge');
    const avatarEl = document.getElementById('sidebarAvatar');
    const facilityEl = document.getElementById('sidebarUserFacility');

    const displayName = user.full_name || user.username || 'User';
    const displayRole = (user.role || 'storekeeper').toUpperCase();

    if (nameEl) nameEl.textContent = displayName;
    if (roleBadgeEl) {
        roleBadgeEl.textContent = displayRole;
        roleBadgeEl.className = `role-badge role-badge-${(user.role || 'storekeeper').toLowerCase()}`;
    }
    if (avatarEl) {
        const initials = displayName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() || 'AD';
        avatarEl.innerHTML = `${escapeHtml(initials)}<span class="user-online-dot"></span>`;
    }
    if (facilityEl) {
        facilityEl.textContent = 'Gurugram Central Store';
    }
}

function applyRBAC(role) {
    const roleNorm = (role || 'storekeeper').toLowerCase();
    document.body.dataset.role = roleNorm;
}

async function apiFetch(url, options = {}) {
    const token = sessionStorage.getItem('ss_token');
    const headers = { ...(options.headers || {}) };

    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    const opts = { ...options, headers };

    try {
        const response = await fetch(url, opts);
        if (response.status === 401) {
            sessionStorage.removeItem('ss_token');
            sessionStorage.removeItem('ss_user');
            localStorage.removeItem('ss_token');
            localStorage.removeItem('ss_user');
            window.location.href = '/login';
            throw new Error('Session expired. Please log in again.');
        }

        if (!response.ok) {
            let errMsg = response.statusText;
            try {
                const errJson = await response.json();
                errMsg = errJson.detail || errJson.message || JSON.stringify(errJson);
            } catch (ignored) {
                errMsg = await response.text();
            }
            throw new Error(errMsg || `Request failed with status ${response.status}`);
        }

        if (response.status !== 204 && response.headers.get('content-length') !== '0') {
            return await response.json();
        }
        return {};
    } catch (e) {
        console.error(`[API Error] ${url}:`, e);
        throw e;
    }
}

async function logout() {
    try {
        await apiFetch('/api/logout', { method: 'POST' });
    } catch (e) {
        console.warn('Logout error:', e);
    } finally {
        sessionStorage.removeItem('ss_token');
        sessionStorage.removeItem('ss_user');
        localStorage.removeItem('ss_token');
        localStorage.removeItem('ss_user');
        document.cookie = 'ss_token=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;';
        window.location.href = '/login';
    }
}

function initKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
            e.preventDefault();
            toggleCommandPalette();
            return;
        }
        if (e.key === 'Escape') {
            closeCommandPalette();
        }
        if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) {
            e.preventDefault();
            switchTab('inventory');
            const searchInput = document.getElementById('invSearch');
            if (searchInput) {
                searchInput.focus();
                searchInput.select();
            }
        }
    });
}

function fetchAllData() {
    console.log('[Anishka Inventory] Loading warehouse records...');
    fetchStats();
    fetchInventory();
    fetchMovements();
    fetchProcurement();
    fetchSuppliers();
    fetchAuditTrail();
    fetchAutomationStatus();
    fetchCustomers();
    fetchSalesOrders();
    fetchDailyDigestCard();
    fetchDeadStock();
}

// ==============================================
//  FORMATTING & ANIMATION UTILITIES
// ==============================================
function formatINR(val) {
    const num = Number(val || 0);
    return '₹' + num.toLocaleString('en-IN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function formatINRCompact(val) {
    const num = Number(val || 0);
    if (isNaN(num)) return '₹0';
    if (Math.abs(num) >= 10000000) { // >= 1 Crore (10,000,000)
        const cr = num / 10000000;
        return '₹' + (cr >= 100 ? cr.toFixed(1) : cr.toFixed(2)) + ' Cr';
    }
    if (Math.abs(num) >= 100000) { // >= 1 Lakh (100,000)
        const lk = num / 100000;
        return '₹' + (lk >= 100 ? lk.toFixed(1) : lk.toFixed(2)) + ' L';
    }
    if (Math.abs(num) >= 1000) {
        const k = num / 1000;
        return '₹' + (k >= 100 ? k.toFixed(1) : k.toFixed(2)) + 'k';
    }
    return formatINR(num);
}

function updateHeroHeader() {
    const greetingEl = document.getElementById('heroGreeting');
    const dateEl = document.getElementById('heroDate');
    if (!greetingEl && !dateEl) return;

    const hour = new Date().getHours();
    let timeOfDay = 'Good morning';
    if (hour >= 12 && hour < 17) {
        timeOfDay = 'Good afternoon';
    } else if (hour >= 17 || hour < 5) {
        timeOfDay = 'Good evening';
    }

    const userName = (state.currentUser && (state.currentUser.full_name || state.currentUser.username)) || 'admin';
    if (greetingEl) {
        greetingEl.innerHTML = `${timeOfDay}, <span class="highlight-user">${escapeHtml(userName)}</span>`;
    }

    if (dateEl) {
        const options = { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' };
        dateEl.textContent = new Date().toLocaleDateString('en-IN', options);
    }
}

function animateCountUp(element, endVal, duration = 800, suffix = '') {
    if (!element) return;
    const end = parseFloat(endVal) || 0;
    const start = parseFloat(element.dataset.currentVal || element.textContent.replace(/[^0-9.-]+/g, '')) || 0;

    if (start !== end && element.dataset.currentVal !== undefined) {
        element.classList.remove('flash-up', 'flash-down');
        void element.offsetWidth; // trigger reflow
        element.classList.add(end > start ? 'flash-up' : 'flash-down');
        setTimeout(() => element.classList.remove('flash-up', 'flash-down'), 1200);
    }

    if (start === end) {
        element.textContent = Math.round(end).toLocaleString('en-IN') + suffix;
        element.dataset.currentVal = end;
        return;
    }

    element.dataset.currentVal = end;
    const startTime = performance.now();

    function update(now) {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        // Ease out quadratic
        const ease = 1 - (1 - progress) * (1 - progress);
        const current = Math.round(start + (end - start) * ease);
        element.textContent = current.toLocaleString('en-IN') + suffix;
        if (progress < 1) {
            requestAnimationFrame(update);
        } else {
            element.textContent = Math.round(end).toLocaleString('en-IN') + suffix;
        }
    }
    requestAnimationFrame(update);
}

function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function renderEmptyTableState(cols, icon, title, subtitle) {
    return `
        <tr>
            <td colspan="${cols}" style="text-align:center; padding:44px 16px;">
                <div style="display:inline-flex; flex-direction:column; align-items:center; gap:8px;">
                    <div style="font-size:36px; line-height:1; opacity:0.85;">${icon}</div>
                    <div style="font-size:14px; font-weight:700; color:var(--text-heading);">${escapeHtml(title)}</div>
                    <div style="font-size:12px; color:var(--text-subtle); max-width:340px;">${escapeHtml(subtitle)}</div>
                </div>
            </td>
        </tr>
    `;
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const legacyToast = document.getElementById('toast');

    if (container) {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.style.setProperty('--toast-duration', '4s');

        const iconSvg = type === 'success'
            ? '<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>'
            : type === 'error'
            ? '<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>'
            : type === 'warning'
            ? '<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>'
            : '<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';

        toast.innerHTML = `
            ${iconSvg}
            <div class="toast-msg">${escapeHtml(message)}</div>
            <div class="toast-bar"></div>
        `;
        container.appendChild(toast);
        setTimeout(() => {
            toast.classList.add('removing');
            setTimeout(() => toast.remove(), 260);
        }, 4000);
    } else if (legacyToast) {
        clearTimeout(state.toastTimer);
        legacyToast.textContent = message;
        legacyToast.className = `toast show ${type}`;
        legacyToast.style.display = 'block';

        state.toastTimer = setTimeout(() => {
            legacyToast.className = 'toast';
            legacyToast.style.display = 'none';
        }, 4000);
    }
}

// ==============================================
//  TAB NAVIGATION & SHELL
// ==============================================
function updateNavIndicator() {
    const activeItem = document.querySelector('.sidebar .nav-item.active');
    const indicator = document.getElementById('nav-indicator');
    if (activeItem && indicator) {
        indicator.style.top = activeItem.offsetTop + 'px';
        indicator.style.height = activeItem.offsetHeight + 'px';
    }
}

function updateBreadcrumb(tabName) {
    const bc = document.getElementById('breadcrumbCurrent');
    if (bc) {
        const labels = {
            'dashboard': 'Warehouse Command Center',
            'inventory': 'Spares Catalog & Stock Control',
            'movements': 'Movement Ledger & Dispatch Notes',
            'procurement': 'Purchase Orders & Inward Deliveries',
            'sales': 'Sales Orders, Quotations & Dispatches',
            'customers': 'Industrial Customer Directory & Ledgers',
            'suppliers': 'Authorized Supplier Directory',
            'reports': 'Reports & Valuation Exports',
            'ai-assistant': 'Anishka AI Technical Copilot',
            'audit': 'Immutable Audit Compliance Trail'
        };
        bc.textContent = labels[tabName] || tabName;
    }
}

function toggleSidebar() {
    const appEl = document.querySelector('.app');
    if (appEl) {
        const isCollapsed = appEl.classList.toggle('sidebar-collapsed');
        localStorage.setItem('sidebar_collapsed', isCollapsed ? '1' : '0');
        setTimeout(updateNavIndicator, 260);
    }
}

function switchTab(tabName) {
    state.activeTab = tabName;
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.sidebar .nav-item').forEach(n => n.classList.remove('active'));

    const tab = document.getElementById(`tab-${tabName}`);
    if (tab) tab.classList.add('active');
    if (tabName === 'reports') fetchDeadStock();
    if (tabName === 'dashboard') fetchDailyDigestCard();

    // ID-based nav highlight (robust — not fragile index coupling)
    const navIdMap = {
        'dashboard':    'nav-item-dashboard',
        'inventory':    'nav-item-inventory',
        'movements':    'nav-item-movements',
        'cycle-count':  'nav-item-cycle-count',
        'procurement':  'nav-item-procurement',
        'sales':        'nav-item-sales',
        'customers':    'nav-item-customers',
        'suppliers':    'nav-item-suppliers',
        'reports':      'nav-item-reports',
        'analytics':    'nav-item-analytics',
        'ai-assistant': 'nav-item-ai-assistant',
        'audit':        'nav-item-audit',
        'users':        'nav-item-users',
        'business-impact': 'nav-item-bizimpact',
    };
    const activeNavId = navIdMap[tabName];
    if (activeNavId) {
        const activeNavEl = document.getElementById(activeNavId);
        if (activeNavEl) activeNavEl.classList.add('active');
    }

    // Update Mobile Bottom Nav Active States
    document.querySelectorAll('.mob-nav-btn').forEach(btn => btn.classList.remove('active'));
    if (tabName === 'inventory') document.getElementById('mob-btn-items')?.classList.add('active');
    else if (tabName === 'procurement') document.getElementById('mob-btn-pos')?.classList.add('active');

    updateNavIndicator();
    updateBreadcrumb(tabName);

    if (tabName === 'dashboard') {
        refreshDashboard();
    } else if (tabName === 'inventory') {
        fetchInventory();
    } else if (tabName === 'movements') {
        fetchMovements();
    } else if (tabName === 'cycle-count') {
        loadCycleCounts();
    } else if (tabName === 'procurement') {
        fetchProcurement();
    } else if (tabName === 'sales') {
        if (state.activeSalesSubtab === 'opportunities') {
            fetchOpportunities();
        } else if (state.activeSalesSubtab === 'invoices') {
            fetchInvoices();
        } else {
            fetchSalesOrders();
        }
        fetchCustomers();
    } else if (tabName === 'customers') {
        fetchCustomers();
    } else if (tabName === 'suppliers') {
        fetchSuppliers();
    } else if (tabName === 'analytics') {
        fetchAnalytics();
        fetchAnomalies();
    } else if (tabName === 'audit') {
        fetchAuditTrail();
    }
}

function refreshDashboard() {
    fetchStats();
}

// ==============================================
//  WEBSOCKET CLIENT & NOTIFICATIONS
// ==============================================
function connectWebSocket() {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${location.host}/ws`);
    state.ws = ws;

    ws.onopen = () => {
        state.wsRetries = 0;
        console.log('[WS] Connected to Anishka Inventory Server');
        updateLiveBadge(true);
    };

    ws.onmessage = (event) => {
        try {
            const msg = JSON.parse(event.data);
            handleWSMessage(msg);
        } catch (e) {
            console.warn('[WS] Parse error:', e);
        }
    };

    ws.onclose = () => {
        updateLiveBadge(false);
        if (state.wsRetries < state.maxRetries) {
            state.wsRetries++;
            setTimeout(connectWebSocket, Math.min(2000 * state.wsRetries, 15000));
        }
    };

    ws.onerror = () => ws.close();
}

function handleWSMessage(msg) {
    if (msg.type === 'stats_update') {
        fetchStats();
    } else if (msg.type === 'new_stock_movement') {
        const m = msg.data;
        const icon = m.type === 'INWARD' ? '📦' : (m.type === 'OUTWARD' ? '🚚' : '🔄');
        const actionLabel = m.type === 'INWARD' ? 'Received' : (m.type === 'OUTWARD' ? 'Dispatched' : 'Adjusted');
        addFeedEvent(
            `<span style="font-size:16px;">${icon}</span>`,
            `Stock ${actionLabel}: <strong>${escapeHtml(m.item_name)}</strong> (${m.quantity} pcs) → ${escapeHtml(m.destination || 'Central Store')} <span style="font-size:11px; color:var(--text-subtle);">[Stock: ${m.remaining}]</span>`
        );
        if (state.activeTab === 'movements') fetchMovements();
        if (state.activeTab === 'inventory') fetchInventory();
    } else if (msg.type === 'daily_digest_generated') {
        showToast('📋 New daily operations briefing generated.', 'info');
        fetchDailyDigestCard();
    } else if (msg.type === 'automation_run') {
        const d = msg.data;
        if (d && d.drafted > 0) {
            showToast(`⚡ Automation: ${d.drafted} PO(s) drafted, ${d.auto_approved} auto-approved.`, 'info');
        }
        fetchAutomationStatus();
        if (state.activeTab === 'procurement') fetchProcurement();
    } else if (msg.type === 'po_auto_approved') {
        const d = msg.data;
        showToast(`✅ PO ${d.po_number} auto-approved (₹${Number(d.total_value || 0).toFixed(2)})`, 'success');
        if (state.activeTab === 'procurement') fetchProcurement();
    } else if (msg.type === 'po_overdue_alert') {
        const d = msg.data;
        showToast(`⏰ OVERDUE PO: ${d.po_number} is ${d.days_late} day(s) late from ${d.supplier_name}`, 'warning');
    } else if (msg.type === 'low_stock' || msg.type === 'reorder_alert') {
        const alertData = msg.data;
        addReorderAlert(alertData);
        showToast(`⚠️ Reorder Alert: ${alertData.name || alertData.sku} is low (${alertData.quantity} left)`, 'warning');
    } else if (msg.type === 'po_created' || msg.type === 'po_status_change') {
        if (state.activeTab === 'procurement') fetchProcurement();
    } else if (msg.type === 'item_created' || msg.type === 'item_updated' || msg.type === 'item_deleted') {
        if (state.activeTab === 'inventory') fetchInventory();
    } else if (msg.type === 'connection_info') {
        const el = document.getElementById('clientCount');
        if (el) el.textContent = `${msg.data.clients} active`;
        state.simulatorRunning = msg.data.simulator;
        updateLiveBadge(true);
    } else if (msg.type === 'demo_reset') {
        showToast('Inventory catalog reset to standard factory defaults.', 'success');
        fetchAllData();
    }
}

function updateLiveBadge(live) {
    const dot = document.getElementById('pulseDot');
    const label = document.getElementById('liveLabel');
    if (dot) dot.className = `pulse-dot ${live && state.simulatorRunning ? 'live' : 'stopped'}`;
    if (label) label.textContent = live && state.simulatorRunning ? 'LIVE' : 'PAUSED';
}

function addFeedEvent(iconHtml, textHtml) {
    const feed = document.getElementById('activityFeed');
    const countEl = document.getElementById('feedCount');
    if (!feed) return;

    const item = document.createElement('li');
    item.className = 'feed-event';
    item.innerHTML = `
        <div class="feed-icon">${iconHtml}</div>
        <div class="feed-content">
            <div class="feed-text">${textHtml}</div>
            <div class="feed-time">${new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'})}</div>
        </div>
    `;

    if (feed.children.length === 1 && (feed.children[0].textContent.includes('Listening') || feed.children[0].textContent.includes('Initializing'))) {
        feed.innerHTML = '';
    }

    feed.prepend(item);
    if (feed.children.length > 30) {
        feed.removeChild(feed.lastChild);
    }

    if (countEl) {
        countEl.textContent = `${feed.children.length} events`;
    }
}

function addReorderAlert(alert) {
    state.alerts.unshift({
        id: alert.sku || Math.random().toString(),
        name: alert.name || alert.sku,
        sku: alert.sku,
        quantity: alert.quantity,
        reorder_level: alert.reorder_level,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });

    updateAlertsUI();
}

function updateAlertsUI() {
    const countEl = document.getElementById('notifCount');
    const listEl = document.getElementById('notifList');

    if (countEl) {
        if (state.alerts.length > 0) {
            countEl.style.display = 'inline-block';
            countEl.textContent = state.alerts.length;
        } else {
            countEl.style.display = 'none';
        }
    }

    if (listEl) {
        if (state.alerts.length === 0) {
            listEl.innerHTML = '<div class="notif-empty">No active reorder alerts</div>';
        } else {
            listEl.innerHTML = state.alerts.map(a => `
                <div class="notif-item" style="padding:10px 14px; border-bottom:1px solid var(--border-subtle); display:flex; justify-content:space-between; align-items:center;">
                    <div>
                        <strong style="font-size:12px; color:var(--text-heading); display:block;">${escapeHtml(a.name)}</strong>
                        <span style="font-size:11px; color:var(--accent-red); font-weight:700;">${a.quantity} in stock</span>
                        <span style="font-size:11px; color:var(--text-subtle);"> · Reorder at ${a.reorder_level}</span>
                    </div>
                    <button class="btn btn-xs btn-primary" onclick="quickReorder('${escapeHtml(a.sku)}')">Reorder</button>
                </div>
            `).join('');
        }
    }
}

function toggleNotifDropdown() {
    const dropdown = document.getElementById('notifDropdown');
    if (!dropdown) return;
    dropdown.style.display = (dropdown.style.display === 'none' || dropdown.style.display === '') ? 'block' : 'none';
}

function clearAlerts() {
    state.alerts = [];
    updateAlertsUI();
    const dropdown = document.getElementById('notifDropdown');
    if (dropdown) dropdown.style.display = 'none';
}

// Close dropdown if clicked outside
document.addEventListener('click', (e) => {
    const wrapper = document.querySelector('.notif-wrapper');
    const dropdown = document.getElementById('notifDropdown');
    if (wrapper && dropdown && !wrapper.contains(e.target)) {
        dropdown.style.display = 'none';
    }
});

// ==============================================
//  DASHBOARD & STATS COMMAND CENTER
// ==============================================
async function fetchStats() {
    try {
        const data = await apiFetch('/api/dashboard');
        updateDashboardUI(data);
    } catch (e) {
        console.error('Error fetching dashboard summary:', e);
    }
}

function updateDashboardUI(data) {
    if (!data) return;

    // Update hero greeting and date
    updateHeroHeader();

    // 1. KPI Cards
    const skusEl = document.getElementById('stat-skus');
    const valEl = document.getElementById('stat-valuation');
    const lowStockEl = document.getElementById('stat-low-stock');
    const outStockEl = document.getElementById('stat-out-stock');
    const deadStockEl = document.getElementById('stat-dead-stock');
    const pendingPosEl = document.getElementById('stat-pending-pos');
    const pendingValEl = document.getElementById('stat-pending-val');

    const counts = data.counts || data.status_distribution || {};
    const lowCount = (counts.LOW || 0) + (counts.CRITICAL || 0);

    if (skusEl) animateCountUp(skusEl, data.total_skus || 0);
    if (valEl) {
        const prevVal = parseFloat(valEl.dataset.rawVal) || 0;
        const currentVal = Number(data.stock_value || 0);
        valEl.dataset.rawVal = currentVal;
        valEl.textContent = formatINRCompact(currentVal);
        valEl.title = `Exact Stock Valuation: ${formatINR(currentVal)}`;
        valEl.setAttribute('data-full-val', formatINR(currentVal));

        if (prevVal !== 0 && currentVal !== prevVal) {
            valEl.classList.remove('flash-up', 'flash-down');
            void valEl.offsetWidth; // trigger reflow
            valEl.classList.add(currentVal > prevVal ? 'flash-up' : 'flash-down');
            setTimeout(() => valEl.classList.remove('flash-up', 'flash-down'), 1200);
        }
    }
    if (lowStockEl) animateCountUp(lowStockEl, lowCount);
    if (outStockEl) animateCountUp(outStockEl, counts.OUT || 0);
    if (deadStockEl) animateCountUp(deadStockEl, counts.DEAD || 0);
    if (pendingPosEl) animateCountUp(pendingPosEl, data.pending_po_count || 0);
    if (pendingValEl) pendingValEl.textContent = `${formatINR(data.pending_po_value || 0)} on order`;

    // 1b. Executive Business KPIs
    const turnoverEl = document.getElementById('stat-kpi-turnover');
    const dioEl = document.getElementById('stat-kpi-dio');
    const wcEl = document.getElementById('stat-kpi-working-capital');
    const stockouts30dEl = document.getElementById('stat-kpi-stockouts-30d');
    const fillRateEl = document.getElementById('stat-kpi-fill-rate');

    const kpis = data.business_kpis || data.stats?.business_kpis || {};
    if (turnoverEl) turnoverEl.textContent = `${Number(kpis.inventory_turnover || data.inventory_turnover || 0).toFixed(1)}×`;
    if (dioEl) dioEl.textContent = `${Math.round(kpis.days_of_inventory || data.days_of_inventory || 0)} d`;
    if (wcEl) wcEl.textContent = formatINRCompact(kpis.working_capital_tied_up || data.working_capital_tied_up || data.stock_value || 0);
    if (stockouts30dEl) stockouts30dEl.textContent = kpis.stockout_count_30d !== undefined ? kpis.stockout_count_30d : (data.stockout_count_30d || counts.OUT || 0);
    if (fillRateEl) fillRateEl.textContent = `${Number(kpis.fill_rate_pct || data.fill_rate_pct || 98.5).toFixed(1)}%`;

    // 2. Stock Health Circular Gauge
    updateStockHealthGauge(counts);

    // 3. Urgent Reorders / Needs Attention Panel
    loadUrgentReorders();

    // 4. Charts Update
    updateCharts(data);

    // 5. Receivables Ageing Card
    if (data.receivables_ageing) {
        updateReceivablesAgeingCard(data.receivables_ageing);
    }

    // 6. Sales Opportunity Funnel Update
    if (data.sales_funnel || data.stats?.sales_funnel) {
        updateSalesFunnelUI(data.sales_funnel || data.stats?.sales_funnel);
    }

    // 7. Executive Owner Summary Card Update
    if (data.owner_summary || data.stats?.owner_summary) {
        updateOwnerSummaryDashboard(data.owner_summary || data.stats?.owner_summary);
    }
}

function updateStockHealthGauge(counts) {
    if (!counts) return;
    const ok = Number(counts.OK || 0);
    const low = Number(counts.LOW || 0);
    const crit = Number(counts.CRITICAL || 0);
    const out = Number(counts.OUT || 0);
    const dead = Number(counts.DEAD || 0);
    const total = ok + low + crit + out + dead;

    const optimalPct = total > 0 ? Math.round((ok / total) * 100) : 0;
    const pctEl = document.getElementById('healthGaugePct');
    if (pctEl) {
        animateCountUp(pctEl, optimalPct, 800, '%');
        if (optimalPct >= 75) {
            pctEl.style.color = 'var(--in)';
        } else if (optimalPct >= 50) {
            pctEl.style.color = 'var(--molten)';
        } else {
            pctEl.style.color = 'var(--out)';
        }
    }

    const pillOk = document.getElementById('healthPillOk');
    const pillLow = document.getElementById('healthPillLow');
    const pillCrit = document.getElementById('healthPillCrit');
    const pillOut = document.getElementById('healthPillOut');
    const pillDead = document.getElementById('healthPillDead');
    if (pillOk) pillOk.textContent = `🟢 Optimal: ${ok}`;
    if (pillLow) pillLow.textContent = `🟡 Low: ${low}`;
    if (pillCrit) pillCrit.textContent = `🟠 Crit: ${crit}`;
    if (pillOut) pillOut.textContent = `🔴 Out: ${out}`;
    if (pillDead) pillDead.textContent = `⚪ Dead: ${dead}`;
}

async function loadUrgentReorders() {
    try {
        const reorders = await apiFetch('/api/inventory/reorders');
        const container = document.getElementById('urgent-reorders-list');
        if (!container) return;

        if (!reorders || reorders.length === 0) {
            container.innerHTML = `
                <div style="padding:28px 16px; text-align:center; background:var(--bg-region); border-radius:var(--radius-md); border:1px dashed var(--border-medium);">
                    <div style="font-size:32px; margin-bottom:8px;">✅</div>
                    <div style="font-weight:700; color:var(--text-heading); font-size:14px; margin-bottom:4px;">Stock Optimal</div>
                    <div style="font-size:12px; color:var(--text-subtle);">All industrial welding spares are currently stocked comfortably above minimum thresholds.</div>
                </div>
            `;
            return;
        }

        // Build inventory map for supplier & lead time lookup
        const invMap = {};
        if (Array.isArray(state.cachedInventory)) {
            state.cachedInventory.forEach(item => {
                if (item && item.sku) invMap[item.sku] = item;
            });
        }

        container.innerHTML = `
            <div style="display:flex; flex-direction:column; gap:8px;">
                ${reorders.slice(0, 5).map(item => {
                    const cached = invMap[item.sku] || {};
                    const supplierName = cached.supplier_name || 'Anishka Primary Vendor';
                    const leadTime = cached.lead_time_days ? `${cached.lead_time_days}d lead` : '2-4d lead';
                    const isOut = item.quantity === 0;
                    const isCrit = !isOut && (item.quantity <= (item.reorder_level / 2));

                    const statusClass = isOut ? 'pill-crit' : (isCrit ? 'pill-crit' : 'pill-alert');
                    const statusText = isOut ? 'OUT OF STOCK' : (isCrit ? 'CRITICAL' : 'LOW STOCK');
                    const fillPct = Math.min(100, Math.max(0, Math.round((item.quantity / (item.reorder_level || 1)) * 100)));
                    const barColor = isOut ? 'var(--out)' : (isCrit ? 'var(--out)' : 'var(--molten)');

                    return `
                    <div class="reorder-item-compact">
                        <div class="reorder-top">
                            <div>
                                <span class="reorder-title">${escapeHtml(item.name)}</span>
                                <span class="reorder-sku"><code>${escapeHtml(item.sku)}</code> · ${escapeHtml(item.category || '')}</span>
                            </div>
                            <div style="display:flex; align-items:center; gap:8px;">
                                <span class="reorder-status-pill ${statusClass}">${statusText}</span>
                                <span class="reorder-lead-tag">⚡ ${escapeHtml(leadTime)}</span>
                            </div>
                        </div>
                        <div class="reorder-bar-wrap">
                            <div class="reorder-bar-fill" style="width:${fillPct}%; background:${barColor};"></div>
                        </div>
                        <div class="reorder-meta">
                            <span>Stock: <strong style="color:${barColor};">${item.quantity}</strong> / Min: ${item.reorder_level} (Order: ${item.suggested_order_qty} pcs) · <span style="color:var(--text-subtle);">${escapeHtml(supplierName)}</span></span>
                            <button class="btn btn-xs btn-primary role-manager-admin" onclick="quickReorder('${escapeHtml(item.sku)}')">⚡ Create PO</button>
                        </div>
                    </div>
                    `;
                }).join('')}
            </div>
        `;
        applyRBAC(state.currentUser ? state.currentUser.role : 'storekeeper');
    } catch (e) {
        console.error('Error loading reorders:', e);
    }
}

// ==============================================
//  CHARTS (CHART.JS)
// ==============================================
function initCharts() {
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    const textColor = isLight ? '#4B5263' : '#9BA3B4';
    const gridColor = isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)';

    const sharedTooltip = {
        backgroundColor: isLight ? 'rgba(255, 255, 255, 0.96)' : 'rgba(14, 15, 18, 0.95)',
        titleColor: isLight ? '#111827' : '#F0F2F5',
        bodyColor: isLight ? '#4B5563' : '#D1D5DB',
        borderColor: isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255, 255, 255, 0.12)',
        borderWidth: 1,
        padding: 10,
        cornerRadius: 8,
        boxPadding: 4,
        usePointStyle: true
    };

    // 1. Valuation by Category (Doughnut)
    const ctxCat = document.getElementById('chartCategories');
    if (ctxCat) {
        state.charts.categories = new Chart(ctxCat, {
            type: 'doughnut',
            data: {
                labels: ['MIG Welding', 'TIG Welding', 'Robotics Spares', 'Welding Wire', 'Safety & Accessories'],
                datasets: [{
                    data: [40, 25, 20, 10, 5],
                    backgroundColor: ['#3DA9FF', '#22C55E', '#FF7A1A', '#A78BFA', '#FACC15'],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10 }, color: textColor, padding: 12 } },
                    tooltip: {
                        ...sharedTooltip,
                        callbacks: {
                            label: function(ctx) {
                                const val = ctx.raw || 0;
                                return ` ${ctx.label}: ${formatINR(val)}`;
                            }
                        }
                    }
                },
                cutout: '70%'
            }
        });
    }

    // 2. Stock Status Distribution / Gauge (Doughnut)
    const ctxStatus = document.getElementById('chartStockStatus');
    if (ctxStatus) {
        state.charts.status = new Chart(ctxStatus, {
            type: 'doughnut',
            data: {
                labels: ['Optimal (OK)', 'Low Stock', 'Critical', 'Out of Stock', 'Dead Stock'],
                datasets: [{
                    data: [45, 8, 3, 2, 4],
                    backgroundColor: ['#22C55E', '#FACC15', '#F97316', '#EF4444', '#6B7280'],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10 }, color: textColor, padding: 8 } },
                    tooltip: {
                        ...sharedTooltip,
                        callbacks: {
                            label: function(ctx) {
                                const val = ctx.raw || 0;
                                return ` ${ctx.label}: ${val} SKUs`;
                            }
                        }
                    }
                },
                cutout: '74%'
            }
        });
    }

    // 3. 30-Day Movement Velocity (Line Chart with Canvas Gradients)
    const ctxMov = document.getElementById('chartMovementTrend');
    if (ctxMov) {
        let greenGrad = 'rgba(34,197,94,0.14)';
        let blueGrad = 'rgba(61,169,255,0.14)';
        try {
            const c2d = ctxMov.getContext('2d');
            if (c2d) {
                const g1 = c2d.createLinearGradient(0, 0, 0, 240);
                g1.addColorStop(0, 'rgba(34, 197, 94, 0.32)');
                g1.addColorStop(1, 'rgba(34, 197, 94, 0.00)');
                greenGrad = g1;

                const g2 = c2d.createLinearGradient(0, 0, 0, 240);
                g2.addColorStop(0, 'rgba(61, 169, 255, 0.32)');
                g2.addColorStop(1, 'rgba(61, 169, 255, 0.00)');
                blueGrad = g2;
            }
        } catch (e) {
            // fallback rgba strings
        }

        state.charts.movements = new Chart(ctxMov, {
            type: 'line',
            data: {
                labels: [],
                datasets: [
                    {
                        label: 'Inward Receipts (Units)',
                        data: [],
                        borderColor: '#22C55E',
                        backgroundColor: greenGrad,
                        tension: 0.35,
                        fill: true,
                        pointRadius: 3,
                        pointHoverRadius: 6,
                        pointBackgroundColor: '#22C55E'
                    },
                    {
                        label: 'Outward Dispatches (Units)',
                        data: [],
                        borderColor: '#3DA9FF',
                        backgroundColor: blueGrad,
                        tension: 0.35,
                        fill: true,
                        pointRadius: 3,
                        pointHoverRadius: 6,
                        pointBackgroundColor: '#3DA9FF'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'top', labels: { boxWidth: 12, font: { size: 11, weight: '600' }, color: textColor } },
                    tooltip: sharedTooltip
                },
                scales: {
                    x: { ticks: { color: textColor, maxTicksLimit: 10 }, grid: { display: false } },
                    y: { ticks: { color: textColor }, grid: { color: gridColor }, beginAtZero: true }
                }
            }
        });
    }

    // 4. Top 10 Fast Movers (Horizontal Bar)
    const ctxFast = document.getElementById('chartFastMovers');
    if (ctxFast) {
        state.charts.fastMovers = new Chart(ctxFast, {
            type: 'bar',
            data: {
                labels: [],
                datasets: [{
                    label: 'Units Dispatched (30D)',
                    data: [],
                    backgroundColor: '#3DA9FF',
                    borderRadius: 6
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        ...sharedTooltip,
                        callbacks: {
                            label: function(ctx) {
                                return ` Velocity: ${ctx.raw} units dispatched`;
                            }
                        }
                    }
                },
                scales: {
                    x: { ticks: { color: textColor }, grid: { color: gridColor }, beginAtZero: true },
                    y: { ticks: { color: textColor, font: { size: 11 } }, grid: { display: false } }
                }
            }
        });
    }
}

async function updateCharts(dashboardData) {
    try {
        // Update category chart
        const catRes = await apiFetch('/api/charts/category-distribution');
        if (state.charts.categories && catRes && catRes.valuation) {
            state.charts.categories.data.labels = Object.keys(catRes.valuation);
            state.charts.categories.data.datasets[0].data = Object.values(catRes.valuation);
            state.charts.categories.update();
        }

        // Update status chart
        const counts = dashboardData?.counts || dashboardData?.status_distribution;
        if (state.charts.status && counts) {
            state.charts.status.data.labels = ['Optimal (OK)', 'Low Stock', 'Critical', 'Out of Stock', 'Dead Stock'];
            state.charts.status.data.datasets[0].data = [
                counts.OK || 0,
                counts.LOW || 0,
                counts.CRITICAL || 0,
                counts.OUT || 0,
                counts.DEAD || 0
            ];
            state.charts.status.update();
            updateStockHealthGauge(counts);
        }

        // Update 30D Movement Line chart
        if (state.charts.movements && dashboardData?.trend_30d) {
            const trend = dashboardData.trend_30d;
            state.charts.movements.data.labels = trend.map(t => t.date.slice(5)); // MM-DD
            state.charts.movements.data.datasets[0].data = trend.map(t => t.inward);
            state.charts.movements.data.datasets[1].data = trend.map(t => t.outward);
            state.charts.movements.update();
        }

        // Update Fast Movers bar chart
        if (state.charts.fastMovers && dashboardData?.fast_movers) {
            const movers = dashboardData.fast_movers.slice(0, 8);
            state.charts.fastMovers.data.labels = movers.map(m => m.sku);
            state.charts.fastMovers.data.datasets[0].data = movers.map(m => m.units_dispatched_30d);
            state.charts.fastMovers.update();
        }
    } catch (e) {
        console.warn('Charts update error:', e);
    }
}

// ==============================================
//  SKELETON LOADER HELPER
// ==============================================
function skeletonRows(cols, rows) {
    cols = cols || 5; rows = rows || 5;
    return Array(rows).fill('').map(function() {
        return '<tr class="skeleton-row">' + Array(cols).fill('').map(function() {
            return '<td><div class="skeleton-cell" style="width:' + Math.round(55 + Math.random() * 35) + '%;"></div></td>';
        }).join('') + '</tr>';
    }).join('');
}

// ==============================================
//  INVENTORY CATALOG TAB & PAGINATION
// ==============================================
async function fetchInventory() {
    try {
        const invTbody = document.getElementById('inventory-tbody');
        if (invTbody) invTbody.innerHTML = skeletonRows(10, 6);
        let url = `/api/inventory?page=${state.invPage}&limit=${state.invLimit}`;
        if (state.activeCategory && state.activeCategory !== 'all') {
            url += `&category=${encodeURIComponent(state.activeCategory)}`;
        }
        if (state.activeStatus && state.activeStatus !== 'all') {
            url += `&status=${encodeURIComponent(state.activeStatus)}`;
        }
        if (state.invFilter) {
            url += `&search=${encodeURIComponent(state.invFilter)}`;
        }
        if (state.invSort) {
            url += `&sort=${encodeURIComponent(state.invSort)}`;
        }

        const data = await apiFetch(url);
        if (data.items) {
            state.cachedInventory = data.items;
            state.invTotal = data.total;
            renderInventoryTable(data.items);
            updateInventoryPagination(data.total, data.page, data.limit);
        } else if (Array.isArray(data)) {
            state.cachedInventory = data;
            state.invTotal = data.length;
            renderInventoryTable(data);
            updateInventoryPagination(data.length, 1, data.length);
        }
        applyRBAC(state.currentUser ? state.currentUser.role : 'storekeeper');
    } catch (e) {
        console.error('Error fetching inventory:', e);
    }
}

function renderInventoryTable(items) {
    const tbody = document.getElementById('inventory-tbody');
    if (!tbody) return;

    if (!items || items.length === 0) {
        tbody.innerHTML = renderEmptyTableState(10, '📦', 'No Spares Found', 'Try adjusting your search query, status filter, or category selector.');
        return;
    }

    tbody.innerHTML = items.map(item => {
        const status = item.status || 'OK';
        let statusBadge = `<span class="status-badge status-badge-${status.toLowerCase()}">${status}</span>`;

        const maxBuffer = Math.max(item.reorder_level * 2.5, item.quantity, 100);
        const fillPct = Math.min(Math.round((item.quantity / maxBuffer) * 100), 100);

        let barClass = 'ok';
        if (status === 'OUT' || item.quantity === 0) barClass = 'out';
        else if (status === 'CRITICAL') barClass = 'critical';
        else if (status === 'LOW') barClass = 'low';
        else if (status === 'DEAD') barClass = 'dead';

        const cost = item.unit_cost || 0;
        const selling = item.selling_price || 0;
        const totalVal = item.quantity * cost;

        return `
            <tr style="cursor:pointer;" onclick="openItemDrawer(${item.id})">
                <td><strong style="color:var(--brand-primary); font-family:monospace; font-size:12px;">${escapeHtml(item.sku)}</strong></td>
                <td>
                    <div style="font-weight:600; color:var(--text-heading); font-size:13px;">${escapeHtml(item.name)}</div>
                    ${item.compatible_with ? `<div style="font-size:11px; color:var(--text-subtle);">Fits: ${escapeHtml(item.compatible_with)}</div>` : ''}
                </td>
                <td><span style="font-size:11px; background:var(--bg-region); padding:3px 8px; border-radius:6px; color:var(--text-muted);">${escapeHtml(item.category)}</span></td>
                <td>
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                        <strong style="font-size:13px; ${item.quantity <= item.reorder_level ? 'color:var(--accent-red);' : ''}">${item.quantity}</strong>
                        <span style="font-size:11px; color:var(--text-subtle);">${escapeHtml(item.unit || 'pcs')}</span>
                    </div>
                    <div class="stock-bar-wrap">
                        <div class="stock-bar-fill ${barClass}" style="width:${fillPct}%;"></div>
                    </div>
                </td>
                <td>${formatINR(cost)}</td>
                <td>${formatINR(selling)}</td>
                <td><strong>${formatINR(totalVal)}</strong></td>
                <td><span style="font-size:11px; color:var(--text-subtle); background:rgba(0,35,75,0.06); padding:2px 6px; border-radius:4px; font-family:monospace;">${escapeHtml(item.location || 'Central Store')}</span></td>
                <td>${statusBadge}</td>
                <td style="text-align:right;" onclick="event.stopPropagation()">
                    <div style="display:flex; gap:6px; justify-content:flex-end;">
                        <button class="btn btn-xs btn-outline" onclick="openAdjustStockModal(${item.id})">Adjust</button>
                        <button class="btn btn-xs btn-primary role-manager-admin" onclick="quickReorder('${escapeHtml(item.sku)}')">Reorder</button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    // Render Mobile Cards (<768px)
    const mobCardsEl = document.getElementById('mobile-items-cards');
    if (mobCardsEl) {
        if (!items || items.length === 0) {
            mobCardsEl.innerHTML = '<div style="text-align:center; padding:24px; color:var(--text-subtle);">No spares found</div>';
        } else {
            mobCardsEl.innerHTML = items.map(item => {
                const status = item.status || 'OK';
                return `
                <div class="mobile-card" onclick="openItemDrawer(${item.id})">
                    <div class="mc-top">
                        <div>
                            <span class="mc-sku">${escapeHtml(item.sku)}</span>
                            <div class="mc-name">${escapeHtml(item.name)}</div>
                        </div>
                        <span class="status-badge status-badge-${status.toLowerCase()}">${status}</span>
                    </div>
                    <div class="mc-meta">
                        <span>📦 <strong>${item.quantity}</strong> ${escapeHtml(item.unit || 'pcs')}</span>
                        <span>📍 ${escapeHtml(item.location || 'Central Store')}</span>
                        <span>🏷️ ${escapeHtml(item.category || '')}</span>
                        <span>₹${(item.unit_cost || 0).toLocaleString('en-IN')}</span>
                    </div>
                    <div class="mc-actions" onclick="event.stopPropagation()">
                        <button class="btn btn-emerald btn-sm" onclick="openStockInModal('${escapeHtml(item.sku)}')">📥 In</button>
                        <button class="btn btn-danger btn-sm" onclick="openStockOutModal('${escapeHtml(item.sku)}', '${escapeHtml(item.name)}', ${item.quantity})">📤 Out</button>
                        <button class="btn btn-outline btn-sm" onclick="openAdjustStockModal(${item.id})">🔄 Adjust</button>
                    </div>
                </div>`;
            }).join('');
        }
    }
}

function updateInventoryPagination(total, page, limit) {
    const infoEl = document.getElementById('invPaginationInfo');
    const pageNumEl = document.getElementById('invPageNum');
    const prevBtn = document.getElementById('invPrevBtn');
    const nextBtn = document.getElementById('invNextBtn');

    const totalPages = Math.ceil(total / limit) || 1;
    const start = total === 0 ? 0 : (page - 1) * limit + 1;
    const end = Math.min(page * limit, total);

    if (infoEl) infoEl.textContent = `Showing ${start} – ${end} of ${total} spares`;
    if (pageNumEl) pageNumEl.textContent = `Page ${page} of ${totalPages}`;
    if (prevBtn) prevBtn.disabled = (page <= 1);
    if (nextBtn) nextBtn.disabled = (page >= totalPages);
}

function prevInventoryPage() {
    if (state.invPage > 1) {
        state.invPage--;
        fetchInventory();
    }
}

function nextInventoryPage() {
    const totalPages = Math.ceil(state.invTotal / state.invLimit) || 1;
    if (state.invPage < totalPages) {
        state.invPage++;
        fetchInventory();
    }
}

function filterByCategory(category) {
    state.activeCategory = category;
    state.invPage = 1;
    document.querySelectorAll('.filter-pill').forEach(btn => {
        btn.classList.remove('btn-primary', 'active');
        btn.classList.add('btn-outline');
    });
    if (event && event.target) {
        event.target.classList.remove('btn-outline');
        event.target.classList.add('btn-primary', 'active');
    }
    fetchInventory();
}

function filterByStatus(status) {
    state.activeStatus = status;
    state.invPage = 1;
    document.querySelectorAll('.status-pill').forEach(btn => {
        btn.classList.remove('active');
        btn.style.fontWeight = 'normal';
    });
    if (event && event.target) {
        event.target.classList.add('active');
        event.target.style.fontWeight = 'bold';
    }
    fetchInventory();
}

function filterInventoryByStatus(status) {
    switchTab('inventory');
    state.activeStatus = status;
    state.invPage = 1;
    document.querySelectorAll('.status-pill').forEach(btn => {
        btn.classList.remove('active');
        if (btn.textContent.toUpperCase().includes(status.toUpperCase()) || (status === 'all' && btn.textContent === 'All')) {
            btn.classList.add('active');
        }
    });
    fetchInventory();
}

let searchDebounce = null;
function filterInventory(val) {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => {
        state.invFilter = val.trim();
        state.invPage = 1;
        fetchInventory();
    }, 300);
}

function sortInventory(col) {
    if (state.invSort === col) {
        state.invSort = `-${col}`;
    } else {
        state.invSort = col;
    }
    state.invPage = 1;
    fetchInventory();
}

// ==============================================
//  RIGHT-SIDE ITEM DRAWER & FORECAST
// ==============================================
async function openItemDrawer(itemId) {
    const item = state.cachedInventory.find(i => i.id === itemId);
    if (!item) return;

    state.selectedDrawerItem = item;

    // Header info
    const titleEl = document.getElementById('drawerTitle');
    const skuEl = document.getElementById('drawerSku');
    const compatEl = document.getElementById('drawerCompat');
    const badgeEl = document.getElementById('drawerStatusBadge');

    if (titleEl) titleEl.textContent = item.name;
    if (skuEl) skuEl.textContent = item.sku;
    if (compatEl) compatEl.textContent = item.compatible_with ? `Fits: ${item.compatible_with}` : 'Standard Industrial Fitment';
    if (badgeEl) {
        badgeEl.textContent = item.status || 'OK';
        badgeEl.className = `status-badge status-badge-${(item.status || 'OK').toLowerCase()}`;
    }

    // Metric numbers
    const qtyEl = document.getElementById('drawerQty');
    const unitEl = document.getElementById('drawerUnit');
    const reorderEl = document.getElementById('drawerReorder');
    const totalValEl = document.getElementById('drawerTotalVal');

    if (qtyEl) qtyEl.textContent = item.quantity;
    if (unitEl) unitEl.textContent = item.unit || 'pcs';
    if (reorderEl) reorderEl.textContent = item.reorder_level;
    if (totalValEl) totalValEl.textContent = formatINR(item.quantity * (item.unit_cost || 0));

    // Specs
    const catEl = document.getElementById('drawerCategory');
    const locEl = document.getElementById('drawerLocation');
    const costEl = document.getElementById('drawerCost');
    const sellEl = document.getElementById('drawerSelling');
    const supEl = document.getElementById('drawerSupplier');

    if (catEl) catEl.textContent = item.category;
    if (locEl) locEl.textContent = item.location || 'Central Store';
    if (costEl) costEl.textContent = formatINR(item.unit_cost);
    if (sellEl) sellEl.textContent = formatINR(item.selling_price);

    const supplier = state.cachedSuppliers.find(s => s.id === item.supplier_id);
    if (supEl) supEl.textContent = supplier ? supplier.name : (item.supplier_id || 'Authorized OEM');

    // Show overlay
    const overlay = document.getElementById('itemDrawerOverlay');
    if (overlay) overlay.style.display = 'flex';

    // Fetch Forecast
    loadDrawerForecast(item.id);
    loadDrawerAdvancedForecast(item.id);
    loadDrawerSafetyStock(item.id);
    initDrawerWhatIf(item.id);

    // Update Matrix badge if available
    const matrixBadgeEl = document.getElementById('drawerMatrixBadge');
    if (matrixBadgeEl) {
        if (state.cachedAnalytics && state.cachedAnalytics.items) {
            const anItem = state.cachedAnalytics.items.find(i => i.id === item.id);
            if (anItem) {
                matrixBadgeEl.textContent = anItem.matrix_class;
                matrixBadgeEl.className = `matrix-badge matrix-badge-${anItem.matrix_class.toLowerCase()}`;
                matrixBadgeEl.style.display = 'inline-block';
            } else {
                matrixBadgeEl.style.display = 'none';
            }
        } else {
            matrixBadgeEl.style.display = 'none';
        }
    }

    // Fetch Recent Movements
    loadDrawerMovements(item.id);

    applyRBAC(state.currentUser ? state.currentUser.role : 'storekeeper');
}

function closeItemDrawer() {
    const overlay = document.getElementById('itemDrawerOverlay');
    if (overlay) overlay.style.display = 'none';
    state.selectedDrawerItem = null;
}

async function loadDrawerForecast(itemId) {
    try {
        const fc = await apiFetch(`/api/forecast/${itemId}`);
        const dailyEl = document.getElementById('fc-daily-rate');
        const daysEl = document.getElementById('fc-days-left');
        const runoutEl = document.getElementById('fc-runout-status');
        const dateEl = document.getElementById('fc-reorder-date');
        const qtyEl = document.getElementById('fc-suggested-qty');
        const expEl = document.getElementById('fc-explanation');

        if (dailyEl) dailyEl.textContent = Number(fc.daily_run_rate || 0).toFixed(1);
        if (daysEl) daysEl.textContent = fc.days_remaining !== null ? fc.days_remaining : '—';
        if (runoutEl) runoutEl.textContent = fc.days_remaining <= 7 ? 'Critical depletion!' : 'Runout estimate';
        if (dateEl) dateEl.textContent = fc.suggested_reorder_date || 'Buffer adequate';
        if (qtyEl) qtyEl.textContent = fc.suggested_reorder_qty || 0;
        if (expEl) expEl.textContent = fc.explanation || 'Consumption rate is optimal.';

        // Smart Reorder Level display
        const sugLvl = fc.suggested_reorder_level;
        const curLvl = fc.current_reorder_level !== undefined ? fc.current_reorder_level : (state.selectedDrawerItem ? state.selectedDrawerItem.reorder_level : 0);
        const textEl = document.getElementById('drawerSuggestedReorderText');
        const btnEl = document.getElementById('drawerApplyReorderBtn');
        if (textEl && sugLvl !== undefined) {
            textEl.innerHTML = `Suggested: <strong>${sugLvl}</strong> (current <strong>${curLvl}</strong>)`;
            state.selectedDrawerItemSuggestedReorder = sugLvl;
            if (btnEl) {
                btnEl.style.display = (sugLvl !== curLvl) ? 'inline-block' : 'none';
                btnEl.textContent = `Apply (${sugLvl})`;
            }
        }
    } catch (e) {
        console.warn('Forecast fetch failed:', e);
    }
}

async function loadDrawerMovements(itemId) {
    const listEl = document.getElementById('drawerMovementsList');
    if (!listEl) return;

    try {
        const data = await apiFetch(`/api/stock-movements?item_id=${itemId}&limit=8`);
        const movements = Array.isArray(data) ? data : (data.movements || []);

        if (!movements || movements.length === 0) {
            listEl.innerHTML = '<div style="font-size:12px; color:var(--text-subtle); text-align:center; padding:10px;">No recent movements recorded</div>';
            return;
        }

        listEl.innerHTML = movements.map(m => {
            const isInward = m.type === 'IN';
            return `
                <div style="display:flex; justify-content:space-between; align-items:center; background:var(--bg-card); padding:6px 10px; border-radius:6px; font-size:11px; border:1px solid var(--border-subtle);">
                    <div>
                        <strong style="color:${isInward ? 'var(--status-active-text)' : 'var(--brand-primary)'};">${m.type}</strong>
                        <span style="color:var(--text-subtle);"> · ${escapeHtml(m.reference || m.party || 'Store')}</span>
                    </div>
                    <div>
                        <strong style="font-size:12px; color:${isInward ? 'var(--status-active-text)' : 'var(--text-heading)'};">${isInward ? '+' : '-'}${m.quantity}</strong>
                        <span style="color:var(--text-subtle); font-size:10px;">(Bal: ${m.balance_after})</span>
                    </div>
                </div>
            `;
        }).join('');
    } catch (e) {
        listEl.innerHTML = '<div style="font-size:11px; color:var(--text-subtle);">Unable to load movements.</div>';
    }
}

function openDrawerStockIn() {
    if (!state.selectedDrawerItem) return;
    openStockInModal(state.selectedDrawerItem.sku, state.selectedDrawerItem.name);
}

function openDrawerStockOut() {
    if (!state.selectedDrawerItem) return;
    openStockOutModal(state.selectedDrawerItem.sku, state.selectedDrawerItem.name, state.selectedDrawerItem.quantity);
}

function openDrawerStockAdjust() {
    if (!state.selectedDrawerItem) return;
    openAdjustStockModal(state.selectedDrawerItem.sku, state.selectedDrawerItem.name);
}

function openDrawerEditItem() {
    if (!state.selectedDrawerItem) return;
    openEditSpareModal(state.selectedDrawerItem);
}

async function confirmDeleteItem() {
    if (!state.selectedDrawerItem) return;
    const item = state.selectedDrawerItem;
    if (!confirm(`Are you sure you want to deactivate and remove ${item.sku} (${item.name}) from catalog?`)) {
        return;
    }

    try {
        await apiFetch(`/api/items/${item.id}`, { method: 'DELETE' });
        showToast(`Item ${item.sku} deactivated from catalog.`, 'info');
        closeItemDrawer();
        fetchInventory();
        fetchStats();
    } catch (e) {
        alert(`Failed to delete item: ${e.message}`);
    }
}

// ==============================================
//  STOCK MOVEMENTS TAB
// ==============================================
async function fetchMovements() {
    try {
        const movTbody = document.getElementById('movements-tbody');
        if (movTbody) movTbody.innerHTML = skeletonRows(8, 6);
        let url = `/api/stock-movements?page=${state.movPage}&limit=${state.movLimit}`;
        if (state.movType && state.movType !== 'all') {
            url += `&type=${encodeURIComponent(state.movType)}`;
        }
        if (state.movSearch) {
            url += `&sku=${encodeURIComponent(state.movSearch)}`;
        }
        if (state.movStartDate) {
            url += `&start_date=${encodeURIComponent(state.movStartDate)}`;
        }
        if (state.movEndDate) {
            url += `&end_date=${encodeURIComponent(state.movEndDate)}`;
        }

        const data = await apiFetch(url);
        if (data && data.movements) {
            state.cachedMovements = data.movements;
            state.movTotal = data.total;
            renderMovementsTable(data.movements);
            updateMovementsPagination(data.total, data.page, data.limit);
        } else if (Array.isArray(data)) {
            state.cachedMovements = data;
            state.movTotal = data.length;
            renderMovementsTable(data);
            updateMovementsPagination(data.length, 1, data.length);
        }
    } catch (e) {
        console.error('Error fetching movements:', e);
    }
}

function renderMovementsTable(movements) {
    const tbody = document.getElementById('movements-tbody');
    if (!tbody) return;

    if (!movements || movements.length === 0) {
        tbody.innerHTML = renderEmptyTableState(11, '🔄', 'No Stock Movements Recorded', 'No inward receipts, dispatches or bin adjustments match your filter.');
        return;
    }

    tbody.innerHTML = movements.map(m => {
        const isInward = m.type === 'IN';
        const isOutward = m.type === 'OUT';
        const typeBadge = isInward 
            ? '<span style="background:rgba(16,185,129,0.15); color:#10b981; border:1px solid rgba(16,185,129,0.3); font-weight:700; font-size:11px; padding:3px 8px; border-radius:6px;">⬇ INWARD</span>'
            : (isOutward
                ? '<span style="background:rgba(220,38,38,0.15); color:#dc2626; border:1px solid rgba(220,38,38,0.3); font-weight:700; font-size:11px; padding:3px 8px; border-radius:6px;">⬆ DISPATCH</span>'
                : '<span style="background:rgba(245,158,11,0.15); color:#d97706; border:1px solid rgba(245,158,11,0.3); font-weight:700; font-size:11px; padding:3px 8px; border-radius:6px;">🔄 ADJUSTMENT</span>');

        const challanBtn = isOutward
            ? `<a href="/api/pdf/dispatch/${m.id}" target="_blank" class="btn btn-xs btn-outline" style="border-color:#dc2626; color:#dc2626; font-weight:700;" title="Download Goods Dispatch Note PDF">📄 Dispatch Note</a>`
            : '—';

        return `
            <tr>
                <td><code>${escapeHtml(m.movement_id)}</code></td>
                <td><span style="font-size:12px; color:var(--text-subtle);">${escapeHtml(m.timestamp)}</span></td>
                <td>${typeBadge}</td>
                <td><strong>${escapeHtml(m.sku)}</strong></td>
                <td>${escapeHtml(m.item_name)}</td>
                <td><strong style="font-size:13px; color:${isInward ? 'var(--status-active-text)' : 'var(--text-heading)'};">${isInward ? '+' : '-'}${m.quantity}</strong></td>
                <td><strong style="font-size:13px;">${m.balance_after !== null && m.balance_after !== undefined ? m.balance_after : '—'}</strong></td>
                <td><span style="font-size:12px; color:var(--text-subtle);">${escapeHtml(m.reference || '—')}</span></td>
                <td>${escapeHtml(m.party || m.destination_or_source || 'Central Store')}</td>
                <td><span style="font-size:12px; color:var(--text-muted);">${escapeHtml(m.performed_by || m.operator || 'Store Incharge')}</span></td>
                <td style="text-align:right;">${challanBtn}</td>
            </tr>
        `;
    }).join('');
}

function updateMovementsPagination(total, page, limit) {
    const infoEl = document.getElementById('movPaginationInfo');
    const pageNumEl = document.getElementById('movPageNum');
    const prevBtn = document.getElementById('movPrevBtn');
    const nextBtn = document.getElementById('movNextBtn');

    const totalPages = Math.ceil(total / limit) || 1;
    const start = total === 0 ? 0 : (page - 1) * limit + 1;
    const end = Math.min(page * limit, total);

    if (infoEl) infoEl.textContent = `Showing ${start} – ${end} of ${total} movements`;
    if (pageNumEl) pageNumEl.textContent = `Page ${page} of ${totalPages}`;
    if (prevBtn) prevBtn.disabled = (page <= 1);
    if (nextBtn) nextBtn.disabled = (page >= totalPages);
}

function prevMovementsPage() {
    if (state.movPage > 1) {
        state.movPage--;
        fetchMovements();
    }
}

function nextMovementsPage() {
    const totalPages = Math.ceil(state.movTotal / state.movLimit) || 1;
    if (state.movPage < totalPages) {
        state.movPage++;
        fetchMovements();
    }
}

function filterMovementsDate() {
    const s = document.getElementById('movStartDate');
    const e = document.getElementById('movEndDate');
    state.movStartDate = s ? s.value : '';
    state.movEndDate = e ? e.value : '';
    state.movPage = 1;
    fetchMovements();
}

function filterMovementsByType(type) {
    state.movType = type;
    state.movPage = 1;
    document.querySelectorAll('.mov-filter-pill').forEach(btn => {
        btn.classList.remove('btn-primary', 'active');
        btn.classList.add('btn-outline');
    });
    if (event && event.target) {
        event.target.classList.remove('btn-outline');
        event.target.classList.add('btn-primary', 'active');
    }
    fetchMovements();
}

let movSearchDebounce = null;
function filterMovements(val) {
    clearTimeout(movSearchDebounce);
    movSearchDebounce = setTimeout(() => {
        state.movSearch = val.trim();
        state.movPage = 1;
        fetchMovements();
    }, 300);
}

// ==============================================
//  PURCHASE ORDERS TAB & LIFECYCLE
// ==============================================
async function fetchProcurement() {
    try {
        const poTbody = document.getElementById('po-table-body');
        if (poTbody) poTbody.innerHTML = skeletonRows(8, 5);
        const pos = await apiFetch('/api/procurement');
        state.cachedPOs = pos;
        renderProcurementTable(pos);
    } catch (e) {
        console.error('Error fetching procurement:', e);
    }
}

function renderProcurementTable(pos) {
    const tbody = document.getElementById('po-table-body');
    if (!tbody) return;

    let filtered = pos || [];
    if (state.activePOStatus && state.activePOStatus !== 'all') {
        filtered = filtered.filter(p => p.status === state.activePOStatus);
    }

    if (filtered.length === 0) {
        tbody.innerHTML = renderEmptyTableState(8, '📝', 'No Purchase Orders Found', 'There are no active or historical procurement orders matching this status.');
        return;
    }

    tbody.innerHTML = filtered.map(p => {
        let statusBadge = `<span style="background:#fef3c7; color:#b45309; padding:3px 8px; border-radius:12px; font-size:11px; font-weight:700;">${p.status}</span>`;
        if (p.status === 'APPROVED') {
            statusBadge = `<span style="background:#dbeafe; color:#1d4ed8; padding:3px 8px; border-radius:12px; font-size:11px; font-weight:700;">APPROVED</span>`;
        } else if (p.status === 'PARTIALLY_RECEIVED') {
            statusBadge = `<span style="background:#fef08a; color:#854d0e; padding:3px 8px; border-radius:12px; font-size:11px; font-weight:700;">PARTIAL</span>`;
        } else if (p.status === 'RECEIVED') {
            statusBadge = `<span style="background:#dcfce7; color:#15803d; padding:3px 8px; border-radius:12px; font-size:11px; font-weight:700;">RECEIVED</span>`;
        } else if (p.status === 'CANCELLED') {
            statusBadge = `<span style="background:#fee2e2; color:#b91c1c; padding:3px 8px; border-radius:12px; font-size:11px; font-weight:700;">CANCELLED</span>`;
        }

        if (p.overdue) {
            statusBadge += ` <span style="background:#fee2e2; color:#b91c1c; padding:2px 6px; border-radius:4px; font-size:10px; font-weight:700;">⏰ OVERDUE ${p.days_late || 1}d</span>`;
        }

        let originBadge = p.auto_generated
            ? '<span style="font-size:10px; background:rgba(0,106,106,0.12); color:var(--brand-secondary); padding:2px 6px; border-radius:4px; font-weight:700; white-space:nowrap; display:inline-block;">🤖 Auto-Draft</span>'
            : '<span style="font-size:10px; color:var(--text-subtle); white-space:nowrap; display:inline-block;">Manual</span>';
        if (p.auto_approved) {
            originBadge += ' <span style="font-size:10px; background:#ede9fe; color:#7c3aed; padding:2px 6px; border-radius:4px; font-weight:700;">✅ Auto-Approved</span>';
        }

        const lineItemNames = p.items && p.items.length > 0
            ? p.items.map(it => `${it.qty}x ${it.sku || it.name}`).join(', ')
            : (p.item || 'Industrial Consumables');

        const totalVal = p.total_value !== undefined ? p.total_value : p.amount;

        return `
            <tr style="cursor:pointer;" onclick="openPODetailModal(${p.id})">
                <td><strong style="color:var(--brand-primary); font-family:monospace; font-size:12px;">${escapeHtml(p.po_number || p.id)}</strong></td>
                <td><span style="font-size:12px; color:var(--text-subtle);">${escapeHtml(p.date || p.created_at || '—')}</span></td>
                <td><strong style="color:var(--text-heading); font-size:13px;">${escapeHtml(p.vendor_name || 'Approved Supplier')}</strong></td>
                <td><div style="font-size:12px; max-width:260px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(lineItemNames)}</div></td>
                <td><strong>${formatINR(totalVal)}</strong></td>
                <td>${originBadge}</td>
                <td>${statusBadge}</td>
                <td style="text-align:right;" onclick="event.stopPropagation()">
                    <div style="display:flex; gap:6px; justify-content:flex-end; align-items:center;">
                        <button class="btn btn-xs btn-outline" onclick="openPODetailModal(${p.id})">View</button>
                        <button class="btn btn-xs btn-outline" onclick="downloadPO('${p.po_number || p.id}')">📄 PDF</button>
                        ${(p.status === 'APPROVED' || p.status === 'ORDERED' || p.status === 'PARTIALLY_RECEIVED') ? `
                            <button class="btn btn-xs btn-whatsapp" onclick="openPOWhatsAppModal('${escapeHtml(p.po_number || p.id)}', '${escapeHtml(p.vendor_name || '')}')" title="Send PO details via WhatsApp">💬 WA</button>
                        ` : ''}
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function filterPOsByStatus(status) {
    state.activePOStatus = status;
    document.querySelectorAll('.po-tab-pill').forEach(btn => {
        btn.classList.remove('btn-primary', 'active');
        btn.classList.add('btn-outline');
    });
    if (event && event.target) {
        event.target.classList.remove('btn-outline');
        event.target.classList.add('btn-primary', 'active');
    }
    renderProcurementTable(state.cachedPOs);
}

async function openPODetailModal(poId) {
    try {
        const po = await apiFetch(`/api/procurement/${poId}`);
        state.selectedPO = po;

        const titleEl = document.getElementById('poDetailTitle');
        const supEl = document.getElementById('poDetailSupplier');
        const amtEl = document.getElementById('poDetailAmount');
        const statusEl = document.getElementById('poDetailStatus');
        const dateEl = document.getElementById('poDetailDate');
        const tbody = document.getElementById('poDetailLineItems');

        if (titleEl) titleEl.textContent = `Purchase Order ${po.po_number || po.id}`;
        if (supEl) supEl.textContent = `Supplier: ${po.vendor_name || 'Approved Supplier'} (${po.supplier_id || 'V001'})`;
        if (amtEl) amtEl.textContent = formatINR(po.total_value !== undefined ? po.total_value : po.amount);
        if (statusEl) statusEl.textContent = po.status;
        if (dateEl) dateEl.textContent = po.date || po.created_at || '—';

        // Update Stepper
        ['DRAFT', 'APPROVED', 'PARTIALLY_RECEIVED', 'RECEIVED'].forEach(step => {
            const el = document.getElementById(`step-${step}`);
            if (el) {
                const isActive = po.status === step;
                el.style.background = isActive ? 'var(--brand-primary)' : 'var(--bg-region)';
                el.style.color = isActive ? '#fff' : 'var(--text-subtle)';
                el.style.borderColor = isActive ? 'var(--brand-primary)' : 'var(--border-medium)';
            }
        });

        if (tbody) {
            if (po.items && po.items.length > 0) {
                tbody.innerHTML = po.items.map(it => `
                    <tr>
                        <td><code>${escapeHtml(it.sku || '—')}</code></td>
                        <td><strong>${escapeHtml(it.name || 'Catalog Spare')}</strong></td>
                        <td>${it.qty}</td>
                        <td>${it.received_qty || 0}</td>
                        <td>${formatINR(it.unit_cost)}</td>
                        <td style="text-align:right;"><strong>${formatINR(it.total || (it.qty * it.unit_cost))}</strong></td>
                        <td style="font-size:11px; color:var(--text-subtle); max-width:180px; overflow:hidden; text-overflow:ellipsis;" title="${escapeHtml(it.reason || '')}">${escapeHtml((it.reason || '').substring(0, 50))}${(it.reason || '').length > 50 ? '...' : ''}</td>
                    </tr>
                `).join('');
            } else {
                tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:12px;">Standard Line Item: ${escapeHtml(po.item || 'Spares')} (${po.quantity || 1} units)</td></tr>`;
            }
        }

        // Configure action button visibility by role & status
        const role = state.currentUser ? state.currentUser.role : 'storekeeper';
        const approveBtn = document.getElementById('poDetailApproveBtn');
        const receiveBtn = document.getElementById('poDetailReceiveBtn');
        const cancelBtn = document.getElementById('poDetailCancelBtn');

        if (approveBtn) {
            approveBtn.style.display = (po.status === 'DRAFT' && ['admin', 'manager'].includes(role)) ? 'inline-block' : 'none';
        }
        if (receiveBtn) {
            receiveBtn.style.display = (['APPROVED', 'PARTIALLY_RECEIVED'].includes(po.status)) ? 'inline-block' : 'none';
        }
        if (cancelBtn) {
            cancelBtn.style.display = (['DRAFT', 'APPROVED', 'PARTIALLY_RECEIVED'].includes(po.status) && ['admin', 'manager'].includes(role)) ? 'inline-block' : 'none';
        }

        openModal('modal-po-detail');
    } catch (e) {
        alert(`Failed to load PO details: ${e.message}`);
    }
}

async function approveCurrentPO() {
    if (!state.selectedPO) return;
    try {
        await apiFetch(`/api/procurement/${state.selectedPO.id}/approve`, { method: 'POST' });
        showToast(`Purchase Order ${state.selectedPO.po_number || state.selectedPO.id} Approved!`, 'success');
        closeModal('modal-po-detail');
        fetchProcurement();
        fetchStats();
    } catch (e) {
        alert(`Approval failed: ${e.message}`);
    }
}



async function cancelCurrentPO() {
    if (!state.selectedPO) return;
    if (!confirm('Are you sure you want to cancel this Purchase Order?')) return;
    try {
        await apiFetch(`/api/procurement/${state.selectedPO.id}/cancel`, { method: 'POST' });
        showToast(`Purchase Order cancelled.`, 'info');
        closeModal('modal-po-detail');
        fetchProcurement();
        fetchStats();
    } catch (e) {
        alert(`Cancellation failed: ${e.message}`);
    }
}

function downloadCurrentPOPDF() {
    if (!state.selectedPO) return;
    downloadPO(state.selectedPO.po_number || state.selectedPO.id);
}

function downloadPO(poId) {
    showToast(`Generating Purchase Order PDF for ${poId}...`, 'info');
    window.open(`/api/pdf/${poId}`, '_blank');
}

function downloadAllPOs() {
    showToast('Compiling batch Purchase Orders PDF...', 'info');
    window.open('/api/pdf/bulk-procurement', '_blank');
}

// ==============================================
//  CREATE PURCHASE ORDER MODAL
// ==============================================
function openCreatePOModal() {
    state.poCreateItems = [];
    populatePOSupplierSelect();
    populatePOItemSelect();
    renderPOCreateLineItems();
    openModal('modal-create-po');
}

function populatePOSupplierSelect() {
    const select = document.getElementById('po-supplier-select');
    if (!select) return;
    select.innerHTML = '<option value="">Select Supplier...</option>' + 
        state.cachedSuppliers.map(s => `<option value="${s.id}">${escapeHtml(s.name)} (${escapeHtml(s.category)})</option>`).join('');
}

function populatePOItemSelect() {
    const select = document.getElementById('po-item-select');
    if (!select) return;
    select.innerHTML = '<option value="">Select Catalog Spare...</option>' + 
        state.cachedInventory.map(i => `<option value="${i.id}" data-cost="${i.unit_cost}">${escapeHtml(i.sku)} - ${escapeHtml(i.name)}</option>`).join('');
}

function onPOItemSelectChange(itemId) {
    const select = document.getElementById('po-item-select');
    const opt = select.options[select.selectedIndex];
    const cost = opt ? parseFloat(opt.getAttribute('data-cost')) || 0 : 0;

    const costInput = document.getElementById('po-unit-cost');
    if (costInput) costInput.value = cost;
}

function addPOLineItem() {
    const select = document.getElementById('po-item-select');
    const itemId = parseInt(select.value, 10);
    const qty = parseInt(document.getElementById('po-quantity').value, 10) || 1;
    const unitCost = parseFloat(document.getElementById('po-unit-cost').value) || 0;

    if (!itemId) {
        alert('Please select a catalog spare item to add.');
        return;
    }

    const item = state.cachedInventory.find(i => i.id === itemId);
    const existing = state.poCreateItems.find(it => it.item_id === itemId);
    if (existing) {
        existing.qty += qty;
        existing.unit_cost = unitCost;
    } else {
        state.poCreateItems.push({
            item_id: itemId,
            sku: item ? item.sku : `ITEM-${itemId}`,
            name: item ? item.name : 'Catalog Spare',
            qty: qty,
            unit_cost: unitCost
        });
    }

    renderPOCreateLineItems();
}

function removePOLineItem(index) {
    state.poCreateItems.splice(index, 1);
    renderPOCreateLineItems();
}

function renderPOCreateLineItems() {
    const tbody = document.getElementById('po-create-line-items');
    const totalDisplay = document.getElementById('po-create-total-display');
    const amountInput = document.getElementById('po-amount');

    if (!tbody) return;

    if (state.poCreateItems.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:16px; color:var(--text-subtle);">No items added yet. Select an item above and click "+ Add".</td></tr>';
        if (totalDisplay) totalDisplay.textContent = '₹0.00';
        if (amountInput) amountInput.value = '0';
        return;
    }

    let total = 0;
    tbody.innerHTML = state.poCreateItems.map((it, idx) => {
        const lineTotal = it.qty * it.unit_cost;
        total += lineTotal;
        return `
            <tr>
                <td><strong>${escapeHtml(it.name)}</strong> <code style="font-size:11px;">(${escapeHtml(it.sku)})</code></td>
                <td>${it.qty}</td>
                <td>${formatINR(it.unit_cost)}</td>
                <td style="text-align:right;"><strong>${formatINR(lineTotal)}</strong></td>
                <td style="text-align:center;"><button type="button" class="btn btn-xs btn-ghost" onclick="removePOLineItem(${idx})" style="color:var(--accent-red); font-size:14px; padding:2px 6px;">✕</button></td>
            </tr>
        `;
    }).join('');

    if (totalDisplay) totalDisplay.textContent = formatINR(total);
    if (amountInput) amountInput.value = total.toFixed(2);
}

function calculatePOTotal() {
    renderPOCreateLineItems();
}

async function submitCreatePO() {
    const supplierId = document.getElementById('po-supplier-select').value;
    const department = document.getElementById('po-department').value.trim() || 'Central Store';

    if (!supplierId) {
        alert('Please select an authorized supplier.');
        return;
    }

    // Auto-add current item if user selected but didn't click + Add
    if (state.poCreateItems.length === 0) {
        const select = document.getElementById('po-item-select');
        const itemId = parseInt(select.value, 10);
        if (itemId) {
            addPOLineItem();
        }
    }

    if (state.poCreateItems.length === 0) {
        alert('Please add at least one line item to the purchase order.');
        return;
    }

    try {
        const res = await apiFetch('/api/procurement', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                supplier_id: supplierId,
                department,
                items: state.poCreateItems.map(it => ({
                    item_id: it.item_id,
                    qty: it.qty,
                    unit_cost: it.unit_cost
                }))
            })
        });

        closeModal('modal-create-po');
        showToast(`Purchase Order ${res.po_number || res.po_id} raised successfully! Total: ${formatINR(res.total_value)}`, 'success');
        fetchProcurement();
        fetchStats();
    } catch (e) {
        alert(`Failed to create PO: ${e.message}`);
    }
}

// ==============================================
//  SUPPLIERS TAB & MODALS
// ==============================================
async function fetchSuppliers() {
    try {
        const suppliers = await apiFetch('/api/suppliers');
        state.cachedSuppliers = suppliers;
        renderSuppliersTable(suppliers);
        populatePOSupplierSelect();
    } catch (e) {
        console.error('Error fetching suppliers:', e);
    }
}

function renderSuppliersTable(suppliers) {
    const tbody = document.getElementById('suppliers-tbody');
    if (!tbody) return;

    if (!suppliers || suppliers.length === 0) {
        tbody.innerHTML = renderEmptyTableState(10, '🏭', 'No Suppliers Found', 'No verified industrial vendors registered in this facility yet.');
        return;
    }

    tbody.innerHTML = suppliers.map(s => `
        <tr>
            <td><code>${escapeHtml(s.id)}</code></td>
            <td>
                <strong style="color:var(--brand-primary); font-size:13px;">${escapeHtml(s.name)}</strong>
                <div style="font-size:11px; color:var(--text-subtle);">${escapeHtml(s.contact_email || 'sales@supplier.com')}</div>
            </td>
            <td><span style="font-size:11px; background:var(--bg-region); padding:2px 8px; border-radius:4px;">${escapeHtml(s.category || 'Welding Equipment')}</span></td>
            <td><strong style="font-size:12px; color:var(--text-heading);">${escapeHtml(s.contact_person || 'Sales Manager')}</strong></td>
            <td><span style="background:rgba(0,106,106,0.1); color:var(--brand-secondary); padding:2px 8px; border-radius:12px; font-weight:700; font-size:11px;">📍 ${escapeHtml(s.city || 'Delhi-NCR')}</span></td>
            <td><span style="font-weight:600; font-size:12px;">${s.lead_time_days || 3} days</span></td>
            <td><strong style="color:var(--accent-amber); font-size:12px;">★ ${Number(s.rating || 4.5).toFixed(1)} / 5.0</strong></td>
            <td>
                <span style="font-weight:700; color:var(--brand-primary);">${s.open_po_count || 0} POs</span>
                <div style="font-size:10px; color:var(--text-subtle);">${formatINR(s.open_po_value || 0)}</div>
            </td>
            <td><span style="font-size:12px; color:var(--text-subtle);">${escapeHtml(s.phone || s.contact_phone || '+91 124 400 0000')}</span></td>
            <td style="text-align:right;">
                <button class="btn btn-xs btn-outline role-manager-admin" onclick="openEditSupplierModal('${s.id}')">✏️ Edit</button>
            </td>
        </tr>
    `).join('');
    applyRBAC(state.currentUser ? state.currentUser.role : 'storekeeper');
}

function openAddSupplierModal() {
    openModal('modal-add-supplier');
}

async function submitNewSupplier() {
    const name = document.getElementById('sup-name').value.trim();
    const category = document.getElementById('sup-category').value.trim();
    const contactPerson = document.getElementById('sup-person').value.trim();
    const city = document.getElementById('sup-city').value.trim();
    const leadTime = parseInt(document.getElementById('sup-lead-time').value, 10) || 3;
    const phone = document.getElementById('sup-phone').value.trim();

    if (!name || !category) {
        alert('Please enter supplier name and category specialty.');
        return;
    }

    try {
        await apiFetch('/api/suppliers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name,
                category,
                contact_person: contactPerson,
                city,
                lead_time_days: leadTime,
                phone
            })
        });

        closeModal('modal-add-supplier');
        showToast(`Supplier ${name} registered!`, 'success');
        fetchSuppliers();
    } catch (e) {
        alert(`Failed to add supplier: ${e.message}`);
    }
}

function openEditSupplierModal(supplierId) {
    const supplier = state.cachedSuppliers.find(s => s.id === supplierId);
    if (!supplier) return;

    document.getElementById('edit-sup-id').value = supplier.id;
    document.getElementById('edit-sup-name').value = supplier.name;
    document.getElementById('edit-sup-category').value = supplier.category || '';
    document.getElementById('edit-sup-person').value = supplier.contact_person || '';
    document.getElementById('edit-sup-city').value = supplier.city || '';
    document.getElementById('edit-sup-lead').value = supplier.lead_time_days || 3;
    document.getElementById('edit-sup-phone').value = supplier.phone || '';

    openModal('modal-edit-supplier');
}

async function submitEditSupplier() {
    const id = document.getElementById('edit-sup-id').value;
    const name = document.getElementById('edit-sup-name').value.trim();
    const category = document.getElementById('edit-sup-category').value.trim();
    const contactPerson = document.getElementById('edit-sup-person').value.trim();
    const city = document.getElementById('edit-sup-city').value.trim();
    const leadTime = parseInt(document.getElementById('edit-sup-lead').value, 10) || 3;
    const phone = document.getElementById('edit-sup-phone').value.trim();

    try {
        await apiFetch(`/api/suppliers/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name, category, contact_person: contactPerson, city, lead_time_days: leadTime, phone
            })
        });

        closeModal('modal-edit-supplier');
        showToast(`Supplier ${name} updated!`, 'success');
        fetchSuppliers();
    } catch (e) {
        alert(`Failed to update supplier: ${e.message}`);
    }
}

// ==============================================
//  STOCK IN / OUT / ADJUST MODALS
// ==============================================
function openStockInModal(sku = '', name = '') {
    const skuInput = document.getElementById('stockin-sku');
    const nameEl = document.getElementById('stockin-part-name');
    const qtyInput = document.getElementById('stockin-quantity');

    if (sku) {
        skuInput.value = sku;
        nameEl.textContent = `${name} (${sku})`;
    } else {
        const selected = prompt('Enter SKU for Inward Receipt (e.g. CT-M8-12):');
        if (!selected) return;
        const item = state.cachedInventory.find(i => i.sku.toLowerCase() === selected.trim().toLowerCase());
        if (!item) {
            alert('SKU not found in catalog.');
            return;
        }
        skuInput.value = item.sku;
        nameEl.textContent = `${item.name} (${item.sku})`;
    }

    if (qtyInput) qtyInput.value = 50;
    openModal('modal-stock-in');
}

async function submitStockIn() {
    const sku = document.getElementById('stockin-sku').value;
    const quantity = parseInt(document.getElementById('stockin-quantity').value, 10);
    const supplier = document.getElementById('stockin-supplier').value.trim();
    const reference = document.getElementById('stockin-reference').value.trim();

    if (!quantity || quantity <= 0) {
        alert('Please enter a valid receipt quantity.');
        return;
    }

    const client_id = generateClientId();
    const payload = {
        sku, quantity, supplier: supplier || 'Authorized OEM', reference: reference || 'Goods Receipt', client_id
    };

    if (!navigator.onLine) {
        await enqueueOfflineAction('STOCK_IN', '/api/stock/in', payload);
        closeModal('modal-stock-in');
        showToast(`Offline: Inward receipt queued for ${sku} (+${quantity})`, 'warning');
        return;
    }

    try {
        const res = await apiFetch('/api/stock/in', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        closeModal('modal-stock-in');
        showToast(`Stock inward recorded for ${sku}. Total: ${res.current_quantity}`, 'success');
        fetchInventory();
        fetchStats();
        fetchMovements();
    } catch (e) {
        if (!navigator.onLine || e.message.includes('fetch') || e.message.includes('network')) {
            await enqueueOfflineAction('STOCK_IN', '/api/stock/in', payload);
            closeModal('modal-stock-in');
            showToast(`Offline: Inward receipt queued for ${sku}`, 'warning');
        } else {
            alert(`Stock in failed: ${e.message}`);
        }
    }
}

function openStockOutModal(sku = '', name = '', availableQty = 0) {
    const skuInput = document.getElementById('stockout-sku');
    const nameEl = document.getElementById('stockout-part-name');
    const availEl = document.getElementById('stockout-available-qty');
    const errBox = document.getElementById('stockout-error');
    const successBox = document.getElementById('stockout-success-box');
    const formFields = document.getElementById('stockout-form-fields');

    if (errBox) errBox.style.display = 'none';
    if (successBox) successBox.style.display = 'none';
    if (formFields) formFields.style.display = 'block';

    if (sku) {
        skuInput.value = sku;
        nameEl.textContent = `${name} (${sku})`;
        availEl.textContent = availableQty;
    } else {
        const selected = prompt('Enter SKU for Dispatch (e.g. CT-M8-12):');
        if (!selected) return;
        const item = state.cachedInventory.find(i => i.sku.toLowerCase() === selected.trim().toLowerCase());
        if (!item) {
            alert('SKU not found in catalog.');
            return;
        }
        skuInput.value = item.sku;
        nameEl.textContent = `${item.name} (${item.sku})`;
        availEl.textContent = item.quantity;
    }

    openModal('modal-stock-out');
}

async function submitStockOut() {
    const sku = document.getElementById('stockout-sku').value;
    const quantity = parseInt(document.getElementById('stockout-quantity').value, 10);
    const destination = document.getElementById('stockout-destination').value.trim();
    const invoice = document.getElementById('stockout-invoice').value.trim();
    const errBox = document.getElementById('stockout-error');
    const successBox = document.getElementById('stockout-success-box');
    const formFields = document.getElementById('stockout-form-fields');

    if (errBox) errBox.style.display = 'none';

    if (!quantity || quantity <= 0) {
        if (errBox) {
            errBox.textContent = 'Please enter a valid dispatch quantity.';
            errBox.style.display = 'block';
        }
        return;
    }

    const client_id = generateClientId();
    const payload = {
        sku,
        quantity,
        customer: destination || 'Shop Floor / Welding Line',
        invoice_no: invoice || 'DISP-ISSUE',
        client_id
    };

    if (!navigator.onLine) {
        await enqueueOfflineAction('STOCK_OUT', '/api/stock/out', payload);
        closeModal('modal-stock-out');
        showToast(`Offline: Dispatch queued for ${sku} (-${quantity})`, 'warning');
        return;
    }

    try {
        const res = await apiFetch('/api/stock/out', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        state.lastMovementId = res.movement_id;

        if (formFields) formFields.style.display = 'none';
        if (successBox) successBox.style.display = 'block';

        showToast(`Stock dispatch recorded for ${sku}. Remaining: ${res.current_quantity}`, 'success');
        fetchInventory();
        fetchStats();
        fetchMovements();
    } catch (e) {
        if (!navigator.onLine || e.message.includes('fetch') || e.message.includes('network')) {
            await enqueueOfflineAction('STOCK_OUT', '/api/stock/out', payload);
            closeModal('modal-stock-out');
            showToast(`Offline: Dispatch queued for ${sku}`, 'warning');
        } else if (errBox) {
            errBox.textContent = `❌ ${e.message}`;
            errBox.style.display = 'block';
        } else {
            alert(`Stock out failed: ${e.message}`);
        }
    }
}

function downloadLastDispatchNote() {
    if (!state.lastMovementId) return;
    window.open(`/api/pdf/dispatch/${state.lastMovementId}`, '_blank');
}

function openAdjustStockModal(skuOrId, name) {
    let item = null;
    if (typeof skuOrId === 'number' || (!isNaN(skuOrId) && !String(skuOrId).includes('-'))) {
        item = state.cachedInventory.find(i => i.id === parseInt(skuOrId, 10));
    }
    if (!item && typeof skuOrId === 'string') {
        item = state.cachedInventory.find(i => i.sku === skuOrId);
    }
    const finalSku = item ? item.sku : skuOrId;
    const finalName = item ? item.name : (name || finalSku);

    document.getElementById('adjust-sku').value = finalSku;
    document.getElementById('adjust-part-name').textContent = `${finalName} (${finalSku})`;
    document.getElementById('adjust-quantity').value = -5;
    document.getElementById('adjust-reason').value = '';
    openModal('modal-adjust-stock');
}

async function submitStockAdjustment() {
    const sku = document.getElementById('adjust-sku').value;
    const rawQty = parseInt(document.getElementById('adjust-quantity').value, 10);
    const destination = document.getElementById('adjust-destination').value.trim();
    const reason = document.getElementById('adjust-reason').value.trim();

    if (isNaN(rawQty) || rawQty === 0) {
        alert('Please enter a non-zero adjustment quantity (+ to add, - to subtract).');
        return;
    }

    if (!reason) {
        alert('Adjustment reason is required for compliance and audit logging.');
        return;
    }

    const client_id = generateClientId();
    const payload = {
        sku: sku,
        quantity_change: rawQty,
        reason: reason,
        destination: destination || 'Central Store',
        client_id
    };

    if (!navigator.onLine) {
        await enqueueOfflineAction('STOCK_ADJUST', '/api/stock/adjust', payload);
        closeModal('modal-adjust-stock');
        showToast(`Offline: Stock adjustment queued for ${sku}`, 'warning');
        return;
    }

    try {
        const res = await apiFetch('/api/stock/adjust', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        closeModal('modal-adjust-stock');
        showToast(`Stock adjusted for ${sku}: Current quantity is ${res.current_quantity}`, 'success');
        fetchInventory();
        fetchStats();
        fetchMovements();
    } catch (e) {
        if (!navigator.onLine || e.message.includes('fetch') || e.message.includes('network')) {
            await enqueueOfflineAction('STOCK_ADJUST', '/api/stock/adjust', payload);
            closeModal('modal-adjust-stock');
            showToast(`Offline: Stock adjustment queued for ${sku}`, 'warning');
        } else {
            alert(`Failed to adjust stock: ${e.message}`);
        }
    }
}

// ==============================================
//  ADD & EDIT SPARE PART MODALS
// ==============================================
function openAddSpareModal() {
    const select = document.getElementById('new-part-supplier');
    if (select) {
        select.innerHTML = '<option value="">Select supplier</option>' + (state.cachedSuppliers || []).map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('');
    }
    openModal('modal-add-spare');
}

function generateNewPartSKU() {
    const catEl = document.getElementById('new-part-category');
    const cat = catEl ? catEl.value : 'MIG Welding';
    const prefixMap = {
        'MIG Welding': 'MIG',
        'TIG Welding': 'TIG',
        'Robotics Spares': 'ROB',
        'Welding Wire': 'WIR',
        'Safety & Accessories': 'SAF'
    };
    const prefix = prefixMap[cat] || (cat.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase() || 'ANI');

    let maxNum = 0;
    (state.cachedInventory || []).forEach(item => {
        if (!item || !item.sku) return;
        const skuUpper = item.sku.toUpperCase();
        if (skuUpper.startsWith(prefix)) {
            const match = skuUpper.match(/(\d+)$/);
            if (match) {
                const num = parseInt(match[1], 10);
                if (num > maxNum) maxNum = num;
            }
        }
    });

    const nextNum = maxNum > 0 ? maxNum + 1 : ((state.cachedInventory || []).filter(i => (i.category === cat || (i.sku && i.sku.toUpperCase().startsWith(prefix)))).length + 1);
    let candidate = `${prefix}-${String(nextNum).padStart(3, '0')}`;
    let counter = nextNum;
    const existing = new Set((state.cachedInventory || []).map(i => (i.sku || '').toUpperCase()));
    while (existing.has(candidate.toUpperCase())) {
        counter++;
        candidate = `${prefix}-${String(counter).padStart(3, '0')}`;
    }

    const skuInput = document.getElementById('new-part-sku');
    if (skuInput) skuInput.value = candidate;
    return candidate;
}

async function submitNewSparePart() {
    const name = document.getElementById('new-part-name').value.trim();
    const sku = document.getElementById('new-part-sku').value.trim();
    const category = document.getElementById('new-part-category').value;
    const unit = document.getElementById('new-part-unit').value.trim() || 'pcs';
    const compat = document.getElementById('new-part-compat').value.trim();
    const qtyInput = document.getElementById('new-part-qty');
    const quantity = parseInt(qtyInput ? qtyInput.value : '0', 10);
    const reorderInput = document.getElementById('new-part-reorder');
    const reorderLevel = parseInt(reorderInput ? reorderInput.value : '10', 10);
    const reorderQtyInput = document.getElementById('new-part-reorder-qty');
    const reorderQty = reorderQtyInput ? (parseInt(reorderQtyInput.value, 10) || 50) : 50;
    const cost = parseFloat(document.getElementById('new-part-cost').value) || 0.0;
    const price = parseFloat(document.getElementById('new-part-price').value) || 0.0;
    const location = document.getElementById('new-part-location').value.trim() || 'R1-B01';
    const supplier = (document.getElementById('new-part-supplier').value || '').trim();

    if (!name || !sku) {
        showToast('Please provide Part Description and unique SKU Code.', 'warning');
        return;
    }

    if (!supplier) {
        showToast('Please select a supplier for this part.', 'warning');
        return;
    }

    // Inline validation: SKU not already in state.cachedInventory
    const isDuplicate = (state.cachedInventory || []).some(item => (item.sku || '').toUpperCase() === sku.toUpperCase());
    if (isDuplicate) {
        showToast(`SKU "${sku}" already exists in inventory.`, 'error');
        return;
    }

    // Inline validation: quantity and reorder level >= 0
    if (isNaN(quantity) || quantity < 0) {
        showToast('Quantity must be greater than or equal to 0.', 'error');
        return;
    }
    if (isNaN(reorderLevel) || reorderLevel < 0) {
        showToast('Reorder level must be greater than or equal to 0.', 'error');
        return;
    }

    // Inline validation: warn if cost > selling price
    if (cost > price) {
        showToast('Warning: Unit cost is higher than selling price!', 'warning');
    }

    try {
        const res = await apiFetch('/api/items', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name, sku, category, unit,
                compatible_with: compat,
                quantity,
                reorder_level: reorderLevel,
                reorder_qty: reorderQty,
                unit_cost: cost,
                selling_price: price,
                location,
                supplier_id: supplier,
                hsn_code: (document.getElementById('new-part-hsn')?.value || '8466').trim(),
                gst_rate: parseFloat(document.getElementById('new-part-gst-rate')?.value || '18.0') || 18.0
            })
        });

        closeModal('modal-add-spare');
        showToast(`Successfully added ${sku} to catalog!`, 'success');
        await fetchInventory();
        fetchStats();

        // Open the new item's drawer
        const created = (state.cachedInventory || []).find(i => (i.sku || '').toUpperCase() === sku.toUpperCase() || (res && i.id === res.id));
        if (created) {
            openItemDrawer(created.id);
        } else if (res && res.id) {
            openItemDrawer(res.id);
        }
    } catch (e) {
        showToast(`Failed to add part: ${e.message}`, 'error');
    }
}

function openEditSpareModal(item) {
    document.getElementById('edit-part-id').value = item.id;
    document.getElementById('edit-part-name').value = item.name;
    document.getElementById('edit-part-sku').value = item.sku;
    document.getElementById('edit-part-category').value = item.category;
    document.getElementById('edit-part-cost').value = item.unit_cost || 0;
    document.getElementById('edit-part-price').value = item.selling_price || 0;
    document.getElementById('edit-part-reorder').value = item.reorder_level || 10;
    document.getElementById('edit-part-location').value = item.location || 'Central Store';
    const hsnEl = document.getElementById('edit-part-hsn');
    if (hsnEl) hsnEl.value = item.hsn_code || '8466';
    const gstEl = document.getElementById('edit-part-gst-rate');
    if (gstEl) gstEl.value = (item.gst_rate !== undefined && item.gst_rate !== null) ? item.gst_rate : 18.0;

    openModal('modal-edit-spare');
}

async function submitEditSparePart() {
    const id = document.getElementById('edit-part-id').value;
    const name = document.getElementById('edit-part-name').value.trim();
    const sku = document.getElementById('edit-part-sku').value.trim();
    const category = document.getElementById('edit-part-category').value;
    const cost = parseFloat(document.getElementById('edit-part-cost').value) || 0;
    const price = parseFloat(document.getElementById('edit-part-price').value) || 0;
    const reorder = parseInt(document.getElementById('edit-part-reorder').value, 10) || 10;
    const location = document.getElementById('edit-part-location').value.trim();

    try {
        await apiFetch(`/api/items/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name, sku, category, unit_cost: cost, selling_price: price, reorder_level: reorder, location,
                hsn_code: (document.getElementById('edit-part-hsn')?.value || '8466').trim(),
                gst_rate: parseFloat(document.getElementById('edit-part-gst-rate')?.value || '18.0') || 18.0
            })
        });

        closeModal('modal-edit-spare');
        showToast(`Updated part ${sku}!`, 'success');
        fetchInventory();
        fetchStats();
        if (state.selectedDrawerItem && state.selectedDrawerItem.id === parseInt(id, 10)) {
            openItemDrawer(parseInt(id, 10));
        }
    } catch (e) {
        alert(`Failed to update part: ${e.message}`);
    }
}

// ==============================================
//  CSV BULK IMPORT & SAMPLES
// ==============================================
function openImportCSVModal() {
    const fileInput = document.getElementById('csvFileInput');
    const resultBox = document.getElementById('importResultBox');
    if (fileInput) fileInput.value = '';
    if (resultBox) {
        resultBox.innerHTML = '';
        resultBox.style.display = 'none';
    }
    openModal('modal-import-csv');
}

function downloadImportSampleTemplate() {
    window.open('/api/import/sample', '_blank');
}

async function submitImportCSV() {
    const fileInput = document.getElementById('csvFileInput');
    const resultBox = document.getElementById('importResultBox');
    const btn = document.getElementById('importSubmitBtn');

    if (!fileInput.files || fileInput.files.length === 0) {
        alert('Please select a CSV file first.');
        return;
    }

    const file = fileInput.files[0];
    const reader = new FileReader();

    btn.disabled = true;
    btn.textContent = 'Importing...';

    reader.onload = async (e) => {
        const textContent = e.target.result;
        try {
            const res = await apiFetch('/api/import/csv', {
                method: 'POST',
                headers: { 'Content-Type': 'text/csv' },
                body: textContent
            });

            btn.disabled = false;
            btn.textContent = 'Start Import';

            if (resultBox) {
                resultBox.style.display = 'block';
                if (res.errors && res.errors.length > 0) {
                    resultBox.innerHTML = `
                        <div style="background:var(--status-critical-bg); color:var(--status-critical-text); padding:10px 14px; border-radius:6px; font-weight:700; font-size:12px; margin-bottom:10px;">
                            Imported ${res.imported} rows with ${res.errors.length} validation errors:
                        </div>
                        <table class="professional-table" style="font-size:11px;">
                            <thead><tr><th>Row</th><th>SKU</th><th>Validation Error</th></tr></thead>
                            <tbody>
                                ${res.errors.map(err => `
                                    <tr>
                                        <td><strong>#${err.row}</strong></td>
                                        <td><code>${escapeHtml(err.sku || '—')}</code></td>
                                        <td style="color:var(--accent-red);">${escapeHtml(err.error)}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    `;
                } else {
                    resultBox.innerHTML = `
                        <div style="background:var(--status-active-bg); color:var(--status-active-text); padding:12px 16px; border-radius:6px; font-weight:700; font-size:13px; text-align:center;">
                            ✅ Successfully imported and updated all ${res.imported} welding spares!
                        </div>
                    `;
                    setTimeout(() => {
                        closeModal('modal-import-csv');
                    }, 2000);
                }
            }

            fetchInventory();
            fetchStats();
        } catch (err) {
            btn.disabled = false;
            btn.textContent = 'Start Import';
            if (resultBox) {
                resultBox.style.display = 'block';
                resultBox.innerHTML = `<div style="background:var(--status-critical-bg); color:var(--status-critical-text); padding:10px; border-radius:6px; font-size:12px;">❌ ${err.message}</div>`;
            }
        }
    };

    reader.readAsText(file);
}

// ==============================================
//  QUICK REORDER & EXPORTS
// ==============================================
async function quickReorder(sku) {
    if (!confirm(`Generate automatic replenishment Purchase Order for ${sku}?`)) return;
    try {
        const res = await apiFetch('/api/inventory/reorder', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sku })
        });
        if (res.status === 'warning' || (res.message && res.message.startsWith('Already on'))) {
            showToast(res.message, 'warning');
        } else {
            showToast(res.message || `Draft Purchase Order ${res.po_number || res.po_id} raised for ${res.item || sku}!`, 'success');
        }
        fetchProcurement();
        fetchStats();
    } catch (e) {
        showToast(`Reorder failed: ${e.message}`, 'error');
    }
}

function exportLowStockReport(format) {
    if (format === 'pdf') {
        showToast('Generating official Low-Stock Replenishment PDF...', 'info');
        window.open('/api/export/low-stock/pdf', '_blank');
    } else if (format === 'excel') {
        showToast('Downloading Low-Stock Replenishment Excel Sheet...', 'info');
        window.location.href = '/api/export/low-stock/excel';
    } else if (format === 'csv') {
        showToast('Downloading Low-Stock Replenishment CSV Data...', 'info');
        window.location.href = '/api/export/low-stock/csv';
    }
}

function downloadValuationReport() {
    showToast('Compiling official Executive Inventory Valuation PDF...', 'info');
    window.open('/api/pdf/dashboard-report', '_blank');
}

function exportExcel(type = 'comprehensive') {
    showToast('Preparing multi-tab Excel audit workbook...', 'info');
    window.location.href = `/api/export/excel/${type}`;
}

function exportCSV(type) {
    showToast(`Exporting ${type} CSV log...`, 'info');
    window.location.href = `/api/export/csv/${type}`;
}

// ==============================================
//  AUDIT TRAIL TAB
// ==============================================
async function fetchAuditTrail() {
    try {
        const logs = await apiFetch('/api/audit');
        const tbody = document.getElementById('audit-table-body');
        if (!tbody) return;

        if (!logs || logs.length === 0) {
            tbody.innerHTML = renderEmptyTableState(5, '🔒', 'Audit Trail Empty', 'No ledger changes or inventory transactions have been logged yet.');
            return;
        }

        tbody.innerHTML = logs.map(l => `
            <tr>
                <td><span style="font-size:12px; color:var(--text-subtle);">${escapeHtml(l.timestamp)}</span></td>
                <td><strong>${escapeHtml(l.user)}</strong></td>
                <td><span style="background:rgba(0,35,75,0.08); padding:3px 8px; border-radius:4px; font-size:11px; font-weight:700; color:var(--brand-primary);">${escapeHtml(l.action)}</span></td>
                <td><code>${escapeHtml(l.target || l.target_id || '—')}</code></td>
                <td><span style="font-size:12px; color:var(--text-base);">${escapeHtml(l.details)}</span></td>
            </tr>
        `).join('');
    } catch (e) {
        console.error('Error fetching audit trail:', e);
    }
}

// ==============================================
//  AI COPILOT (GROQ LLM)
// ==============================================
function toggleAICopilot() {
    const panel = document.getElementById('aiCopilotPanel');
    if (panel) panel.classList.toggle('open');
}

// ─── Web Speech Recognition (Voice Input EN-IN & HI-IN) ─────────────
let speechRecognition = null;
let speechLang = 'en-IN';
let isListening = false;

function initSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const micBtn = document.getElementById('ai-mic-btn');
    if (!SpeechRecognition) {
        if (micBtn) micBtn.style.display = 'none';
        return;
    }
    if (micBtn) micBtn.style.display = 'inline-flex';

    try {
        speechRecognition = new SpeechRecognition();
        speechRecognition.continuous = false;
        speechRecognition.interimResults = false;
        speechRecognition.lang = speechLang;

        speechRecognition.onresult = (e) => {
            if (e.results && e.results[0] && e.results[0][0]) {
                const transcript = e.results[0][0].transcript;
                const inp = document.getElementById('ai-main-input');
                if (inp) inp.value = transcript;
            }
            isListening = false;
            updateMicBtnState();
        };

        speechRecognition.onend = () => {
            isListening = false;
            updateMicBtnState();
        };

        speechRecognition.onerror = (e) => {
            console.warn('Speech recognition error:', e);
            isListening = false;
            updateMicBtnState();
        };
    } catch (e) {
        console.warn('Speech recognition init failed:', e);
        if (micBtn) micBtn.style.display = 'none';
    }
}

function updateMicBtnState() {
    const micBtn = document.getElementById('ai-mic-btn');
    const label = document.getElementById('mic-lang-label');
    if (label) label.textContent = speechLang === 'en-IN' ? 'EN' : 'HI';
    if (micBtn) {
        if (isListening) {
            micBtn.style.borderColor = 'var(--out)';
            micBtn.style.color = 'var(--out)';
            micBtn.classList.add('pulse');
        } else {
            micBtn.style.borderColor = '';
            micBtn.style.color = '';
            micBtn.classList.remove('pulse');
        }
    }
}

function toggleSpeechRecognition() {
    if (!speechRecognition) return;
    if (isListening) {
        speechRecognition.stop();
        isListening = false;
        speechLang = speechLang === 'en-IN' ? 'hi-IN' : 'en-IN';
        speechRecognition.lang = speechLang;
        updateMicBtnState();
        return;
    }
    try {
        speechRecognition.lang = speechLang;
        speechRecognition.start();
        isListening = true;
        updateMicBtnState();
    } catch (e) {
        console.warn('Speech recognition start failed:', e);
        isListening = false;
        updateMicBtnState();
    }
}

function formatAIMessage(text) {
    if (!text) return '';
    return escapeHtml(text)
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/`([^`]+)`/g, '<code style="background:var(--bg-region); padding:1px 4px; border-radius:3px; font-size:11px;">$1</code>')
        .replace(/\n\n/g, '<br><br>')
        .replace(/\n- /g, '<br>• ')
        .replace(/\n/g, '<br>');
}

function renderProposedActionCard(action, containerId) {
    const container = document.getElementById(containerId);
    if (!container || !action) return;
    const actionId = 'proposed-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5);
    const div = document.createElement('div');
    div.id = actionId;
    div.className = 'ai-proposed-action-card';
    div.style.cssText = 'margin:10px 0 10px 24px; padding:12px 16px; background:rgba(255,191,0,0.08); border:1px solid rgba(255,191,0,0.4); border-radius:10px; font-size:12px;';
    
    const roleStr = (action.requires_role || []).join(' / ') || 'manager';
    const actionName = (action.action || 'Proposed Action').replace(/_/g, ' ').toUpperCase();

    div.innerHTML = `
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:6px;">
            <div style="display:flex; align-items:center; gap:8px;">
                <span style="background:rgba(255,191,0,0.25); color:var(--molten); padding:2px 8px; border-radius:8px; font-size:10px; font-weight:700;">⚡ PROPOSED WRITE ACTION</span>
                <strong style="font-size:12px; color:var(--text-primary);">${escapeHtml(actionName)}</strong>
            </div>
            <span class="text-subtle small" style="font-size:11px;">Requires: ${escapeHtml(roleStr)}</span>
        </div>
        <div style="margin-bottom:8px; color:var(--text-primary); line-height:1.4;">${escapeHtml(action.summary || '')}</div>
        <details style="margin-bottom:10px; font-size:11px;">
            <summary class="text-subtle" style="cursor:pointer; font-weight:600;">View Action Payload</summary>
            <pre style="font-size:10px; overflow-x:auto; padding:6px; background:var(--bg-region); border-radius:4px; margin-top:4px; border:1px solid var(--border);">${escapeHtml(JSON.stringify(action.payload || {}, null, 2))}</pre>
        </details>
        <div style="display:flex; gap:8px;" class="card-action-btns">
            <button class="btn btn-primary btn-xs" onclick="executeProposedAction('${actionId}')">✅ Approve & Execute</button>
            <button class="btn btn-ghost btn-xs" onclick="document.getElementById('${actionId}').remove()">✕ Cancel</button>
        </div>
    `;

    div._proposedActionData = action;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

async function executeProposedAction(actionId) {
    const card = document.getElementById(actionId);
    if (!card || !card._proposedActionData) return;
    const action = card._proposedActionData;

    const btn = card.querySelector('button.btn-primary');
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Executing...';
    }

    try {
        await apiFetch(action.endpoint, {
            method: action.method || 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Via-AI': 'true'
            },
            body: JSON.stringify(action.payload)
        });

        card.style.borderColor = 'rgba(16,185,129,0.5)';
        card.style.background = 'rgba(16,185,129,0.08)';
        const btnGroup = card.querySelector('.card-action-btns');
        if (btnGroup) {
            btnGroup.innerHTML = '<span style="color:var(--in); font-weight:700; font-size:11px;">✅ Executed via AI with audit trail!</span>';
        }
        showToast('Action executed successfully via AI!', 'success');

        if (typeof fetchStats === 'function') fetchStats();
        if (typeof fetchInventory === 'function') fetchInventory();
        if (typeof fetchProcurement === 'function') fetchProcurement();
        if (typeof fetchSalesOrders === 'function') fetchSalesOrders();
        if (typeof fetchCustomers === 'function') fetchCustomers();
    } catch (e) {
        showToast(`Failed to execute action: ${e.message}`, 'error');
        if (btn) {
            btn.disabled = false;
            btn.textContent = '✅ Approve & Execute';
        }
    }
}

async function loadAIUsageStats() {
    try {
        const data = await apiFetch('/api/ai/usage');
        const modelEl = document.getElementById('settings-ai-model');
        const statusEl = document.getElementById('settings-ai-status');
        const reqEl = document.getElementById('settings-ai-requests');
        const tokEl = document.getElementById('settings-ai-tokens');
        const topUserEl = document.getElementById('settings-ai-topuser');

        if (modelEl) modelEl.textContent = data.configured_model || 'llama-3.3-70b-versatile';
        if (reqEl) reqEl.textContent = (data.total_requests || 0).toLocaleString();
        if (tokEl) tokEl.textContent = (data.total_tokens || 0).toLocaleString() + ' tokens';

        if (topUserEl && data.by_user) {
            const entries = Object.entries(data.by_user);
            if (entries.length) {
                entries.sort((a, b) => b[1] - a[1]);
                topUserEl.textContent = `${entries[0][0]} (${entries[0][1].toLocaleString()} tok)`;
            } else {
                topUserEl.textContent = '—';
            }
        }

        const health = await apiFetch('/api/ai/health');
        if (statusEl) {
            const s = health.status || 'unknown';
            if (s === 'connected') {
                statusEl.innerHTML = '<span style="color:var(--in);">✅ Connected</span>';
            } else if (s === 'fallback_mode') {
                statusEl.innerHTML = '<span style="color:var(--molten);">🔶 Fallback Mode</span>';
            } else if (s === 'model_invalid') {
                statusEl.innerHTML = '<span style="color:var(--out);">❌ Model Invalid</span>';
            } else {
                statusEl.textContent = s;
            }
        }
    } catch (e) {
        console.warn('Failed to load AI usage stats:', e);
    }
}

async function sendMainAIMessage() {
    const input = document.getElementById('ai-main-input');
    const msg = input.value.trim();
    if (!msg) return;

    input.value = '';
    appendMessageToChat('ai-main-chat', msg, 'user');
    
    if (!state.mainChatHistory) state.mainChatHistory = [];
    state.mainChatHistory.push({ role: 'user', content: msg });
    if (state.mainChatHistory.length > 20) {
        state.mainChatHistory = state.mainChatHistory.slice(-20);
    }

    const container = document.getElementById('ai-main-chat');
    const msgDiv = document.createElement('div');
    msgDiv.className = 'ai-message assistant';
    const contentId = 'ai-stream-' + Date.now();
    msgDiv.innerHTML = `<div class="ai-msg-avatar">🤖</div><div class="ai-msg-content" id="${contentId}"><span class="ai-typing-cursor">▌</span></div>`;
    container.appendChild(msgDiv);
    container.scrollTop = container.scrollHeight;

    const contentEl = document.getElementById(contentId);
    let fullText = '';

    try {
        const token = sessionStorage.getItem('ss_token') || '';
        const response = await fetch('/api/ai/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'text/event-stream',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                message: msg,
                conversation_history: state.mainChatHistory.slice(-10),
                stream: true
            })
        });

        if (!response.ok) {
            let errDetail = response.statusText;
            try {
                const errJson = await response.json();
                errDetail = errJson.detail || errJson.message || errDetail;
            } catch (_) {}
            contentEl.innerHTML = `<span style="color:var(--out);">⚠️ Error: ${escapeHtml(errDetail)}</span>`;
            return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop();

            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed.startsWith('data: ')) continue;
                const jsonStr = trimmed.slice(6);
                try {
                    const event = JSON.parse(jsonStr);
                    if (event.type === 'token') {
                        fullText += event.content;
                        contentEl.innerHTML = formatAIMessage(fullText) + '<span class="ai-typing-cursor">▌</span>';
                        container.scrollTop = container.scrollHeight;
                    } else if (event.type === 'tool_call') {
                        const badge = document.createElement('div');
                        badge.className = 'ai-tool-badge';
                        badge.style.cssText = 'font-size:11px; color:var(--accent); font-style:italic; margin:4px 0; background:rgba(45,212,191,0.08); padding:2px 8px; border-radius:4px; display:inline-block;';
                        badge.textContent = `🔍 Tool: ${event.name || 'querying'}`;
                        contentEl.insertAdjacentElement('beforebegin', badge);
                        setTimeout(() => badge.remove(), 4000);
                    } else if (event.type === 'proposed_action') {
                        renderProposedActionCard(event.action, 'ai-main-chat');
                    } else if (event.type === 'done') {
                        contentEl.innerHTML = formatAIMessage(fullText || 'Action completed.');
                        state.mainChatHistory.push({ role: 'assistant', content: fullText });
                        if (state.mainChatHistory.length > 20) {
                            state.mainChatHistory = state.mainChatHistory.slice(-20);
                        }
                    }
                } catch (pe) {}
            }
        }

        if (contentEl.querySelector('.ai-typing-cursor')) {
            contentEl.innerHTML = formatAIMessage(fullText || 'Response received.');
        }

    } catch (err) {
        contentEl.innerHTML = `<span style="color:var(--out);">⚠️ Connection Error: ${escapeHtml(err.message)}</span>`;
    }
}

async function sendDrawerAIMessage() {
    const input = document.getElementById('aiChatInput');
    const msg = input.value.trim();
    if (!msg) return;

    input.value = '';
    appendMessageToChat('aiChatMessages', msg, 'user');
    const typingId = appendTypingIndicator('aiChatMessages');

    try {
        const res = await apiFetch('/api/ai/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: msg,
                conversation_history: state.drawerChatHistory
            })
        });

        removeTypingIndicator(typingId);
        const reply = res.response || '⚠️ Unable to process query.';
        appendMessageToChat('aiChatMessages', reply, 'assistant');
        state.drawerChatHistory.push({ role: 'user', content: msg });
        state.drawerChatHistory.push({ role: 'assistant', content: reply });
    } catch (e) {
        removeTypingIndicator(typingId);
        appendMessageToChat('aiChatMessages', `Error: ${e.message}`, 'assistant');
    }
}

function askAICopilot(query) {
    const input = document.getElementById('ai-main-input');
    if (input) {
        input.value = query;
        sendMainAIMessage();
    }
}

function appendMessageToChat(containerId, content, role) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const div = document.createElement('div');
    div.className = `ai-message ${role}`;
    const avatar = role === 'user' ? '👤' : '🤖';

    let formatted = escapeHtml(content)
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/\n\n/g, '<br><br>')
        .replace(/\n- /g, '<br>• ')
        .replace(/\n/g, '<br>');

    div.innerHTML = `
        <div class="ai-msg-avatar">${avatar}</div>
        <div class="ai-msg-content">${formatted}</div>
    `;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

function appendTypingIndicator(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return null;
    const id = 'typing-' + Math.random().toString(36).substr(2, 9);
    const div = document.createElement('div');
    div.id = id;
    div.className = 'ai-message assistant';
    div.innerHTML = `
        <div class="ai-msg-avatar">🤖</div>
        <div class="ai-msg-content" style="color:var(--text-subtle); font-style:italic;">
            Analyzing welding inventory and technical specs...
        </div>
    `;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
    return id;
}

function removeTypingIndicator(id) {
    if (!id) return;
    const el = document.getElementById(id);
    if (el) el.remove();
}

async function checkAIStatus() {
    try {
        const health = await apiFetch('/api/ai/health');
        const groqStatus = health.groq?.status || 'unknown';
        if (groqStatus === 'connected') {
            showToast('✅ Groq LLaMA 3.3 connected and operational.', 'success');
        } else if (groqStatus === 'demo_mode') {
            showToast('ℹ️ Running in built-in Anishka Welding AI mode.', 'info');
        } else {
            showToast(`⚠️ AI Status: ${health.groq?.error || 'Check configuration'}`, 'warning');
        }
    } catch (e) {
        showToast('Failed to check AI health', 'error');
    }
}

// ==============================================
//  SIMULATOR & SYSTEM SETTINGS
// ==============================================
async function initSimulatorStatus() {
    try {
        const res = await apiFetch('/api/simulator/status');
        state.simulatorRunning = !!res.simulator_running;
        updateLiveBadge(true);
    } catch (e) {
        console.warn('Failed to fetch simulator status:', e);
    }
}

async function toggleSimulator() {
    try {
        const res = await apiFetch('/api/simulator/toggle', { method: 'POST' });
        state.simulatorRunning = res.simulator_running;
        updateLiveBadge(true);
        showToast(`Live simulation is now ${state.simulatorRunning ? 'ACTIVE' : 'PAUSED'}`, 'info');
    } catch (e) {
        showToast(`Simulator toggle failed: ${e.message}`, 'warning');
    }
}

async function resetDemoCatalog() {
    if (!confirm('Reset inventory catalog to default factory welding spares?')) return;
    try {
        await apiFetch('/api/demo/reset', { method: 'POST' });
        closeModal('settings-modal');
        showToast('Factory catalog reset complete!', 'success');
        fetchAllData();
    } catch (e) {
        alert('Reset failed: ' + e.message);
    }
}

async function hardRefreshDemo(buttonEl) {
    if (!confirm("This resets all demo data to the starting state. Continue?")) return;

    const btn = buttonEl || document.getElementById('hardRefreshBtn');
    let originalHtml = '';
    if (btn) {
        originalHtml = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = `<span style="display:inline-block; animation:spin 1s linear infinite;">🔄</span> Resetting...`;
    }

    try {
        // (a) call the existing demo reset endpoint (POST /api/demo/reset) and show a progress state on the button
        await apiFetch('/api/demo/reset', { method: 'POST' });

        // (b) stop the simulator if it's running (existing stop endpoint)
        try {
            await apiFetch('/api/simulator/stop', { method: 'POST' });
            state.simulatorRunning = false;
            updateLiveBadge(false);
        } catch (simErr) {
            console.warn('Simulator stop notice:', simErr);
        }

        // (c) clear cached frontend state: the in-memory state/caches, notification bell items, activity feed, and any localStorage keys the app uses for filters or caches (but NOT the login token or theme preference)
        state.cachedInventory = [];
        state.cachedMovements = [];
        state.cachedPOs = [];
        state.cachedSuppliers = [];
        state.alerts = [];
        state.mainChatHistory = [];
        state.drawerChatHistory = [];
        state.selectedDrawerItem = null;
        state.selectedPO = null;
        state.poCreateItems = [];

        // Clear notification bell items
        const notifList = document.getElementById('notifList');
        if (notifList) notifList.innerHTML = '<div class="notif-empty">No active replenishment alerts</div>';
        const notifCount = document.getElementById('notifCount');
        if (notifCount) {
            notifCount.textContent = '0';
            notifCount.style.display = 'none';
        }

        // Clear activity feed
        const feed = document.getElementById('activityFeed');
        if (feed) {
            feed.innerHTML = '<li class="feed-event"><div class="feed-icon">⚡</div><div class="feed-content"><div class="feed-text">Telemetry reset to factory state.</div><div class="feed-time">Just now</div></div></li>';
        }

        // Clear localStorage keys except login token and theme preference
        const preservedKeys = ['ss_token', 'ss_user', 'anishka_theme'];
        const allKeys = Object.keys(localStorage);
        for (const key of allKeys) {
            if (!preservedKeys.includes(key)) {
                localStorage.removeItem(key);
            }
        }

        // (d) show a success toast ("Demo data reset"), then reload the page with location.reload() after about 800ms so every tab re-fetches fresh data
        showToast('Demo data reset', 'success');
        setTimeout(() => {
            window.location.reload();
        }, 800);

    } catch (e) {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalHtml;
        }
        showToast(`Reset failed: ${e.message}`, 'error');
    }
}

function openSettingsModal() {
    loadAutomationSettings();
    loadAIUsageStats();
    openModal('settings-modal');
}

function closeSettingsModal() {
    closeModal('settings-modal');
}

function update3DThemeSwitch(theme) {
    const btn = document.getElementById('themeToggle');
    if (!btn) return;
    const isLight = (theme === 'light');
    btn.setAttribute('aria-checked', isLight ? 'true' : 'false');
    btn.setAttribute('aria-label', `Toggle theme: currently ${isLight ? 'light' : 'dark'} mode`);
}

function init3DThemeToggleTilt() {
    const toggle = document.getElementById('themeToggle');
    if (!toggle) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    toggle.addEventListener('mousemove', (e) => {
        const rect = toggle.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;
        const tiltX = ((y - centerY) / centerY) * -12;
        const tiltY = ((x - centerX) / centerX) * 12;
        toggle.style.transform = `perspective(200px) rotateX(${tiltX}deg) rotateY(${tiltY}deg) scale(1.02)`;
    });

    toggle.addEventListener('mouseleave', () => {
        toggle.style.transform = '';
    });
}

function initTheme() {
    const savedTheme = localStorage.getItem('anishka_theme') || 'dark';
    const checkbox = document.getElementById('theme-toggle');
    if (savedTheme === 'light') {
        document.documentElement.setAttribute('data-theme', 'light');
        document.body.classList.remove('dark-theme');
        if (checkbox) checkbox.checked = false;
    } else {
        document.documentElement.setAttribute('data-theme', 'dark');
        document.body.classList.add('dark-theme');
        if (checkbox) checkbox.checked = true;
    }

    update3DThemeSwitch(savedTheme);

    // Restore sidebar state
    if (localStorage.getItem('sidebar_collapsed') === '1') {
        const appEl = document.querySelector('.app');
        if (appEl) appEl.classList.add('sidebar-collapsed');
    }
    setTimeout(updateNavIndicator, 200);

    // Initialize Card Tilt & 3D Theme Switch Tilt
    initCardTilt();
    init3DThemeToggleTilt();
}

function toggleTheme(event) {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

    // Trigger ripple animation on 3D switch
    const switchBtn = document.getElementById('themeToggle');
    if (switchBtn) {
        switchBtn.classList.remove('rippling');
        void switchBtn.offsetWidth; // trigger reflow
        switchBtn.classList.add('rippling');
        setTimeout(() => switchBtn.classList.remove('rippling'), 450);
    }

    const applyThemeDOM = () => {
        document.documentElement.setAttribute('data-theme', newTheme);
        if (newTheme === 'dark') {
            document.body.classList.add('dark-theme');
        } else {
            document.body.classList.remove('dark-theme');
        }

        const checkbox = document.getElementById('theme-toggle');
        if (checkbox) checkbox.checked = (newTheme === 'dark');

        update3DThemeSwitch(newTheme);
        localStorage.setItem('anishka_theme', newTheme);
        showToast(`Switched to ${newTheme === 'dark' ? 'Graphite Dark' : 'Steel Light'} theme`, 'info');

        // Rebuild charts with theme-specific text & grid colors
        if (state.charts) {
            Object.values(state.charts).forEach(c => {
                if (c && typeof c.destroy === 'function') c.destroy();
            });
            state.charts = {};
            initCharts();
            fetchStats();
        }
    };

    // Circular reveal transition if View Transitions API is available
    if (document.startViewTransition && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        let x = window.innerWidth / 2;
        let y = 0;
        if (event && event.clientX !== undefined) {
            x = event.clientX;
            y = event.clientY;
        } else if (switchBtn) {
            const rect = switchBtn.getBoundingClientRect();
            x = rect.left + rect.width / 2;
            y = rect.top + rect.height / 2;
        }

        const endRadius = Math.hypot(
            Math.max(x, window.innerWidth - x),
            Math.max(y, window.innerHeight - y)
        );

        const transition = document.startViewTransition(() => {
            applyThemeDOM();
        });

        transition.ready.then(() => {
            document.documentElement.animate(
                {
                    clipPath: [
                        `circle(0px at ${x}px ${y}px)`,
                        `circle(${endRadius}px at ${x}px ${y}px)`
                    ]
                },
                {
                    duration: 450,
                    easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
                    pseudoElement: '::view-transition-new(root)'
                }
            );
        }).catch(() => {
            // fallback if transition fails
        });
    } else {
        // Fallback: quick fade transition
        document.documentElement.classList.add('theme-transitioning');
        applyThemeDOM();
        setTimeout(() => {
            document.documentElement.classList.remove('theme-transitioning');
        }, 300);
    }
}

function openModal(modalId) {
    const el = document.getElementById(modalId);
    if (el) el.style.display = 'flex';
}

function closeModal(modalId) {
    const el = document.getElementById(modalId);
    if (el) el.style.display = 'none';
}

// ==============================================
//  COMMAND PALETTE (CTRL+K)
// ==============================================
function toggleCommandPalette() {
    const overlay = document.getElementById('cmd-palette-overlay');
    if (!overlay) return;
    if (overlay.classList.contains('open')) {
        closeCommandPalette();
    } else {
        openCommandPalette();
    }
}

function openCommandPalette() {
    const overlay = document.getElementById('cmd-palette-overlay');
    const input = document.getElementById('cmd-input');
    if (overlay) {
        overlay.classList.add('open');
        overlay.style.display = 'flex';
        renderCommandResults('');
        if (input) {
            input.value = '';
            setTimeout(() => input.focus(), 50);
        }
    }
}

function closeCommandPalette() {
    const overlay = document.getElementById('cmd-palette-overlay');
    if (overlay) {
        overlay.classList.remove('open');
        overlay.style.display = 'none';
    }
}

function handleCommandInput(query) {
    renderCommandResults(query ? query.trim().toLowerCase() : '');
}

function renderCommandResults(query) {
    const resultsContainer = document.getElementById('cmd-results');
    if (!resultsContainer) return;

    const navItems = [
        { label: 'Warehouse Command Dashboard', tab: 'dashboard', icon: '📊', sub: 'KPIs & Telemetry' },
        { label: 'Spares Inventory Catalog', tab: 'inventory', icon: '📦', sub: 'SKU Directory' },
        { label: 'Stock Movements & Dispatch Notes', tab: 'movements', icon: '🚚', sub: 'Inward / Outward' },
        { label: 'Purchase Orders & Inbound Deliveries', tab: 'procurement', icon: '📋', sub: 'Supplier POs' },
        { label: 'Authorized Supplier Directory', tab: 'suppliers', icon: '🏢', sub: 'Vendor Directory' },
        { label: 'Reports & Data Valuation Exports', tab: 'reports', icon: '📄', sub: 'PDF, Excel, CSV' },
        { label: 'Anishka AI Technical Copilot', tab: 'ai-assistant', icon: '⚡', sub: 'Technical Advisory' },
        { label: 'Immutable Audit Trail', tab: 'audit', icon: '🔒', sub: 'Compliance Log' }
    ];

    const actions = [
        { label: 'Record Stock In (GRN Receipt)', fn: 'openStockInModal()', icon: '📥', role: 'all' },
        { label: 'Issue Stock Out (Goods Dispatch Note)', fn: 'openStockOutModal()', icon: '📤', role: 'all' },
        { label: 'Add New Welding Spare to Catalog', fn: 'openAddSpareModal()', icon: '➕', role: 'manager' },
        { label: 'Create New Purchase Order', fn: 'openCreatePOModal()', icon: '📝', role: 'manager' },
        { label: 'Download Executive Stock Valuation PDF', fn: 'downloadValuationReport()', icon: '📊', role: 'all' },
        { label: 'Export Multi-Sheet Excel Ledger', fn: 'exportExcel("comprehensive")', icon: '📑', role: 'all' },
        { label: 'Reset Demo Data to Factory Defaults', fn: 'resetDemoCatalog()', icon: '⚡', role: 'admin' },
        { label: 'Hard Refresh (Reset Demo)', fn: 'hardRefreshDemo()', icon: '🔄', role: 'admin' }
    ];

    let html = '';

    // Filter Navigation
    const matchedTabs = navItems.filter(n => !query || n.label.toLowerCase().includes(query) || n.sub.toLowerCase().includes(query));
    if (matchedTabs.length > 0) {
        html += '<div class="cmd-section-label">Navigation Views</div>';
        matchedTabs.forEach(t => {
            html += `
                <div class="cmd-item" onclick="switchTab('${t.tab}'); closeCommandPalette();">
                    <span style="font-size:16px;">${t.icon}</span>
                    <span style="font-weight:600;">${t.label}</span>
                    <span class="cmd-item-sub">${t.sub}</span>
                </div>
            `;
        });
    }

    // Filter Actions
    const role = state.currentUser ? state.currentUser.role : 'storekeeper';
    const matchedActions = actions.filter(a => {
        if (a.role === 'admin' && role !== 'admin') return false;
        if (a.role === 'manager' && !['admin', 'manager'].includes(role)) return false;
        return !query || a.label.toLowerCase().includes(query);
    });

    if (matchedActions.length > 0) {
        html += '<div class="cmd-section-label" style="margin-top:8px;">Quick Operations</div>';
        matchedActions.forEach(a => {
            html += `
                <div class="cmd-item" onclick="${a.fn}; closeCommandPalette();">
                    <span style="font-size:16px;">${a.icon}</span>
                    <span style="font-weight:600;">${a.label}</span>
                </div>
            `;
        });
    }

    // Search Inventory
    if (query && state.cachedInventory && state.cachedInventory.length > 0) {
        const matchedItems = state.cachedInventory.filter(it => 
            it.sku.toLowerCase().includes(query) || it.name.toLowerCase().includes(query)
        ).slice(0, 5);

        if (matchedItems.length > 0) {
            html += '<div class="cmd-section-label" style="margin-top:8px;">Catalog Spares Matching "' + escapeHtml(query) + '"</div>';
            matchedItems.forEach(it => {
                html += `
                    <div class="cmd-item" onclick="openItemDrawer(${it.id}); closeCommandPalette();">
                        <span style="font-family:monospace; font-size:11px; color:var(--accent);">${escapeHtml(it.sku)}</span>
                        <span style="font-weight:600; margin-left:6px;">${escapeHtml(it.name)}</span>
                        <span class="cmd-item-sub">${it.quantity} on hand · ${it.status}</span>
                    </div>
                `;
            });
        }
    }

    if (!html) {
        html = '<div style="padding:24px; text-align:center; color:var(--text-subtle); font-size:13px;">No commands or spares matching "' + escapeHtml(query) + '"</div>';
    }

    resultsContainer.innerHTML = html;
}

// ==============================================
//  CARD TILT & MICRO-INTERACTIONS
// ==============================================
function initCardTilt() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    document.querySelectorAll('.stat-card, .bento-panel').forEach(card => {
        card.addEventListener('mousemove', e => {
            const rect = card.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            card.style.setProperty('--mouse-x', `${x}px`);
            card.style.setProperty('--mouse-y', `${y}px`);

            if (card.classList.contains('clickable')) {
                const centerX = rect.width / 2;
                const centerY = rect.height / 2;
                const rotateX = ((y - centerY) / centerY) * -4;
                const rotateY = ((x - centerX) / centerX) * 4;
                card.style.transform = `perspective(600px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-3px)`;
            }
        });

        card.addEventListener('mouseleave', () => {
            if (card.classList.contains('clickable')) {
                card.style.transform = '';
            }
            card.style.setProperty('--mouse-x', `-100px`);
            card.style.setProperty('--mouse-y', `-100px`);
        });
    });
}

// ==============================================
//  AUTOMATION ENGINE & RECEIVE MODAL HELPERS
// ==============================================

async function fetchAutomationStatus() {
    try {
        const data = await apiFetch('/api/automation/status');
        const cardStatus = document.getElementById('cardAutoStatus');
        const cardDrafted = document.getElementById('cardAutoDrafted');
        const cardNextRun = document.getElementById('cardAutoNextRun');
        if (cardStatus) {
            cardStatus.textContent = data.enabled ? '⚡ Active' : '⏸️ Paused';
            cardStatus.className = `trend-chip ${data.enabled ? 'trend-up' : 'trend-down'}`;
        }
        if (cardDrafted) {
            const draftedCount = (data.this_week_counts && data.this_week_counts.drafted !== undefined) 
                ? data.this_week_counts.drafted : (data.last_run ? data.last_run.drafted : 0);
            cardDrafted.textContent = `${draftedCount} Auto-POs`;
        }
        if (cardNextRun) {
            if (data.next_run) {
                const nr = new Date(data.next_run);
                cardNextRun.textContent = `Next: ${nr.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`;
            } else {
                cardNextRun.textContent = data.enabled ? 'Scan: scheduled' : 'Automation paused';
            }
        }
    } catch (e) {
        console.warn('[Automation] Status fetch failed:', e);
    }
}

async function loadAutomationSettings() {
    try {
        const s = await apiFetch('/api/settings/automation');
        const elReorder = document.getElementById('setting-auto-reorder');
        const elSmart = document.getElementById('setting-smart-qty');
        const elApprove = document.getElementById('setting-auto-approve');
        const elOverdue = document.getElementById('setting-overdue-alerts');
        const elInterval = document.getElementById('setting-scan-interval');
        const elSafety = document.getElementById('setting-safety-days');
        const elLimit = document.getElementById('setting-approve-limit');
        const elRating = document.getElementById('setting-min-rating');

        if (elReorder) elReorder.checked = !!s.auto_reorder_enabled;
        if (elSmart) elSmart.checked = !!s.smart_qty_enabled;
        if (elApprove) elApprove.checked = !!s.auto_approve_enabled;
        if (elOverdue) elOverdue.checked = !!s.overdue_alerts_enabled;
        if (elInterval) elInterval.value = s.scan_interval_minutes || 5;
        if (elSafety) elSafety.value = s.safety_days !== undefined ? s.safety_days : 14;
        if (elLimit) elLimit.value = s.auto_approve_limit !== undefined ? s.auto_approve_limit : 25000;
        if (elRating) elRating.value = s.auto_approve_min_supplier_rating !== undefined ? s.auto_approve_min_supplier_rating : 4.0;
        const elEmail = document.getElementById('setting-email-approval');
        const elDigest = document.getElementById('setting-digest-time');
        if (elEmail) elEmail.checked = s.email_on_approval !== undefined ? !!s.email_on_approval : true;
        if (elDigest) elDigest.value = s.digest_time || '08:00';

        // Load Service Level & Safety Stock settings
        try {
            const slRes = await apiFetch('/api/settings/service-level');
            if (slRes.service_level && document.getElementById('setting-service-level')) {
                document.getElementById('setting-service-level').value = slRes.service_level;
            }
            if (slRes.safety_stock_method && document.getElementById('setting-safety-method')) {
                document.getElementById('setting-safety-method').value = slRes.safety_stock_method;
            }
        } catch (err) {
            console.warn('Error loading service level settings:', err);
        }
    } catch (e) {
        console.warn('[Settings] Failed to load automation settings:', e);
    }
}

async function saveAutomationSettings() {
    try {
        const payload = {
            auto_reorder_enabled: document.getElementById('setting-auto-reorder')?.checked ?? true,
            smart_qty_enabled: document.getElementById('setting-smart-qty')?.checked ?? true,
            auto_approve_enabled: document.getElementById('setting-auto-approve')?.checked ?? false,
            overdue_alerts_enabled: document.getElementById('setting-overdue-alerts')?.checked ?? true,
            scan_interval_minutes: parseInt(document.getElementById('setting-scan-interval')?.value) || 5,
            safety_days: parseInt(document.getElementById('setting-safety-days')?.value) || 14,
            auto_approve_limit: parseFloat(document.getElementById('setting-approve-limit')?.value) || 25000,
            auto_approve_min_supplier_rating: parseFloat(document.getElementById('setting-min-rating')?.value) || 4.0,
            email_on_approval: document.getElementById('setting-email-approval')?.checked ?? true,
            digest_time: document.getElementById('setting-digest-time')?.value || '08:00'
        };
        await apiFetch('/api/settings/automation', {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
        });

        // Save Service Level Setting
        const slVal = document.getElementById('setting-service-level')?.value || '95%';
        const smVal = document.getElementById('setting-safety-method')?.value || 'safety_days';
        await apiFetch('/api/settings/service-level', {
            method: 'POST',
            body: JSON.stringify({ service_level: slVal, safety_stock_method: smVal })
        });
        showToast('Automation settings saved successfully!', 'success');
        fetchAutomationStatus();
    } catch (e) {
        showToast(`Failed to save settings: ${e.message}`, 'error');
    }
}

async function runAutomationNow(btn) {
    const origText = btn ? btn.textContent : '⚡ Run Now';
    if (btn) { btn.disabled = true; btn.textContent = 'Running...'; }
    try {
        const res = await apiFetch('/api/automation/run-now', { method: 'POST' });
        showToast(`Cycle complete: ${res.scanned} scanned, ${res.drafted} drafted, ${res.auto_approved} approved, ${res.overdue} overdue.`, 'success');
        fetchProcurement();
        fetchStats();
        fetchAutomationStatus();
    } catch (e) {
        showToast(`Automation run failed: ${e.message}`, 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = origText; }
    }
}

function openPOReceiveModal() {
    if (!state.selectedPO) return;
    const po = state.selectedPO;
    const titleEl = document.getElementById('poReceiveModalTitle');
    if (titleEl) titleEl.textContent = `📥 Receive GRN: ${po.po_number || po.id}`;
    const tbody = document.getElementById('poReceiveItemsBody');
    if (tbody) {
        tbody.innerHTML = (po.items || []).map(it => {
            const outstanding = it.outstanding_qty !== undefined ? it.outstanding_qty : Math.max(0, it.qty - (it.received_qty || 0));
            return `<tr>
                <td><code>${escapeHtml(it.sku || '—')}</code></td>
                <td>${escapeHtml(it.name || 'Spare')}</td>
                <td>${it.qty}</td>
                <td>${it.received_qty || 0}</td>
                <td><strong>${outstanding}</strong></td>
                <td><input type="number" class="po-receive-qty" data-item-id="${it.item_id}" value="${outstanding}" min="0" max="${outstanding}" style="width:75px; padding:4px 8px; border-radius:4px; border:1px solid var(--border-medium); background:var(--bg-card); color:var(--text-heading);"></td>
            </tr>`;
        }).join('');
    }
    openModal('modal-po-receive');
}

async function submitPOReceiveItems() {
    if (!state.selectedPO) return;
    const rows = document.querySelectorAll('.po-receive-qty');
    const items = Array.from(rows).map(inp => ({
        item_id: parseInt(inp.dataset.itemId),
        qty_received: parseInt(inp.value) || 0
    })).filter(r => r.qty_received > 0);

    if (items.length === 0) {
        showToast('Please enter a received quantity greater than 0 for at least one item.', 'warning');
        return;
    }

    try {
        const res = await apiFetch(`/api/procurement/${state.selectedPO.id}/receive`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ items })
        });
        showToast(`Stock received. PO status: ${res.new_status}`, 'success');
        closeModal('modal-po-receive');
        closeModal('modal-po-detail');
        fetchProcurement();
        fetchInventory();
        fetchStats();
    } catch (e) {
        showToast(`Receipt failed: ${e.message}`, 'error');
    }
}

// ==============================================
//  AUTOMATION EXTRAS (OUTBOX, DIGEST, REORDER REVIEW, DEAD STOCK)
// ==============================================

async function fetchDailyDigestCard() {
    try {
        const d = await apiFetch('/api/digest/latest');
        const dateEl = document.getElementById('cardDigestDate');
        const statusEl = document.getElementById('cardDigestStatus');
        const subEl = document.getElementById('cardDigestSub');
        if (dateEl && d.date) dateEl.textContent = `📅 ${d.date}`;
        if (statusEl) statusEl.textContent = 'Briefing Ready';
        if (subEl) subEl.textContent = `Status: ${d.status_label || 'Ready'}`;
    } catch (e) {
        console.warn('Failed to fetch digest card:', e);
    }
}

async function openDailyDigestModal() {
    try {
        const d = await apiFetch('/api/digest/latest');
        const titleEl = document.getElementById('dailyDigestModalTitle');
        const dateEl = document.getElementById('dailyDigestModalDate');
        const bodyEl = document.getElementById('dailyDigestBody');
        if (titleEl) titleEl.textContent = `📋 Daily Operations & Inventory Digest (${d.date || 'Today'})`;
        if (dateEl) dateEl.textContent = `Status: ${d.status_label || 'SIMULATED'} · Generated: ${d.created_at || '—'}`;
        if (bodyEl) bodyEl.textContent = d.body || 'No summary text available.';
        openModal('modal-daily-digest');
    } catch (e) {
        showToast(`Failed to load daily digest: ${e.message}`, 'error');
    }
}

async function runDailyDigestNow(btn) {
    const orig = btn ? btn.textContent : '⚡ Run Digest Now';
    if (btn) { btn.disabled = true; btn.textContent = 'Generating...'; }
    try {
        const res = await apiFetch('/api/digest/run-now', { method: 'POST' });
        showToast('Daily operations digest generated and logged in Outbox!', 'success');
        openDailyDigestModal();
        fetchDailyDigestCard();
    } catch (e) {
        showToast(`Digest run failed: ${e.message}`, 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = orig; }
    }
}

async function openOutboxModal() {
    openModal('modal-email-outbox');
    fetchOutboxMessages();
}

async function fetchOutboxMessages() {
    const tbody = document.getElementById('outboxTableBody');
    if (!tbody) return;
    try {
        const list = await apiFetch('/api/outbox');
        if (!list || list.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:14px;" class="text-subtle">No outbound emails logged in outbox yet.</td></tr>';
            return;
        }
        tbody.innerHTML = list.map(m => {
            let statusColor = '#3b82f6';
            if (m.status === 'SENT') statusColor = '#10b981';
            else if (m.status === 'FAILED') statusColor = '#ef4444';
            else if (m.status === 'SIMULATED') statusColor = '#8b5cf6';

            const statusBadge = `<span style="background:${statusColor}22; color:${statusColor}; padding:2px 8px; border-radius:12px; font-size:11px; font-weight:700;">${m.status}</span>`;
            const poBadge = m.related_po ? `<code style="font-size:11px; color:var(--brand-primary);">${escapeHtml(m.related_po)}</code>` : '<span class="text-subtle">—</span>';
            const att = m.attachment_name ? `📎 ${escapeHtml(m.attachment_name)}` : '<span class="text-subtle">—</span>';

            return `<tr>
                <td><small style="color:var(--text-subtle);">${m.id}</small></td>
                <td><small>${escapeHtml(m.created_at || '—')}</small></td>
                <td><strong>${escapeHtml(m.to_email || '—')}</strong></td>
                <td><div style="font-size:12px; max-width:260px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${escapeHtml(m.subject)}">${escapeHtml(m.subject || '—')} ${poBadge}</div></td>
                <td><small>${att}</small></td>
                <td>${statusBadge}</td>
                <td style="text-align:right;">
                    <div style="display:flex; gap:4px; justify-content:flex-end;">
                        <button class="btn btn-xs btn-outline" onclick="openOutboxPreview(${m.id})">Preview</button>
                        <button class="btn btn-xs btn-ghost role-manager-admin" onclick="resendOutboxItem(${m.id}, this)" title="Re-dispatch message">🔄 Resend</button>
                    </div>
                </td>
            </tr>`;
        }).join('');
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:12px; color:var(--out);">Failed to load outbox: ${escapeHtml(e.message)}</td></tr>`;
    }
}

async function openOutboxPreview(id) {
    try {
        const list = await apiFetch('/api/outbox');
        const item = (list || []).find(m => m.id === id);
        if (!item) return;

        const subjEl = document.getElementById('previewOutboxSubject');
        const toEl = document.getElementById('previewOutboxRecipient');
        const stEl = document.getElementById('previewOutboxStatus');
        const dtEl = document.getElementById('previewOutboxDate');
        const bodyEl = document.getElementById('previewOutboxBody');

        if (subjEl) subjEl.textContent = item.subject || 'Email Preview';
        if (toEl) toEl.textContent = `To: ${item.to_email || '—'}`;
        if (stEl) stEl.textContent = item.status;
        if (dtEl) dtEl.textContent = item.created_at || '—';
        if (bodyEl) bodyEl.textContent = item.body || '(Empty body)';

        openModal('modal-outbox-preview');
    } catch (e) {
        showToast(`Failed to load message: ${e.message}`, 'error');
    }
}

async function resendOutboxItem(id, btn) {
    const orig = btn ? btn.textContent : '🔄 Resend';
    if (btn) { btn.disabled = true; btn.textContent = '...'; }
    try {
        const res = await apiFetch(`/api/outbox/${id}/resend`, { method: 'POST' });
        showToast(`Outbox item ${id} re-processed. Status: ${res.new_status}`, 'success');
        fetchOutboxMessages();
    } catch (e) {
        showToast(`Resend failed: ${e.message}`, 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = orig; }
    }
}

async function applyDrawerSuggestedReorder() {
    if (!state.selectedDrawerItem || state.selectedDrawerItemSuggestedReorder === undefined) return;
    const itemId = state.selectedDrawerItem.id;
    const newLevel = state.selectedDrawerItemSuggestedReorder;
    try {
        await apiFetch(`/api/items/${itemId}`, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ reorder_level: newLevel })
        });
        showToast(`Reorder level updated to ${newLevel} for ${state.selectedDrawerItem.sku}`, 'success');
        state.selectedDrawerItem.reorder_level = newLevel;
        const reorderEl = document.getElementById('drawerReorder');
        if (reorderEl) reorderEl.textContent = newLevel;
        const btnEl = document.getElementById('drawerApplyReorderBtn');
        if (btnEl) btnEl.style.display = 'none';
        const txtEl = document.getElementById('drawerSuggestedReorderText');
        if (txtEl) txtEl.innerHTML = `Suggested: <strong>${newLevel}</strong> (current <strong>${newLevel}</strong>) ✓ Updated`;
        fetchInventory();
    } catch (e) {
        showToast(`Failed to update reorder level: ${e.message}`, 'error');
    }
}

async function openReorderReviewModal() {
    openModal('modal-reorder-review');
    const tbody = document.getElementById('reorderReviewTableBody');
    if (!tbody) return;
    try {
        const res = await apiFetch('/api/inventory/reorder-level-suggestions');
        const items = res.items || [];
        if (items.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:14px;" class="text-subtle">All catalog items have well-aligned reorder levels (&lt;25% variance).</td></tr>';
            return;
        }
        tbody.innerHTML = items.map(it => {
            const diffClass = it.diff > 0 ? 'text-danger' : 'text-primary';
            const diffSign = it.diff > 0 ? `+${it.diff}` : `${it.diff}`;
            const pctSign = it.diff_pct > 0 ? `+${it.diff_pct}%` : `${it.diff_pct}%`;

            return `<tr>
                <td><code>${escapeHtml(it.sku)}</code></td>
                <td><strong>${escapeHtml(it.name)}</strong></td>
                <td>${it.avg_daily_out_30d} /day</td>
                <td><strong>${it.current_reorder_level}</strong></td>
                <td><strong style="color:var(--brand-primary);">${it.suggested_reorder_level}</strong></td>
                <td><span style="font-weight:700;" class="${diffClass}">${pctSign} (${diffSign})</span></td>
                <td style="text-align:right;">
                    <button class="btn btn-xs btn-primary role-manager-admin" onclick="applyReviewItemReorder(${it.item_id}, ${it.suggested_reorder_level}, '${escapeHtml(it.sku)}', this)">Apply ${it.suggested_reorder_level}</button>
                </td>
            </tr>`;
        }).join('');
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:12px; color:var(--out);">Failed to load suggestions: ${escapeHtml(e.message)}</td></tr>`;
    }
}

async function applyReviewItemReorder(itemId, newLevel, sku, btn) {
    if (btn) { btn.disabled = true; btn.textContent = 'Updating...'; }
    try {
        await apiFetch(`/api/items/${itemId}`, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ reorder_level: newLevel })
        });
        showToast(`Reorder level for ${sku} updated to ${newLevel}!`, 'success');
        if (btn) { btn.textContent = 'Applied ✓'; btn.className = 'btn btn-xs btn-emerald'; }
        fetchInventory();
    } catch (e) {
        showToast(`Failed: ${e.message}`, 'error');
        if (btn) { btn.disabled = false; btn.textContent = `Apply ${newLevel}`; }
    }
}

async function fetchDeadStock() {
    const tbody = document.getElementById('deadStockTableBody');
    const subhead = document.getElementById('deadStockSubhead');
    if (!tbody) return;
    try {
        const data = await apiFetch('/api/inventory/dead-stock');
        if (subhead) {
            subhead.textContent = `${data.count} dead stock SKUs identified · ₹${Number(data.total_tied_up_value || 0).toLocaleString('en-IN', {minimumFractionDigits: 2})} total working capital tied up`;
        }
        const items = data.items || [];
        if (items.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:14px;" class="text-subtle">No dead stock detected. All catalog spares have active inventory velocity.</td></tr>';
            return;
        }
        tbody.innerHTML = items.map(it => {
            let actionBadge = '<span style="background:rgba(239,68,68,0.12); color:#ef4444; padding:3px 8px; border-radius:12px; font-size:11px; font-weight:700;">Return to Supplier</span>';
            if (it.suggested_action.includes('Discount') || it.suggested_action.includes('Clearance')) {
                actionBadge = '<span style="background:rgba(245,158,11,0.12); color:#f59e0b; padding:3px 8px; border-radius:12px; font-size:11px; font-weight:700;">Clearance Discount</span>';
            } else if (it.suggested_action.includes('Bundle')) {
                actionBadge = '<span style="background:rgba(59,130,246,0.12); color:#3b82f6; padding:3px 8px; border-radius:12px; font-size:11px; font-weight:700;">Bundle Fast-Mover</span>';
            }

            return `<tr>
                <td><code>${escapeHtml(it.sku)}</code></td>
                <td><strong>${escapeHtml(it.name)}</strong></td>
                <td>${escapeHtml(it.category)}</td>
                <td>${it.quantity}</td>
                <td>${formatINR(it.unit_cost)}</td>
                <td><strong style="color:var(--out);">${formatINR(it.tied_up_value)}</strong></td>
                <td><strong>${it.days_idle} days</strong></td>
                <td>${actionBadge}</td>
            </tr>`;
        }).join('');
    } catch (e) {
        if (tbody) tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:12px; color:var(--out);">Failed to load dead stock: ${escapeHtml(e.message)}</td></tr>`;
    }
}

function downloadDeadStockCSV() {
    window.location.href = '/api/export/dead-stock/csv';
}


// ==============================================
//  SALES & CUSTOMERS MODULE
// ==============================================

state.cachedCustomers = [];
state.cachedSalesOrders = [];
state.cachedInvoices = [];
state.activeSalesSubtab = 'orders';
state.selectedSO = null;
state.currentSOFilter = 'ALL';
state.currentInvFilter = 'ALL';

function updateReceivablesAgeingCard(ageing) {
    if (!ageing) return;
    const b030 = document.getElementById('ageing-bucket-0-30');
    const b3160 = document.getElementById('ageing-bucket-31-60');
    const b60p = document.getElementById('ageing-bucket-60-plus');
    const btot = document.getElementById('ageing-total-outstanding');

    if (b030) b030.textContent = formatINR(ageing.bucket_0_30 || 0);
    if (b3160) b3160.textContent = formatINR(ageing.bucket_31_60 || 0);
    if (b60p) b60p.textContent = formatINR(ageing.bucket_60_plus || 0);
    if (btot) btot.textContent = formatINR(ageing.total_outstanding || 0);
}

function switchSalesSubtab(tab) {
    state.activeSalesSubtab = tab;
    const btnOrders = document.getElementById('btn-subtab-orders');
    const btnInvoices = document.getElementById('btn-subtab-invoices');
    const btnOpps = document.getElementById('btn-subtab-opportunities');
    const viewOrders = document.getElementById('sales-orders-subview');
    const viewInvoices = document.getElementById('sales-invoices-subview');
    const viewOpps = document.getElementById('sales-opportunities-subview');

    [btnOrders, btnInvoices, btnOpps].forEach(b => b && b.classList.remove('active'));
    [viewOrders, viewInvoices, viewOpps].forEach(v => v && (v.style.display = 'none'));

    if (tab === 'orders') {
        if (btnOrders) btnOrders.classList.add('active');
        if (viewOrders) viewOrders.style.display = 'block';
        fetchSalesOrders();
    } else if (tab === 'invoices') {
        if (btnInvoices) btnInvoices.classList.add('active');
        if (viewInvoices) viewInvoices.style.display = 'block';
        fetchInvoices();
    } else if (tab === 'opportunities') {
        if (btnOpps) btnOpps.classList.add('active');
        if (viewOpps) viewOpps.style.display = 'block';
        fetchOpportunities();
    }
}

// --- Sales Orders ---
async function fetchSalesOrders(status = null) {
    try {
        const url = status && status !== 'ALL' ? `/api/sales/orders?status=${encodeURIComponent(status)}` : '/api/sales/orders';
        const orders = await apiFetch(url);
        state.cachedSalesOrders = orders || [];
        renderSalesOrdersTable(state.cachedSalesOrders);
    } catch (e) {
        console.error('Failed to fetch sales orders:', e);
        const tbody = document.getElementById('sales-orders-table-body');
        if (tbody) tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:16px; color:var(--out);">Failed to load sales orders: ${escapeHtml(e.message)}</td></tr>`;
    }
}

function filterSOByStatus(status, btn) {
    state.currentSOFilter = status;
    document.querySelectorAll('.so-filter-pill').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    fetchSalesOrders(status);
}

function filterSalesOrders() {
    const q = (document.getElementById('so-search-input')?.value || '').toLowerCase().trim();
    if (!q) {
        renderSalesOrdersTable(state.cachedSalesOrders);
        return;
    }
    const filtered = state.cachedSalesOrders.filter(o => 
        (o.order_no || '').toLowerCase().includes(q) ||
        (o.customer_name || '').toLowerCase().includes(q)
    );
    renderSalesOrdersTable(filtered);
}

function getSOStatusBadge(status) {
    const s = (status || '').toUpperCase();
    if (s === 'QUOTE') return '<span class="status-badge" style="background:rgba(148,163,184,0.15); color:var(--text-secondary); border:1px solid var(--border-subtle);">QUOTE</span>';
    if (s === 'CONFIRMED') return '<span class="status-badge" style="background:rgba(59,130,246,0.15); color:#3b82f6; border:1px solid #3b82f6;">CONFIRMED</span>';
    if (s === 'PARTIALLY_DISPATCHED') return '<span class="status-badge" style="background:rgba(245,158,11,0.15); color:#f59e0b; border:1px solid #f59e0b;">PART. DISPATCHED</span>';
    if (s === 'DISPATCHED') return '<span class="status-badge" style="background:rgba(16,185,129,0.15); color:#10b981; border:1px solid #10b981;">DISPATCHED</span>';
    if (s === 'INVOICED') return '<span class="status-badge" style="background:rgba(139,92,246,0.15); color:#8b5cf6; border:1px solid #8b5cf6;">INVOICED</span>';
    if (s === 'CANCELLED') return '<span class="status-badge" style="background:rgba(239,68,68,0.15); color:#ef4444; border:1px solid #ef4444;">CANCELLED</span>';
    return `<span class="status-badge">${escapeHtml(s)}</span>`;
}

function renderSalesOrdersTable(orders) {
    const tbody = document.getElementById('sales-orders-table-body');
    if (!tbody) return;

    if (!orders || orders.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:20px;" class="text-subtle">No sales orders or quotations found.</td></tr>';
        return;
    }

    tbody.innerHTML = orders.map(o => {
        const dateStr = (o.created_at || '').substring(0, 10);
        const itemCount = (o.items || []).length;
        return `<tr>
            <td><strong><code>${escapeHtml(o.order_no)}</code></strong></td>
            <td>${escapeHtml(dateStr)}</td>
            <td>
                <div style="font-weight:600;">${escapeHtml(o.customer_name || 'Customer #' + o.customer_id)}</div>
                <div class="text-subtle small">${escapeHtml(o.customer_gstin || '')}</div>
            </td>
            <td>${itemCount} spare line${itemCount === 1 ? '' : 's'}</td>
            <td style="text-align:right; font-weight:700;">${formatINR(o.total_amount || 0)}</td>
            <td>${getSOStatusBadge(o.status)}</td>
            <td style="text-align:right;">
                <div style="display:flex; gap:6px; justify-content:flex-end;">
                    <button class="btn btn-xs btn-outline" onclick="openSODetailModal(${o.id})">Inspect</button>
                    <button class="btn btn-xs btn-outline" onclick="downloadSOQuotePDF(${o.id})" title="Quotation PDF">📄 Quote</button>
                    ${(o.status === 'CONFIRMED' || o.status === 'PARTIALLY_DISPATCHED') ? 
                        `<button class="btn btn-xs btn-emerald" onclick="openSODetailModal(${o.id}, true)">Dispatch</button>` : ''}
                </div>
            </td>
        </tr>`;
    }).join('');
}

// --- Create Sales Order / Quote Modal ---
function openCreateSOModal(isQuote = false) {
    const titleEl = document.getElementById('modal-so-title');
    const docTypeEl = document.getElementById('so-doc-type');
    const isQuoteEl = document.getElementById('so-is-quote');
    const submitBtn = document.getElementById('btn-submit-so');

    if (isQuote) {
        if (titleEl) titleEl.textContent = '📝 New Commercial Quotation';
        if (docTypeEl) docTypeEl.value = 'QUOTE';
        if (isQuoteEl) isQuoteEl.value = 'true';
        if (submitBtn) submitBtn.textContent = 'Generate Quotation';
    } else {
        if (titleEl) titleEl.textContent = '🛒 New Sales Order (Direct)';
        if (docTypeEl) docTypeEl.value = 'ORDER';
        if (isQuoteEl) isQuoteEl.value = 'false';
        if (submitBtn) submitBtn.textContent = 'Confirm & Place Order';
    }

    // Populate customer dropdown
    populateSOCustomerSelect();

    // Reset lines
    const tbody = document.getElementById('so-lines-body');
    if (tbody) tbody.innerHTML = '';
    addSOLineRow(); // add at least one line

    // Reset notes and valid until (default 30 days)
    const validUntilEl = document.getElementById('so-valid-until');
    if (validUntilEl) {
        const d = new Date();
        d.setDate(d.getDate() + 30);
        validUntilEl.value = d.toISOString().split('T')[0];
    }
    const notesEl = document.getElementById('so-notes');
    if (notesEl) notesEl.value = '';

    updateSOGrandTotals();
    openModal('modal-create-so');
}

function onSODocTypeChange() {
    const docType = document.getElementById('so-doc-type')?.value;
    const isQuoteEl = document.getElementById('so-is-quote');
    const submitBtn = document.getElementById('btn-submit-so');
    const titleEl = document.getElementById('modal-so-title');

    if (docType === 'QUOTE') {
        if (isQuoteEl) isQuoteEl.value = 'true';
        if (submitBtn) submitBtn.textContent = 'Generate Quotation';
        if (titleEl) titleEl.textContent = '📝 New Commercial Quotation';
    } else {
        if (isQuoteEl) isQuoteEl.value = 'false';
        if (submitBtn) submitBtn.textContent = 'Confirm & Place Order';
        if (titleEl) titleEl.textContent = '🛒 New Sales Order (Direct)';
    }
}

function populateSOCustomerSelect() {
    const sel = document.getElementById('so-customer-id');
    if (!sel) return;
    sel.innerHTML = '<option value="">Select customer...</option>' + 
        (state.cachedCustomers || []).map(c => 
            `<option value="${c.id}">${escapeHtml(c.name)} (${escapeHtml(c.city)}, ${escapeHtml(c.state)})</option>`
        ).join('');
}

function onSOCustomerChange() {
    const custId = parseInt(document.getElementById('so-customer-id')?.value || '0', 10);
    const infoEl = document.getElementById('so-customer-credit-info');
    if (!infoEl) return;

    if (!custId) {
        infoEl.style.display = 'none';
        return;
    }

    const c = (state.cachedCustomers || []).find(x => x.id === custId);
    if (!c) {
        infoEl.style.display = 'none';
        return;
    }

    const availCredit = Math.max(0, (c.credit_limit || 0) - (c.outstanding || 0));
    infoEl.style.display = 'block';
    infoEl.innerHTML = `<strong>Customer:</strong> ${escapeHtml(c.name)} | <strong>GSTIN:</strong> ${escapeHtml(c.gstin)} | <strong>State:</strong> ${escapeHtml(c.state)} | <strong>Credit Limit:</strong> ${formatINR(c.credit_limit)} | <strong>Available Credit:</strong> <span style="color:${availCredit > 0 ? 'var(--in)' : 'var(--out)'}; font-weight:700;">${formatINR(availCredit)}</span>`;
}

function addSOLineRow() {
    const tbody = document.getElementById('so-lines-body');
    if (!tbody) return;

    const rowId = 'so-line-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
    const tr = document.createElement('tr');
    tr.id = rowId;

    const itemsOptions = (state.cachedInventory || []).map(item => {
        const avail = (item.quantity || 0) - (item.reserved_qty || 0);
        return `<option value="${item.id}" data-price="${item.selling_price || 0}" data-gst="${item.gst_rate ?? 18.0}" data-avail="${avail}">
            ${escapeHtml(item.sku)} - ${escapeHtml(item.name)} (Avail: ${avail})
        </option>`;
    }).join('');

    tr.innerHTML = `
        <td>
            <select class="so-item-select" style="width:100%; padding:4px;" onchange="onSOLineItemSelect('${rowId}')" required>
                <option value="">Select spare part...</option>
                ${itemsOptions}
            </select>
        </td>
        <td>
            <input type="number" class="so-item-qty" min="1" value="1" style="width:100%; padding:4px;" oninput="calcSOLineTotal('${rowId}')" required>
        </td>
        <td>
            <input type="number" class="so-item-price" step="0.01" value="0.00" style="width:100%; padding:4px;" oninput="calcSOLineTotal('${rowId}')" required>
        </td>
        <td>
            <input type="number" class="so-item-disc" step="0.5" min="0" max="100" value="0" style="width:100%; padding:4px;" oninput="calcSOLineTotal('${rowId}')">
        </td>
        <td>
            <input type="number" class="so-item-gst" step="0.1" value="18.0" style="width:100%; padding:4px;" oninput="calcSOLineTotal('${rowId}')">
        </td>
        <td style="text-align:right; font-weight:600;" class="so-item-total">₹0.00</td>
        <td style="text-align:center;">
            <button type="button" class="btn btn-ghost btn-xs" style="color:var(--out); padding:2px 6px;" onclick="removeSOLineRow('${rowId}')">✕</button>
        </td>
    `;

    tbody.appendChild(tr);
}

function removeSOLineRow(rowId) {
    const tr = document.getElementById(rowId);
    if (tr) tr.remove();
    updateSOGrandTotals();
}

function onSOLineItemSelect(rowId) {
    const tr = document.getElementById(rowId);
    if (!tr) return;
    const sel = tr.querySelector('.so-item-select');
    const opt = sel.options[sel.selectedIndex];
    if (opt && opt.value) {
        const price = parseFloat(opt.getAttribute('data-price') || '0');
        const gst = parseFloat(opt.getAttribute('data-gst') || '18.0');
        tr.querySelector('.so-item-price').value = price.toFixed(2);
        tr.querySelector('.so-item-gst').value = gst.toFixed(1);
    }
    calcSOLineTotal(rowId);
}

function calcSOLineTotal(rowId) {
    const tr = document.getElementById(rowId);
    if (!tr) return;
    const qty = parseFloat(tr.querySelector('.so-item-qty')?.value || '0');
    const price = parseFloat(tr.querySelector('.so-item-price')?.value || '0');
    const disc = parseFloat(tr.querySelector('.so-item-disc')?.value || '0');
    const gstRate = parseFloat(tr.querySelector('.so-item-gst')?.value || '18.0');

    const netTaxable = (qty * price) * (1 - disc / 100);
    const lineTotal = netTaxable * (1 + gstRate / 100);

    const totalEl = tr.querySelector('.so-item-total');
    if (totalEl) totalEl.textContent = formatINR(lineTotal);

    updateSOGrandTotals();
}

function updateSOGrandTotals() {
    let subtotal = 0;
    let gstTotal = 0;

    const rows = document.querySelectorAll('#so-lines-body tr');
    rows.forEach(tr => {
        const qty = parseFloat(tr.querySelector('.so-item-qty')?.value || '0');
        const price = parseFloat(tr.querySelector('.so-item-price')?.value || '0');
        const disc = parseFloat(tr.querySelector('.so-item-disc')?.value || '0');
        const gstRate = parseFloat(tr.querySelector('.so-item-gst')?.value || '18.0');

        const netTaxable = (qty * price) * (1 - disc / 100);
        const gstVal = netTaxable * (gstRate / 100);

        subtotal += netTaxable;
        gstTotal += gstVal;
    });

    const grandTotal = subtotal + gstTotal;

    const subEl = document.getElementById('so-summary-subtotal');
    const gstEl = document.getElementById('so-summary-gst');
    const totEl = document.getElementById('so-summary-total');

    if (subEl) subEl.textContent = formatINR(subtotal);
    if (gstEl) gstEl.textContent = formatINR(gstTotal);
    if (totEl) totEl.textContent = formatINR(grandTotal);
}

async function submitCreateSO() {
    const custId = parseInt(document.getElementById('so-customer-id')?.value || '0', 10);
    const isQuote = document.getElementById('so-is-quote')?.value === 'true';
    const validUntil = document.getElementById('so-valid-until')?.value || null;
    const notes = document.getElementById('so-notes')?.value.trim() || null;

    if (!custId) {
        showToast('Please select a customer.', 'warning');
        return;
    }

    const rows = document.querySelectorAll('#so-lines-body tr');
    if (rows.length === 0) {
        showToast('Please add at least one line item.', 'warning');
        return;
    }

    const items = [];
    let hasError = false;

    rows.forEach(tr => {
        const itemId = parseInt(tr.querySelector('.so-item-select')?.value || '0', 10);
        const qty = parseInt(tr.querySelector('.so-item-qty')?.value || '0', 10);
        const price = parseFloat(tr.querySelector('.so-item-price')?.value || '0');
        const disc = parseFloat(tr.querySelector('.so-item-disc')?.value || '0');
        const gstRate = parseFloat(tr.querySelector('.so-item-gst')?.value || '18.0');

        if (!itemId || qty <= 0) {
            hasError = true;
            return;
        }

        items.push({
            item_id: itemId,
            qty: qty,
            unit_price: price,
            discount_pct: disc,
            gst_rate: gstRate
        });
    });

    if (hasError || items.length === 0) {
        showToast('Please select valid parts and quantities for all lines.', 'warning');
        return;
    }

    try {
        const payload = {
            customer_id: custId,
            items: items,
            is_quote: isQuote,
            valid_until: validUntil,
            notes: notes
        };

        const res = await apiFetch('/api/sales/orders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        closeModal('modal-create-so');
        showToast(`Sales document ${res.order_no} created successfully!`, 'success');
        fetchSalesOrders();
        fetchCustomers();
        fetchInventory();
    } catch (e) {
        showToast(`Failed to create order: ${e.message}`, 'error');
    }
}

// --- Sales Order Detail Modal ---
async function openSODetailModal(orderId, autoOpenDispatch = false) {
    try {
        const so = await apiFetch(`/api/sales/orders/${orderId}`);
        state.selectedSO = so;

        const titleEl = document.getElementById('so-detail-title');
        const subEl = document.getElementById('so-detail-subtitle');
        if (titleEl) titleEl.textContent = `${so.order_no} (${so.status})`;
        if (subEl) subEl.textContent = `Raised by ${so.created_by} on ${(so.created_at || '').substring(0, 10)}`;

        const metaEl = document.getElementById('so-detail-meta');
        if (metaEl) {
            metaEl.innerHTML = `
                <div>
                    <div class="text-subtle small">Customer</div>
                    <strong>${escapeHtml(so.customer_name)}</strong>
                    <div class="text-subtle small">${escapeHtml(so.customer_city || '')}, ${escapeHtml(so.customer_state || '')}</div>
                </div>
                <div>
                    <div class="text-subtle small">GSTIN</div>
                    <code>${escapeHtml(so.customer_gstin || 'Unregistered')}</code>
                    <div class="text-subtle small">Notes: ${escapeHtml(so.notes || 'None')}</div>
                </div>
                <div>
                    <div class="text-subtle small">Financials</div>
                    <div style="font-size:16px; font-weight:700; color:var(--accent);">${formatINR(so.total_amount)}</div>
                    <div class="text-subtle small">Taxable: ${formatINR(so.taxable_value)} | GST: ${formatINR(so.gst_amount)}</div>
                </div>
            `;
        }

        const linesBody = document.getElementById('so-detail-lines-body');
        if (linesBody) {
            linesBody.innerHTML = (so.items || []).map(it => {
                const marginHtml = it.margin_per_unit !== undefined ? 
                    `<td style="text-align:right; color:var(--in);" class="role-manager-admin">${formatINR(it.margin_per_unit)}</td>` : 
                    `<td style="text-align:right;" class="role-manager-admin">-</td>`;

                return `<tr>
                    <td>
                        <strong>${escapeHtml(it.sku)}</strong>
                        <div class="text-subtle small">${escapeHtml(it.name)}</div>
                    </td>
                    <td style="text-align:right; font-weight:600;">${it.qty}</td>
                    <td style="text-align:right; color:${it.dispatched_qty >= it.qty ? 'var(--in)' : 'var(--text-primary)'}; font-weight:600;">${it.dispatched_qty || 0}</td>
                    <td style="text-align:right;">${formatINR(it.unit_price)}</td>
                    ${marginHtml}
                    <td style="text-align:right;">${it.gst_rate}%</td>
                    <td style="text-align:right; font-weight:700;">${formatINR(it.line_total)}</td>
                </tr>`;
            }).join('');
        }

        // Action buttons visibility
        const btnConfirm = document.getElementById('btn-so-confirm');
        const btnDispatch = document.getElementById('btn-so-dispatch');
        const btnInvoice = document.getElementById('btn-so-invoice');
        const btnCancel = document.getElementById('btn-so-cancel');
        const overrideBox = document.getElementById('so-confirm-override-box');

        if (overrideBox) overrideBox.style.display = 'none';

        if (btnConfirm) btnConfirm.style.display = so.status === 'QUOTE' ? 'inline-block' : 'none';
        if (btnCancel) btnCancel.style.display = (so.status === 'QUOTE' || so.status === 'CONFIRMED') ? 'inline-block' : 'none';
        if (btnDispatch) btnDispatch.style.display = (so.status === 'CONFIRMED' || so.status === 'PARTIALLY_DISPATCHED') ? 'inline-block' : 'none';
        if (btnInvoice) btnInvoice.style.display = (so.status === 'DISPATCHED' || so.status === 'PARTIALLY_DISPATCHED') ? 'inline-block' : 'none';

        openModal('modal-so-detail');
        applyRBAC(state.currentUser ? state.currentUser.role : 'storekeeper');

        if (autoOpenDispatch && (so.status === 'CONFIRMED' || so.status === 'PARTIALLY_DISPATCHED')) {
            openDispatchModal();
        }
    } catch (e) {
        showToast(`Failed to load order: ${e.message}`, 'error');
    }
}

async function confirmCurrentSO() {
    if (!state.selectedSO) return;
    const orderId = state.selectedSO.id;
    const overrideInput = document.getElementById('so-override-reason');
    const overrideReason = overrideInput?.value.trim() || null;

    try {
        await apiFetch(`/api/sales/orders/${orderId}/confirm`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ override_reason: overrideReason })
        });

        showToast('Sales Order confirmed! Inventory reserved.', 'success');
        closeModal('modal-so-detail');
        fetchSalesOrders();
        fetchInventory();
        fetchStats();
    } catch (e) {
        if (e.message && e.message.toLowerCase().includes('credit limit')) {
            const overrideBox = document.getElementById('so-confirm-override-box');
            if (overrideBox) {
                overrideBox.style.display = 'block';
                showToast('Credit limit exceeded. Provide an override reason to confirm.', 'warning');
                return;
            }
        }
        showToast(`Failed to confirm order: ${e.message}`, 'error');
    }
}

async function cancelCurrentSO() {
    if (!state.selectedSO) return;
    if (!confirm(`Are you sure you want to cancel order ${state.selectedSO.order_no}? Any reserved stock will be released.`)) return;

    try {
        await apiFetch(`/api/sales/orders/${state.selectedSO.id}/cancel`, { method: 'POST' });
        showToast('Order cancelled.', 'info');
        closeModal('modal-so-detail');
        fetchSalesOrders();
        fetchInventory();
        fetchStats();
    } catch (e) {
        showToast(`Failed to cancel order: ${e.message}`, 'error');
    }
}

function openDispatchModal() {
    if (!state.selectedSO) return;
    const so = state.selectedSO;
    const tbody = document.getElementById('so-dispatch-lines-body');
    if (!tbody) return;

    tbody.innerHTML = (so.items || []).map(it => {
        const pending = Math.max(0, it.qty - (it.dispatched_qty || 0));
        return `<tr>
            <td>
                <strong>${escapeHtml(it.sku)}</strong>
                <div class="text-subtle small">${escapeHtml(it.name)}</div>
            </td>
            <td>${it.qty}</td>
            <td>${it.dispatched_qty || 0}</td>
            <td><strong style="color:var(--molten);">${pending}</strong></td>
            <td>
                <input type="number" class="dispatch-input-qty" data-item-id="${it.id}" min="0" max="${pending}" value="${pending}" style="width:80px; padding:4px;" ${pending === 0 ? 'disabled' : ''}>
            </td>
        </tr>`;
    }).join('');

    const refEl = document.getElementById('so-dispatch-ref');
    if (refEl) refEl.value = `DEL-${so.order_no.replace(/[^A-Za-z0-9]/g, '')}`;

    openModal('modal-so-dispatch');
}

async function submitSODispatch() {
    if (!state.selectedSO) return;
    const orderId = state.selectedSO.id;
    const ref = document.getElementById('so-dispatch-ref')?.value.trim() || 'Dispatch Note';

    const inputs = document.querySelectorAll('.dispatch-input-qty');
    const items = [];
    inputs.forEach(inp => {
        const itemId = parseInt(inp.getAttribute('data-item-id'), 10);
        const qty = parseInt(inp.value, 10) || 0;
        if (itemId && qty > 0) {
            items.push({ item_id: itemId, qty: qty });
        }
    });

    if (items.length === 0) {
        showToast('No quantities specified for dispatch.', 'warning');
        return;
    }

    try {
        const res = await apiFetch(`/api/sales/orders/${orderId}/dispatch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items: items, reference: ref })
        });

        closeModal('modal-so-dispatch');
        closeModal('modal-so-detail');
        showToast(`Dispatched items! Status: ${res.status}`, 'success');
        fetchSalesOrders();
        fetchInventory();
        fetchMovements();
        fetchStats();
    } catch (e) {
        showToast(`Dispatch failed: ${e.message}`, 'error');
    }
}

async function invoiceCurrentSO() {
    if (!state.selectedSO) return;
    if (!confirm(`Generate official GST Tax Invoice for order ${state.selectedSO.order_no}?`)) return;

    try {
        const inv = await apiFetch(`/api/sales/orders/${state.selectedSO.id}/invoice`, { method: 'POST' });
        showToast(`Invoice ${inv.invoice_no} generated successfully!`, 'success');
        closeModal('modal-so-detail');
        fetchSalesOrders();
        fetchInvoices();
        fetchCustomers();
        fetchStats();
        // Prompt download
        window.open(`/api/invoices/${inv.id}/pdf`, '_blank');
    } catch (e) {
        showToast(`Failed to generate invoice: ${e.message}`, 'error');
    }
}

function downloadSOQuotePDF(orderId = null) {
    const id = orderId || state.selectedSO?.id;
    if (!id) return;
    window.open(`/api/sales/orders/${id}/quote-pdf`, '_blank');
}

// --- Invoices & Payments ---
async function fetchInvoices(status = null) {
    try {
        const url = status && status !== 'ALL' ? `/api/invoices?status=${encodeURIComponent(status)}` : '/api/invoices';
        const invoices = await apiFetch(url);
        state.cachedInvoices = invoices || [];
        renderInvoicesTable(state.cachedInvoices);
    } catch (e) {
        console.error('Failed to fetch invoices:', e);
        const tbody = document.getElementById('sales-invoices-table-body');
        if (tbody) tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; padding:16px; color:var(--out);">Failed to load invoices: ${escapeHtml(e.message)}</td></tr>`;
    }
}

function filterInvByStatus(status, btn) {
    state.currentInvFilter = status;
    document.querySelectorAll('.inv-filter-pill').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    fetchInvoices(status);
}

function filterInvoices() {
    const q = (document.getElementById('inv-search-input')?.value || '').toLowerCase().trim();
    if (!q) {
        renderInvoicesTable(state.cachedInvoices);
        return;
    }
    const filtered = state.cachedInvoices.filter(inv => 
        (inv.invoice_no || '').toLowerCase().includes(q) ||
        (inv.customer_name || '').toLowerCase().includes(q) ||
        (inv.order_no || '').toLowerCase().includes(q)
    );
    renderInvoicesTable(filtered);
}

function getInvStatusBadge(status) {
    const s = (status || '').toUpperCase();
    if (s === 'PAID') return '<span class="status-badge" style="background:rgba(16,185,129,0.15); color:#10b981; border:1px solid #10b981;">PAID</span>';
    if (s === 'PARTIALLY_PAID') return '<span class="status-badge" style="background:rgba(245,158,11,0.15); color:#f59e0b; border:1px solid #f59e0b;">PARTIAL</span>';
    if (s === 'UNPAID') return '<span class="status-badge" style="background:rgba(239,68,68,0.15); color:#ef4444; border:1px solid #ef4444;">UNPAID</span>';
    return `<span class="status-badge">${escapeHtml(s)}</span>`;
}

function renderInvoicesTable(invoices) {
    const tbody = document.getElementById('sales-invoices-table-body');
    if (!tbody) return;

    if (!invoices || invoices.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" style="text-align:center; padding:20px;" class="text-subtle">No invoices found.</td></tr>';
        return;
    }

    tbody.innerHTML = invoices.map(inv => {
        const totalGst = (inv.cgst || 0) + (inv.sgst || 0) + (inv.igst || 0);
        const gstBreakdown = inv.igst > 0 ? `IGST: ${formatINR(inv.igst)}` : `CGST+SGST: ${formatINR(inv.cgst + inv.sgst)}`;
        return `<tr>
            <td><strong><code>${escapeHtml(inv.invoice_no)}</code></strong></td>
            <td><code>${escapeHtml(inv.order_no)}</code></td>
            <td>${escapeHtml((inv.date || '').substring(0, 10))}</td>
            <td>
                <strong>${escapeHtml(inv.customer_name)}</strong>
                <div class="text-subtle small">${escapeHtml(inv.place_of_supply || '')}</div>
            </td>
            <td style="text-align:right;">${formatINR(inv.taxable_value)}</td>
            <td style="text-align:right;" title="${gstBreakdown}">${formatINR(totalGst)}</td>
            <td style="text-align:right; font-weight:700;">${formatINR(inv.total)}</td>
            <td style="text-align:right; color:var(--in); font-weight:600;">${formatINR(inv.paid_amount || 0)}</td>
            <td>${getInvStatusBadge(inv.status)}</td>
            <td style="text-align:right;">
                <div style="display:flex; gap:6px; justify-content:flex-end;">
                    <button class="btn btn-xs btn-outline" onclick="downloadInvoicePDF(${inv.id})">Tax Invoice PDF</button>
                    ${inv.status !== 'PAID' ? 
                        `<button class="btn btn-xs btn-emerald role-manager-admin" onclick="openRecordPaymentModal(${inv.id})">Record Payment</button>` : ''}
                </div>
            </td>
        </tr>`;
    }).join('');

    applyRBAC(state.currentUser ? state.currentUser.role : 'storekeeper');
}

function downloadInvoicePDF(invoiceId) {
    window.open(`/api/invoices/${invoiceId}/pdf`, '_blank');
}

function openRecordPaymentModal(invoiceId) {
    const inv = (state.cachedInvoices || []).find(i => i.id === invoiceId);
    if (!inv) return;

    const pending = Math.max(0, (inv.total || 0) - (inv.paid_amount || 0));
    document.getElementById('pay-invoice-id').value = inv.id;
    document.getElementById('pay-amount').value = pending.toFixed(2);
    document.getElementById('pay-amount').max = pending.toFixed(2);
    document.getElementById('pay-date').value = new Date().toISOString().split('T')[0];
    document.getElementById('pay-ref').value = '';

    const infoEl = document.getElementById('pay-invoice-info');
    if (infoEl) {
        infoEl.innerHTML = `<strong>Invoice:</strong> ${escapeHtml(inv.invoice_no)} | <strong>Customer:</strong> ${escapeHtml(inv.customer_name)}<br><strong>Invoice Total:</strong> ${formatINR(inv.total)} | <strong>Already Paid:</strong> ${formatINR(inv.paid_amount)} | <strong>Pending:</strong> <strong style="color:var(--molten);">${formatINR(pending)}</strong>`;
    }

    openModal('modal-record-payment');
}

async function submitRecordPayment() {
    const invId = parseInt(document.getElementById('pay-invoice-id')?.value || '0', 10);
    const amount = parseFloat(document.getElementById('pay-amount')?.value || '0');
    const mode = document.getElementById('pay-mode')?.value || 'NEFT';
    const ref = document.getElementById('pay-ref')?.value.trim();
    const date = document.getElementById('pay-date')?.value || new Date().toISOString().split('T')[0];

    if (!invId || amount <= 0 || !ref) {
        showToast('Please provide valid payment amount and reference.', 'warning');
        return;
    }

    try {
        await apiFetch(`/api/invoices/${invId}/payments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ amount, mode, reference: ref, date })
        });

        closeModal('modal-record-payment');
        showToast('Payment recorded successfully!', 'success');
        fetchInvoices();
        fetchCustomers();
        fetchStats();
    } catch (e) {
        showToast(`Failed to record payment: ${e.message}`, 'error');
    }
}

// --- Customers & Ledgers ---
async function fetchCustomers() {
    try {
        const customers = await apiFetch('/api/customers');
        state.cachedCustomers = customers || [];
        renderCustomersTable(state.cachedCustomers);
    } catch (e) {
        console.error('Failed to fetch customers:', e);
        const tbody = document.getElementById('customers-table-body');
        if (tbody) tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding:16px; color:var(--out);">Failed to load customers: ${escapeHtml(e.message)}</td></tr>`;
    }
}

function renderCustomersTable(customers) {
    const tbody = document.getElementById('customers-table-body');
    if (!tbody) return;

    if (!customers || customers.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:20px;" class="text-subtle">No industrial customers registered.</td></tr>';
        return;
    }

    tbody.innerHTML = customers.map(c => {
        const limit = c.credit_limit || 0;
        const out = c.outstanding || 0;
        const utilPct = limit > 0 ? Math.min(100, Math.round((out / limit) * 100)) : 0;
        let barColor = 'var(--in)';
        if (utilPct > 80) barColor = 'var(--out)';
        else if (utilPct > 50) barColor = 'var(--molten)';

        return `<tr>
            <td>
                <strong>${escapeHtml(c.name)}</strong>
                <div class="text-subtle small">${escapeHtml(c.contact_person || '')}</div>
            </td>
            <td><code>${escapeHtml(c.gstin)}</code></td>
            <td>${escapeHtml(c.city)}, ${escapeHtml(c.state)}</td>
            <td>
                <div>${escapeHtml(c.phone || '')}</div>
                <div class="text-subtle small">${escapeHtml(c.email || '')}</div>
            </td>
            <td><span class="status-badge">${escapeHtml(c.price_tier || 'Standard')}</span></td>
            <td style="text-align:right;">${formatINR(limit)}</td>
            <td style="text-align:right; font-weight:700; color:${out > 0 ? 'var(--out)' : 'var(--text-primary)'};">${formatINR(out)}</td>
            <td>
                <div style="width:120px; background:var(--bg-region); border-radius:4px; height:8px; overflow:hidden; border:1px solid var(--border-subtle); margin-bottom:2px;">
                    <div style="width:${utilPct}%; background:${barColor}; height:100%;"></div>
                </div>
                <div class="text-subtle small">${utilPct}% of credit</div>
            </td>
            <td style="text-align:right;">
                <button class="btn btn-xs btn-outline" onclick="openCustomerLedger(${c.id})">Ledger Statement</button>
            </td>
        </tr>`;
    }).join('');
}

function openCreateCustomerModal() {
    document.getElementById('cust-name').value = '';
    document.getElementById('cust-gstin').value = '';
    document.getElementById('cust-state').value = 'Haryana';
    document.getElementById('cust-city').value = 'Gurugram';
    document.getElementById('cust-contact').value = '';
    document.getElementById('cust-phone').value = '';
    document.getElementById('cust-email').value = '';
    document.getElementById('cust-tier').value = 'Standard';
    document.getElementById('cust-credit-limit').value = '500000';
    document.getElementById('cust-credit-days').value = '30';

    openModal('modal-create-customer');
}

async function submitCreateCustomer() {
    const name = document.getElementById('cust-name').value.trim();
    const gstin = document.getElementById('cust-gstin').value.trim().toUpperCase();
    const stateVal = document.getElementById('cust-state').value.trim();
    const city = document.getElementById('cust-city').value.trim();
    const contact = document.getElementById('cust-contact').value.trim();
    const phone = document.getElementById('cust-phone').value.trim();
    const email = document.getElementById('cust-email').value.trim();
    const tier = document.getElementById('cust-tier').value;
    const creditLimit = parseFloat(document.getElementById('cust-credit-limit').value) || 0;
    const creditDays = parseInt(document.getElementById('cust-credit-days').value, 10) || 30;

    if (!name || !gstin || !stateVal || !city) {
        showToast('Please fill in Customer Name, GSTIN, State and City.', 'warning');
        return;
    }

    try {
        const payload = {
            name, gstin, state: stateVal, city,
            contact_person: contact, phone, email,
            price_tier: tier, credit_limit: creditLimit, credit_days: creditDays
        };

        const res = await apiFetch('/api/customers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        closeModal('modal-create-customer');
        showToast(`Customer "${res.name}" registered successfully!`, 'success');
        fetchCustomers();
    } catch (e) {
        showToast(`Failed to register customer: ${e.message}`, 'error');
    }
}

async function openCustomerLedger(customerId) {
    try {
        const data = await apiFetch(`/api/customers/${customerId}/ledger`);
        const c = data.customer;
        const txs = data.transactions || [];

        const titleEl = document.getElementById('cust-ledger-title');
        const subEl = document.getElementById('cust-ledger-sub');
        if (titleEl) titleEl.textContent = `Statement of Account: ${c.name}`;
        if (subEl) subEl.textContent = `GSTIN: ${c.gstin} | Location: ${c.city}, ${c.state} | Terms: Net ${c.credit_days || 30} Days`;

        const cardsEl = document.getElementById('cust-ledger-summary-cards');
        if (cardsEl) {
            cardsEl.innerHTML = `
                <div>
                    <div class="text-subtle small">Sanctioned Credit Limit</div>
                    <div style="font-size:16px; font-weight:700;">${formatINR(c.credit_limit)}</div>
                </div>
                <div>
                    <div class="text-subtle small">Total Outstanding Balance</div>
                    <div style="font-size:16px; font-weight:700; color:${data.outstanding > 0 ? 'var(--out)' : 'var(--in)'};">${formatINR(data.outstanding)}</div>
                </div>
                <div>
                    <div class="text-subtle small">Available Credit Line</div>
                    <div style="font-size:16px; font-weight:700; color:var(--accent);">${formatINR(Math.max(0, (c.credit_limit || 0) - (data.outstanding || 0)))}</div>
                </div>
            `;
        }

        const tbody = document.getElementById('cust-ledger-table-body');
        if (tbody) {
            if (txs.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:16px;" class="text-subtle">No transaction entries found for this customer.</td></tr>';
            } else {
                tbody.innerHTML = txs.map(t => {
                    const isDebit = t.type === 'INVOICE';
                    return `<tr>
                        <td>${escapeHtml((t.date || '').substring(0, 10))}</td>
                        <td><span class="status-badge" style="background:${isDebit ? 'rgba(59,130,246,0.1)' : 'rgba(16,185,129,0.1)'}; color:${isDebit ? '#3b82f6' : '#10b981'};">${t.type}</span></td>
                        <td><strong>${escapeHtml(t.reference)}</strong></td>
                        <td style="text-align:right; font-weight:600;">${t.debit > 0 ? formatINR(t.debit) : '-'}</td>
                        <td style="text-align:right; font-weight:600; color:var(--in);">${t.credit > 0 ? formatINR(t.credit) : '-'}</td>
                        <td style="text-align:right; font-weight:700;">${formatINR(t.running_balance)}</td>
                    </tr>`;
                }).join('');
            }
        }

        openModal('modal-customer-ledger');
    } catch (e) {
        showToast(`Failed to load ledger: ${e.message}`, 'error');
    }
}


// ==============================================
//  DELIVERY DOCUMENT SCANNING & VERIFICATION
// ==============================================
let currentSelectedScanFile = null;
let currentScanReviewData = null;

function openScanDocModal() {
    currentSelectedScanFile = null;
    const fileInp = document.getElementById('scan-file-input');
    if (fileInp) fileInp.value = '';
    const label = document.getElementById('scan-file-label');
    if (label) label.textContent = 'Click to browse or drag & drop photo / PDF here';
    const btn = document.getElementById('btn-process-upload');
    if (btn) btn.disabled = true;
    const loading = document.getElementById('scan-loading');
    if (loading) loading.style.display = 'none';

    setupScanDropzone();
    openModal('modal-scan-doc');
}

function setupScanDropzone() {
    const dropzone = document.getElementById('scan-dropzone');
    if (!dropzone || dropzone._setupDone) return;
    dropzone._setupDone = true;

    ['dragenter', 'dragover'].forEach(eventName => {
        dropzone.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropzone.style.borderColor = 'var(--accent)';
            dropzone.style.background = 'rgba(45,212,191,0.06)';
        }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropzone.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropzone.style.borderColor = 'var(--border)';
            dropzone.style.background = 'var(--bg-region)';
        }, false);
    });

    dropzone.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        const files = dt.files;
        if (files && files.length > 0) {
            handleScanFile(files[0]);
        }
    }, false);
}

function handleScanFileSelected(input) {
    if (input.files && input.files.length > 0) {
        handleScanFile(input.files[0]);
    }
}

function handleScanFile(file) {
    if (file.size > 10 * 1024 * 1024) {
        showToast('File size exceeds maximum 10 MB limit.', 'error');
        return;
    }
    currentSelectedScanFile = file;
    const label = document.getElementById('scan-file-label');
    if (label) label.textContent = `Selected: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
    const btn = document.getElementById('btn-process-upload');
    if (btn) btn.disabled = false;
}

async function submitScanDocument() {
    if (!currentSelectedScanFile) return;
    const formData = new FormData();
    formData.append('file', currentSelectedScanFile);

    const btn = document.getElementById('btn-process-upload');
    const loading = document.getElementById('scan-loading');
    if (btn) btn.disabled = true;
    if (loading) loading.style.display = 'block';

    try {
        const token = sessionStorage.getItem('ss_token') || '';
        const response = await fetch('/api/procurement/scan-document', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            },
            body: formData
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({ detail: response.statusText }));
            throw new Error(err.detail || response.statusText);
        }

        const data = await response.json();
        closeModal('modal-scan-doc');
        renderDocReview(data);
    } catch (e) {
        showToast(`Document scan failed: ${e.message}`, 'error');
    } finally {
        if (btn) btn.disabled = false;
        if (loading) loading.style.display = 'none';
    }
}

async function processSampleDoc(sampleKey) {
    const loading = document.getElementById('scan-loading');
    if (loading) loading.style.display = 'block';

    try {
        const formData = new FormData();
        formData.append('sample_key', sampleKey);

        const token = sessionStorage.getItem('ss_token') || '';
        const response = await fetch('/api/procurement/scan-document', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            },
            body: formData
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({ detail: response.statusText }));
            throw new Error(err.detail || response.statusText);
        }

        const data = await response.json();
        closeModal('modal-scan-doc');
        renderDocReview(data);
    } catch (e) {
        showToast(`Sample document extraction failed: ${e.message}`, 'error');
    } finally {
        if (loading) loading.style.display = 'none';
    }
}

function renderDocReview(data) {
    currentScanReviewData = data;
    currentScanReviewData.user_corrections = 0;

    // Fill metadata
    const docNumEl = document.getElementById('review-doc-number');
    const docDateEl = document.getElementById('review-doc-date');
    const supNameEl = document.getElementById('review-supplier-name');
    const poNumEl = document.getElementById('review-po-number');
    const poStatusEl = document.getElementById('review-po-status');
    const docLinkEl = document.getElementById('review-doc-link');
    const dupBanner = document.getElementById('review-duplicate-banner');
    const corrCountEl = document.getElementById('review-corrections-count');

    if (docNumEl) docNumEl.textContent = data.document.document_number || 'N/A';
    if (docDateEl) docDateEl.textContent = data.document.document_date || 'N/A';
    if (supNameEl) supNameEl.textContent = data.document.supplier_name || 'N/A';
    if (poNumEl) poNumEl.textContent = data.po.po_number || 'No PO Matched';

    if (poStatusEl) {
        poStatusEl.textContent = data.po.status || 'NONE';
        poStatusEl.className = `badge status-${(data.po.status || 'draft').toLowerCase()}`;
    }

    if (docLinkEl) {
        if (data.file_url) {
            docLinkEl.href = data.file_url;
            docLinkEl.style.display = 'inline-block';
        } else {
            docLinkEl.style.display = 'none';
        }
    }

    if (dupBanner) {
        dupBanner.style.display = data.flags && data.flags.duplicate_document ? 'block' : 'none';
    }

    if (corrCountEl) corrCountEl.textContent = '0';

    // Build line items
    const tbody = document.getElementById('review-lines-tbody');
    if (!tbody) return;

    if (!data.lines || data.lines.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:16px;" class="text-subtle">No line items extracted from document.</td></tr>';
    } else {
        tbody.innerHTML = data.lines.map((line, idx) => {
            const ext = line.extracted;
            const matched = line.matched_po_item;
            const flags = line.flags || {};
            const conf = line.confidence || 'LOW';

            // Confidence badge
            let confBadge = '';
            if (conf === 'HIGH') {
                confBadge = `<span class="badge badge-in" title="Matched via ${line.match_method}">HIGH (${line.match_method})</span>`;
            } else if (conf === 'MEDIUM') {
                confBadge = `<span class="badge badge-amber" title="Matched via ${line.match_method}">MEDIUM</span>`;
            } else {
                confBadge = `<span class="badge badge-out">NOT ON PO</span>`;
            }

            // Price column
            let priceCol = '';
            if (matched) {
                const variancePct = flags.price_variance_pct || 0;
                const isVariance = flags.price_variance;
                priceCol = `
                    <div>Doc: ₹${ext.unit_price.toFixed(2)}</div>
                    <div class="text-subtle small">PO: ₹${matched.expected_unit_cost.toFixed(2)}</div>
                    ${isVariance ? `<span class="badge badge-out" style="font-size:10px;">${variancePct > 0 ? '+' : ''}${variancePct}% Var</span>` : ''}
                `;
            } else {
                priceCol = `<div>Doc: ₹${ext.unit_price.toFixed(2)}</div>`;
            }

            // Flag tags
            const flagTags = [];
            if (flags.not_on_po) flagTags.push('<span class="badge badge-out" style="font-size:10px; margin:2px 0;">⚠️ Not on PO</span>');
            if (flags.quantity_mismatch) flagTags.push('<span class="badge badge-amber" style="font-size:10px; margin:2px 0;">⚠️ Qty Mismatch</span>');
            if (flags.price_variance) flagTags.push('<span class="badge badge-out" style="font-size:10px; margin:2px 0;">⚠️ Price &gt;5%</span>');
            const flagsHtml = flagTags.length ? flagTags.join('<br>') : '<span class="text-subtle small">✅ OK</span>';

            const pendingQty = matched ? matched.pending_qty : '-';
            const reviewedQty = line.reviewed_qty !== undefined ? line.reviewed_qty : ext.qty;

            return `
                <tr id="review-row-${idx}">
                    <td style="text-align:center;">${idx + 1}</td>
                    <td>
                        <strong>${escapeHtml(ext.description)}</strong>
                        ${ext.sku ? `<div class="text-subtle small">SKU: <code>${escapeHtml(ext.sku)}</code></div>` : ''}
                    </td>
                    <td>
                        ${matched ? `
                            <div style="font-weight:600;">${escapeHtml(matched.name)}</div>
                            <div class="text-subtle small">SKU: <code>${escapeHtml(matched.sku)}</code></div>
                        ` : `<span class="text-subtle" style="font-style:italic;">No matching item on PO</span>`}
                    </td>
                    <td style="text-align:center;">${confBadge}</td>
                    <td style="text-align:right;">${priceCol}</td>
                    <td style="text-align:center; font-weight:600;">${pendingQty}</td>
                    <td style="text-align:center;">
                        <input type="number" 
                               class="form-control" 
                               style="width:75px; text-align:center; padding:4px 6px; font-weight:700; border-radius:4px; font-size:12px;"
                               value="${reviewedQty}" 
                               min="0" 
                               step="1"
                               ${!matched ? 'disabled' : ''}
                               onchange="handleReceiveQtyChange(${idx}, this.value)">
                    </td>
                    <td>${flagsHtml}</td>
                </tr>
            `;
        }).join('');
    }

    openModal('modal-doc-review');
}

function handleReceiveQtyChange(lineIndex, newVal) {
    if (!currentScanReviewData || !currentScanReviewData.lines[lineIndex]) return;
    const val = parseFloat(newVal) || 0;
    currentScanReviewData.lines[lineIndex].reviewed_qty = val;
    currentScanReviewData.user_corrections = (currentScanReviewData.user_corrections || 0) + 1;

    const countEl = document.getElementById('review-corrections-count');
    if (countEl) countEl.textContent = currentScanReviewData.user_corrections;
}

async function submitDocConfirmation() {
    if (!currentScanReviewData || !currentScanReviewData.extraction_id) return;

    const btn = document.getElementById('btn-confirm-doc-receive');
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Receiving Goods...';
    }

    try {
        const reviewedLines = [];
        for (const line of currentScanReviewData.lines) {
            if (line.matched_po_item && line.reviewed_qty > 0) {
                reviewedLines.push({
                    po_item_id: line.matched_po_item.po_item_id,
                    item_id: line.matched_po_item.item_id,
                    qty: line.reviewed_qty
                });
            }
        }

        if (reviewedLines.length === 0) {
            throw new Error('No valid matched PO items with quantity > 0 selected for receiving.');
        }

        const payload = {
            po_id: currentScanReviewData.po.id,
            reviewed_lines: reviewedLines,
            fields_corrected: currentScanReviewData.user_corrections || 0
        };

        const res = await apiFetch(`/api/procurement/scan-document/${currentScanReviewData.extraction_id}/confirm`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        closeModal('modal-doc-review');
        showToast(`Document verified! Received ${res.units_received} units into Central Store.`, 'success');

        // Refresh Procurement & Inventory views
        if (typeof fetchProcurement === 'function') fetchProcurement();
        if (typeof fetchInventory === 'function') fetchInventory();
        if (typeof fetchStats === 'function') fetchStats();
    } catch (e) {
        showToast(`Receipt confirmation failed: ${e.message}`, 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = '✅ Confirm & Receive Goods';
        }
    }
}

async function openScanAccuracyModal() {
    try {
        const data = await apiFetch('/api/procurement/scan-document/accuracy');
        const scEl = document.getElementById('acc-total-scanned');
        const cfEl = document.getElementById('acc-total-confirmed');
        const rtEl = document.getElementById('acc-accuracy-rate');
        const crEl = document.getElementById('acc-avg-corrections');

        if (scEl) scEl.textContent = data.total_documents_scanned || 0;
        if (cfEl) cfEl.textContent = data.total_documents_confirmed || 0;
        if (rtEl) rtEl.textContent = `${data.accuracy_rate_pct || 100}%`;
        if (crEl) crEl.textContent = (data.avg_corrections_per_doc || 0).toFixed(1);

        openModal('modal-scan-accuracy');
    } catch (e) {
        showToast(`Failed to load accuracy metrics: ${e.message}`, 'error');
    }
}


// ==============================================
//  PWA OFFLINE QUEUE (INDEXEDDB) & IDEMPOTENCY
// ==============================================
let offlineDB = null;

function initOfflineQueue() {
    if (!('indexedDB' in window)) {
        console.warn('IndexedDB not supported in this browser environment');
        return;
    }

    const request = indexedDB.open('anishka_offline_db', 1);

    request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('offline_actions')) {
            const store = db.createObjectStore('offline_actions', { keyPath: 'client_id' });
            store.createIndex('status', 'status', { unique: false });
            store.createIndex('created_at', 'created_at', { unique: false });
        }
    };

    request.onsuccess = (e) => {
        offlineDB = e.target.result;
        updatePendingPill();
        if (navigator.onLine) {
            replayOfflineQueue();
        }
    };

    request.onerror = (e) => {
        console.warn('IndexedDB failed to open:', e);
    };

    window.addEventListener('online', () => {
        document.body.classList.remove('is-offline');
        showToast('🌐 Network reconnected! Replaying queued offline actions...', 'info');
        replayOfflineQueue();
    });

    window.addEventListener('offline', () => {
        document.body.classList.add('is-offline');
        showToast('⚡ Offline mode: Stock actions are being queued locally.', 'warning');
    });

    if (!navigator.onLine) {
        document.body.classList.add('is-offline');
    }
}

function generateClientId() {
    return (typeof crypto !== 'undefined' && crypto.randomUUID) 
        ? crypto.randomUUID() 
        : 'cid-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
}

function enqueueOfflineAction(actionType, url, payload) {
    return new Promise((resolve, reject) => {
        if (!offlineDB) {
            console.warn('Offline DB not initialized');
            resolve(null);
            return;
        }

        const clientId = payload.client_id || generateClientId();
        payload.client_id = clientId;

        const action = {
            client_id: clientId,
            action_type: actionType,
            url: url,
            payload: payload,
            status: 'PENDING',
            error: null,
            created_at: new Date().toISOString()
        };

        const tx = offlineDB.transaction(['offline_actions'], 'readwrite');
        const store = tx.objectStore('offline_actions');
        store.put(action);

        tx.oncomplete = () => {
            updatePendingPill();
            resolve(clientId);
        };
        tx.onerror = (e) => reject(e);
    });
}

function getOfflineActions() {
    return new Promise((resolve) => {
        if (!offlineDB) return resolve([]);
        const tx = offlineDB.transaction(['offline_actions'], 'readonly');
        const store = tx.objectStore('offline_actions');
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
    });
}

async function updatePendingPill() {
    const actions = await getOfflineActions();
    const pendingCount = actions.filter(a => a.status === 'PENDING').length;
    const failedCount = actions.filter(a => a.status === 'FAILED').length;
    const pill = document.getElementById('pending-pill');
    const countEl = document.getElementById('pending-count');

    if (!pill || !countEl) return;

    if (pendingCount > 0 || failedCount > 0) {
        pill.classList.add('has-pending');
        countEl.textContent = pendingCount + (failedCount > 0 ? ` (${failedCount} failed)` : '');
        pill.title = `${pendingCount} pending, ${failedCount} conflicts/failed. Click to review.`;
    } else {
        pill.classList.remove('has-pending');
    }
}

async function replayOfflineQueue() {
    if (!navigator.onLine || !offlineDB) return;

    const actions = await getOfflineActions();
    const pendingActions = actions
        .filter(a => a.status === 'PENDING')
        .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

    if (pendingActions.length === 0) return;

    let syncedCount = 0;
    let failedCount = 0;

    for (const action of pendingActions) {
        try {
            const token = sessionStorage.getItem('ss_token');
            const res = await fetch(action.url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                },
                body: JSON.stringify(action.payload)
            });

            if (res.ok) {
                action.status = 'COMPLETED';
                action.error = null;
                syncedCount++;
            } else {
                const errData = await res.json().catch(() => ({}));
                action.status = 'FAILED';
                action.error = errData.detail || `Server error ${res.status}`;
                failedCount++;
            }
        } catch (netErr) {
            console.warn('Network error during offline replay, pausing:', netErr);
            break;
        }

        await new Promise((resolve) => {
            const tx = offlineDB.transaction(['offline_actions'], 'readwrite');
            tx.objectStore('offline_actions').put(action);
            tx.oncomplete = resolve;
            tx.onerror = resolve;
        });
    }

    updatePendingPill();

    if (syncedCount > 0) {
        showToast(`✅ Synced ${syncedCount} offline action(s) to server.`, 'success');
        if (typeof fetchInventory === 'function') fetchInventory();
        if (typeof fetchMovements === 'function') fetchMovements();
        if (typeof fetchStats === 'function') fetchStats();
    }

    if (failedCount > 0) {
        showToast(`⚠️ ${failedCount} offline action(s) had conflicts. Click pending pill to review.`, 'error');
    }
}

async function openOfflineQueueModal() {
    const actions = await getOfflineActions();
    const listEl = document.getElementById('oq-items-list');
    const summaryEl = document.getElementById('oq-summary-text');

    if (!listEl) return;

    if (actions.length === 0) {
        listEl.innerHTML = '<div style="text-align:center; padding:16px;" class="text-subtle">No offline actions in queue</div>';
    } else {
        listEl.innerHTML = actions.map(act => {
            let dotClass = 'pending';
            let statusText = 'Pending';
            if (act.status === 'COMPLETED') { dotClass = 'done'; statusText = 'Synced'; }
            else if (act.status === 'FAILED') { dotClass = 'failed'; statusText = 'Failed / Conflict'; }

            const p = act.payload || {};
            const desc = `${act.action_type}: ${p.sku || 'Item'} (Qty: ${p.quantity || p.quantity_change || '—'})`;
            const time = new Date(act.created_at).toLocaleTimeString();

            return `
            <div class="oq-item">
                <div class="oq-status-dot ${dotClass}" title="${statusText}"></div>
                <div class="oq-desc">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <strong>${escapeHtml(desc)}</strong>
                        <span class="small text-subtle">${time}</span>
                    </div>
                    <div class="small text-subtle">ID: <code>${escapeHtml(act.client_id.slice(0, 14))}...</code> | Status: <strong>${statusText}</strong></div>
                    ${act.error ? `<div class="oq-err">⚠️ Conflict: ${escapeHtml(act.error)}</div>` : ''}
                </div>
            </div>`;
        }).join('');
    }

    if (summaryEl) {
        const pending = actions.filter(a => a.status === 'PENDING').length;
        const failed = actions.filter(a => a.status === 'FAILED').length;
        summaryEl.textContent = `${pending} pending, ${failed} failed conflict(s)`;
    }

    openModal('modal-offline-queue');
}

async function clearSyncedOfflineQueue() {
    if (!offlineDB) return;
    const actions = await getOfflineActions();
    const tx = offlineDB.transaction(['offline_actions'], 'readwrite');
    const store = tx.objectStore('offline_actions');

    for (const a of actions) {
        if (a.status === 'COMPLETED') {
            store.delete(a.client_id);
        }
    }

    tx.oncomplete = () => {
        showToast('Cleared completed actions.', 'info');
        updatePendingPill();
        openOfflineQueueModal();
    };
}


// ==============================================
//  BARCODE / QR SCANNING (BarcodeDetector + html5-qrcode)
// ==============================================
let scannerVideoTrack = null;
let scannerIntervalId = null;
let html5QrScannerInstance = null;
let activeScanContext = 'quick-action';

async function openBarcodeScanner(context = 'quick-action') {
    activeScanContext = context;
    const statusEl = document.getElementById('scanner-status');
    const video = document.getElementById('scanner-video');
    const readerDiv = document.getElementById('scanner-html5-reader');

    if (statusEl) statusEl.textContent = 'Starting camera...';
    openModal('modal-barcode-scanner');

    // 1. Try Native BarcodeDetector API if supported
    if ('BarcodeDetector' in window && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        try {
            const formats = await BarcodeDetector.getSupportedFormats();
            const detector = new BarcodeDetector({ formats: formats && formats.length ? formats : ['qr_code', 'code_128', 'ean_13', 'ean_8'] });

            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: { ideal: 'environment' }, width: { ideal: 640 }, height: { ideal: 480 } }
            });

            scannerVideoTrack = stream.getVideoTracks()[0];
            video.srcObject = stream;
            video.style.display = 'block';
            if (readerDiv) readerDiv.style.display = 'none';

            await video.play();
            if (statusEl) statusEl.textContent = 'Align barcode or QR within frame';

            scannerIntervalId = setInterval(async () => {
                if (video.readyState >= video.HAVE_CURRENT_DATA) {
                    try {
                        const barcodes = await detector.detect(video);
                        if (barcodes.length > 0) {
                            const raw = barcodes[0].rawValue;
                            closeBarcodeScanner();
                            handleScannedCode(raw);
                        }
                    } catch (e) {}
                }
            }, 300);
            return;
        } catch (nativeErr) {
            console.warn('Native BarcodeDetector initialization failed, trying html5-qrcode fallback:', nativeErr);
            stopScannerStream();
        }
    }

    // 2. Fallback to html5-qrcode library
    video.style.display = 'none';
    if (readerDiv) readerDiv.style.display = 'block';

    if (typeof Html5Qrcode !== 'undefined') {
        try {
            if (!html5QrScannerInstance) {
                html5QrScannerInstance = new Html5Qrcode("scanner-html5-reader");
            }
            if (statusEl) statusEl.textContent = 'Using camera scanner...';

            await html5QrScannerInstance.start(
                { facingMode: "environment" },
                { fps: 10, qrbox: { width: 220, height: 220 } },
                (decodedText) => {
                    closeBarcodeScanner();
                    handleScannedCode(decodedText);
                },
                () => {}
            );
            if (statusEl) statusEl.textContent = 'Align code inside box';
        } catch (libErr) {
            if (statusEl) statusEl.textContent = 'Camera unavailable (' + (libErr.message || libErr) + '). Use manual SKU below.';
        }
    } else {
        if (statusEl) statusEl.textContent = 'Camera unavailable. Use manual SKU below.';
    }
}

function stopScannerStream() {
    if (scannerIntervalId) {
        clearInterval(scannerIntervalId);
        scannerIntervalId = null;
    }
    if (scannerVideoTrack) {
        scannerVideoTrack.stop();
        scannerVideoTrack = null;
    }
    const video = document.getElementById('scanner-video');
    if (video) {
        video.srcObject = null;
        video.style.display = 'none';
    }
    if (html5QrScannerInstance) {
        try {
            html5QrScannerInstance.stop().catch(() => {});
        } catch (e) {}
    }
}

function closeBarcodeScanner() {
    stopScannerStream();
    closeModal('modal-barcode-scanner');
}

function submitManualSkuScan() {
    const input = document.getElementById('scanner-manual-sku');
    if (!input || !input.value.trim()) return;
    const sku = input.value.trim();
    input.value = '';
    closeBarcodeScanner();
    handleScannedCode(sku);
}

function handleScannedCode(rawCode) {
    if (!rawCode) return;
    let clean = rawCode.trim();

    try {
        const parsed = JSON.parse(clean);
        if (parsed.sku) clean = parsed.sku;
    } catch (e) {}

    if (activeScanContext === 'cycle-count') {
        handleCycleCountBarcode(clean);
        return;
    }

    lookupAndOpenQuickAction(clean);
}

async function lookupAndOpenQuickAction(sku) {
    let item = (state.cachedInventory || []).find(i => i.sku.toLowerCase() === sku.toLowerCase());

    if (!item) {
        try {
            item = await apiFetch(`/api/items/${encodeURIComponent(sku)}`);
        } catch (e) {
            try {
                const searchRes = await apiFetch(`/api/items?search=${encodeURIComponent(sku)}&limit=1`);
                if (searchRes.items && searchRes.items.length > 0) {
                    item = searchRes.items[0];
                }
            } catch (err2) {}
        }
    }

    if (!item) {
        showToast(`SKU / Barcode "${sku}" not found in catalog.`, 'error');
        return;
    }

    state.quickActionItem = item;
    const nameEl = document.getElementById('qs-item-name');
    const metaEl = document.getElementById('qs-item-meta');

    if (nameEl) nameEl.textContent = item.name;
    if (metaEl) {
        metaEl.textContent = `SKU: ${item.sku} | In Stock: ${item.quantity} ${item.unit || 'pcs'} | Bin: ${item.location || 'Central Store'}`;
    }

    document.getElementById('quick-action-sheet')?.classList.add('open');
    document.getElementById('qs-overlay')?.classList.add('open');
}

function closeQuickActionSheet() {
    document.getElementById('quick-action-sheet')?.classList.remove('open');
    document.getElementById('qs-overlay')?.classList.remove('open');
}

function quickActionStockIn() {
    if (!state.quickActionItem) return;
    const it = state.quickActionItem;
    closeQuickActionSheet();
    openStockInModal(it.sku, it.name);
}

function quickActionStockOut() {
    if (!state.quickActionItem) return;
    const it = state.quickActionItem;
    closeQuickActionSheet();
    openStockOutModal(it.sku, it.name, it.quantity);
}

function quickActionAdjust() {
    if (!state.quickActionItem) return;
    const it = state.quickActionItem;
    closeQuickActionSheet();
    openAdjustStockModal(it.sku, it.name);
}

function quickActionInfo() {
    if (!state.quickActionItem) return;
    const it = state.quickActionItem;
    closeQuickActionSheet();
    openItemDrawer(it.id);
}


// ==============================================
//  QR LABELS GENERATION (ITEMS & BINS)
// ==============================================
function printItemLabels(category = '') {
    let url = '/api/labels/items/pdf?all=1';
    if (category) {
        url = `/api/labels/items/pdf?category=${encodeURIComponent(category)}`;
    }
    window.open(url, '_blank');
}

function printBinLabels() {
    window.open('/api/labels/bins/pdf?all=1', '_blank');
}


// ==============================================
//  CYCLE COUNT & AUDITS LOGIC
// ==============================================
let activeCycleCountData = null;

async function loadCycleCounts() {
    const tbody = document.getElementById('cc-list-tbody');
    if (!tbody) return;

    try {
        const counts = await apiFetch('/api/cycle-counts');
        if (!counts || counts.length === 0) {
            tbody.innerHTML = '<tr><td colspan="10" style="text-align:center; padding:16px;" class="text-subtle">No cycle count sheets found. Click "+ Create Count Sheet" to start an audit.</td></tr>';
            return;
        }

        tbody.innerHTML = counts.map(cc => {
            const dateStr = cc.created_at ? new Date(cc.created_at).toLocaleDateString() : '—';
            const varVal = cc.total_variance_value || 0;
            const varClass = varVal > 0 ? 'cc-variance-pos' : (varVal < 0 ? 'cc-variance-neg' : 'cc-variance-zero');
            const statusClass = `cc-status-${(cc.status || 'open').toLowerCase()}`;

            return `
            <tr>
                <td><strong class="mono" style="color:var(--accent); font-size:12px;">${escapeHtml(cc.count_no)}</strong></td>
                <td><span style="font-size:11px; padding:2px 6px; border-radius:4px; background:var(--bg-region);">${escapeHtml(cc.type)}</span></td>
                <td><strong>${escapeHtml(cc.target_name || 'All Warehouse')}</strong></td>
                <td><span class="status-badge ${statusClass}">${escapeHtml(cc.status)}</span></td>
                <td><span class="text-subtle small">${escapeHtml(cc.created_by)}</span></td>
                <td style="text-align:right;">${cc.total_items || 0}</td>
                <td style="text-align:right;">${cc.total_system_qty} / <strong>${cc.total_counted_qty}</strong></td>
                <td style="text-align:right;" class="${varClass}">₹${varVal.toLocaleString('en-IN', {minimumFractionDigits: 2})}</td>
                <td><span class="text-subtle small">${dateStr}</span></td>
                <td style="text-align:right;">
                    <button class="btn btn-xs btn-outline" onclick="openCycleCountDetail(${cc.id})">Inspect</button>
                </td>
            </tr>`;
        }).join('');
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; padding:16px; color:var(--out);">Error loading cycle counts: ${escapeHtml(e.message)}</td></tr>`;
    }
}

function openCreateCycleCountModal() {
    openModal('modal-cycle-count-create');
}

function onCycleCountTypeChange() {
    const type = document.getElementById('cc-create-type').value;
    const grp = document.getElementById('cc-create-target-group');
    const lbl = document.getElementById('cc-create-target-label');
    const sel = document.getElementById('cc-create-target-select');
    const txt = document.getElementById('cc-create-target-text');

    if (type === 'CATEGORY') {
        grp.style.display = 'block';
        lbl.textContent = 'Category';
        sel.style.display = 'block';
        txt.style.display = 'none';
    } else if (type === 'BIN') {
        grp.style.display = 'block';
        lbl.textContent = 'Bin Location';
        sel.style.display = 'none';
        txt.style.display = 'block';
    } else {
        grp.style.display = 'none';
    }
}

async function submitCreateCycleCount() {
    const type = document.getElementById('cc-create-type').value;
    let target_name = '';
    if (type === 'CATEGORY') {
        target_name = document.getElementById('cc-create-target-select').value;
    } else if (type === 'BIN') {
        target_name = document.getElementById('cc-create-target-text').value.trim();
        if (!target_name) {
            alert('Please specify a bin location (e.g. BIN-A1)');
            return;
        }
    } else {
        target_name = 'All Categories';
    }

    const notes = document.getElementById('cc-create-notes').value.trim();

    try {
        const res = await apiFetch('/api/cycle-counts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type, target_name, notes })
        });

        closeModal('modal-cycle-count-create');
        showToast(`Cycle count sheet ${res.count_no} created with ${res.total_items} items!`, 'success');
        loadCycleCounts();
        openCycleCountDetail(res.id);
    } catch (e) {
        alert(`Failed to create cycle count: ${e.message}`);
    }
}

async function openCycleCountDetail(id) {
    try {
        const cc = await apiFetch(`/api/cycle-counts/${id}`);
        activeCycleCountData = cc;

        document.getElementById('cc-view-number').textContent = cc.count_no;
        const statusEl = document.getElementById('cc-view-status');
        statusEl.textContent = cc.status;
        statusEl.className = `status-badge cc-status-${(cc.status || 'open').toLowerCase()}`;

        document.getElementById('cc-view-scope').textContent = `${cc.type}: ${cc.target_name || 'All'}`;
        document.getElementById('cc-view-created-by').textContent = cc.created_by;
        document.getElementById('cc-view-created-at').textContent = cc.created_at ? new Date(cc.created_at).toLocaleString() : '—';

        const isManagerOrAdmin = state.currentUser && (state.currentUser.role === 'admin' || state.currentUser.role === 'manager');
        const isEditable = cc.status === 'OPEN' || cc.status === 'DRAFT';
        const isSubmitted = cc.status === 'SUBMITTED';

        const btnSave = document.getElementById('cc-btn-save-draft');
        const btnSub = document.getElementById('cc-btn-submit');
        const btnApp = document.getElementById('cc-btn-approve');
        const btnRej = document.getElementById('cc-btn-reject');

        if (btnSave) btnSave.style.display = isEditable ? 'inline-block' : 'none';
        if (btnSub) btnSub.style.display = isEditable ? 'inline-block' : 'none';
        if (btnApp) btnApp.style.display = (isSubmitted && isManagerOrAdmin) ? 'inline-block' : 'none';
        if (btnRej) btnRej.style.display = (isSubmitted && isManagerOrAdmin) ? 'inline-block' : 'none';

        renderCycleCountItems(cc.items || [], isEditable);
        updateCycleCountKPIs();

        document.getElementById('cc-list-view').style.display = 'none';
        document.getElementById('cc-active-view').style.display = 'block';
    } catch (e) {
        showToast(`Failed to load sheet details: ${e.message}`, 'error');
    }
}

function closeCycleCountDetail() {
    document.getElementById('cc-active-view').style.display = 'none';
    document.getElementById('cc-list-view').style.display = 'block';
    activeCycleCountData = null;
    loadCycleCounts();
}

function renderCycleCountItems(items, isEditable) {
    const tbody = document.getElementById('cc-items-tbody');
    if (!tbody) return;

    if (items.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:16px;" class="text-subtle">No matching items found for this audit scope.</td></tr>';
        return;
    }

    tbody.innerHTML = items.map(item => {
        const counted = item.counted_qty !== null && item.counted_qty !== undefined ? item.counted_qty : item.system_qty;
        const diff = counted - item.system_qty;
        const diffVal = diff * (item.unit_cost || 0);

        let diffClass = 'cc-variance-zero';
        if (diff > 0) diffClass = 'cc-variance-pos';
        else if (diff < 0) diffClass = 'cc-variance-neg';

        return `
        <tr id="cc-row-${item.id}" data-item-id="${item.id}" data-sku="${escapeHtml(item.sku)}">
            <td><strong class="mono" style="font-size:12px;">${escapeHtml(item.sku)}</strong></td>
            <td><div style="font-weight:600; font-size:12px;">${escapeHtml(item.name || item.sku)}</div></td>
            <td><span class="mono small text-subtle">${escapeHtml(item.bin_location || 'Central')}</span></td>
            <td style="text-align:right;"><span id="cc-sys-${item.id}">${item.system_qty}</span></td>
            <td style="text-align:center;">
                <input type="number" min="0" value="${counted}" 
                    style="width:80px; text-align:center; font-weight:700; font-size:13px;"
                    ${isEditable ? '' : 'disabled'}
                    oninput="onCycleCountQtyChange(${item.id}, this.value)">
            </td>
            <td style="text-align:right;" id="cc-diff-${item.id}" class="${diffClass}">
                ${diff > 0 ? '+' : ''}${diff}
            </td>
            <td style="text-align:right;"><span id="cc-cost-${item.id}">₹${(item.unit_cost || 0).toFixed(2)}</span></td>
            <td style="text-align:right;" id="cc-diffval-${item.id}" class="${diffClass}">
                ₹${diffVal.toFixed(2)}
            </td>
            <td>
                <input type="text" placeholder="Reason if variance..." value="${escapeHtml(item.discrepancy_reason || '')}"
                    style="width:100%; font-size:11px;"
                    ${isEditable ? '' : 'disabled'}
                    onchange="onCycleCountReasonChange(${item.id}, this.value)">
            </td>
        </tr>`;
    }).join('');
}

function onCycleCountQtyChange(itemId, newVal) {
    if (!activeCycleCountData) return;
    const item = (activeCycleCountData.items || []).find(it => it.id === itemId);
    if (!item) return;

    const val = parseInt(newVal, 10);
    item.counted_qty = isNaN(val) ? 0 : val;
    item.variance_qty = item.counted_qty - item.system_qty;
    item.variance_value = item.variance_qty * (item.unit_cost || 0);

    const diffEl = document.getElementById(`cc-diff-${itemId}`);
    const diffValEl = document.getElementById(`cc-diffval-${itemId}`);

    if (diffEl) {
        diffEl.textContent = (item.variance_qty > 0 ? '+' : '') + item.variance_qty;
        diffEl.className = item.variance_qty > 0 ? 'cc-variance-pos' : (item.variance_qty < 0 ? 'cc-variance-neg' : 'cc-variance-zero');
    }
    if (diffValEl) {
        diffValEl.textContent = `₹${item.variance_value.toFixed(2)}`;
        diffValEl.className = item.variance_qty > 0 ? 'cc-variance-pos' : (item.variance_qty < 0 ? 'cc-variance-neg' : 'cc-variance-zero');
    }

    updateCycleCountKPIs();
}

function onCycleCountReasonChange(itemId, val) {
    if (!activeCycleCountData) return;
    const item = (activeCycleCountData.items || []).find(it => it.id === itemId);
    if (item) {
        item.discrepancy_reason = val.trim();
    }
}

function updateCycleCountKPIs() {
    if (!activeCycleCountData) return;
    const items = activeCycleCountData.items || [];

    let totalSys = 0;
    let totalCount = 0;
    let totalVarQty = 0;
    let totalVarVal = 0;

    for (const it of items) {
        const sys = it.system_qty || 0;
        const cnt = it.counted_qty !== null && it.counted_qty !== undefined ? it.counted_qty : sys;
        const diff = cnt - sys;
        totalSys += sys;
        totalCount += cnt;
        totalVarQty += diff;
        totalVarVal += diff * (it.unit_cost || 0);
    }

    const itEl = document.getElementById('cc-kpi-items');
    const sysEl = document.getElementById('cc-kpi-system-qty');
    const cntEl = document.getElementById('cc-kpi-counted-qty');
    const vqEl = document.getElementById('cc-kpi-variance-qty');
    const vvEl = document.getElementById('cc-kpi-variance-val');

    if (itEl) itEl.textContent = items.length;
    if (sysEl) sysEl.textContent = totalSys;
    if (cntEl) cntEl.textContent = totalCount;
    if (vqEl) vqEl.textContent = (totalVarQty > 0 ? '+' : '') + totalVarQty;
    if (vvEl) vvEl.textContent = `₹${totalVarVal.toLocaleString('en-IN', {minimumFractionDigits: 2})}`;
}

function handleCycleCountBarcode(code) {
    if (!activeCycleCountData) {
        showToast('Open a cycle count sheet first to scan items.', 'warning');
        return;
    }

    const clean = code.trim().toLowerCase();
    const item = (activeCycleCountData.items || []).find(it => 
        (it.sku && it.sku.toLowerCase() === clean) || (it.name && it.name.toLowerCase().includes(clean))
    );

    if (!item) {
        showToast(`Item "${code}" does not belong to this count sheet scope!`, 'error');
        return;
    }

    const current = item.counted_qty !== null && item.counted_qty !== undefined ? item.counted_qty : item.system_qty;
    item.counted_qty = current + 1;
    item.variance_qty = item.counted_qty - item.system_qty;
    item.variance_value = item.variance_qty * (item.unit_cost || 0);

    const row = document.getElementById(`cc-row-${item.id}`);
    if (row) {
        const input = row.querySelector('input[type="number"]');
        if (input) input.value = item.counted_qty;
        onCycleCountQtyChange(item.id, item.counted_qty);
        row.scrollIntoView({ behavior: 'smooth', block: 'center' });
        row.style.background = 'rgba(61,169,255,0.2)';
        setTimeout(() => row.style.background = '', 1500);
    }

    showToast(`Counted +1 for SKU: ${item.sku}. Total: ${item.counted_qty}`, 'success');
}

async function saveCycleCountDraft() {
    if (!activeCycleCountData) return;
    const items = activeCycleCountData.items || [];
    const payloadItems = items.map(it => ({
        item_id: it.item_id || it.id,
        counted_qty: it.counted_qty !== null && it.counted_qty !== undefined ? it.counted_qty : it.system_qty,
        discrepancy_reason: it.discrepancy_reason || null
    }));

    try {
        await apiFetch(`/api/cycle-counts/${activeCycleCountData.id}/count`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items: payloadItems })
        });
        showToast('Draft counts saved successfully.', 'success');
    } catch (e) {
        showToast(`Save failed: ${e.message}`, 'error');
    }
}

async function submitCycleCountForApproval() {
    if (!activeCycleCountData) return;
    await saveCycleCountDraft();

    try {
        const res = await apiFetch(`/api/cycle-counts/${activeCycleCountData.id}/submit`, {
            method: 'POST'
        });
        showToast(`Cycle count submitted for manager approval!`, 'success');
        openCycleCountDetail(activeCycleCountData.id);
    } catch (e) {
        showToast(`Submit failed: ${e.message}`, 'error');
    }
}

async function approveCycleCount() {
    if (!activeCycleCountData) return;
    if (!confirm('Approve this cycle count? Physical adjustments will be permanently posted to stock ledger.')) return;

    try {
        const res = await apiFetch(`/api/cycle-counts/${activeCycleCountData.id}/approve`, {
            method: 'POST'
        });
        showToast('✅ Cycle count approved! Inventory balances adjusted.', 'success');
        openCycleCountDetail(activeCycleCountData.id);
        if (typeof fetchInventory === 'function') fetchInventory();
        if (typeof fetchMovements === 'function') fetchMovements();
    } catch (e) {
        showToast(`Approval failed: ${e.message}`, 'error');
    }
}

async function rejectCycleCount() {
    if (!activeCycleCountData) return;
    const reason = prompt('Please enter rejection reason:');
    if (!reason) return;

    try {
        await apiFetch(`/api/cycle-counts/${activeCycleCountData.id}/reject`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reason })
        });
        showToast('Cycle count rejected.', 'info');
        openCycleCountDetail(activeCycleCountData.id);
    } catch (e) {
        showToast(`Rejection failed: ${e.message}`, 'error');
    }
}

function openMobileAlerts() {
    switchTab('dashboard');
    toggleNotifDropdown();
}


// ==============================================
//  ADVANCED ANALYTICS & INTELLIGENCE CONTROLLERS
// ==============================================

state.cachedAnalytics = null;
state.currentMatrixFilter = 'ALL';
state.analyticsSearchQuery = '';

async function fetchAnalytics() {
    try {
        const data = await apiFetch('/api/analytics/abc-xyz');
        state.cachedAnalytics = data;
        renderAnalyticsOverview(data);
        renderAbcXyzMatrix(data);
        renderAnalyticsTable(data.items || []);
    } catch (e) {
        console.error('Error loading analytics:', e);
        showToast('Error loading ABC-XYZ analytics: ' + (e.message || e), 'error');
    }
}

function renderAnalyticsOverview(data) {
    const cogsEl = document.getElementById('an-cogs-val');
    const aCountEl = document.getElementById('an-a-count');
    const aPctEl = document.getElementById('an-a-pct');
    const xCountEl = document.getElementById('an-x-count');

    if (cogsEl) cogsEl.textContent = formatINR(data.total_annual_cogs || 0);
    if (aCountEl) aCountEl.textContent = `${data.abc_distribution?.A || 0} SKUs`;
    if (aPctEl) aPctEl.textContent = `Top 80% (${data.total_items ? Math.round((data.abc_distribution?.A || 0) / data.total_items * 100) : 0}% of catalog)`;
    if (xCountEl) xCountEl.textContent = `${data.xyz_distribution?.X || 0} SKUs`;

    // Pareto distribution boxes
    const paretoA = document.getElementById('pareto-a-summary');
    const paretoB = document.getElementById('pareto-b-summary');
    const paretoC = document.getElementById('pareto-c-summary');
    if (paretoA) paretoA.textContent = `${data.abc_distribution?.A || 0} items`;
    if (paretoB) paretoB.textContent = `${data.abc_distribution?.B || 0} items`;
    if (paretoC) paretoC.textContent = `${data.abc_distribution?.C || 0} items`;

    const paretoX = document.getElementById('pareto-x-summary');
    const paretoY = document.getElementById('pareto-y-summary');
    const paretoZ = document.getElementById('pareto-z-summary');
    if (paretoX) paretoX.textContent = `${data.xyz_distribution?.X || 0} items`;
    if (paretoY) paretoY.textContent = `${data.xyz_distribution?.Y || 0} items`;
    if (paretoZ) paretoZ.textContent = `${data.xyz_distribution?.Z || 0} items`;
}

function renderAbcXyzMatrix(data) {
    const matrix = data.matrix || {};
    const cells = ['AX', 'AY', 'AZ', 'BX', 'BY', 'BZ', 'CX', 'CY', 'CZ'];

    cells.forEach(cell => {
        const cellData = matrix[cell] || { count: 0, total_value: 0, percentage_value: 0 };
        const cntEl = document.getElementById(`cnt-${cell}`);
        const valEl = document.getElementById(`val-${cell}`);
        const pctEl = document.getElementById(`pct-${cell}`);

        if (cntEl) cntEl.textContent = cellData.count;
        if (valEl) valEl.textContent = formatINRCompact(cellData.total_value);
        if (pctEl) pctEl.textContent = `${cellData.percentage_value}% share`;
    });
}

function filterMatrixCell(cellCode) {
    state.currentMatrixFilter = cellCode;
    const labelEl = document.getElementById('matrix-active-filter-label');
    const resetBtn = document.getElementById('btn-reset-matrix-filter');
    const cells = document.querySelectorAll('.matrix-cell');

    cells.forEach(c => c.classList.remove('active-filter'));

    if (cellCode === 'ALL') {
        if (labelEl) labelEl.textContent = 'Showing: All 9 Matrix Classes';
        if (resetBtn) resetBtn.style.display = 'none';
        applyAnalyticsFilter();
    } else {
        const activeCellEl = document.getElementById(`cell-${cellCode}`);
        if (activeCellEl) activeCellEl.classList.add('active-filter');

        const cellInfo = state.cachedAnalytics?.matrix?.[cellCode];
        if (labelEl) labelEl.textContent = `Filtered: Class ${cellCode} (${cellInfo?.count || 0} items, ${formatINR(cellInfo?.total_value || 0)})`;
        if (resetBtn) resetBtn.style.display = 'inline-block';
        applyAnalyticsFilter();
    }
}

function handleAnalyticsSearch(val) {
    state.analyticsSearchQuery = (val || '').toLowerCase().trim();
    applyAnalyticsFilter();
}

function applyAnalyticsFilter() {
    if (!state.cachedAnalytics || !state.cachedAnalytics.items) return;

    let items = state.cachedAnalytics.items;

    if (state.currentMatrixFilter && state.currentMatrixFilter !== 'ALL') {
        items = items.filter(it => it.matrix_class === state.currentMatrixFilter);
    }

    if (state.analyticsSearchQuery) {
        items = items.filter(it =>
            (it.sku || '').toLowerCase().includes(state.analyticsSearchQuery) ||
            (it.name || '').toLowerCase().includes(state.analyticsSearchQuery) ||
            (it.category || '').toLowerCase().includes(state.analyticsSearchQuery)
        );
    }

    renderAnalyticsTable(items);
}

function renderAnalyticsTable(items) {
    const tbody = document.getElementById('analytics-items-tbody');
    if (!tbody) return;

    if (!items || items.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" style="text-align:center; padding:18px;" class="text-subtle">No spares match the current matrix filter.</td></tr>';
        return;
    }

    tbody.innerHTML = items.map(it => {
        const mClass = (it.matrix_class || 'CZ').toUpperCase();
        const badgeClass = `matrix-badge matrix-badge-${mClass.toLowerCase()}`;
        return `
            <tr class="clickable-row" onclick="openItemDrawer(${it.id})">
                <td class="mono font-bold" style="color:var(--text-heading);">${escapeHtml(it.sku)}</td>
                <td>${escapeHtml(it.name)}</td>
                <td><span class="text-subtle small">${escapeHtml(it.category || '—')}</span></td>
                <td style="text-align:center;"><span class="${badgeClass}">${mClass}</span></td>
                <td style="text-align:right; font-weight:600;">${formatINR(it.annual_consumption_value)}</td>
                <td style="text-align:right;"><span class="text-subtle small">${it.cum_pct}%</span></td>
                <td style="text-align:right;" class="mono small">${Number(it.weekly_cv || 0).toFixed(2)}</td>
                <td style="text-align:right;">${Number(it.avg_weekly_demand || 0).toFixed(1)}/wk</td>
                <td style="text-align:right; font-weight:600;">${it.quantity}</td>
                <td style="text-align:center;">
                    <button class="btn btn-xs btn-outline" onclick="event.stopPropagation(); openItemDrawer(${it.id})" title="View Holt-Winters forecast & what-if simulator">Forecast →</button>
                </td>
            </tr>
        `;
    }).join('');
}

async function fetchAnomalies() {
    try {
        const anomalies = await apiFetch('/api/analytics/anomalies');
        const countEl = document.getElementById('an-outliers-val');
        if (countEl) countEl.textContent = `${anomalies.length} Alerts`;
        renderAnomaliesTable(anomalies);
    } catch (e) {
        console.error('Error fetching movement anomalies:', e);
    }
}

function renderAnomaliesTable(anomalies) {
    const tbody = document.getElementById('analytics-anomalies-tbody');
    if (!tbody) return;

    if (!anomalies || anomalies.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:16px;" class="text-subtle">No statistical movement anomalies detected (|Robust Z| &gt; 3.0).</td></tr>';
        return;
    }

    tbody.innerHTML = anomalies.map(a => {
        const typeClass = a.type === 'OUT' ? 'status-badge-out' : (a.type === 'IN' ? 'status-badge-ok' : 'status-badge-low');
        const tagHtml = a.is_synthetic ?
            '<span class="anomaly-tag-synthetic">[DEMO SYNTHETIC]</span>' :
            '<span class="anomaly-tag-live">LIVE DATA</span>';

        return `
            <tr>
                <td class="mono small" style="white-space:nowrap;">${(a.timestamp || '').slice(0, 16)}</td>
                <td><span class="status-badge ${typeClass}">${a.type}</span></td>
                <td>
                    <div class="mono font-bold" style="font-size:12px;">${escapeHtml(a.sku)}</div>
                    <div class="text-subtle small">${escapeHtml(a.name)}</div>
                </td>
                <td style="text-align:right; font-weight:700; color:var(--text-heading);">${Math.abs(a.quantity || 0)}</td>
                <td style="text-align:right;" class="mono small">${a.median}</td>
                <td style="text-align:right; font-weight:700; color:var(--out);">${a.robust_z}</td>
                <td><span class="text-subtle small">${escapeHtml(a.user || 'storekeeper')}</span></td>
                <td style="font-size:12px; line-height:1.4;">${escapeHtml(a.reason)}</td>
                <td>${tagHtml}</td>
            </tr>
        `;
    }).join('');
}

async function seedAnalyticsDemo() {
    const btn = event?.currentTarget;
    if (btn) btn.disabled = true;
    try {
        showToast('Generating 12 months of synthetic history with seasonality & anomalies...', 'info');
        const res = await apiFetch('/api/analytics/seed-demo-history', { method: 'POST' });
        showToast(`Success: Seeded ${res.movements_seeded} movements with ${res.anomalies_injected} labeled anomalies [DEMO SYNTHETIC]!`, 'success');
        await fetchAnalytics();
        await fetchAnomalies();
        await refreshDashboard();
    } catch (e) {
        showToast('Error seeding demo history: ' + (e.message || e), 'error');
    } finally {
        if (btn) btn.disabled = false;
    }
}

// ─── Drawer Forecast Chart & What-If Simulation ─────────────────────────

async function loadDrawerAdvancedForecast(itemId) {
    try {
        const data = await apiFetch(`/api/analytics/forecast/${itemId}`);
        const modelEl = document.getElementById('drawerForecastModel');
        const wapeEl = document.getElementById('drawerForecastWape');
        const accEl = document.getElementById('drawerForecastAccuracy');
        const relEl = document.getElementById('drawerForecastReliability');

        if (modelEl) modelEl.textContent = data.model || 'Exponential Smoothing';
        if (wapeEl) wapeEl.textContent = `WAPE: ${data.backtest_metrics?.wape ?? '--'}%`;
        if (accEl) accEl.textContent = `${data.backtest_metrics?.accuracy_pct ?? '--'}%`;

        if (relEl) {
            const isRel = data.backtest_metrics?.is_reliable;
            relEl.textContent = isRel ? '✓ Reliable Model' : '⚠️ Volatile / Unreliable';
            relEl.style.background = isRel ? 'rgba(34,197,94,0.18)' : 'rgba(255,122,26,0.18)';
            relEl.style.color = isRel ? '#22C55E' : '#FF7A1A';
            relEl.title = data.backtest_metrics?.reliability_note || '';
        }

        renderForecastCanvasChart(data);
    } catch (e) {
        console.warn('Error loading advanced forecast:', e);
    }
}

function renderForecastCanvasChart(data) {
    const canvas = document.getElementById('drawerForecastCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);

    const history = data.history || [];
    const forecast = data.forecast || [];
    if (history.length === 0 && forecast.length === 0) return;

    // Collect all values to find max scale
    const allVals = [
        ...history.map(pt => pt.actual || 0),
        ...forecast.map(pt => pt.upper || pt.forecast || 0)
    ];
    const maxVal = Math.max(10, Math.max(...allVals) * 1.15);

    const totalPoints = history.length + forecast.length;
    const stepX = (w - 40) / Math.max(1, totalPoints - 1);
    const padX = 20;
    const padY = 20;
    const graphH = h - padY * 2;

    const getY = (val) => h - padY - (val / maxVal) * graphH;

    // Draw horizontal grid lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    for (let r = 0; r <= 3; r++) {
        const y = padY + (r / 3) * graphH;
        ctx.beginPath();
        ctx.moveTo(padX, y);
        ctx.lineTo(w - padX, y);
        ctx.stroke();
    }

    // 1. Draw Prediction Interval Shaded Band for Forecast
    if (forecast.length > 0) {
        const startX = padX + (history.length - 1) * stepX;
        ctx.fillStyle = 'rgba(61, 169, 255, 0.16)';
        ctx.beginPath();
        // Top edge: upper bound
        forecast.forEach((pt, idx) => {
            const x = padX + (history.length + idx) * stepX;
            const y = getY(pt.upper || pt.forecast);
            if (idx === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        // Bottom edge: lower bound (reversed)
        for (let idx = forecast.length - 1; idx >= 0; idx--) {
            const pt = forecast[idx];
            const x = padX + (history.length + idx) * stepX;
            const y = getY(pt.lower || 0);
            ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fill();
    }

    // 2. Draw Historical Demand Line
    if (history.length > 0) {
        ctx.strokeStyle = '#3DA9FF';
        ctx.lineWidth = 2;
        ctx.beginPath();
        history.forEach((pt, idx) => {
            const x = padX + idx * stepX;
            const y = getY(pt.actual || 0);
            if (idx === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.stroke();

        // Historical Dots
        ctx.fillStyle = '#3DA9FF';
        history.forEach((pt, idx) => {
            const x = padX + idx * stepX;
            const y = getY(pt.actual || 0);
            ctx.beginPath();
            ctx.arc(x, y, 2.5, 0, Math.PI * 2);
            ctx.fill();
        });
    }

    // 3. Draw Future Forecast Line (dashed green)
    if (forecast.length > 0) {
        ctx.strokeStyle = '#22C55E';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        // Connect from last historical point
        if (history.length > 0) {
            const lastH = history[history.length - 1];
            ctx.moveTo(padX + (history.length - 1) * stepX, getY(lastH.actual || 0));
        }
        forecast.forEach((pt, idx) => {
            const x = padX + (history.length + idx) * stepX;
            const y = getY(pt.forecast || 0);
            if (idx === 0 && history.length === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.stroke();
        ctx.setLineDash([]); // reset

        // Forecast Dots
        ctx.fillStyle = '#22C55E';
        forecast.forEach((pt, idx) => {
            const x = padX + (history.length + idx) * stepX;
            const y = getY(pt.forecast || 0);
            ctx.beginPath();
            ctx.arc(x, y, 3, 0, Math.PI * 2);
            ctx.fill();
        });
    }

    // Labels
    ctx.fillStyle = '#94A3B8';
    ctx.font = '9px monospace';
    ctx.fillText('History (Past Weeks)', padX, h - 4);
    ctx.fillText('8-Wk Forecast →', w - padX - 80, h - 4);
}

async function loadDrawerSafetyStock(itemId, serviceLevel) {
    try {
        const url = `/api/analytics/safety-stock/${itemId}` + (serviceLevel ? `?service_level=${encodeURIComponent(serviceLevel)}` : '');
        const data = await apiFetch(url);

        const formEl = document.getElementById('drawerSSFormula');
        const ropFormEl = document.getElementById('drawerROPFormula');
        const statRopEl = document.getElementById('drawerStatRopVal');
        const statSsEl = document.getElementById('drawerStatSsVal');
        const tradRopEl = document.getElementById('drawerTradRopVal');
        const tradSsEl = document.getElementById('drawerTradSsVal');

        if (formEl) formEl.textContent = data.formula_text;
        if (ropFormEl) ropFormEl.textContent = data.rop_formula_text;
        if (statRopEl) statRopEl.textContent = `${data.reorder_point} pcs`;
        if (statSsEl) statSsEl.textContent = `SS: ${data.safety_stock} pcs`;
        if (tradRopEl) tradRopEl.textContent = `${data.traditional_comparison?.reorder_point || '--'} pcs`;
        if (tradSsEl) tradSsEl.textContent = `Fixed ${data.traditional_comparison?.safety_days || 14}d (${data.traditional_comparison?.safety_stock || '--'} pcs)`;
    } catch (e) {
        console.warn('Error loading safety stock breakdown:', e);
    }
}

function changeDrawerServiceLevel(newLevel) {
    if (!state.selectedDrawerItem) return;
    loadDrawerSafetyStock(state.selectedDrawerItem.id, newLevel);
}

function initDrawerWhatIf(itemId) {
    const ltSlider = document.getElementById('drawerWhatIfLTSlider');
    const demandSlider = document.getElementById('drawerWhatIfDemandSlider');
    if (ltSlider) ltSlider.value = 0;
    if (demandSlider) demandSlider.value = 0;
    handleDrawerWhatIfChange();
}

async function handleDrawerWhatIfChange() {
    if (!state.selectedDrawerItem) return;

    const ltSlider = document.getElementById('drawerWhatIfLTSlider');
    const demandSlider = document.getElementById('drawerWhatIfDemandSlider');
    const ltValEl = document.getElementById('drawerWhatIfLTVal');
    const demandValEl = document.getElementById('drawerWhatIfDemandVal');

    const ltDelta = parseInt(ltSlider?.value || 0, 10);
    const demandDelta = parseInt(demandSlider?.value || 0, 10);

    if (ltValEl) ltValEl.textContent = (ltDelta >= 0 ? '+' : '') + ltDelta + ' days';
    if (demandValEl) demandValEl.textContent = (demandDelta >= 0 ? '+' : '') + demandDelta + '%';

    try {
        const res = await apiFetch('/api/analytics/what-if', {
            method: 'POST',
            body: JSON.stringify({
                item_id: state.selectedDrawerItem.id,
                lead_time_delta_days: ltDelta,
                demand_increase_pct: demandDelta
            })
        });

        const sim = res.simulated_scenario || {};
        const dailyEl = document.getElementById('drawerWhatIfDailyRate');
        const dateEl = document.getElementById('drawerWhatIfDate');
        const runwayEl = document.getElementById('drawerWhatIfRunway');
        const riskBadge = document.getElementById('drawerWhatIfRiskBadge');
        const riskMsg = document.getElementById('drawerWhatIfRiskMsg');

        if (dailyEl) dailyEl.textContent = `${sim.simulated_daily_demand || '--'} units/day`;
        if (dateEl) dateEl.textContent = sim.simulated_stockout_date || '--';
        if (runwayEl) runwayEl.textContent = `${sim.simulated_runway_days ?? '--'} days`;
        if (riskMsg) riskMsg.textContent = sim.risk_message || '';

        if (riskBadge) {
            riskBadge.textContent = sim.risk_level || 'SAFE';
            if (sim.risk_level === 'CRITICAL' || sim.risk_level === 'OUT') {
                riskBadge.style.background = 'rgba(239, 68, 68, 0.2)';
                riskBadge.style.color = '#EF4444';
            } else if (sim.risk_level === 'WARNING') {
                riskBadge.style.background = 'rgba(255, 122, 26, 0.2)';
                riskBadge.style.color = '#FF7A1A';
            } else {
                riskBadge.style.background = 'rgba(34, 197, 94, 0.2)';
                riskBadge.style.color = '#22C55E';
            }
        }
    } catch (e) {
        console.warn('Error running what-if simulator:', e);
    }
}


// ═════════════════════════════════════════════════════════════════════════════
//  SALES OPPORTUNITIES & WHATSAPP COMMUNICATIONS CONTROLLER
// ═════════════════════════════════════════════════════════════════════════════

state.activeOppWindow = 14;
state.currentWALang = 'en';

function updateSalesFunnelUI(funnel) {
    if (!funnel) return;
    const stages = funnel.funnel_stages || [];
    const conv = funnel.conversion_rates || {};

    // Stage 1: Identified
    const st1 = stages.find(s => s.stage_key === 'IDENTIFIED') || {};
    const cnt1 = document.getElementById('funnel-count-1');
    const val1 = document.getElementById('funnel-val-1');
    const bar1 = document.getElementById('funnel-bar-1');
    if (cnt1) cnt1.textContent = `${st1.count || 0} Opps`;
    if (val1) val1.textContent = formatINR(st1.value || 0);
    if (bar1) bar1.style.width = '100%';

    // Stage 2: Messaged
    const st2 = stages.find(s => s.stage_key === 'MESSAGED') || {};
    const cnt2 = document.getElementById('funnel-count-2');
    const val2 = document.getElementById('funnel-val-2');
    const conv1 = document.getElementById('funnel-conv-1');
    const bar2 = document.getElementById('funnel-bar-2');
    if (cnt2) cnt2.textContent = `${st2.count || 0} Sent`;
    if (val2) val2.textContent = formatINR(st2.value || 0);
    if (conv1) conv1.textContent = `${conv.identified_to_messaged_pct || 0}%`;
    const w2 = Math.min(100, Math.max(8, conv.identified_to_messaged_pct || 0));
    if (bar2) bar2.style.width = `${w2}%`;

    // Stage 3: Quoted
    const st3 = stages.find(s => s.stage_key === 'QUOTED') || {};
    const cnt3 = document.getElementById('funnel-count-3');
    const val3 = document.getElementById('funnel-val-3');
    const conv2 = document.getElementById('funnel-conv-2');
    const bar3 = document.getElementById('funnel-bar-3');
    if (cnt3) cnt3.textContent = `${st3.count || 0} Quotes`;
    if (val3) val3.textContent = formatINR(st3.value || 0);
    if (conv2) conv2.textContent = `${conv.messaged_to_quote_pct || 0}%`;
    const w3 = Math.min(100, Math.max(6, conv.messaged_to_quote_pct || 0));
    if (bar3) bar3.style.width = `${w3}%`;

    // Stage 4: Won
    const st4 = stages.find(s => s.stage_key === 'WON') || {};
    const cnt4 = document.getElementById('funnel-count-4');
    const val4 = document.getElementById('funnel-val-4');
    const conv3 = document.getElementById('funnel-conv-3');
    const bar4 = document.getElementById('funnel-bar-4');
    if (cnt4) cnt4.textContent = `${st4.count || 0} Orders`;
    if (val4) val4.textContent = formatINR(st4.value || 0);
    if (conv3) conv3.textContent = `${conv.quote_to_won_pct || 0}%`;
    const w4 = Math.min(100, Math.max(4, conv.quote_to_won_pct || 0));
    if (bar4) bar4.style.width = `${w4}%`;

    // Win Rate Badge
    const winBadge = document.getElementById('funnelWinRateBadge');
    if (winBadge) winBadge.textContent = `Win Rate: ${conv.overall_win_rate_pct || 0}%`;
}

async function fetchOpportunities(windowDays = null) {
    try {
        const tbody = document.getElementById('sales-opportunities-table-body');
        if (tbody) tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:16px;" class="text-subtle">Computing customer purchase cycles & stock coverage...</td></tr>`;

        const w = windowDays !== undefined && windowDays !== null ? windowDays : (state.activeOppWindow !== undefined ? state.activeOppWindow : 14);
        const url = w !== null ? `/api/sales/opportunities?window_days=${encodeURIComponent(w)}` : '/api/sales/opportunities';
        const data = await apiFetch(url);

        state.cachedOpportunities = data.opportunities || [];

        // Update Counter Cards
        const countEl = document.getElementById('opps-stat-count');
        const valEl = document.getElementById('opps-stat-val');
        const shortEl = document.getElementById('opps-stat-shortfall');
        const covEl = document.getElementById('opps-stat-covered');

        if (countEl) countEl.textContent = data.total_opportunities || 0;
        if (valEl) valEl.textContent = formatINR(data.total_expected_value || 0);
        if (shortEl) shortEl.textContent = data.shortfall_count || 0;
        if (covEl) covEl.textContent = data.covered_count || 0;

        filterOpportunitiesUI();
    } catch (e) {
        console.error('Failed to fetch opportunities:', e);
        const tbody = document.getElementById('sales-opportunities-table-body');
        if (tbody) tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:16px; color:var(--out);">Failed to load opportunities: ${escapeHtml(e.message)}</td></tr>`;
    }
}

function setOppWindow(days, btn) {
    state.activeOppWindow = days;
    document.querySelectorAll('.opp-window-pill').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    fetchOpportunities(days);
}

function filterOpportunitiesUI() {
    const opps = state.cachedOpportunities || [];
    const search = (document.getElementById('opp-search-input')?.value || '').toLowerCase().trim();
    const stockFilter = document.getElementById('opp-stock-filter')?.value || 'ALL';
    const confFilter = document.getElementById('opp-conf-filter')?.value || 'ALL';

    const filtered = opps.filter(o => {
        if (search) {
            const matchesCust = (o.customer_name || '').toLowerCase().includes(search);
            const matchesItem = (o.item_name || '').toLowerCase().includes(search);
            const matchesSku = (o.sku || '').toLowerCase().includes(search);
            if (!matchesCust && !matchesItem && !matchesSku) return false;
        }
        if (stockFilter !== 'ALL' && o.stock_status !== stockFilter) return false;
        if (confFilter !== 'ALL' && o.confidence !== confFilter) return false;
        return true;
    });

    renderOpportunitiesTable(filtered);
}

function renderOpportunitiesTable(opps) {
    const tbody = document.getElementById('sales-opportunities-table-body');
    if (!tbody) return;

    if (!opps || opps.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:24px;" class="text-subtle">No re-order opportunities match this filter criteria. Try expanding the timeframe window.</td></tr>`;
        return;
    }

    tbody.innerHTML = opps.map(o => {
        // Due tag
        let dueBadgeClass = 'due-future';
        let dueText = `In ${o.days_until_due} days`;
        if (o.days_until_due < 0) {
            dueBadgeClass = 'due-overdue';
            dueText = `Overdue ${Math.abs(o.days_until_due)}d`;
        } else if (o.days_until_due <= 7) {
            dueBadgeClass = 'due-7d';
            dueText = o.days_until_due === 0 ? 'Due Today' : `In ${o.days_until_due}d`;
        } else if (o.days_until_due <= 14) {
            dueBadgeClass = 'due-14d';
        }

        // Confidence pill
        let confClass = 'confidence-low';
        let confIcon = '⚪';
        if (o.confidence === 'HIGH') {
            confClass = 'confidence-high';
            confIcon = '🟢';
        } else if (o.confidence === 'MEDIUM') {
            confClass = 'confidence-medium';
            confIcon = '🟡';
        }

        // Stock coverage pill
        let stockPill = `<span class="stock-pill stock-covered" title="Depot stock (${o.available_stock} available) fully covers projected requirement (${o.usual_qty} ${o.unit})">✅ Ready (${o.available_stock} avail)</span>`;
        if (o.stock_status === 'SHORTFALL') {
            stockPill = `<span class="stock-pill stock-shortfall" title="Shortfall of ${o.shortfall_qty} ${o.unit}! Only ${o.available_stock} currently in stock. Purchasing should create PO first.">⚠️ Shortfall: -${o.shortfall_qty} ${o.unit}</span>`;
        }

        // Customer Opt-out Tag
        const optOutTag = o.whatsapp_opt_out ? `<span class="opt-out-tag" title="Customer opted out of promotional communications">Opted Out</span>` : '';

        // WhatsApp Action button
        const waBtnDisabled = o.whatsapp_opt_out;
        const waBtnTitle = o.whatsapp_opt_out
            ? 'Customer has opted out of WhatsApp messages'
            : 'Open WhatsApp with prefilled re-order quote in English/Hindi';

        return `
            <tr>
                <td>
                    <strong style="color:var(--text-heading); font-size:13px;">${escapeHtml(o.customer_name)}</strong>
                    ${optOutTag}
                    <div style="font-size:11px; color:var(--text-subtle);">
                        ${escapeHtml(o.customer_city)} • <span class="badge" style="font-size:10px;">${escapeHtml(o.price_tier)}</span>
                        ${o.contact_person ? ` • ${escapeHtml(o.contact_person)}` : ''}
                    </div>
                </td>
                <td>
                    <strong style="color:var(--brand-primary); font-family:monospace; font-size:12px;">${escapeHtml(o.sku)}</strong>
                    <div style="font-size:12px; color:var(--text-heading); max-width:200px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${escapeHtml(o.item_name)}">
                        ${escapeHtml(o.item_name)}
                    </div>
                </td>
                <td>
                    <strong style="font-size:12px;">Every ~${o.cadence_days} days</strong>
                    <div style="font-size:11px; color:var(--text-subtle);">Last: ${escapeHtml(o.last_order_date)} (${o.total_orders} orders)</div>
                </td>
                <td>
                    <span class="due-badge ${dueBadgeClass}">${dueText}</span>
                    <div style="font-size:11px; color:var(--text-subtle); margin-top:2px;">${escapeHtml(o.predicted_date)}</div>
                </td>
                <td>
                    <span class="confidence-pill ${confClass}" title="${escapeHtml(o.confidence_reason)}">
                        ${confIcon} ${o.confidence}
                    </span>
                </td>
                <td style="text-align:right;">
                    <strong style="font-size:13px; color:var(--text-heading);">${formatINR(o.expected_value)}</strong>
                    <div style="font-size:11px; color:var(--text-subtle);">${o.usual_qty} ${o.unit} @ ₹${o.unit_price}</div>
                </td>
                <td>${stockPill}</td>
                <td style="text-align:right;">
                    <div style="display:flex; gap:6px; justify-content:flex-end; align-items:center;">
                        <button class="btn btn-xs btn-whatsapp" ${waBtnDisabled ? 'disabled style="opacity:0.4; cursor:not-allowed;"' : ''} onclick="openOpportunityWhatsAppModal('${o.id}')" title="${waBtnTitle}">
                            💬 WhatsApp
                        </button>
                        <button class="btn btn-xs btn-primary role-manager-admin" onclick="createQuoteFromOpportunity('${o.id}')" title="Create draft quotation with these lines">
                            📄 Quote
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

async function createQuoteFromOpportunity(oppId) {
    if (!confirm('Generate a formal quotation from this predicted re-order opportunity?')) return;
    try {
        const quote = await apiFetch(`/api/sales/opportunities/${encodeURIComponent(oppId)}/quote`, {
            method: 'POST'
        });
        showToast(`Quotation ${quote.order_no} created successfully! Total: ${formatINR(quote.grand_total)}`, 'success');
        // Switch to Orders & Quotes subtab and refresh
        switchSalesSubtab('orders');
    } catch (e) {
        showToast(e.message || 'Failed to create quotation from opportunity.', 'error');
    }
}

async function toggleCustomerWhatsAppOpt(customerId, currentOptOut) {
    try {
        await apiFetch(`/api/customers/${customerId}/whatsapp-opt`, {
            method: 'PUT',
            body: JSON.stringify({ opt_out: !currentOptOut })
        });
        showToast(`Customer WhatsApp opt-out status updated.`, 'success');
        fetchOpportunities();
        fetchCustomers();
    } catch (e) {
        showToast(e.message || 'Failed to update opt-out status.', 'error');
    }
}

// ─────────────────────────────────────────────────────────────────────────────
//  WHATSAPP MODAL & COMMUNICATIONS DISPATCH
// ─────────────────────────────────────────────────────────────────────────────

async function openOpportunityWhatsAppModal(oppId) {
    try {
        state.currentWALang = 'en';
        document.getElementById('wa-modal-title').textContent = 'Send Re-Order Proposal via WhatsApp';
        document.getElementById('wa-modal-subtitle').textContent = 'Prompt buyer with cadence reminder and prefilled quote';
        document.getElementById('wa-template-type').value = 'opportunity';
        document.getElementById('wa-ref-id').value = oppId;
        document.getElementById('wa-lang').value = 'en';

        // Load preview
        const res = await apiFetch('/api/communications/whatsapp/preview', {
            method: 'POST',
            body: JSON.stringify({
                template_type: 'opportunity',
                ref_id: oppId,
                lang: 'en'
            })
        });

        const opp = (state.cachedOpportunities || []).find(o => o.id === oppId);
        document.getElementById('wa-recipient-name').value = opp ? `${opp.customer_name} (${opp.contact_person || 'Buyer'})` : 'Customer';
        document.getElementById('wa-recipient-phone').value = res.recipient_phone || (opp ? opp.customer_phone : '');
        document.getElementById('wa-message-body').value = res.message || '';
        document.getElementById('wa-customer-id').value = opp ? opp.customer_id : '';
        document.getElementById('wa-supplier-id').value = '';

        // Opt out alert
        const optAlert = document.getElementById('wa-opt-out-alert');
        if (optAlert) optAlert.style.display = res.opted_out ? 'block' : 'none';

        // Lang tabs
        document.querySelectorAll('.wa-lang-tab').forEach(t => t.classList.remove('active'));
        document.getElementById('wa-btn-lang-en')?.classList.add('active');

        updateWALinkPreview();
        openModal('modal-whatsapp');
    } catch (e) {
        showToast(e.message || 'Failed to preview WhatsApp message.', 'error');
    }
}

async function openPOWhatsAppModal(poNo, supplierName) {
    try {
        state.currentWALang = 'en';
        document.getElementById('wa-modal-title').textContent = 'Send Approved PO to Supplier via WhatsApp';
        document.getElementById('wa-modal-subtitle').textContent = `Official purchase order dispatch for PO #${poNo}`;
        document.getElementById('wa-template-type').value = 'po';
        document.getElementById('wa-ref-id').value = String(poNo);
        document.getElementById('wa-lang').value = 'en';
        document.getElementById('wa-recipient-name').value = supplierName || 'Approved Supplier';
        document.getElementById('wa-customer-id').value = '';
        document.getElementById('wa-supplier-id').value = '';

        const optAlert = document.getElementById('wa-opt-out-alert');
        if (optAlert) optAlert.style.display = 'none';

        // Load preview
        const res = await apiFetch('/api/communications/whatsapp/preview', {
            method: 'POST',
            body: JSON.stringify({
                template_type: 'po',
                ref_id: String(poNo),
                lang: 'en'
            })
        });

        document.getElementById('wa-recipient-phone').value = res.recipient_phone || '';
        document.getElementById('wa-message-body').value = res.message || '';

        // Lang tabs
        document.querySelectorAll('.wa-lang-tab').forEach(t => t.classList.remove('active'));
        document.getElementById('wa-btn-lang-en')?.classList.add('active');

        updateWALinkPreview();
        openModal('modal-whatsapp');
    } catch (e) {
        showToast(e.message || 'Failed to preview PO WhatsApp message.', 'error');
    }
}

async function switchWALang(lang) {
    state.currentWALang = lang;
    document.getElementById('wa-lang').value = lang;
    document.querySelectorAll('.wa-lang-tab').forEach(t => t.classList.remove('active'));
    document.getElementById(`wa-btn-lang-${lang}`)?.classList.add('active');

    const templateType = document.getElementById('wa-template-type')?.value || 'opportunity';
    const refId = document.getElementById('wa-ref-id')?.value || '';

    try {
        const res = await apiFetch('/api/communications/whatsapp/preview', {
            method: 'POST',
            body: JSON.stringify({
                template_type: templateType,
                ref_id: refId,
                lang: lang
            })
        });
        document.getElementById('wa-message-body').value = res.message || '';
        updateWALinkPreview();
    } catch (e) {
        console.warn('Failed to switch language template:', e);
    }
}

function updateWALinkPreview() {
    const phoneInput = document.getElementById('wa-recipient-phone')?.value || '';
    const cleanPhone = phoneInput.replace(/[^\d]/g, '');
    const normalizedPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
    const msg = document.getElementById('wa-message-body')?.value || '';

    const directLink = document.getElementById('wa-direct-link');
    if (directLink) {
        if (normalizedPhone) {
            directLink.href = `https://wa.me/${normalizedPhone}?text=${encodeURIComponent(msg)}`;
            directLink.style.pointerEvents = 'auto';
            directLink.style.opacity = '1';
        } else {
            directLink.href = '#';
            directLink.style.pointerEvents = 'none';
            directLink.style.opacity = '0.5';
        }
    }

    const charCount = document.getElementById('wa-char-count');
    if (charCount) charCount.textContent = `${msg.length} chars`;
}

async function logWhatsAppOpenAction() {
    // Log message dispatch in background Outbox
    try {
        const tType = document.getElementById('wa-template-type')?.value || 'opportunity';
        const refId = document.getElementById('wa-ref-id')?.value || '';
        const phone = document.getElementById('wa-recipient-phone')?.value || '';
        const message = document.getElementById('wa-message-body')?.value || '';
        const lang = document.getElementById('wa-lang')?.value || 'en';
        const custId = document.getElementById('wa-customer-id')?.value || null;

        await apiFetch('/api/communications/whatsapp/send', {
            method: 'POST',
            body: JSON.stringify({
                template_type: tType,
                ref_id: refId,
                phone: phone,
                message: message,
                lang: lang,
                customer_id: custId ? parseInt(custId) : null
            })
        });
        showToast('WhatsApp link opened. Interaction logged in communications audit trail.', 'success');
        closeModal('modal-whatsapp');
        // Refresh funnel on dashboard
        fetchStats();
    } catch (e) {
        console.warn('Logging error:', e);
    }
}

async function sendViaCloudAPI() {
    const tType = document.getElementById('wa-template-type')?.value || 'opportunity';
    const refId = document.getElementById('wa-ref-id')?.value || '';
    const phone = document.getElementById('wa-recipient-phone')?.value || '';
    const message = document.getElementById('wa-message-body')?.value || '';
    const lang = document.getElementById('wa-lang')?.value || 'en';
    const custId = document.getElementById('wa-customer-id')?.value || null;

    if (!phone) {
        showToast('Please enter a valid recipient phone number.', 'error');
        return;
    }

    try {
        const res = await apiFetch('/api/communications/whatsapp/send', {
            method: 'POST',
            body: JSON.stringify({
                template_type: tType,
                ref_id: refId,
                phone: phone,
                message: message,
                lang: lang,
                customer_id: custId ? parseInt(custId) : null
            })
        });

        if (res.simulated) {
            showToast('Simulated Cloud API dispatch logged. Opening WhatsApp link...', 'info');
            if (res.wa_link) window.open(res.wa_link, '_blank');
        } else {
            showToast(`Message sent via WhatsApp Cloud API! Status: ${res.dispatch_status}`, 'success');
        }

        closeModal('modal-whatsapp');
        fetchStats();
    } catch (e) {
        showToast(e.message || 'Failed to dispatch via WhatsApp Cloud API.', 'error');
    }
}

// =============================================================================
// BUSINESS REPORTS CONTROLLER (GST, Tally, Owner Summary)
// =============================================================================

// Owner Summary Dashboard Card update
function updateOwnerSummaryDashboard(summary) {
    if (!summary) return;
    const period = summary.period || {};
    const p = document.getElementById('ownerSummaryPeriod');
    if (p) p.textContent = `${period.from_date || ''} to ${period.to_date || ''} \u00b7 ${period.period_days || 7} days`;

    const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    setEl('owner-kpi-rev', formatINR(summary.total_revenue || 0));
    setEl('owner-kpi-growth', `${summary.invoices_count || 0} Invoices \u00b7 ${(summary.growth_pct || 0) >= 0 ? '+' : ''}${summary.growth_pct || 0}% vs prior period`);
    setEl('owner-kpi-margin', `${summary.gross_margin_pct || 0}%`);
    setEl('owner-kpi-profit', `${formatINR(summary.gross_profit || 0)} profit`);
    setEl('owner-kpi-rec', formatINR(summary.overdue_receivables || 0));
    setEl('owner-kpi-dead', formatINR(summary.dead_stock_tied || 0));
    setEl('owner-kpi-stockouts', `${summary.stockouts_count || 0} current stockouts`);

    const narr = document.getElementById('ownerSummaryNarrative');
    if (narr) narr.textContent = summary.narrative || 'No narrative available.';
}

async function refreshOwnerSummary() {
    try {
        const data = await apiFetch('/api/dashboard');
        const os = data.owner_summary || data.stats?.owner_summary;
        if (os) updateOwnerSummaryDashboard(os);
        showToast('Executive brief refreshed.', 'success');
    } catch(e) {
        showToast('Failed to refresh owner summary.', 'error');
    }
}

// Reports subtab switcher
state.activeReportsSubtab = 'valuation';

function switchReportsSubtab(subtab) {
    state.activeReportsSubtab = subtab;
    ['valuation', 'gst', 'tally', 'owner'].forEach(t => {
        const el = document.getElementById(`subview-rep-${t}`);
        if (el) el.style.display = t === subtab ? 'block' : 'none';
        const btn = document.getElementById(`btn-rep-${t}`);
        if (btn) btn.classList.toggle('active', t === subtab);
    });
    if (subtab === 'gst') loadGSTReports();
    if (subtab === 'tally') loadTallySettings();
    if (subtab === 'owner') loadFullOwnerSummary();
}

// GST Registers Controller
state.activeGSTTable = 'sales';

function switchGSTTable(tableType) {
    state.activeGSTTable = tableType;
    ['sales', 'purchase', 'gstr1', 'hsn'].forEach(t => {
        const btn = document.getElementById(`btn-gst-${t}`);
        if (btn) btn.classList.toggle('active', t === tableType);
    });
    loadGSTReports();
}

async function loadGSTReports() {
    const month = document.getElementById('gstFilterMonth')?.value || new Date().toISOString().slice(0,7);
    const tableType = state.activeGSTTable || 'sales';
    const tbody = document.getElementById('gstReportTableBody');
    const thead = document.getElementById('gstReportTableHead');
    if (tbody) tbody.innerHTML = '<tr><td colspan="13" style="text-align:center;padding:14px;" class="text-subtle">Loading...</td></tr>';

    const setKPI = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    const setCountLabel = (label) => { const el = document.getElementById('gst-kpi-count-label'); if (el) el.textContent = label; };

    try {
        let url, data;
        if (tableType === 'sales') {
            url = `/api/reports/gst/sales-register?month=${month}`;
            data = await apiFetch(url);
            setCountLabel('Total Invoices');
            setKPI('gst-kpi-count', data.summary?.invoice_count || 0);
            setKPI('gst-kpi-taxable', formatINR(data.summary?.total_taxable || 0));
            setKPI('gst-kpi-cgst', formatINR(data.summary?.total_cgst || 0));
            setKPI('gst-kpi-sgst', formatINR(data.summary?.total_sgst || 0));
            setKPI('gst-kpi-igst', formatINR(data.summary?.total_igst || 0));
            setKPI('gst-kpi-total', formatINR(data.summary?.total_amount || 0));

            if (thead) thead.innerHTML = `<tr><th>Invoice No</th><th>Date</th><th>Customer Name</th><th>GSTIN</th><th>Type</th><th>Place of Supply</th><th>Taxable (\u20b9)</th><th>CGST (\u20b9)</th><th>SGST (\u20b9)</th><th>IGST (\u20b9)</th><th>Total (\u20b9)</th><th>Status</th></tr>`;
            if (tbody) tbody.innerHTML = (data.records || []).map(r => `<tr>
                <td>${r.invoice_no}</td><td>${r.date}</td><td>${r.customer_name}</td>
                <td><code>${r.customer_gstin || 'URP'}</code></td>
                <td><span class="badge" style="background:${r.is_b2b?'rgba(61,169,255,0.15)':'rgba(16,185,129,0.15)'}; color:${r.is_b2b?'#3DA9FF':'#10B981'}">${r.is_b2b?'B2B':'B2C'}</span></td>
                <td>${r.place_of_supply}</td>
                <td style="text-align:right">${(r.taxable_value||0).toLocaleString('en-IN',{minimumFractionDigits:2})}</td>
                <td style="text-align:right">${(r.cgst||0).toLocaleString('en-IN',{minimumFractionDigits:2})}</td>
                <td style="text-align:right">${(r.sgst||0).toLocaleString('en-IN',{minimumFractionDigits:2})}</td>
                <td style="text-align:right">${(r.igst||0).toLocaleString('en-IN',{minimumFractionDigits:2})}</td>
                <td style="text-align:right; font-weight:700">${(r.total_amount||0).toLocaleString('en-IN',{minimumFractionDigits:2})}</td>
                <td><span class="badge">${r.status}</span></td>
            </tr>`).join('') || '<tr><td colspan="12" style="text-align:center" class="text-subtle">No invoices found for this month.</td></tr>';

        } else if (tableType === 'purchase') {
            url = `/api/reports/gst/purchase-register?month=${month}`;
            data = await apiFetch(url);
            setCountLabel('Total POs');
            setKPI('gst-kpi-count', data.summary?.po_count || 0);
            setKPI('gst-kpi-taxable', formatINR(data.summary?.total_taxable || 0));
            setKPI('gst-kpi-cgst', formatINR(data.summary?.total_cgst || 0));
            setKPI('gst-kpi-sgst', formatINR(data.summary?.total_sgst || 0));
            setKPI('gst-kpi-igst', formatINR(data.summary?.total_igst || 0));
            setKPI('gst-kpi-total', formatINR(data.summary?.total_amount || 0));

            if (thead) thead.innerHTML = `<tr><th>PO Number</th><th>Date</th><th>Supplier Name</th><th>GSTIN</th><th>Place of Supply</th><th>Taxable (\u20b9)</th><th>CGST (\u20b9)</th><th>SGST (\u20b9)</th><th>IGST (\u20b9)</th><th>Total (\u20b9)</th><th>Status</th></tr>`;
            if (tbody) tbody.innerHTML = (data.records || []).map(r => `<tr>
                <td>${r.po_number}</td><td>${r.date}</td><td>${r.supplier_name}</td>
                <td><code>${r.supplier_gstin || 'URP'}</code></td>
                <td>${r.place_of_supply}</td>
                <td style="text-align:right">${(r.taxable_value||0).toLocaleString('en-IN',{minimumFractionDigits:2})}</td>
                <td style="text-align:right">${(r.cgst||0).toLocaleString('en-IN',{minimumFractionDigits:2})}</td>
                <td style="text-align:right">${(r.sgst||0).toLocaleString('en-IN',{minimumFractionDigits:2})}</td>
                <td style="text-align:right">${(r.igst||0).toLocaleString('en-IN',{minimumFractionDigits:2})}</td>
                <td style="text-align:right; font-weight:700">${(r.total_amount||0).toLocaleString('en-IN',{minimumFractionDigits:2})}</td>
                <td><span class="badge">${r.status}</span></td>
            </tr>`).join('') || '<tr><td colspan="11" style="text-align:center" class="text-subtle">No purchase orders found for this month.</td></tr>';

        } else if (tableType === 'gstr1') {
            url = `/api/reports/gst/gstr1?month=${month}`;
            data = await apiFetch(url);
            const b2b = data.b2b || {}; const b2c = data.b2c || {};
            setCountLabel('B2B Invoices');
            setKPI('gst-kpi-count', b2b.count || 0);
            setKPI('gst-kpi-taxable', formatINR(data.grand_total?.total_taxable || 0));
            setKPI('gst-kpi-cgst', '\u2014');
            setKPI('gst-kpi-sgst', '\u2014');
            setKPI('gst-kpi-igst', formatINR(data.grand_total?.total_tax || 0));
            setKPI('gst-kpi-total', formatINR(data.grand_total?.total_value || 0));

            if (thead) thead.innerHTML = `<tr><th>Recipient GSTIN</th><th>Name</th><th>Invoice No</th><th>Date</th><th>Invoice Value (\u20b9)</th><th>Place of Supply</th><th>Rev Charge</th><th>Rate %</th><th>Taxable (\u20b9)</th></tr>`;
            const b2bRows = (b2b.invoices || []).map(r => `<tr>
                <td><code>${r.recipient_gstin}</code></td><td>${r.recipient_name}</td>
                <td>${r.invoice_number}</td><td>${r.invoice_date}</td>
                <td style="text-align:right; font-weight:700">${(r.invoice_value||0).toLocaleString('en-IN',{minimumFractionDigits:2})}</td>
                <td>${r.place_of_supply}</td><td>${r.reverse_charge}</td>
                <td>${r.rate}%</td>
                <td style="text-align:right">${(r.taxable_value||0).toLocaleString('en-IN',{minimumFractionDigits:2})}</td>
            </tr>`);
            if (tbody) tbody.innerHTML = b2bRows.join('') || '<tr><td colspan="9" style="text-align:center" class="text-subtle">No B2B invoices for this month.</td></tr>';

        } else if (tableType === 'hsn') {
            url = `/api/reports/gst/hsn-summary?month=${month}`;
            data = await apiFetch(url);
            setCountLabel('HSN Codes');
            setKPI('gst-kpi-count', data.summary?.total_hsn_codes || 0);
            setKPI('gst-kpi-taxable', formatINR(data.summary?.total_taxable || 0));
            setKPI('gst-kpi-cgst', formatINR(data.summary?.total_cgst || 0));
            setKPI('gst-kpi-sgst', formatINR(data.summary?.total_sgst || 0));
            setKPI('gst-kpi-igst', formatINR(data.summary?.total_igst || 0));
            setKPI('gst-kpi-total', formatINR(data.summary?.total_value || 0));

            if (thead) thead.innerHTML = `<tr><th>HSN Code</th><th>Description</th><th>UQC</th><th>Total Qty</th><th>Taxable Value (\u20b9)</th><th>IGST (\u20b9)</th><th>CGST (\u20b9)</th><th>SGST (\u20b9)</th><th>Total Tax (\u20b9)</th><th>Total Value (\u20b9)</th></tr>`;
            if (tbody) tbody.innerHTML = (data.records || []).map(r => `<tr>
                <td><code>${r.hsn_code}</code></td><td>${r.description}</td><td>${r.uqc}</td>
                <td style="text-align:right">${r.total_quantity}</td>
                <td style="text-align:right">${(r.total_taxable_value||0).toLocaleString('en-IN',{minimumFractionDigits:2})}</td>
                <td style="text-align:right">${(r.integrated_tax_amount||0).toLocaleString('en-IN',{minimumFractionDigits:2})}</td>
                <td style="text-align:right">${(r.central_tax_amount||0).toLocaleString('en-IN',{minimumFractionDigits:2})}</td>
                <td style="text-align:right">${(r.state_tax_amount||0).toLocaleString('en-IN',{minimumFractionDigits:2})}</td>
                <td style="text-align:right">${(r.total_tax_amount||0).toLocaleString('en-IN',{minimumFractionDigits:2})}</td>
                <td style="text-align:right; font-weight:700">${(r.total_value||0).toLocaleString('en-IN',{minimumFractionDigits:2})}</td>
            </tr>`).join('') || '<tr><td colspan="10" style="text-align:center" class="text-subtle">No HSN data for this month.</td></tr>';
        }
    } catch(e) {
        if (tbody) tbody.innerHTML = `<tr><td colspan="13" style="text-align:center;color:var(--out)">Error loading data: ${e.message}</td></tr>`;
    }
}

function exportCurrentGSTCSV() {
    const month = document.getElementById('gstFilterMonth')?.value || new Date().toISOString().slice(0,7);
    const tableType = state.activeGSTTable || 'sales';
    let url;
    if (tableType === 'sales') url = `/api/reports/gst/sales-register?month=${month}&format=csv`;
    else if (tableType === 'purchase') url = `/api/reports/gst/purchase-register?month=${month}&format=csv`;
    else if (tableType === 'gstr1') {
        const a1 = document.createElement('a');
        a1.href = `/api/reports/gst/gstr1?month=${month}&format=b2b_csv`;
        a1.download = `GSTR1_B2B_${month}.csv`;
        a1.click();
        setTimeout(() => {
            const a2 = document.createElement('a');
            a2.href = `/api/reports/gst/gstr1?month=${month}&format=b2c_csv`;
            a2.download = `GSTR1_B2CS_${month}.csv`;
            a2.click();
        }, 500);
        return;
    } else if (tableType === 'hsn') url = `/api/reports/gst/hsn-summary?month=${month}&format=csv`;
    if (url) {
        const a = document.createElement('a');
        a.href = url;
        a.download = '';
        a.click();
    }
}

// Tally Export Controller
async function loadTallySettings() {
    try {
        const data = await apiFetch('/api/reports/tally/settings');
        Object.entries(data).forEach(([key, val]) => {
            const el = document.getElementById(key);
            if (el) el.value = val;
        });
    } catch(e) {
        showToast('Failed to load Tally ledger settings.', 'error');
    }
}

async function saveTallyLedgerSettings() {
    const keys = [
        'tally_company_name', 'tally_sales_ledger', 'tally_purchase_ledger',
        'tally_output_cgst_ledger', 'tally_output_sgst_ledger', 'tally_output_igst_ledger',
        'tally_input_cgst_ledger', 'tally_input_sgst_ledger', 'tally_input_igst_ledger',
        'tally_round_off_ledger'
    ];
    const payload = {};
    keys.forEach(k => {
        const el = document.getElementById(k);
        if (el && el.value) payload[k] = el.value;
    });
    try {
        await apiFetch('/api/reports/tally/settings', {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        showToast('Tally ledger mappings saved successfully.', 'success');
    } catch(e) {
        showToast('Failed to save Tally settings: ' + e.message, 'error');
    }
}

function exportTallyVouchers(format = 'xml') {
    const fromDate = document.getElementById('tallyFromDate')?.value || '';
    const toDate = document.getElementById('tallyToDate')?.value || '';
    const type = document.getElementById('tallyVoucherType')?.value || 'both';
    let url = `/api/reports/tally/vouchers?type=${type}&format=${format}`;
    if (fromDate) url += `&from_date=${fromDate}`;
    if (toDate) url += `&to_date=${toDate}`;
    const a = document.createElement('a');
    a.href = url;
    a.download = '';
    a.click();
    showToast(`Tally ${format.toUpperCase()} export initiated.`, 'success');
}

// Owner Summary Full Page Controller
async function loadFullOwnerSummary() {
    const today = new Date();
    const start = new Date(today);
    start.setDate(today.getDate() - 7);

    const toEl = document.getElementById('ownerToDate');
    const fromEl = document.getElementById('ownerFromDate');
    if (toEl && !toEl.value) toEl.value = today.toISOString().slice(0, 10);
    if (fromEl && !fromEl.value) fromEl.value = start.toISOString().slice(0, 10);

    const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

    try {
        const fDate = document.getElementById('ownerFromDate')?.value || '';
        const tDate = document.getElementById('ownerToDate')?.value || '';
        let url = '/api/reports/owner-summary';
        const params = [];
        if (fDate) params.push(`from_date=${fDate}`);
        if (tDate) params.push(`to_date=${tDate}`);
        if (params.length) url += '?' + params.join('&');

        const data = await apiFetch(url);
        const m = data.metrics || {};
        const s = m.sales || {};
        const mg = m.margin || {};
        const r = m.receivables || {};
        const p = m.procurement || {};
        const d = m.dead_stock || {};
        const so = m.stockouts || {};
        const a = m.automation_activity || {};

        // KPI Cards
        setEl('rep-owner-rev', formatINR(s.total_revenue || 0));
        setEl('rep-owner-invoices', `${s.invoice_count || 0} Invoices \u00b7 ${(s.growth_pct_vs_prior || 0) >= 0 ? '+' : ''}${s.growth_pct_vs_prior || 0}% vs prior`);
        setEl('rep-owner-margin', `${mg.gross_margin_pct || 0}%`);
        setEl('rep-owner-profit', `${formatINR(mg.gross_profit || 0)} Gross Profit`);
        setEl('rep-owner-rec', formatINR(r.total_overdue_value || 0));
        setEl('rep-owner-rec-count', `${r.overdue_invoices_count || 0} Past-due Invoices \u00b7 ${r.overdue_customers_count || 0} Customers`);
        setEl('rep-owner-dead', formatINR(d.tied_capital_value || 0));
        setEl('rep-owner-dead-count', `${d.dead_stock_count || 0} Inactive SKUs`);

        // Narrative
        const narr = document.getElementById('rep-owner-narrative');
        if (narr) narr.textContent = data.narrative || 'No narrative generated.';

        // Top Customers
        const topCustTbody = document.getElementById('rep-owner-top-customers');
        if (topCustTbody) {
            const custs = m.top_customers || [];
            topCustTbody.innerHTML = custs.length
                ? custs.map(c => `<tr>
                    <td>${c.name}</td><td>${c.city || '\u2014'}</td>
                    <td style="text-align:right; font-weight:700">${formatINR(c.revenue)}</td>
                </tr>`).join('')
                : '<tr><td colspan="3" style="text-align:center" class="text-subtle">No customer orders in this period.</td></tr>';
        }

        // Risk Alerts
        const riskTbody = document.getElementById('rep-owner-risk-alerts');
        if (riskTbody) {
            const risks = [
                ['Zero-Stock Items', `${so.zero_stock_count || 0} SKUs`, 'High Risk'],
                ['Critical Low Stock', `${so.critical_low_count || 0} SKUs`, 'Medium Risk'],
                ['Overdue Receivables', `${r.overdue_invoices_count || 0} Invoices`, formatINR(r.total_overdue_value || 0)],
                ['Delayed Purchase Orders', `${p.overdue_pos_count || 0} POs`, formatINR(p.overdue_pos_value || 0)],
                ['Dead Stock Capital', `${d.dead_stock_count || 0} SKUs`, formatINR(d.tied_capital_value || 0)]
            ];
            riskTbody.innerHTML = risks.map(([cat, cnt, imp]) => `<tr>
                <td>${cat}</td><td style="text-align:center">${cnt}</td>
                <td style="text-align:right; font-weight:700">${imp}</td>
            </tr>`).join('');
        }

        // Automation Activity
        const autoEl = document.getElementById('rep-owner-auto-text');
        if (autoEl) {
            autoEl.textContent =
                `Automation engine ran ${a.runs_count || 0} background cycles. ` +
                `Auto-drafted ${a.draft_pos_created || 0} purchase orders and auto-approved ${a.auto_approved_pos || 0} replenishments. ` +
                `${a.cycle_counts_posted || 0} cycle count sheets finalized. ` +
                `${a.doc_scans_processed || 0} supplier invoices/challans processed via OCR matching.`;
        }

        showToast('Executive summary loaded.', 'success');
    } catch(e) {
        showToast('Failed to load owner summary: ' + e.message, 'error');
    }
}

function downloadOwnerSummaryPDF() {
    const fromDate = document.getElementById('ownerFromDate')?.value || '';
    const toDate = document.getElementById('ownerToDate')?.value || '';
    const params = [];
    if (fromDate) params.push(`from_date=${fromDate}`);
    if (toDate) params.push(`to_date=${toDate}`);
    let url = '/api/reports/owner-summary/pdf';
    if (params.length) url += '?' + params.join('&');
    const a = document.createElement('a');
    a.href = url;
    a.download = '';
    a.click();
    showToast('Downloading Executive PDF...', 'info');
}

async function dispatchOwnerSummaryEmail() {
    const fromDate = document.getElementById('ownerFromDate')?.value || '';
    const toDate = document.getElementById('ownerToDate')?.value || '';
    try {
        const res = await apiFetch('/api/reports/owner-summary/dispatch', {
            method: 'POST',
            body: JSON.stringify({
                from_date: fromDate || null,
                to_date: toDate || null
            })
        });
        showToast(`Executive summary dispatched to Outbox! Outbox ID: ${res.outbox_id}`, 'success');
    } catch(e) {
        showToast('Failed to dispatch owner summary: ' + e.message, 'error');
    }
}


// =============================================================================
// PILOT READINESS CONTROLLERS: SECURITY, USERS, IMPORT WIZARD, BACKUPS
// =============================================================================

// Extend switchReportsSubtab to support 'backup'
(function patchReportsSubtab() {
    const origSwitch = window.switchReportsSubtab;
    window.switchReportsSubtab = function(subtab) {
        if (origSwitch) origSwitch(subtab);
        const bkpEl = document.getElementById('subview-rep-backup');
        const bkpBtn = document.getElementById('btn-rep-backup');
        if (bkpEl) bkpEl.style.display = (subtab === 'backup') ? 'block' : 'none';
        if (bkpBtn) bkpBtn.classList.toggle('active', subtab === 'backup');
        if (subtab === 'backup') refreshBackupsList();
    };
})();

// Hook into switchTab for 'users'
(function patchSwitchTab() {
    const origSwitchTab = window.switchTab;
    window.switchTab = function(tabName) {
        if (origSwitchTab) origSwitchTab(tabName);
        const usersTab = document.getElementById('tab-users');
        const usersNav = document.getElementById('nav-item-users');
        if (usersTab) usersTab.style.display = (tabName === 'users') ? 'block' : 'none';
        if (usersNav) usersNav.classList.toggle('active', tabName === 'users');
        if (tabName === 'users') loadUsersList();
    };
})();

// --- 1. Security & Change Password Controller ---

function openChangePasswordModal(isForced = false) {
    const modal = document.getElementById('modal-change-password');
    const alertBox = document.getElementById('pwd-forced-alert');
    const closeBtn = document.getElementById('btn-close-change-pwd');
    const cancelBtn = document.getElementById('btn-cancel-change-pwd');

    if (alertBox) alertBox.style.display = isForced ? 'block' : 'none';
    if (closeBtn) closeBtn.style.display = isForced ? 'none' : 'block';
    if (cancelBtn) cancelBtn.style.display = isForced ? 'none' : 'block';

    const curr = document.getElementById('pwd-current');
    const pnew = document.getElementById('pwd-new');
    const pconf = document.getElementById('pwd-confirm');
    if (curr) curr.value = '';
    if (pnew) pnew.value = '';
    if (pconf) pconf.value = '';

    openModal('modal-change-password');
}

async function submitPasswordChange() {
    const oldPassword = document.getElementById('pwd-current')?.value;
    const newPassword = document.getElementById('pwd-new')?.value;
    const confirmPassword = document.getElementById('pwd-confirm')?.value;

    if (!oldPassword || !newPassword) {
        showToast('Please fill in both current and new password.', 'error');
        return;
    }
    if (newPassword !== confirmPassword) {
        showToast('New passwords do not match.', 'error');
        return;
    }
    if (newPassword.length < 8) {
        showToast('New password must be at least 8 characters long.', 'error');
        return;
    }

    try {
        const res = await apiFetch('/api/auth/change-password', {
            method: 'POST',
            body: JSON.stringify({ old_password: oldPassword, new_password: newPassword })
        });
        showToast(res.message || 'Password successfully updated!', 'success');
        closeModal('modal-change-password');
    } catch (e) {
        showToast(e.message || 'Failed to update password.', 'error');
    }
}


// --- 2. User Management Controller (Admin) ---

async function loadUsersList() {
    if ((state.currentUser?.role || '').toLowerCase() !== 'admin') return;
    const tbody = document.getElementById('usersTableBody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:1.5rem;" class="text-subtle">Loading users...</td></tr>';

    try {
        const users = await apiFetch('/api/users');
        if (!tbody) return;

        if (!users || !users.length) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;" class="text-subtle">No users found.</td></tr>';
            return;
        }

        tbody.innerHTML = users.map(u => {
            const roleColor = u.role === 'admin' ? '#ef4444' : (u.role === 'manager' ? '#3b82f6' : '#10b981');
            const statusBadge = u.is_active
                ? '<span class="badge" style="background:rgba(16,185,129,0.15); color:#10b981;">Active</span>'
                : '<span class="badge" style="background:rgba(239,68,68,0.15); color:#ef4444;">Deactivated</span>';
            const flagBadge = u.must_change_password
                ? '<span class="badge" style="background:rgba(245,158,11,0.15); color:#f59e0b;">Password Change Required</span>'
                : '<span class="badge" style="background:rgba(255,255,255,0.05); color:var(--text-subtle);">Verified</span>';

            return `<tr>
                <td><strong>${u.username}</strong></td>
                <td>${u.full_name || '—'}</td>
                <td><span class="badge" style="background:rgba(255,255,255,0.08); color:${roleColor}; font-weight:700;">${u.role.toUpperCase()}</span></td>
                <td>${statusBadge}</td>
                <td>${flagBadge}</td>
                <td class="text-subtle small">${u.last_login ? u.last_login.slice(0, 16) : 'Never'}</td>
                <td style="text-align:right;">
                    ${u.is_active ? `
                        <button class="btn btn-xs btn-outline" onclick="promptResetUserPassword(${u.id}, '${u.username}')" title="Reset Password">Key</button>
                        <button class="btn btn-xs btn-outline" style="color:var(--out); border-color:rgba(239,68,68,0.3);" onclick="deactivateUser(${u.id}, '${u.username}')" title="Deactivate">Disable</button>
                    ` : `
                        <button class="btn btn-xs btn-outline" style="color:#10b981;" onclick="reactivateUser(${u.id}, '${u.username}')">Enable</button>
                    `}
                </td>
            </tr>`;
        }).join('');
    } catch (e) {
        if (tbody) tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:var(--out);">Failed to load users: ${e.message}</td></tr>`;
    }
}

function openAddUserModal() {
    const un = document.getElementById('user-new-username');
    const fn = document.getElementById('user-new-fullname');
    const pw = document.getElementById('user-new-password');
    if (un) un.value = '';
    if (fn) fn.value = '';
    if (pw) pw.value = '';
    openModal('modal-add-user');
}

async function submitCreateUser() {
    const username = document.getElementById('user-new-username')?.value?.trim();
    const fullName = document.getElementById('user-new-fullname')?.value?.trim();
    const role = document.getElementById('user-new-role')?.value;
    const password = document.getElementById('user-new-password')?.value;
    const forceChange = document.getElementById('user-new-force-change')?.checked;

    if (!username || !password) {
        showToast('Username and temporary password are required.', 'error');
        return;
    }
    if (password.length < 8) {
        showToast('Password must be at least 8 characters.', 'error');
        return;
    }

    try {
        await apiFetch('/api/users', {
            method: 'POST',
            body: JSON.stringify({
                username,
                full_name: fullName,
                role,
                password,
                must_change_password: forceChange
            })
        });
        showToast(`User ${username} created successfully!`, 'success');
        closeModal('modal-add-user');
        loadUsersList();
    } catch (e) {
        showToast(e.message || 'Failed to create user.', 'error');
    }
}

async function deactivateUser(userId, username) {
    if (!confirm(`Are you sure you want to deactivate user '${username}'?`)) return;
    try {
        await apiFetch(`/api/users/${userId}`, { method: 'DELETE' });
        showToast(`User ${username} deactivated.`, 'success');
        loadUsersList();
    } catch (e) {
        showToast(e.message || 'Failed to deactivate user.', 'error');
    }
}

async function reactivateUser(userId, username) {
    try {
        await apiFetch(`/api/users/${userId}`, {
            method: 'PUT',
            body: JSON.stringify({ is_active: true })
        });
        showToast(`User ${username} reactivated.`, 'success');
        loadUsersList();
    } catch (e) {
        showToast(e.message || 'Failed to reactivate user.', 'error');
    }
}

async function promptResetUserPassword(userId, username) {
    const newPwd = prompt(`Enter new temporary password for '${username}' (min 8 chars):`);
    if (!newPwd) return;
    if (newPwd.length < 8) {
        showToast('Password must be at least 8 characters.', 'error');
        return;
    }
    try {
        await apiFetch(`/api/users/${userId}`, {
            method: 'PUT',
            body: JSON.stringify({ new_password: newPwd, must_change_password: true })
        });
        showToast(`Password for ${username} reset. User must change on next login.`, 'success');
        loadUsersList();
    } catch (e) {
        showToast(e.message || 'Failed to reset password.', 'error');
    }
}


// --- 3. Enterprise Data Import Wizard Controller ---

window.wizardState = {
    selectedFile: null,
    previewData: null,
    activeTab: 'upload'
};

function openImportWizard() {
    window.wizardState.selectedFile = null;
    window.wizardState.previewData = null;
    switchWizardTab('upload');
    updateTemplateDownloadLinks();
    openModal('modal-import-wizard');
}

function switchWizardTab(tab) {
    window.wizardState.activeTab = tab;
    ['upload', 'preview', 'history'].forEach(t => {
        const el = document.getElementById(`wiz-tab-${t}`);
        const btn = document.getElementById(`btn-wiz-${t}`);
        if (el) el.style.display = (t === tab) ? 'block' : 'none';
        if (btn) btn.classList.toggle('active', t === tab);
    });

    const valBtn = document.getElementById('btn-wiz-validate');
    const comBtn = document.getElementById('btn-wiz-commit');

    if (tab === 'upload') {
        if (valBtn) valBtn.style.display = 'inline-block';
        if (comBtn) comBtn.style.display = 'none';
    } else if (tab === 'preview') {
        if (valBtn) valBtn.style.display = 'none';
        if (comBtn) comBtn.style.display = (window.wizardState.previewData?.can_commit) ? 'inline-block' : 'none';
    } else if (tab === 'history') {
        if (valBtn) valBtn.style.display = 'none';
        if (comBtn) comBtn.style.display = 'none';
        loadWizardBatches();
    }
}

function updateTemplateDownloadLinks() {
    const type = document.getElementById('wiz-import-type')?.value || 'items';
    const csvLink = document.getElementById('wiz-dl-csv');
    const xlsxLink = document.getElementById('wiz-dl-xlsx');
    if (csvLink) {
        csvLink.href = `/api/import/template?type=${type}&format=csv`;
        csvLink.download = `anishka_${type}_template.csv`;
    }
    if (xlsxLink) {
        xlsxLink.href = `/api/import/template?type=${type}&format=xlsx`;
        xlsxLink.download = `anishka_${type}_template.xlsx`;
    }
}

function handleWizardFileSelected(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    window.wizardState.selectedFile = file;
    const nameEl = document.getElementById('wiz-selected-file-name');
    if (nameEl) nameEl.textContent = `${file.name} (${Math.round(file.size / 1024)} KB)`;
}

async function uploadAndValidateWizardFile() {
    const file = window.wizardState.selectedFile;
    if (!file) {
        showToast('Please select a CSV or Excel file to upload.', 'error');
        return;
    }

    const importType = document.getElementById('wiz-import-type')?.value || 'items';
    const formData = new FormData();
    formData.append('file', file);
    formData.append('import_type', importType);

    const statusEl = document.getElementById('wiz-footer-status');
    if (statusEl) statusEl.textContent = 'Parsing and validating file row-by-row...';

    try {
        const res = await fetch('/api/import/preview', {
            method: 'POST',
            headers: (typeof getAuthHeaders === 'function') ? getAuthHeaders() : {},
            body: formData
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({ detail: res.statusText }));
            throw new Error(err.detail || 'Validation failed');
        }
        const data = await res.json();
        window.wizardState.previewData = data;
        renderWizardPreview(data);
        switchWizardTab('preview');
        if (statusEl) statusEl.textContent = `Validated: ${data.valid_count} valid, ${data.error_count} errors, ${data.warning_count} warnings.`;
    } catch (e) {
        showToast(e.message || 'File validation error.', 'error');
        if (statusEl) statusEl.textContent = 'Validation failed.';
    }
}

function renderWizardPreview(val) {
    const sumEl = document.getElementById('wiz-preview-summary');
    if (sumEl) {
        sumEl.innerHTML = `
            <div class="kpi-card" style="padding:8px 14px; flex:1;">
                <span class="label">Total Records</span>
                <span class="value" style="font-size:1.15rem;">${val.total_rows}</span>
            </div>
            <div class="kpi-card" style="padding:8px 14px; flex:1; border-color:rgba(16,185,129,0.3);">
                <span class="label" style="color:#10b981;">Valid Rows</span>
                <span class="value" style="font-size:1.15rem; color:#10b981;">${val.valid_count}</span>
            </div>
            <div class="kpi-card" style="padding:8px 14px; flex:1; border-color:rgba(245,158,11,0.3);">
                <span class="label" style="color:#f59e0b;">Warnings</span>
                <span class="value" style="font-size:1.15rem; color:#f59e0b;">${val.warning_count}</span>
            </div>
            <div class="kpi-card" style="padding:8px 14px; flex:1; border-color:rgba(239,68,68,0.3);">
                <span class="label" style="color:#ef4444;">Errors</span>
                <span class="value" style="font-size:1.15rem; color:#ef4444;">${val.error_count}</span>
            </div>
        `;
    }

    const thead = document.getElementById('wiz-preview-thead');
    const tbody = document.getElementById('wiz-preview-tbody');
    if (!tbody || !val.preview_rows || !val.preview_rows.length) return;

    const sampleRow = val.preview_rows[0]?.data || {};
    const keys = Object.keys(sampleRow).filter(k => sampleRow[k] !== undefined).slice(0, 7);

    thead.innerHTML = `<tr>
        <th>Row</th>
        <th>Status</th>
        ${keys.map(k => `<th>${k.replace('_', ' ').toUpperCase()}</th>`).join('')}
        <th>Issues</th>
    </tr>`;

    tbody.innerHTML = val.preview_rows.map(r => {
        const badge = r.status === 'valid'
            ? '<span class="badge" style="background:rgba(16,185,129,0.15); color:#10b981;">Valid</span>'
            : (r.status === 'warning'
                ? '<span class="badge" style="background:rgba(245,158,11,0.15); color:#f59e0b;">Warning</span>'
                : '<span class="badge" style="background:rgba(239,68,68,0.15); color:#ef4444;">Error</span>');

        const issues = [...(r.errors || []), ...(r.warnings || [])].join('; ') || '—';

        return `<tr style="${r.status === 'error' ? 'background:rgba(239,68,68,0.04);' : ''}">
            <td><strong>#${r.row_num}</strong></td>
            <td>${badge}</td>
            ${keys.map(k => `<td>${r.data[k] !== null && r.data[k] !== undefined ? String(r.data[k]) : '—'}</td>`).join('')}
            <td class="small" style="max-width:240px; color:${r.status === 'error' ? 'var(--out)' : 'inherit'};">${issues}</td>
        </tr>`;
    }).join('');

    const comBtn = document.getElementById('btn-wiz-commit');
    if (comBtn) {
        comBtn.style.display = val.can_commit ? 'inline-block' : 'none';
        comBtn.disabled = !val.can_commit;
    }
}

async function commitWizardImport() {
    const val = window.wizardState.previewData;
    if (!val || !val.can_commit) {
        showToast('Cannot commit import: unresolved validation errors.', 'error');
        return;
    }

    const statusEl = document.getElementById('wiz-footer-status');
    if (statusEl) statusEl.textContent = 'Committing records inside transaction...';

    try {
        const res = await apiFetch('/api/import/commit', {
            method: 'POST',
            body: JSON.stringify({
                import_type: val.import_type,
                filename: val.filename || 'import_data.csv',
                rows: val.preview_rows
            })
        });

        showToast(`Successfully committed Batch [${res.batch_id}]! (${res.records_count} records)`, 'success');
        closeModal('modal-import-wizard');

        // Refresh views
        if (typeof fetchInventory === 'function') fetchInventory();
        if (typeof fetchSuppliers === 'function') fetchSuppliers();
        if (typeof fetchStats === 'function') fetchStats();
    } catch (e) {
        showToast(e.message || 'Commit failed.', 'error');
        if (statusEl) statusEl.textContent = 'Commit failed.';
    }
}

async function loadWizardBatches() {
    const tbody = document.getElementById('wiz-batches-tbody');
    if (!tbody) return;

    try {
        const batches = await apiFetch('/api/import/batches');
        if (!batches || !batches.length) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;" class="text-subtle">No import batches recorded.</td></tr>';
            return;
        }

        tbody.innerHTML = batches.map(b => {
            const isCommitted = b.status === 'committed';
            const badge = isCommitted
                ? '<span class="badge" style="background:rgba(16,185,129,0.15); color:#10b981;">Committed</span>'
                : '<span class="badge" style="background:rgba(239,68,68,0.15); color:#ef4444;">Rolled Back</span>';

            return `<tr>
                <td><code>${b.batch_id}</code></td>
                <td><span class="badge">${b.import_type.toUpperCase()}</span></td>
                <td>${b.filename || '—'}</td>
                <td>${b.records_count}</td>
                <td class="text-subtle small">${b.created_at}</td>
                <td>${badge}</td>
                <td style="text-align:right;">
                    ${isCommitted ? `
                        <button class="btn btn-xs btn-outline" style="color:var(--out); border-color:rgba(239,68,68,0.3);" onclick="rollbackWizardBatch('${b.batch_id}')">
                            Undo Batch
                        </button>
                    ` : '—'}
                </td>
            </tr>`;
        }).join('');
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:var(--out);">Failed to load batches: ${e.message}</td></tr>`;
    }
}

async function rollbackWizardBatch(batchId) {
    if (!confirm(`Are you sure you want to rollback import batch '${batchId}'? This will restore prior stock quantities or deactivate imported records.`)) return;

    try {
        const res = await apiFetch(`/api/import/rollback/${batchId}`, { method: 'POST' });
        showToast(`Batch ${batchId} rolled back successfully (${res.reverted_count} records restored).`, 'success');
        loadWizardBatches();
        if (typeof fetchInventory === 'function') fetchInventory();
        if (typeof fetchSuppliers === 'function') fetchSuppliers();
        if (typeof fetchStats === 'function') fetchStats();
    } catch (e) {
        showToast(e.message || 'Rollback failed.', 'error');
    }
}


// --- 4. Database Backups & Recovery Controller ---

async function refreshBackupsList() {
    const tbody = document.getElementById('backupsTableBody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:1.5rem;" class="text-subtle">Scanning backup archives...</td></tr>';

    try {
        const backups = await apiFetch('/api/backup/list');
        const countEl = document.getElementById('backup-stat-count');
        const latestEl = document.getElementById('backup-stat-latest');
        const timeEl = document.getElementById('backup-stat-time');

        if (countEl) countEl.textContent = (backups || []).length;

        if (backups && backups.length) {
            const first = backups[0];
            if (latestEl) latestEl.textContent = `${first.size_kb} KB (${first.db_type.toUpperCase()})`;
            if (timeEl) timeEl.textContent = first.created_at.slice(0, 16);
        } else {
            if (latestEl) latestEl.textContent = 'None';
            if (timeEl) timeEl.textContent = 'Never';
        }

        if (!tbody) return;

        if (!backups || !backups.length) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;" class="text-subtle">No backups found. Click "Create Backup Now" to create one.</td></tr>';
            return;
        }

        tbody.innerHTML = backups.map(b => `
            <tr>
                <td><code>${b.filename}</code></td>
                <td><span class="badge">${b.db_type.toUpperCase()}</span></td>
                <td>${b.size_kb} KB</td>
                <td class="text-subtle small">${b.created_at.slice(0, 19).replace('T', ' ')}</td>
                <td style="text-align:right;">
                    <a href="/api/backup/download/${b.filename}" class="btn btn-xs btn-outline" download style="text-decoration:none;">
                        ⬇️ Download
                    </a>
                </td>
            </tr>
        `).join('');
    } catch (e) {
        if (tbody) tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--out);">Failed to load backups: ${e.message}</td></tr>`;
    }
}

async function triggerManualBackup() {
    const tag = prompt('Enter a label/tag for this backup (default: manual):', 'manual');
    if (tag === null) return;

    try {
        showToast('Initiating atomic hot backup snapshot...', 'info');
        const res = await apiFetch('/api/backup/create', {
            method: 'POST',
            body: JSON.stringify({ tag: tag.trim() || 'manual', retention_days: 14 })
        });
        showToast(`Backup created: ${res.filename} (${res.size_kb} KB)`, 'success');
        refreshBackupsList();
    } catch (e) {
        showToast(e.message || 'Backup creation failed.', 'error');
    }
}

// Check for forced password change on page load
window.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        if (sessionStorage.getItem('must_change_password') === 'true') {
            if (typeof openChangePasswordModal === 'function') {
                openChangePasswordModal(true);
            }
        }
    }, 500);
});


// ==========================================================================
// BUSINESS IMPACT, PILOT ROI & PRICING CONTROLLER
// ==========================================================================

let cachedPilotKPIs = [];

function switchBusinessImpactSubtab(subtab) {
    const subtabs = ['roi', 'pilot', 'pricing'];
    subtabs.forEach(s => {
        const pane = document.getElementById(`bi-subtab-${s}`);
        const btn = document.getElementById(`bi-subtab-btn-${s}`);
        if (pane) pane.style.display = (s === subtab) ? 'block' : 'none';
        if (btn) {
            if (s === subtab) {
                btn.classList.add('active-subtab');
            } else {
                btn.classList.remove('active-subtab');
            }
        }
    });

    if (subtab === 'pilot') {
        loadPilotKPIs();
    } else if (subtab === 'pricing') {
        loadPricingPlans();
        computeUnitEconomics();
    }
}

async function loadBusinessImpactPage() {
    const role = (state.currentUser?.role || 'storekeeper').toLowerCase();
    if (role === 'storekeeper') {
        showToast('Access restricted: Business Impact is for managers and administrators.', 'error');
        return;
    }
    await loadPilotKPIs();
    await loadPricingPlans();
    computeUnitEconomics();
}

// --------------------------------------------------------------------------
// 1. ROI Calculator Controller
// --------------------------------------------------------------------------

async function computeROI() {
    const num_skus = parseFloat(document.getElementById('roi_num_skus')?.value || 0);
    const monthly_orders = parseFloat(document.getElementById('roi_monthly_orders')?.value || 0);
    const hours_per_week = parseFloat(document.getElementById('roi_hours_per_week')?.value || 0);
    const stockouts = parseFloat(document.getElementById('roi_stockouts')?.value || 0);
    const aov = parseFloat(document.getElementById('roi_aov')?.value || 0);
    const inv_value = parseFloat(document.getElementById('roi_inv_value')?.value || 0);
    const hourly_cost = parseFloat(document.getElementById('roi_hourly_cost')?.value || 0);

    const f_time_red = (parseFloat(document.getElementById('roi_f_time_red')?.value || 65)) / 100;
    const f_stockout_red = (parseFloat(document.getElementById('roi_f_stockout_red')?.value || 70)) / 100;
    const f_loss_rate = (parseFloat(document.getElementById('roi_f_loss_rate')?.value || 40)) / 100;
    const f_margin_rate = (parseFloat(document.getElementById('roi_f_margin_rate')?.value || 25)) / 100;
    const f_holding_rate = (parseFloat(document.getElementById('roi_f_holding_rate')?.value || 18)) / 100;
    const f_dead_stock_red = (parseFloat(document.getElementById('roi_f_dead_stock_red')?.value || 15)) / 100;
    const f_software_cost = parseFloat(document.getElementById('roi_f_software_cost')?.value || 75000);

    const payload = {
        inputs: {
            num_skus,
            monthly_orders,
            hours_per_week_stock_po: hours_per_week,
            stockout_incidents_per_month: stockouts,
            average_order_value: aov,
            total_inventory_value: inv_value,
            hourly_staff_cost: hourly_cost
        },
        formula_parameters: {
            time_reduction_pct: f_time_red,
            stockout_reduction_pct: f_stockout_red,
            order_loss_per_stockout: f_loss_rate,
            gross_margin_rate: f_margin_rate,
            inventory_holding_rate: f_holding_rate,
            dead_stock_reduction_pct: f_dead_stock_red,
            annual_software_cost: f_software_cost
        }
    };

    try {
        const res = await apiFetch('/api/business-impact/roi-calculator', {
            method: 'POST',
            body: JSON.stringify(payload)
        });

        const out = res.outputs;
        const fb = res.formula_breakdowns;

        // Reveal container
        const container = document.getElementById('roi-results-container');
        if (container) container.style.display = 'block';

        // Update cards
        const laborEl = document.getElementById('roi-out-labor');
        const hoursEl = document.getElementById('roi-out-hours');
        if (laborEl) laborEl.textContent = `₹${out.annual_labor_savings.toLocaleString('en-IN')}/yr`;
        if (hoursEl) hoursEl.textContent = `${out.hours_saved_monthly} hrs/month freed (${out.hours_saved_annually} hrs/yr)`;

        const marginEl = document.getElementById('roi-out-margin');
        const stockoutsEl = document.getElementById('roi-out-stockouts');
        if (marginEl) marginEl.textContent = `₹${out.gross_margin_protected.toLocaleString('en-IN')}/yr`;
        if (stockoutsEl) stockoutsEl.textContent = `${out.annual_stockouts_avoided} stockouts avoided/yr (₹${out.annual_revenue_protected.toLocaleString('en-IN')} rev)`;

        const capitalEl = document.getElementById('roi-out-capital');
        const holdingEl = document.getElementById('roi-out-holding');
        if (capitalEl) capitalEl.textContent = `₹${out.working_capital_freed.toLocaleString('en-IN')}`;
        if (holdingEl) holdingEl.textContent = `₹${out.annual_holding_cost_savings.toLocaleString('en-IN')}/yr holding cost saved`;

        const paybackEl = document.getElementById('roi-out-payback');
        const multipleEl = document.getElementById('roi-out-multiple');
        if (paybackEl) paybackEl.textContent = `${out.payback_period_months} months`;
        if (multipleEl) multipleEl.textContent = `${out.net_roi_multiple}x annual return (₹${out.total_annual_benefit.toLocaleString('en-IN')} total benefit)`;

        // Update formula breakdowns
        const fbLabor = document.getElementById('roi-fb-labor');
        const fbRev = document.getElementById('roi-fb-rev');
        const fbMargin = document.getElementById('roi-fb-margin');
        const fbCapital = document.getElementById('roi-fb-capital');
        const fbHolding = document.getElementById('roi-fb-holding');
        const fbPayback = document.getElementById('roi-fb-payback');

        if (fbLabor) fbLabor.textContent = fb.labor_savings;
        if (fbRev) fbRev.textContent = fb.revenue_protected;
        if (fbMargin) fbMargin.textContent = fb.margin_protected;
        if (fbCapital) fbCapital.textContent = fb.working_capital;
        if (fbHolding) fbHolding.textContent = fb.holding_cost_savings;
        if (fbPayback) fbPayback.textContent = fb.payback_period;

        showToast('ROI and payback projections computed successfully.', 'success');
    } catch (e) {
        showToast(e.message || 'Failed to compute ROI.', 'error');
    }
}

function resetROIInputs() {
    const ids = [
        'roi_num_skus', 'roi_monthly_orders', 'roi_hours_per_week',
        'roi_stockouts', 'roi_aov', 'roi_inv_value', 'roi_hourly_cost'
    ];
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    const container = document.getElementById('roi-results-container');
    if (container) container.style.display = 'none';
    showToast('ROI inputs cleared.', 'info');
}

// --------------------------------------------------------------------------
// 2. Pilot KPI Tracker Controller
// --------------------------------------------------------------------------

async function loadPilotKPIs() {
    const tbody = document.getElementById('pilot-kpis-table-body');
    try {
        const kpis = await apiFetch('/api/business-impact/pilot-kpis');
        cachedPilotKPIs = kpis;
        renderPilotKPIsTable(kpis);
        renderPilotKPIChart(kpis);
    } catch (e) {
        if (tbody) tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; color:var(--out);">Failed to load pilot KPIs: ${e.message}</td></tr>`;
    }
}

function renderPilotKPIsTable(kpis) {
    const tbody = document.getElementById('pilot-kpis-table-body');
    if (!tbody) return;

    if (!kpis || kpis.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:1.5rem;" class="text-subtle">No pilot KPIs recorded yet.</td></tr>';
        return;
    }

    const isAdmin = (state.currentUser?.role || '').toLowerCase() === 'admin';

    tbody.innerHTML = kpis.map(k => {
        let statusBadge = '<span class="kpi-badge kpi-badge-pending">Pending</span>';
        if (k.status === 'improved') {
            statusBadge = `<span class="kpi-badge kpi-badge-improved">&#9650; Improved (${k.delta_pct > 0 ? '+' : ''}${k.delta_pct}%)</span>`;
        } else if (k.status === 'degraded') {
            statusBadge = `<span class="kpi-badge kpi-badge-degraded">&#9660; Degraded (${k.delta_pct > 0 ? '+' : ''}${k.delta_pct}%)</span>`;
        } else if (k.status === 'neutral') {
            statusBadge = '<span class="kpi-badge kpi-badge-neutral">No Change</span>';
        }

        const deltaFormatted = (k.delta !== null) ? `${k.delta > 0 ? '+' : ''}${k.delta} ${k.unit || ''}` : '&mdash;';
        const measuredFormatted = (k.measured_value !== null) ? `${k.measured_value} ${k.unit || ''}` : '<span class="text-subtle">Not recorded</span>';
        const measuredDate = k.measured_date ? `<br><small class="text-subtle">${k.measured_date}</small>` : '';
        const baselineDate = k.baseline_date ? `<br><small class="text-subtle">${k.baseline_date}</small>` : '';

        return `
            <tr>
                <td>
                    <strong>${escapeHTML(k.kpi_name)}</strong>
                    <div style="font-size:0.75rem; color:var(--text-subtle);">${k.higher_is_better ? 'Higher is better' : 'Lower is better'}</div>
                </td>
                <td><span class="badge" style="background:rgba(0,0,0,0.05); font-size:0.75rem;">${escapeHTML(k.category || 'Operations')}</span></td>
                <td><strong>${k.baseline_value}</strong> ${k.unit || ''}${baselineDate}</td>
                <td><strong>${measuredFormatted}</strong>${measuredDate}</td>
                <td>${k.target_value !== null ? `${k.target_value} ${k.unit || ''}` : '&mdash;'}</td>
                <td><strong>${deltaFormatted}</strong></td>
                <td>${statusBadge}</td>
                <td style="max-width:220px; font-size:0.8rem; color:var(--text-subtle);">${escapeHTML(k.notes || '')}</td>
                <td style="text-align:right; white-space:nowrap;">
                    <button class="btn btn-xs btn-secondary" onclick="openEditPilotKPIModal(${k.id})" title="Record Measured Value">
                        Record
                    </button>
                    ${isAdmin ? `
                    <button class="btn btn-xs btn-outline-danger" onclick="deletePilotKPI(${k.id})" title="Delete KPI" style="margin-left:0.25rem;">
                        &times;
                    </button>
                    ` : ''}
                </td>
            </tr>
        `;
    }).join('');
}

function renderPilotKPIChart(kpis) {
    const container = document.getElementById('pilot-kpi-chart-container');
    if (!container) return;

    if (!kpis || kpis.length === 0) {
        container.innerHTML = '<div class="text-subtle" style="text-align:center; padding:2rem;">No data for chart comparison.</div>';
        return;
    }

    // Generate responsive comparative SVG bars
    const rowHeight = 44;
    const chartHeight = kpis.length * rowHeight + 30;
    const svgWidth = 720;
    const labelWidth = 240;
    const barAreaWidth = svgWidth - labelWidth - 90;

    let barsSVG = '';
    kpis.forEach((k, idx) => {
        const y = idx * rowHeight + 15;
        const baseline = k.baseline_value || 0;
        const measured = (k.measured_value !== null) ? k.measured_value : 0;
        const maxVal = Math.max(baseline, measured, k.target_value || 0, 1);

        const baselineW = Math.max(4, Math.round((baseline / maxVal) * barAreaWidth));
        const measuredW = (k.measured_value !== null) ? Math.max(4, Math.round((measured / maxVal) * barAreaWidth)) : 0;

        const isImproved = k.status === 'improved';
        const measuredColor = (k.measured_value === null) ? '#cbd5e1' : (isImproved ? '#10b981' : '#ef4444');

        barsSVG += `
            <!-- KPI ${idx}: ${escapeHTML(k.kpi_name)} -->
            <text x="10" y="${y + 16}" font-size="11.5" font-weight="600" fill="currentColor">${escapeHTML(k.kpi_name.substring(0, 32))}</text>
            <text x="10" y="${y + 28}" font-size="9.5" fill="#64748b">${k.category || ''} (${k.unit || ''})</text>

            <!-- Baseline bar (Before) -->
            <rect x="${labelWidth}" y="${y + 4}" width="${baselineW}" height="12" rx="3" fill="#94a3b8" opacity="0.85"></rect>
            <text x="${labelWidth + baselineW + 6}" y="${y + 14}" font-size="10" fill="#475569" font-weight="500">${baseline}</text>

            <!-- Measured bar (After) -->
            ${k.measured_value !== null ? `
            <rect x="${labelWidth}" y="${y + 18}" width="${measuredW}" height="12" rx="3" fill="${measuredColor}"></rect>
            <text x="${labelWidth + measuredW + 6}" y="${y + 28}" font-size="10" fill="${measuredColor}" font-weight="600">${measured}</text>
            ` : `
            <text x="${labelWidth}" y="${y + 28}" font-size="10" fill="#94a3b8" font-style="italic">Pending pilot measurement</text>
            `}
        `;
    });

    container.innerHTML = `
        <svg viewBox="0 0 ${svgWidth} ${chartHeight}" style="width:100%; height:auto; display:block; font-family:inherit;">
            <!-- Axis guideline -->
            <line x1="${labelWidth}" y1="5" x2="${labelWidth}" y2="${chartHeight - 10}" stroke="#e2e8f0" stroke-width="1.5"></line>
            ${barsSVG}
        </svg>
    `;
}

function openAddPilotKPIModal() {
    const form = document.getElementById('form-add-pilot-kpi');
    if (form) form.reset();
    const dateInput = document.getElementById('add-kpi-baseline-date');
    if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];
    const modal = document.getElementById('modal-add-pilot-kpi');
    if (modal) modal.style.display = 'flex';
}

async function submitAddPilotKPI(e) {
    e.preventDefault();
    const name = document.getElementById('add-kpi-name')?.value.trim();
    const category = document.getElementById('add-kpi-category')?.value;
    const unit = document.getElementById('add-kpi-unit')?.value.trim();
    const baseline_val = parseFloat(document.getElementById('add-kpi-baseline-val')?.value || 0);
    const baseline_date = document.getElementById('add-kpi-baseline-date')?.value;
    const target_val_str = document.getElementById('add-kpi-target-val')?.value;
    const higher_is_better = document.getElementById('add-kpi-direction')?.value === 'true';
    const notes = document.getElementById('add-kpi-notes')?.value.trim();

    const payload = {
        kpi_name: name,
        category: category,
        unit: unit,
        higher_is_better: higher_is_better,
        baseline_value: baseline_val,
        baseline_date: baseline_date,
        target_value: target_val_str ? parseFloat(target_val_str) : null,
        notes: notes
    };

    try {
        await apiFetch('/api/business-impact/pilot-kpis', {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        showToast(`Pilot KPI "${name}" added successfully.`, 'success');
        closeModal('modal-add-pilot-kpi');
        loadPilotKPIs();
    } catch (err) {
        showToast(err.message || 'Failed to add pilot KPI.', 'error');
    }
}

function openEditPilotKPIModal(id) {
    const kpi = cachedPilotKPIs.find(k => k.id === id);
    if (!kpi) return;

    document.getElementById('edit-kpi-id').value = kpi.id;
    document.getElementById('edit-kpi-name').value = kpi.kpi_name;
    document.getElementById('edit-kpi-baseline').value = `${kpi.baseline_value} ${kpi.unit || ''}`;
    document.getElementById('edit-kpi-target').value = (kpi.target_value !== null) ? `${kpi.target_value} ${kpi.unit || ''}` : 'None set';
    document.getElementById('edit-kpi-measured-val').value = (kpi.measured_value !== null) ? kpi.measured_value : '';
    document.getElementById('edit-kpi-measured-date').value = kpi.measured_date || new Date().toISOString().split('T')[0];
    document.getElementById('edit-kpi-notes').value = kpi.notes || '';

    const modal = document.getElementById('modal-edit-pilot-kpi');
    if (modal) modal.style.display = 'flex';
}

async function submitEditPilotKPI(e) {
    e.preventDefault();
    const id = document.getElementById('edit-kpi-id')?.value;
    const measured_val = parseFloat(document.getElementById('edit-kpi-measured-val')?.value || 0);
    const measured_date = document.getElementById('edit-kpi-measured-date')?.value;
    const notes = document.getElementById('edit-kpi-notes')?.value.trim();

    try {
        await apiFetch(`/api/business-impact/pilot-kpis/${id}`, {
            method: 'PUT',
            body: JSON.stringify({
                measured_value: measured_val,
                measured_date: measured_date,
                notes: notes
            })
        });
        showToast('Pilot measured outcome saved.', 'success');
        closeModal('modal-edit-pilot-kpi');
        loadPilotKPIs();
    } catch (err) {
        showToast(err.message || 'Failed to update pilot reading.', 'error');
    }
}

async function deletePilotKPI(id) {
    if (!confirm('Are you sure you want to delete this pilot KPI reading?')) return;
    try {
        await apiFetch(`/api/business-impact/pilot-kpis/${id}`, { method: 'DELETE' });
        showToast('Pilot KPI deleted.', 'success');
        loadPilotKPIs();
    } catch (err) {
        showToast(err.message || 'Failed to delete KPI.', 'error');
    }
}

// --------------------------------------------------------------------------
// 3. Pricing & Unit Economics Controller
// --------------------------------------------------------------------------

async function loadPricingPlans() {
    const grid = document.getElementById('pricing-plans-grid');
    if (!grid) return;

    try {
        const res = await apiFetch('/api/business-impact/pricing-plans');
        const plans = res.plans || [];

        grid.innerHTML = plans.map(p => `
            <div class="pricing-plan-card ${p.is_popular ? 'popular' : ''}">
                ${p.is_popular ? '<span class="pricing-popular-badge">Most Popular</span>' : ''}
                <div>
                    <h4 style="margin:0 0 0.5rem 0; font-size:1.15rem;">${escapeHTML(p.name)}</h4>
                    <p style="font-size:0.8rem; color:var(--text-subtle); margin:0 0 1rem 0;">${escapeHTML(p.recommended_for || '')}</p>
                    <div style="display:flex; align-items:baseline; gap:0.25rem; margin-bottom:1.25rem;">
                        <span style="font-size:1.85rem; font-weight:700; color:var(--primary);">₹${p.monthly_price.toLocaleString('en-IN')}</span>
                        <span class="text-subtle" style="font-size:0.85rem;">/month</span>
                    </div>

                    <div style="border-top:1px solid var(--border); padding-top:0.75rem; margin-bottom:1rem; font-size:0.85rem;">
                        <div style="display:flex; justify-content:space-between; margin-bottom:0.35rem;">
                            <span class="text-subtle">User Seats:</span>
                            <strong>${p.max_users}</strong>
                        </div>
                        <div style="display:flex; justify-content:space-between; margin-bottom:0.35rem;">
                            <span class="text-subtle">SKU Capacity:</span>
                            <strong>${p.max_skus}</strong>
                        </div>
                    </div>

                    <ul style="list-style:none; padding:0; margin:0 0 1.5rem 0; font-size:0.85rem; display:flex; flex-direction:column; gap:0.5rem;">
                        ${(p.features || []).map(f => `
                            <li style="display:flex; align-items:flex-start; gap:0.4rem;">
                                <span style="color:#10b981; font-weight:700;">&#10003;</span>
                                <span>${escapeHTML(f)}</span>
                            </li>
                        `).join('')}
                    </ul>
                </div>
                <div>
                    <button class="btn ${p.is_popular ? 'btn-primary' : 'btn-secondary'}" style="width:100%;" onclick="selectPricingTier('${p.id}', ${p.monthly_price})">
                        Select for Unit Economics
                    </button>
                </div>
            </div>
        `).join('');
    } catch (e) {
        grid.innerHTML = `<div class="text-subtle" style="color:var(--out);">Failed to load pricing plans: ${e.message}</div>`;
    }
}

function selectPricingTier(tierId, price) {
    const priceInput = document.getElementById('ue_price');
    if (priceInput) {
        priceInput.value = price;
        computeUnitEconomics();
        showToast(`Selected ₹${price.toLocaleString('en-IN')}/mo tier for unit economics.`, 'info');
        // Scroll to unit economics
        priceInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

async async function computeUnitEconomics() {
    const price = parseFloat(document.getElementById('ue_price')?.value || 9999);
    const hosting = parseFloat(document.getElementById('ue_hosting')?.value || 0);
    const llm = parseFloat(document.getElementById('ue_llm')?.value || 0);
    const wa = parseFloat(document.getElementById('ue_wa')?.value || 0);
    const support = parseFloat(document.getElementById('ue_support')?.value || 0);
    const overhead = parseFloat(document.getElementById('ue_overhead')?.value || 0);

    const payload = {
        plan_price_monthly: price,
        hosting_server_per_customer: hosting,
        llm_ai_tokens_per_customer: llm,
        whatsapp_cloud_api_per_customer: wa,
        support_ops_per_customer: support,
        fixed_overhead_monthly: overhead
    };

    try {
        const res = await apiFetch('/api/business-impact/unit-economics', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const varCostEl = document.getElementById('ue-out-varcost');
        const profitEl = document.getElementById('ue-out-profit');
        const marginEl = document.getElementById('ue-out-margin');
        const breakEvenEl = document.getElementById('ue-out-breakeven');
        const summaryEl = document.getElementById('ue-out-summary');

        if (varCostEl) varCostEl.textContent = `₹${res.cost_breakdown.total_variable_cost.toLocaleString('en-IN')}/mo`;
        if (profitEl) profitEl.textContent = `₹${res.gross_profit_monthly.toLocaleString('en-IN')}/mo`;
        if (marginEl) marginEl.textContent = `${res.gross_margin_pct}%`;
        if (breakEvenEl) breakEvenEl.textContent = `${res.break_even_customers} active customers`;
        if (summaryEl) summaryEl.textContent = res.contribution_summary;
    } catch (e) {
        const msg = (e && typeof e === 'object' && typeof e.message === 'string' && e.message)
            ? e.message : 'Unit economics calculation failed. Check inputs.';
        if (typeof showToast === 'function') showToast(msg, 'error');
    }
}

// --------------------------------------------------------------------------
// 4. Tab Navigation and RBAC Hook
// --------------------------------------------------------------------------

(function() {
    const prevSwitchTab = window.switchTab;
    window.switchTab = function(tabName) {
        if (typeof prevSwitchTab === 'function') {
            prevSwitchTab(tabName);
        }

        const bizTab = document.getElementById('tab-business-impact');
        const bizNav = document.getElementById('nav-item-bizimpact');

        if (bizTab) {
            bizTab.style.display = (tabName === 'business-impact') ? 'block' : 'none';
        }
        if (bizNav) {
            bizNav.classList.toggle('active', tabName === 'business-impact');
        }

        if (tabName === 'business-impact') {
            loadBusinessImpactPage();
        }
    };

    // Extend applyRBAC to toggle Business Impact navigation visibility
    const prevApplyRBAC = window.applyRBAC;
    window.applyRBAC = function(role) {
        if (typeof prevApplyRBAC === 'function') {
            prevApplyRBAC(role);
        }
        const roleNorm = (role || 'storekeeper').toLowerCase();
        const canView = (roleNorm === 'admin' || roleNorm === 'manager');
        const bizNav = document.getElementById('nav-item-bizimpact');
        if (bizNav) {
            bizNav.style.display = canView ? 'flex' : 'none';
        }
        // Hide User Accounts nav for non-admin
        const usersNav = document.getElementById('nav-item-users');
        if (usersNav) {
            usersNav.style.display = (roleNorm === 'admin') ? '' : 'none';
        }
    };
})();
