import React, { useState, useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Sidebar, TabKey } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { DashboardView } from './views/DashboardView';
import { GenericTableView } from './views/GenericTableView';
import { BusinessImpactView } from './views/BusinessImpactView';
import { DevMotionView } from './views/DevMotionView';
import { AiCopilotModal } from './views/AiCopilotModal';
import { LoginView } from './views/LoginView';
import { ExternalLink } from 'lucide-react';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const MainShell: React.FC = () => {
  const { user } = useAuth();
  const shouldReduceMotion = useReducedMotion();

  // Detect /dev/motion or query params on load
  const [activeTab, setActiveTab] = useState<TabKey>(() => {
    if (typeof window !== 'undefined') {
      if (window.location.pathname.includes('/dev/motion') || window.location.hash.includes('dev-motion')) {
        return 'dev-motion';
      }
    }
    return 'dashboard';
  });

  const [isCopilotOpen, setIsCopilotOpen] = useState(false);
  const [copilotQuery, setCopilotQuery] = useState('');

  // Handle Ctrl+K shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCopilotOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  if (!user) {
    return <LoginView />;
  }

  const role = user.role || 'storekeeper';

  return (
    <div className="min-h-screen bg-canvas-light dark:bg-canvas-dark text-ink-light dark:text-ink-dark transition-colors duration-300">
      {/* Floating Slim Sidebar (64px wide, 16px from edges) */}
      <Sidebar
        activeTab={activeTab}
        onTabChange={tab => setActiveTab(tab)}
      />

      {/* Main Workspace Area (offset by sidebar: 64px + 32px padding = 96px / 6rem) */}
      <div className="pl-24 pr-4 sm:pr-6 md:pr-8 py-6 max-w-[1600px] mx-auto min-h-screen flex flex-col justify-between">
        <div>
          {/* Top Bar with synchronized blur route-change title */}
          <TopBar
            activeTab={activeTab}
            onSearchClick={() => setIsCopilotOpen(true)}
            onNotificationsClick={() => {}}
          />

          {/* Active Tab Content wrapped in AnimatePresence with title blur timing (180ms) */}
          <AnimatePresence mode="wait">
            <motion.main
              key={activeTab}
              initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, filter: 'blur(6px)' }}
              animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, filter: 'blur(0px)' }}
              exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, filter: 'blur(6px)' }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              className="transition-all duration-200"
            >
              {activeTab === 'dashboard' && (
                <DashboardView
                  onNavigateTab={setActiveTab}
                  onOpenCopilot={query => {
                    setCopilotQuery(query || '');
                    setIsCopilotOpen(true);
                  }}
                />
              )}

              {activeTab === 'inventory' && (
                <GenericTableView
                  title="Inventory Catalog"
                  subtitle="Live warehouse stock levels, unit costs, and reorder thresholds"
                  endpoint="/api/inventory"
                  exportEndpoint="/api/inventory/export?format=csv"
                  columns={[
                    { header: 'SKU', accessor: (it: any) => <span className="font-mono font-semibold text-sage">{it.sku}</span> },
                    { header: 'Item Name', accessor: (it: any) => <span className="font-semibold text-ink-light dark:text-ink-dark">{it.name}</span> },
                    { header: 'Category', accessor: (it: any) => <span className="text-muted">{it.category}</span> },
                    {
                      header: 'Current Stock',
                      align: 'right',
                      accessor: (it: any) => (
                        <span className="font-mono font-bold">
                          {it.quantity} {it.unit || 'pcs'}
                        </span>
                      ),
                    },
                    {
                      header: 'Unit Cost',
                      align: 'right',
                      accessor: (it: any) => (
                        <span className="font-mono text-muted">
                          ₹{(it.unit_cost || 0).toLocaleString('en-IN')}
                        </span>
                      ),
                    },
                    {
                      header: 'Status',
                      align: 'center',
                      accessor: (it: any) => {
                        const qty = it.quantity || 0;
                        const ro = it.reorder_level || 0;
                        if (qty === 0) {
                          return <span className="px-2 py-0.5 text-[10px] font-semibold bg-negative/10 text-negative rounded-full">OUT OF STOCK</span>;
                        } else if (qty <= ro) {
                          return <span className="px-2 py-0.5 text-[10px] font-semibold bg-warning/10 text-warning rounded-full">LOW BUFFER</span>;
                        }
                        return <span className="px-2 py-0.5 text-[10px] font-semibold bg-positive/10 text-positive rounded-full">OPTIMAL</span>;
                      },
                    },
                  ]}
                />
              )}

              {activeTab === 'movements' && (
                <GenericTableView
                  title="Stock Movement Ledger"
                  subtitle="Immutable record of material inward, outward dispatch, adjustments, and audits"
                  endpoint="/api/movements"
                  exportEndpoint="/api/inventory/export?format=csv&type=movements"
                  columns={[
                    { header: 'Timestamp', accessor: (m: any) => <span className="font-mono text-muted">{m.timestamp}</span> },
                    { header: 'SKU', accessor: (m: any) => <span className="font-mono font-semibold text-sage">{m.item_sku || m.item_id}</span> },
                    {
                      header: 'Type',
                      align: 'center',
                      accessor: (m: any) => (
                        <span
                          className={`font-mono text-xs px-2 py-0.5 rounded-full font-bold ${
                            m.type === 'IN'
                              ? 'bg-positive/10 text-positive'
                              : m.type === 'OUT'
                              ? 'bg-negative/10 text-negative'
                              : 'bg-muted/10 text-muted'
                          }`}
                        >
                          {m.type}
                        </span>
                      ),
                    },
                    { header: 'Quantity', align: 'right', accessor: (m: any) => <span className="font-mono font-bold">{m.quantity}</span> },
                    { header: 'Operator', accessor: (m: any) => <span className="text-muted">{m.user || 'System'}</span> },
                    { header: 'Reason', accessor: (m: any) => <span className="text-muted text-xs">{m.reason || '—'}</span> },
                  ]}
                />
              )}

              {activeTab === 'procurement' && (
                <GenericTableView
                  title="Purchase Orders & Procurement"
                  subtitle="Vendor purchase orders, line receipts, and arrival tracking"
                  endpoint="/api/purchase-orders"
                  exportEndpoint="/api/inventory/export?format=csv&type=orders"
                  columns={[
                    { header: 'PO Number', accessor: (o: any) => <span className="font-mono font-semibold text-sage">{o.po_number || `PO-${o.id}`}</span> },
                    { header: 'Supplier', accessor: (o: any) => <span className="font-semibold text-ink-light dark:text-ink-dark">{o.supplier_name || `Supplier #${o.supplier_id}`}</span> },
                    { header: 'Date', accessor: (o: any) => <span className="font-mono text-muted">{o.created_at ? o.created_at.slice(0, 10) : '—'}</span> },
                    {
                      header: 'Status',
                      align: 'center',
                      accessor: (o: any) => {
                        const s = (o.status || '').toUpperCase();
                        const color =
                          s === 'RECEIVED'
                            ? 'bg-positive/10 text-positive'
                            : s === 'PENDING'
                            ? 'bg-warning/10 text-warning'
                            : 'bg-muted/10 text-muted';
                        return <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${color}`}>{s || 'PENDING'}</span>;
                      },
                    },
                    {
                      header: 'Total Value',
                      align: 'right',
                      accessor: (o: any) => (
                        <span className="font-mono font-semibold">
                          ₹{(o.total_cost || o.total_amount || 0).toLocaleString('en-IN')}
                        </span>
                      ),
                    },
                  ]}
                />
              )}

              {activeTab === 'sales' && (
                <GenericTableView
                  title="Sales Orders & Invoices"
                  subtitle="Commercial customer orders, GST invoices, and dispatch notes"
                  endpoint="/api/sales/orders"
                  columns={[
                    { header: 'Order #', accessor: (so: any) => <span className="font-mono font-semibold text-sage">{so.order_number || `SO-${so.id}`}</span> },
                    { header: 'Customer', accessor: (so: any) => <span className="font-semibold text-ink-light dark:text-ink-dark">{so.customer_name || 'B2B Client'}</span> },
                    { header: 'Created', accessor: (so: any) => <span className="font-mono text-muted">{so.created_at ? so.created_at.slice(0, 10) : '—'}</span> },
                    {
                      header: 'Status',
                      align: 'center',
                      accessor: (so: any) => {
                        const s = (so.status || 'CONFIRMED').toUpperCase();
                        const color =
                          s === 'INVOICED'
                            ? 'bg-positive/10 text-positive'
                            : s === 'DISPATCHED'
                            ? 'bg-sage/10 text-sage'
                            : 'bg-warning/10 text-warning';
                        return <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${color}`}>{s}</span>;
                      },
                    },
                    {
                      header: 'Grand Total',
                      align: 'right',
                      accessor: (so: any) => (
                        <span className="font-mono font-semibold">
                          ₹{(so.total_amount || so.grand_total || 0).toLocaleString('en-IN')}
                        </span>
                      ),
                    },
                  ]}
                />
              )}

              {activeTab === 'customers' && (
                <GenericTableView
                  title="Customer Accounts & Ledgers"
                  subtitle="Client directories, credit limits, and outstanding receivables"
                  endpoint="/api/customers"
                  columns={[
                    { header: 'Name', accessor: (c: any) => <span className="font-semibold text-ink-light dark:text-ink-dark">{c.name}</span> },
                    { header: 'Contact', accessor: (c: any) => <span className="text-muted">{c.phone || c.email || '—'}</span> },
                    { header: 'GSTIN', accessor: (c: any) => <span className="font-mono text-xs">{c.gstin || 'Unregistered'}</span> },
                    { header: 'City / State', accessor: (c: any) => <span className="text-muted">{c.city ? `${c.city}, ${c.state || ''}` : '—'}</span> },
                    {
                      header: 'Receivable Balance',
                      align: 'right',
                      accessor: (c: any) => {
                        const bal = c.current_balance || 0;
                        return (
                          <span className={`font-mono font-semibold ${bal > 0 ? 'text-warning' : 'text-positive'}`}>
                            ₹{bal.toLocaleString('en-IN')}
                          </span>
                        );
                      },
                    },
                  ]}
                />
              )}

              {activeTab === 'suppliers' && (
                <GenericTableView
                  title="Supplier Directory"
                  subtitle="Authorized vendors, payment terms, and delivery performance"
                  endpoint="/api/suppliers"
                  columns={[
                    { header: 'Vendor Name', accessor: (s: any) => <span className="font-semibold text-ink-light dark:text-ink-dark">{s.name}</span> },
                    { header: 'Contact Person', accessor: (s: any) => <span>{s.contact_person || '—'}</span> },
                    { header: 'Phone / Email', accessor: (s: any) => <span className="font-mono text-muted text-xs">{s.phone || s.email || '—'}</span> },
                    { header: 'Payment Terms', align: 'center', accessor: (s: any) => <span className="font-mono text-xs px-2 py-0.5 rounded-full bg-black/5 dark:bg-white/10">{s.payment_terms || 'Net 30'}</span> },
                  ]}
                />
              )}

              {activeTab === 'reports' && (
                <GenericTableView
                  title="Warehouse Valuation & Audits"
                  subtitle="Valuation reports and inventory turnover"
                  endpoint="/api/reports/valuation"
                  columns={[
                    { header: 'SKU', accessor: (r: any) => <span className="font-mono font-semibold text-sage">{r.sku}</span> },
                    { header: 'Name', accessor: (r: any) => <span>{r.name}</span> },
                    { header: 'Category', accessor: (r: any) => <span className="text-muted">{r.category}</span> },
                    { header: 'Stock Units', align: 'right', accessor: (r: any) => <span className="font-mono">{r.quantity}</span> },
                    { header: 'Unit Cost', align: 'right', accessor: (r: any) => <span className="font-mono text-muted">₹{(r.unit_cost || 0).toLocaleString('en-IN')}</span> },
                    { header: 'Total Value', align: 'right', accessor: (r: any) => <span className="font-mono font-bold">₹{(r.total_value || 0).toLocaleString('en-IN')}</span> },
                  ]}
                />
              )}

              {activeTab === 'analytics' && (
                <GenericTableView
                  title="ABC-XYZ Inventory Classification"
                  subtitle="Revenue Pareto analysis and demand predictability categorization"
                  endpoint="/api/analytics/abc-xyz"
                  columns={[
                    { header: 'SKU', accessor: (a: any) => <span className="font-mono font-semibold text-sage">{a.sku}</span> },
                    { header: 'Item Name', accessor: (a: any) => <span>{a.name}</span> },
                    {
                      header: 'Class',
                      align: 'center',
                      accessor: (a: any) => (
                        <span className="font-mono font-bold px-2 py-0.5 rounded-full bg-sage/10 text-sage text-xs">
                          {a.abc_class || 'A'}-{a.xyz_class || 'X'}
                        </span>
                      ),
                    },
                    { header: 'Annual Consumption', align: 'right', accessor: (a: any) => <span className="font-mono">{a.annual_consumption || 0}</span> },
                    { header: 'Annual Value', align: 'right', accessor: (a: any) => <span className="font-mono font-semibold">₹{(a.annual_spend || 0).toLocaleString('en-IN')}</span> },
                  ]}
                />
              )}

              {activeTab === 'ai-copilot' && (
                <div className="bg-card-light dark:bg-card-dark rounded-card p-8 shadow-bento border border-hairline-light dark:border-hairline-dark text-center py-16">
                  <motion.button
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setIsCopilotOpen(true)}
                    className="px-6 py-3 bg-sage text-white text-sm font-semibold rounded-pill shadow-lg hover:bg-sage-dark transition-all inline-flex items-center gap-2 sweep-hover"
                  >
                    <span>Launch Ani Copilot Window</span>
                  </motion.button>
                </div>
              )}

              {activeTab === 'audit' && (role === 'admin' || role === 'manager') && (
                <GenericTableView
                  title="Cryptographic Audit Trail"
                  subtitle="Immutable ledger recording every mutating inventory movement, order, and operator action"
                  endpoint="/api/audit"
                  exportEndpoint="/api/inventory/export?format=csv&type=audit"
                  columns={[
                    { header: 'Timestamp', accessor: (a: any) => <span className="font-mono text-muted">{a.timestamp}</span> },
                    { header: 'Operator', accessor: (a: any) => <span className="font-semibold text-sage">{a.user}</span> },
                    { header: 'Action', accessor: (a: any) => <span className="font-mono text-xs">{a.action}</span> },
                    { header: 'Target ID', accessor: (a: any) => <span className="font-mono text-muted">{a.target_id || '—'}</span> },
                    { header: 'Details', accessor: (a: any) => <span className="text-xs text-muted truncate max-w-xs block">{a.details}</span> },
                  ]}
                />
              )}

              {activeTab === 'users' && role === 'admin' && (
                <GenericTableView
                  title="User Accounts & RBAC"
                  subtitle="Operator role assignments, security status, and warehouse privileges"
                  endpoint="/api/users"
                  columns={[
                    { header: 'Username', accessor: (u: any) => <span className="font-semibold">{u.username}</span> },
                    { header: 'Full Name', accessor: (u: any) => <span>{u.full_name || u.username}</span> },
                    {
                      header: 'Role',
                      align: 'center',
                      accessor: (u: any) => (
                        <span className="font-mono uppercase text-[10px] font-bold px-2 py-0.5 rounded-full bg-sage/10 text-sage">
                          {u.role}
                        </span>
                      ),
                    },
                    {
                      header: 'Status',
                      align: 'center',
                      accessor: () => (
                        <span className="text-[10px] font-semibold text-positive bg-positive/10 px-2 py-0.5 rounded-full">
                          ACTIVE
                        </span>
                      ),
                    },
                  ]}
                />
              )}

              {activeTab === 'business-impact' && <BusinessImpactView />}

              {activeTab === 'dev-motion' && <DevMotionView />}
            </motion.main>
          </AnimatePresence>
        </div>

        {/* Footer with Legacy UI Switcher */}
        <footer className="mt-12 pt-4 border-t border-hairline-light dark:border-hairline-dark flex flex-col sm:flex-row items-center justify-between text-xs text-muted gap-2">
          <div>
            <span>Anishka Inventory Enterprise • v2.5.0-pilot • Gurugram Facility</span>
          </div>
          <div className="flex items-center gap-4">
            <a
              href="/static/legacy.html"
              className="flex items-center gap-1.5 text-sage hover:underline font-medium"
            >
              <span>Switch to Classic UI</span>
              <ExternalLink size={12} />
            </a>
          </div>
        </footer>
      </div>

      {/* AI Copilot Search & Assistant Modal */}
      <AiCopilotModal
        isOpen={isCopilotOpen}
        onClose={() => setIsCopilotOpen(false)}
        initialQuery={copilotQuery}
      />
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MainShell />
      </AuthProvider>
    </QueryClientProvider>
  );
};
