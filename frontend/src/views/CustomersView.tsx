import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  Search,
  Plus,
  Users,
  Building,
  CreditCard,
  MapPin,
  Phone,
  Mail,
  X,
  RefreshCw,
  Download,
  BookOpen,
  FileSpreadsheet,
} from 'lucide-react';
import { apiFetch } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useOrb } from '../context/OrbContext';
import { Skeleton } from '../components/Skeleton';

interface Customer {
  id: number;
  name: string;
  contact_person?: string;
  phone?: string;
  email?: string;
  gstin?: string;
  city?: string;
  state?: string;
  credit_limit?: number;
  current_balance?: number;
}

export const CustomersView: React.FC = () => {
  const { user } = useAuth();
  const { triggerSuccess, triggerAlert } = useOrb();
  const queryClient = useQueryClient();
  const shouldReduceMotion = useReducedMotion();

  const [search, setSearch] = useState('');
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [selectedCustomerForLedger, setSelectedCustomerForLedger] = useState<Customer | null>(null);
  const [addForm, setAddForm] = useState({
    name: '',
    contact_person: 'Procurement Head',
    phone: '+91 98110 00000',
    email: 'accounts@client.com',
    gstin: '06AAAAA0000A1Z5',
    city: 'Gurugram',
    state: 'Haryana',
    credit_limit: 500000,
  });

  const { data, isLoading, refetch, isFetching } = useQuery<Customer[]>({
    queryKey: ['/api/customers'],
    queryFn: () => apiFetch('/api/customers'),
    staleTime: 60000,
  });

  const customers = Array.isArray(data) ? data : [];

  // Fetch individual customer financial ledger
  const { data: ledgerData, isLoading: ledgerLoading } = useQuery({
    queryKey: ['/api/customers', selectedCustomerForLedger?.id, 'ledger'],
    queryFn: () => apiFetch(`/api/customers/${selectedCustomerForLedger?.id}/ledger`),
    enabled: Boolean(selectedCustomerForLedger?.id),
  });

  const handleExportLedgerCsv = () => {
    if (!ledgerData?.transactions?.length || !selectedCustomerForLedger) return;
    const headers = ['Date', 'Type', 'Reference', 'Details', 'Debit (INR)', 'Credit (INR)', 'Running Balance (INR)'];
    const rows = ledgerData.transactions.map((t: any) => [
      `"${t.date || ''}"`,
      `"${t.type || ''}"`,
      `"${t.ref || t.reference || ''}"`,
      `"${(t.details || '').replace(/"/g, '""')}"`,
      t.debit ?? 0,
      t.credit ?? 0,
      t.running_balance ?? 0,
    ]);
    const csvContent = [headers.join(','), ...rows.map((r: any[]) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedCustomerForLedger.name.replace(/\s+/g, '_')}_Ledger.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  };

  const filteredCustomers = useMemo(() => {
    if (!search.trim()) return customers;
    const q = search.toLowerCase();
    return customers.filter(
      c =>
        c.name.toLowerCase().includes(q) ||
        (c.city && c.city.toLowerCase().includes(q)) ||
        (c.gstin && c.gstin.toLowerCase().includes(q))
    );
  }, [customers, search]);

  const addCustomerMutation = useMutation({
    mutationFn: (payload: any) =>
      apiFetch('/api/customers', {
        method: 'POST',
        body: payload,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/customers'] });
      triggerSuccess('New customer account created');
      setIsAddOpen(false);
      setAddForm({
        name: '',
        contact_person: 'Procurement Head',
        phone: '+91 98110 00000',
        email: 'accounts@client.com',
        gstin: '06AAAAA0000A1Z5',
        city: 'Gurugram',
        state: 'Haryana',
        credit_limit: 500000,
      });
    },
    onError: (err: any) => triggerAlert(err.message || 'Failed to create customer'),
  });

  const canManage = user?.role === 'admin' || user?.role === 'manager';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-ink-light dark:text-ink-dark tracking-tight">
            Customer Ledgers & Accounts
          </h2>
          <p className="text-xs text-muted mt-0.5">
            B2B client profiles, statutory GSTIN verification, credit limits, and running receivable balances
          </p>
        </div>

        <div className="flex items-center gap-2">
          {canManage && (
            <motion.button
              whileTap={{ scale: 0.98 }}
              onClick={() => setIsAddOpen(true)}
              className="px-4 py-2 bg-ink-light dark:bg-white text-white dark:text-ink-light rounded-pill text-xs font-semibold shadow-bento sweep-hover flex items-center gap-1.5 transition-all"
            >
              <Plus size={14} />
              <span>Add Customer</span>
            </motion.button>
          )}

          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={() => refetch()}
            className="w-9 h-9 rounded-full bg-card-light dark:bg-card-dark border border-hairline-light dark:border-hairline-dark flex items-center justify-center text-muted hover:text-ink-light"
          >
            <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
          </motion.button>
        </div>
      </div>

      {/* Search Input Bar */}
      <div className="bg-card-light dark:bg-card-dark rounded-card p-4 shadow-bento border border-hairline-light dark:border-hairline-dark flex items-center justify-between">
        <div className="relative flex items-center bg-canvas-light dark:bg-black/20 rounded-pill px-3 py-1.5 border border-hairline-light dark:border-hairline-dark text-xs w-72">
          <Search size={14} className="text-muted mr-2" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search customer, GSTIN, city…"
            className="bg-transparent text-ink-light dark:text-ink-dark focus:outline-none w-full"
          />
        </div>
        <span className="text-xs text-muted">
          <strong>{filteredCustomers.length}</strong> active client accounts
        </span>
      </div>

      {/* Customers Table (56px rows, sticky header, hover row tint) */}
      <div className="bg-card-light dark:bg-card-dark rounded-card shadow-bento border border-hairline-light dark:border-hairline-dark overflow-hidden">
        <div className="overflow-x-auto max-h-[640px] no-scrollbar">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="sticky top-0 z-10 bg-white/85 dark:bg-[#181B1A]/90 backdrop-blur-md border-b border-hairline-light dark:border-hairline-dark text-muted font-medium uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-3.5 px-4">Client Name</th>
                <th className="py-3.5 px-4">GSTIN</th>
                <th className="py-3.5 px-4">Contact Person</th>
                <th className="py-3.5 px-4">Phone / Email</th>
                <th className="py-3.5 px-4 text-center">City / State</th>
                <th className="py-3.5 px-4 text-right">Credit Limit</th>
                <th className="py-3.5 px-4 text-right">Outstanding Balance</th>
                <th className="py-3.5 px-4 text-center">Ledger</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline-light dark:divide-hairline-dark">
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="h-14">
                    <td colSpan={8} className="px-4">
                      <Skeleton className="h-8 w-full" rounded="md" />
                    </td>
                  </tr>
                ))
              ) : filteredCustomers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center text-xs text-muted">
                    No customer accounts match your search.
                  </td>
                </tr>
              ) : (
                filteredCustomers.map((c, idx) => {
                  const bal = c.current_balance || 0;
                  return (
                    <tr key={c.id || idx} className="h-14 hover:bg-black/2 dark:hover:bg-white/2 transition-colors">
                      <td className="py-2 px-4 font-semibold text-ink-light dark:text-ink-dark">
                        {c.name}
                      </td>

                      <td className="py-2 px-4 font-mono text-[11px] text-muted">
                        {c.gstin || 'Unregistered'}
                      </td>

                      <td className="py-2 px-4 text-ink-light dark:text-ink-dark">
                        {c.contact_person || '—'}
                      </td>

                      <td className="py-2 px-4 text-muted font-mono text-[11px]">
                        <div>{c.phone || '—'}</div>
                        <div className="text-muted/70">{c.email || '—'}</div>
                      </td>

                      <td className="py-2 px-4 text-center">
                        <span className="inline-flex items-center gap-1 text-[11px] bg-black/5 dark:bg-white/10 px-2 py-0.5 rounded text-muted">
                          <MapPin size={10} />
                          {c.city ? `${c.city}, ${c.state || ''}` : 'Delhi-NCR'}
                        </span>
                      </td>

                      <td className="py-2 px-4 text-right font-mono text-muted">
                        ₹{(c.credit_limit || 0).toLocaleString('en-IN')}
                      </td>

                      <td className="py-2 px-4 text-right font-mono font-bold">
                        <span className={bal > 0 ? 'text-warning' : 'text-positive'}>
                          ₹{bal.toLocaleString('en-IN')}
                        </span>
                      </td>

                      <td className="py-2 px-4 text-center">
                        <button
                          onClick={() => setSelectedCustomerForLedger(c)}
                          className="px-2.5 py-1 bg-card-light dark:bg-card-dark border border-hairline-light dark:border-hairline-dark hover:bg-black/5 dark:hover:bg-white/10 rounded-pill text-[11px] font-medium text-ink-light dark:text-ink-dark flex items-center gap-1 shadow-sm transition-colors mx-auto"
                        >
                          <BookOpen size={12} className="text-sage" />
                          <span>Ledger</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Customer Modal */}
      <AnimatePresence>
        {isAddOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAddOpen(false)}
              className="fixed inset-0 bg-black/40 backdrop-blur-[8px]"
            />
            <motion.div
              initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 8 }}
              animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
              exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 8 }}
              className="relative z-10 bg-card-light dark:bg-card-dark max-w-md w-full rounded-card p-6 shadow-2xl border border-hairline-light dark:border-hairline-dark text-xs"
            >
              <div className="flex items-center justify-between pb-3 border-b border-hairline-light dark:border-hairline-dark">
                <h3 className="text-base font-bold text-ink-light dark:text-ink-dark">
                  Add Commercial Customer
                </h3>
                <button onClick={() => setIsAddOpen(false)} className="text-muted hover:text-ink-light">
                  <X size={16} />
                </button>
              </div>

              <form
                onSubmit={e => {
                  e.preventDefault();
                  addCustomerMutation.mutate(addForm);
                }}
                className="space-y-3 mt-4"
              >
                <div>
                  <label className="block text-muted font-medium mb-1">Company / Trade Name *</label>
                  <input
                    type="text"
                    required
                    value={addForm.name}
                    onChange={e => setAddForm({ ...addForm, name: e.target.value })}
                    className="w-full bg-canvas-light dark:bg-black/20 rounded-pill px-3 py-2 border border-hairline-light dark:border-hairline-dark font-medium"
                    placeholder="e.g. Maruti Fabricators Ltd"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-muted font-medium mb-1">GSTIN Number</label>
                    <input
                      type="text"
                      value={addForm.gstin}
                      onChange={e => setAddForm({ ...addForm, gstin: e.target.value.toUpperCase() })}
                      className="w-full bg-canvas-light dark:bg-black/20 rounded-pill px-3 py-2 border border-hairline-light dark:border-hairline-dark font-mono uppercase"
                    />
                  </div>
                  <div>
                    <label className="block text-muted font-medium mb-1">Credit Limit (₹)</label>
                    <input
                      type="number"
                      value={addForm.credit_limit}
                      onChange={e => setAddForm({ ...addForm, credit_limit: Number(e.target.value) })}
                      className="w-full bg-canvas-light dark:bg-black/20 rounded-pill px-3 py-2 border border-hairline-light dark:border-hairline-dark font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-muted font-medium mb-1">Contact Person</label>
                    <input
                      type="text"
                      value={addForm.contact_person}
                      onChange={e => setAddForm({ ...addForm, contact_person: e.target.value })}
                      className="w-full bg-canvas-light dark:bg-black/20 rounded-pill px-3 py-2 border border-hairline-light dark:border-hairline-dark"
                    />
                  </div>
                  <div>
                    <label className="block text-muted font-medium mb-1">Phone</label>
                    <input
                      type="text"
                      value={addForm.phone}
                      onChange={e => setAddForm({ ...addForm, phone: e.target.value })}
                      className="w-full bg-canvas-light dark:bg-black/20 rounded-pill px-3 py-2 border border-hairline-light dark:border-hairline-dark font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-muted font-medium mb-1">City</label>
                    <input
                      type="text"
                      value={addForm.city}
                      onChange={e => setAddForm({ ...addForm, city: e.target.value })}
                      className="w-full bg-canvas-light dark:bg-black/20 rounded-pill px-3 py-2 border border-hairline-light dark:border-hairline-dark"
                    />
                  </div>
                  <div>
                    <label className="block text-muted font-medium mb-1">State</label>
                    <input
                      type="text"
                      value={addForm.state}
                      onChange={e => setAddForm({ ...addForm, state: e.target.value })}
                      className="w-full bg-canvas-light dark:bg-black/20 rounded-pill px-3 py-2 border border-hairline-light dark:border-hairline-dark"
                    />
                  </div>
                </div>

                <div className="pt-3 border-t border-hairline-light dark:border-hairline-dark flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsAddOpen(false)}
                    className="px-4 py-2 bg-black/5 dark:bg-white/10 rounded-pill text-muted"
                  >
                    Cancel
                  </button>
                  <motion.button
                    whileTap={{ scale: 0.98 }}
                    type="submit"
                    disabled={addCustomerMutation.isPending}
                    className="px-5 py-2 bg-sage hover:bg-sage-dark text-white rounded-pill font-semibold sweep-hover"
                  >
                    {addCustomerMutation.isPending ? 'Saving…' : 'Save Account'}
                  </motion.button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Customer Financial Ledger Drawer */}
      <AnimatePresence>
        {selectedCustomerForLedger && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedCustomerForLedger(null)}
              className="fixed inset-0 bg-black/40 backdrop-blur-[8px]"
            />
            <motion.div
              initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 8 }}
              animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
              exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 8 }}
              className="relative z-10 bg-card-light dark:bg-card-dark max-w-3xl w-full rounded-card p-6 shadow-2xl border border-hairline-light dark:border-hairline-dark text-xs flex flex-col max-h-[85vh]"
            >
              <div className="flex items-center justify-between pb-4 border-b border-hairline-light dark:border-hairline-dark">
                <div>
                  <div className="flex items-center gap-2">
                    <BookOpen size={18} className="text-sage" />
                    <h3 className="text-base font-bold text-ink-light dark:text-ink-dark">
                      Financial Ledger: {selectedCustomerForLedger.name}
                    </h3>
                  </div>
                  <p className="text-[11px] text-muted mt-0.5">
                    GSTIN: {selectedCustomerForLedger.gstin || 'Unregistered'} • Credit Limit: ₹{(selectedCustomerForLedger.credit_limit || 0).toLocaleString('en-IN')}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <motion.button
                    whileTap={{ scale: 0.98 }}
                    onClick={handleExportLedgerCsv}
                    disabled={!ledgerData?.transactions?.length}
                    className="px-3.5 py-1.5 bg-ink-light dark:bg-white text-white dark:text-ink-light rounded-pill text-xs font-semibold shadow-bento sweep-hover flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <Download size={13} />
                    <span>Export</span>
                  </motion.button>
                  <button onClick={() => setSelectedCustomerForLedger(null)} className="p-1 text-muted hover:text-ink-light">
                    <X size={16} />
                  </button>
                </div>
              </div>

              {/* Ledger Summary Cards */}
              <div className="grid grid-cols-3 gap-3 my-4">
                <div className="p-3 rounded-card bg-canvas-light/60 dark:bg-black/20 border border-hairline-light dark:border-hairline-dark">
                  <span className="text-[10px] text-muted uppercase font-semibold">Total Invoiced (Debit)</span>
                  <div className="text-sm font-bold font-mono text-ink-light dark:text-ink-dark mt-1">
                    ₹{(ledgerData?.transactions || [])
                      .reduce((acc: number, t: any) => acc + (t.debit || 0), 0)
                      .toLocaleString('en-IN')}
                  </div>
                </div>
                <div className="p-3 rounded-card bg-canvas-light/60 dark:bg-black/20 border border-hairline-light dark:border-hairline-dark">
                  <span className="text-[10px] text-muted uppercase font-semibold">Total Paid (Credit)</span>
                  <div className="text-sm font-bold font-mono text-positive mt-1">
                    ₹{(ledgerData?.transactions || [])
                      .reduce((acc: number, t: any) => acc + (t.credit || 0), 0)
                      .toLocaleString('en-IN')}
                  </div>
                </div>
                <div className="p-3 rounded-card bg-canvas-light/60 dark:bg-black/20 border border-hairline-light dark:border-hairline-dark">
                  <span className="text-[10px] text-muted uppercase font-semibold">Outstanding Balance</span>
                  <div className="text-sm font-bold font-mono text-warning mt-1">
                    ₹{(selectedCustomerForLedger.current_balance ?? ledgerData?.outstanding_balance ?? 0).toLocaleString('en-IN')}
                  </div>
                </div>
              </div>

              {/* Transactions Table */}
              <div className="overflow-y-auto flex-1 no-scrollbar border border-hairline-light dark:border-hairline-dark rounded-tile">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="sticky top-0 bg-white/90 dark:bg-[#181B1A]/90 backdrop-blur-md border-b border-hairline-light dark:border-hairline-dark text-muted font-medium uppercase text-[10px]">
                    <tr>
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-3">Type</th>
                      <th className="py-2.5 px-3">Reference</th>
                      <th className="py-2.5 px-3">Details</th>
                      <th className="py-2.5 px-3 text-right">Debit (₹)</th>
                      <th className="py-2.5 px-3 text-right">Credit (₹)</th>
                      <th className="py-2.5 px-3 text-right">Balance (₹)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-hairline-light dark:divide-hairline-dark font-mono text-[11px]">
                    {ledgerLoading ? (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-muted font-sans">
                          Loading customer transactions…
                        </td>
                      </tr>
                    ) : !ledgerData?.transactions?.length ? (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-muted font-sans">
                          No ledger transactions found for this customer.
                        </td>
                      </tr>
                    ) : (
                      ledgerData.transactions.map((t: any, i: number) => (
                        <tr key={i} className="hover:bg-black/2 dark:hover:bg-white/2">
                          <td className="py-2 px-3 text-muted">{t.date || '—'}</td>
                          <td className="py-2 px-3">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              t.type === 'INVOICE' ? 'bg-warning/10 text-warning' : 'bg-positive/10 text-positive'
                            }`}>
                              {t.type}
                            </span>
                          </td>
                          <td className="py-2 px-3 font-semibold text-sage">{t.ref || t.reference || '—'}</td>
                          <td className="py-2 px-3 text-muted font-sans truncate max-w-xs">{t.details || '—'}</td>
                          <td className="py-2 px-3 text-right text-ink-light dark:text-ink-dark">
                            {t.debit ? `₹${Number(t.debit).toLocaleString('en-IN')}` : '—'}
                          </td>
                          <td className="py-2 px-3 text-right text-positive">
                            {t.credit ? `₹${Number(t.credit).toLocaleString('en-IN')}` : '—'}
                          </td>
                          <td className="py-2 px-3 text-right font-bold text-ink-light dark:text-ink-dark">
                            ₹{Number(t.running_balance ?? 0).toLocaleString('en-IN')}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
