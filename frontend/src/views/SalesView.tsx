import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  Search,
  Receipt,
  FileCheck,
  Send,
  CreditCard,
  Target,
  RefreshCw,
  Plus,
  X,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Download,
  FileText,
  Trash2,
} from 'lucide-react';
import { apiFetch, downloadFile } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useOrb } from '../context/OrbContext';
import { Skeleton } from '../components/Skeleton';

export const SalesView: React.FC = () => {
  const { user } = useAuth();
  const { triggerSuccess, triggerAlert } = useOrb();
  const queryClient = useQueryClient();
  const shouldReduceMotion = useReducedMotion();

  const [activeSubTab, setActiveSubTab] = useState<'orders' | 'invoices' | 'opportunities'>('orders');
  const [search, setSearch] = useState('');

  // Payment modal state
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null);
  const [paymentForm, setPaymentForm] = useState({
    amount: 10000,
    payment_mode: 'NEFT',
    reference: 'UTR-99201',
    notes: 'Electronic Transfer Clearance',
  });

  // Quote Creation Modal State
  const [isQuoteModalOpen, setIsQuoteModalOpen] = useState(false);
  const [quoteCustomerId, setQuoteCustomerId] = useState<number | ''>('');
  const [quoteCustomerName, setQuoteCustomerName] = useState('');
  const [quoteOppRef, setQuoteOppRef] = useState('');
  const [quoteNotes, setQuoteNotes] = useState('');
  const [quoteValidUntil, setQuoteValidUntil] = useState('');
  const [quoteItems, setQuoteItems] = useState<
    Array<{
      item_id: number;
      name: string;
      sku: string;
      qty: number;
      unit_price: number;
      discount_pct: number;
    }>
  >([]);
  const [selectedItemToAdd, setSelectedItemToAdd] = useState<string>('');

  // Fetch Customers for quote creation
  const { data: rawCustomers } = useQuery({
    queryKey: ['/api/customers'],
    queryFn: () => apiFetch('/api/customers'),
    staleTime: 60000,
  });
  const customers = Array.isArray(rawCustomers) ? rawCustomers : [];

  // Fetch Inventory for items selection
  const { data: rawInventory } = useQuery({
    queryKey: ['/api/inventory'],
    queryFn: () => apiFetch('/api/inventory'),
    staleTime: 60000,
  });
  const inventoryItems = Array.isArray(rawInventory) ? rawInventory : [];

  // Fetch Sales Orders
  const { data: rawOrders, isLoading: ordersLoading, refetch: refetchOrders } = useQuery({
    queryKey: ['/api/sales/orders'],
    queryFn: () => apiFetch('/api/sales/orders'),
    staleTime: 30000,
  });

  // Fetch Invoices
  const { data: rawInvoices, isLoading: invoicesLoading, refetch: refetchInvoices } = useQuery({
    queryKey: ['/api/invoices'],
    queryFn: () => apiFetch('/api/invoices'),
    staleTime: 30000,
  });

  // Fetch Opportunities
  const { data: rawOpps, isLoading: oppsLoading, refetch: refetchOpps } = useQuery({
    queryKey: ['/api/sales/opportunities'],
    queryFn: () => apiFetch('/api/sales/opportunities'),
    staleTime: 60000,
  });

  const orders = Array.isArray(rawOrders) ? rawOrders : [];
  const invoices = Array.isArray(rawInvoices) ? rawInvoices : [];
  const opportunities = Array.isArray(rawOpps) ? rawOpps : [];

  // Compute opportunities from repeat-order patterns if backend returns none
  const displayOpportunities = useMemo(() => {
    if (opportunities.length > 0) return opportunities;
    // Derive from orders repeat patterns
    const customerCounts: Record<string, { count: number; total: number; lastOrder: any; customerId: number }> = {};
    orders.forEach((ord: any) => {
      const cname = ord.customer_name || `Customer #${ord.customer_id || 'Unknown'}`;
      if (!customerCounts[cname]) {
        customerCounts[cname] = { count: 0, total: 0, lastOrder: ord, customerId: ord.customer_id };
      }
      customerCounts[cname].count += 1;
      customerCounts[cname].total += Number(ord.total_amount || 0);
      if (!customerCounts[cname].lastOrder || ord.id > customerCounts[cname].lastOrder.id) {
        customerCounts[cname].lastOrder = ord;
        customerCounts[cname].customerId = ord.customer_id;
      }
    });

    const computed = Object.entries(customerCounts)
      .map(([customerName, data], idx) => {
        const lastOrd = data.lastOrder || {};
        return {
          id: `computed-${idx + 1}`,
          opportunity_no: `OPP-REP-${101 + idx}`,
          customer_name: customerName,
          customer_id: data.customerId || lastOrd.customer_id || 1,
          items: lastOrd.items || [],
          title: `Recurring Spares Re-Order — ${customerName}`,
          description: `Repeat buyer (${data.count} confirmed order${data.count > 1 ? 's' : ''}). Projected replenishment based on inventory consumption cycle.`,
          stage: data.count > 1 ? 'REPEAT_CYCLE' : 'LEAD',
          estimated_value: Math.round(data.total / data.count) || 25000,
          lastOrder: lastOrd,
        };
      });

    return computed;
  }, [opportunities, orders]);

  // Open Quote Modal helper
  const openQuoteModalForOpp = (opp: any) => {
    if (opp) {
      let cid = opp.customer_id;
      if (!cid && customers.length > 0) {
        const match = customers.find((c: any) => c.name?.toLowerCase() === opp.customer_name?.toLowerCase());
        if (match) cid = match.id;
      }
      if (!cid && customers.length > 0) cid = customers[0].id;
      setQuoteCustomerId(cid || 1);
      setQuoteCustomerName(opp.customer_name || '');
      setQuoteOppRef(opp.opportunity_no || '');
      setQuoteNotes(`Quotation prepared for repeat replenishment (${opp.opportunity_no || 'Pipeline'})`);

      let initialItems: any[] = [];
      if (opp.items && opp.items.length > 0) {
        initialItems = opp.items.map((it: any) => ({
          item_id: it.item_id,
          name: it.name || 'Welding Spare',
          sku: it.sku || '',
          qty: it.qty || 5,
          unit_price: it.unit_price || 500,
          discount_pct: it.discount_pct || 0,
        }));
      } else if (inventoryItems.length > 0) {
        const first = inventoryItems[0];
        initialItems = [{
          item_id: first.id,
          name: first.name,
          sku: first.sku,
          qty: 10,
          unit_price: first.selling_price || first.unit_price || 450,
          discount_pct: 0,
        }];
      }
      setQuoteItems(initialItems);
    } else {
      setQuoteCustomerId(customers[0]?.id || 1);
      setQuoteCustomerName(customers[0]?.name || '');
      setQuoteOppRef('');
      setQuoteNotes('Commercial sales quotation for industrial welding spares');
      if (inventoryItems.length > 0) {
        const first = inventoryItems[0];
        setQuoteItems([{
          item_id: first.id,
          name: first.name,
          sku: first.sku,
          qty: 10,
          unit_price: first.selling_price || first.unit_price || 450,
          discount_pct: 0,
        }]);
      } else {
        setQuoteItems([]);
      }
    }

    const d = new Date();
    d.setDate(d.getDate() + 15);
    setQuoteValidUntil(d.toISOString().split('T')[0]);
    setIsQuoteModalOpen(true);
  };

  // Create Quote Mutation
  const createQuoteMutation = useMutation({
    mutationFn: (payload: any) =>
      apiFetch('/api/sales/orders', {
        method: 'POST',
        body: payload,
      }),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/sales/orders'] });
      triggerSuccess(`Quotation ${data.order_no || 'Quote'} generated successfully!`);
      setIsQuoteModalOpen(false);
      setActiveSubTab('orders');
    },
    onError: (err: any) => triggerAlert(err.message || 'Failed to create quotation'),
  });

  // Mutations
  const confirmOrderMutation = useMutation({
    mutationFn: (orderId: number | string) =>
      apiFetch(`/api/sales/orders/${orderId}/confirm`, {
        method: 'POST',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/sales/orders'] });
      triggerSuccess('Quotation confirmed into active Sales Order');
    },
    onError: (err: any) => triggerAlert(err.message || 'Confirmation failed'),
  });

  const dispatchOrderMutation = useMutation({
    mutationFn: (orderId: number | string) =>
      apiFetch(`/api/sales/orders/${orderId}/dispatch`, {
        method: 'POST',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/sales/orders'] });
      queryClient.invalidateQueries({ queryKey: ['/api/inventory'] });
      triggerSuccess('Order dispatched and stock reserved deducted');
    },
    onError: (err: any) => triggerAlert(err.message || 'Dispatch failed'),
  });

  const invoiceOrderMutation = useMutation({
    mutationFn: (orderId: number | string) =>
      apiFetch(`/api/sales/orders/${orderId}/invoice`, {
        method: 'POST',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/sales/orders'] });
      queryClient.invalidateQueries({ queryKey: ['/api/invoices'] });
      triggerSuccess('GST Tax Invoice generated');
    },
    onError: (err: any) => triggerAlert(err.message || 'Invoicing failed'),
  });

  const recordPaymentMutation = useMutation({
    mutationFn: ({ invoiceId, payload }: any) =>
      apiFetch(`/api/invoices/${invoiceId}/payments`, {
        method: 'POST',
        body: payload,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/invoices'] });
      queryClient.invalidateQueries({ queryKey: ['/api/sales/orders'] });
      triggerSuccess('Payment clearance recorded in ledger');
      setIsPaymentModalOpen(false);
    },
    onError: (err: any) => triggerAlert(err.message || 'Payment recording failed'),
  });

  const canManage = user?.role === 'admin' || user?.role === 'manager';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-ink-light dark:text-ink-dark tracking-tight">
            Commercial Sales & Customer Invoicing
          </h2>
          <p className="text-xs text-muted mt-0.5">
            Customer quotations, confirmed dispatch orders, GST invoices, and payment reconciliation
          </p>
        </div>

        <div className="flex items-center gap-2">
          {canManage && (
            <motion.button
              whileTap={{ scale: 0.98 }}
              onClick={() => openQuoteModalForOpp(null)}
              className="px-3.5 py-2 rounded-pill bg-sage hover:bg-sage-dark text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-all"
            >
              <Plus size={14} />
              <span>Create Quote</span>
            </motion.button>
          )}
          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={() => {
              refetchOrders();
              refetchInvoices();
              refetchOpps();
            }}
            className="w-9 h-9 rounded-full bg-card-light dark:bg-card-dark border border-hairline-light dark:border-hairline-dark flex items-center justify-center text-muted hover:text-ink-light"
          >
            <RefreshCw size={14} className={ordersLoading || invoicesLoading ? 'animate-spin' : ''} />
          </motion.button>
        </div>
      </div>

      {/* Sub-tab Navigation */}
      <div className="bg-card-light dark:bg-card-dark rounded-card p-4 shadow-bento border border-hairline-light dark:border-hairline-dark flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveSubTab('orders')}
            className={`px-4 py-2 rounded-pill text-xs font-semibold transition-all ${
              activeSubTab === 'orders'
                ? 'bg-ink-light dark:bg-white text-white dark:text-ink-light shadow-sm'
                : 'bg-black/5 dark:bg-white/10 text-muted hover:text-ink-light'
            }`}
          >
            Sales Orders & Quotes ({orders.length})
          </button>

          <button
            onClick={() => setActiveSubTab('invoices')}
            className={`px-4 py-2 rounded-pill text-xs font-semibold transition-all ${
              activeSubTab === 'invoices'
                ? 'bg-ink-light dark:bg-white text-white dark:text-ink-light shadow-sm'
                : 'bg-black/5 dark:bg-white/10 text-muted hover:text-ink-light'
            }`}
          >
            Tax Invoices & Receivables ({invoices.length})
          </button>

          <button
            onClick={() => setActiveSubTab('opportunities')}
            className={`px-4 py-2 rounded-pill text-xs font-semibold transition-all ${
              activeSubTab === 'opportunities'
                ? 'bg-ink-light dark:bg-white text-white dark:text-ink-light shadow-sm'
                : 'bg-black/5 dark:bg-white/10 text-muted hover:text-ink-light'
            }`}
          >
            Opportunity Pipeline ({displayOpportunities.length})
          </button>
        </div>

        <div className="relative flex items-center bg-canvas-light dark:bg-black/20 rounded-pill px-3 py-1.5 border border-hairline-light dark:border-hairline-dark text-xs w-60">
          <Search size={14} className="text-muted mr-2" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search order #, customer…"
            className="bg-transparent text-ink-light dark:text-ink-dark focus:outline-none w-full"
          />
        </div>
      </div>

      {/* ==================================================================== */}
      {/* SUBTAB 1: ORDERS & QUOTES TABLE                                      */}
      {/* ==================================================================== */}
      {activeSubTab === 'orders' && (
        <div className="bg-card-light dark:bg-card-dark rounded-card shadow-bento border border-hairline-light dark:border-hairline-dark overflow-hidden">
          <div className="overflow-x-auto max-h-[640px] no-scrollbar">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="sticky top-0 z-10 bg-white/85 dark:bg-[#181B1A]/90 backdrop-blur-md border-b border-hairline-light dark:border-hairline-dark text-muted font-medium uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="py-3.5 px-4">Order / Quote #</th>
                  <th className="py-3.5 px-4">Client Name</th>
                  <th className="py-3.5 px-4">Date</th>
                  <th className="py-3.5 px-4 text-right">Grand Total</th>
                  <th className="py-3.5 px-4 text-center">Status</th>
                  <th className="py-3.5 px-4 text-center">Workflow Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline-light dark:divide-hairline-dark">
                {ordersLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="h-14">
                      <td colSpan={6} className="px-4">
                        <Skeleton className="h-8 w-full" rounded="md" />
                      </td>
                    </tr>
                  ))
                ) : orders.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-16 text-center text-xs text-muted">
                      No commercial sales orders recorded.
                    </td>
                  </tr>
                ) : (
                  orders.map((so: any) => {
                    const st = (so.status || 'CONFIRMED').toUpperCase();
                    return (
                      <tr key={so.id} className="h-14 hover:bg-black/2 dark:hover:bg-white/2 transition-colors">
                        <td className="py-2 px-4 font-mono font-bold text-sage">
                          {so.order_number || so.order_no || `SO-${so.id}`}
                        </td>
                        <td className="py-2 px-4 font-semibold text-ink-light dark:text-ink-dark">
                          {so.customer_name || 'B2B Client'}
                        </td>
                        <td className="py-2 px-4 font-mono text-muted text-[11px]">
                          {so.created_at ? so.created_at.slice(0, 10) : '—'}
                        </td>
                        <td className="py-2 px-4 text-right font-mono font-bold text-ink-light dark:text-ink-dark">
                          ₹{(so.total_amount || so.grand_total || 0).toLocaleString('en-IN')}
                        </td>
                        <td className="py-2 px-4 text-center">
                          {st === 'QUOTE' && (
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-warning/10 text-warning">
                              QUOTATION
                            </span>
                          )}
                          {st === 'CONFIRMED' && (
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-positive/10 text-positive">
                              CONFIRMED
                            </span>
                          )}
                          {st === 'DISPATCHED' && (
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-sage/10 text-sage">
                              DISPATCHED
                            </span>
                          )}
                          {st === 'INVOICED' && (
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-positive text-white">
                              INVOICED
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-4 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            {/* Quotation PDF */}
                            <motion.button
                              whileTap={{ scale: 0.98 }}
                              onClick={() =>
                                downloadFile(
                                  `/api/sales/orders/${so.id}/quote-pdf`,
                                  `Quotation_${so.order_number || so.order_no || so.id}.pdf`
                                )
                              }
                              className="px-2.5 py-1 bg-card-light dark:bg-card-dark border border-hairline-light dark:border-hairline-dark hover:bg-black/5 dark:hover:bg-white/10 rounded-pill text-[11px] font-medium text-ink-light dark:text-ink-dark flex items-center gap-1 shadow-sm transition-colors"
                              title="Download Quotation PDF"
                            >
                              <FileText size={12} className="text-sage" />
                              <span>Quote PDF</span>
                            </motion.button>

                            {canManage && st === 'QUOTE' && (
                              <motion.button
                                whileTap={{ scale: 0.98 }}
                                onClick={() => confirmOrderMutation.mutate(so.id)}
                                className="px-2.5 py-1 bg-sage hover:bg-sage-dark text-white rounded-pill text-[11px] font-medium shadow-sm"
                              >
                                Confirm Order
                              </motion.button>
                            )}

                            {st === 'CONFIRMED' && (
                              <motion.button
                                whileTap={{ scale: 0.98 }}
                                onClick={() => dispatchOrderMutation.mutate(so.id)}
                                className="px-2.5 py-1 bg-ink-light dark:bg-white text-white dark:text-ink-light rounded-pill text-[11px] font-medium shadow-sm"
                              >
                                Dispatch
                              </motion.button>
                            )}

                            {st === 'DISPATCHED' && (
                              <motion.button
                                whileTap={{ scale: 0.98 }}
                                onClick={() => invoiceOrderMutation.mutate(so.id)}
                                className="px-2.5 py-1 bg-positive hover:bg-positive/90 text-white rounded-pill text-[11px] font-medium shadow-sm"
                              >
                                Generate Invoice
                              </motion.button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* SUBTAB 2: TAX INVOICES & PAYMENTS TABLE                              */}
      {/* ==================================================================== */}
      {activeSubTab === 'invoices' && (
        <div className="bg-card-light dark:bg-card-dark rounded-card shadow-bento border border-hairline-light dark:border-hairline-dark overflow-hidden">
          <div className="overflow-x-auto max-h-[640px] no-scrollbar">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="sticky top-0 z-10 bg-white/85 dark:bg-[#181B1A]/90 backdrop-blur-md border-b border-hairline-light dark:border-hairline-dark text-muted font-medium uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="py-3.5 px-4">Invoice #</th>
                  <th className="py-3.5 px-4">Customer</th>
                  <th className="py-3.5 px-4">Invoice Date</th>
                  <th className="py-3.5 px-4 text-right">Grand Total</th>
                  <th className="py-3.5 px-4 text-right">Balance Due</th>
                  <th className="py-3.5 px-4 text-center">Payment Status</th>
                  <th className="py-3.5 px-4 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline-light dark:divide-hairline-dark">
                {invoicesLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="h-14">
                      <td colSpan={7} className="px-4">
                        <Skeleton className="h-8 w-full" rounded="md" />
                      </td>
                    </tr>
                  ))
                ) : invoices.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-16 text-center text-xs text-muted">
                      No tax invoices on record.
                    </td>
                  </tr>
                ) : (
                  invoices.map((inv: any) => {
                    const bal = inv.balance_due ?? (inv.grand_total - (inv.paid_amount || 0));
                    return (
                      <tr key={inv.id} className="h-14 hover:bg-black/2 dark:hover:bg-white/2 transition-colors">
                        <td className="py-2 px-4 font-mono font-bold text-sage">
                          {inv.invoice_no || `INV-${inv.id}`}
                        </td>
                        <td className="py-2 px-4 font-semibold text-ink-light dark:text-ink-dark">
                          {inv.customer_name || 'Client'}
                        </td>
                        <td className="py-2 px-4 font-mono text-muted text-[11px]">
                          {inv.invoice_date || '—'}
                        </td>
                        <td className="py-2 px-4 text-right font-mono font-bold text-ink-light dark:text-ink-dark">
                          ₹{(inv.grand_total || 0).toLocaleString('en-IN')}
                        </td>
                        <td className="py-2 px-4 text-right font-mono font-semibold text-warning">
                          ₹{(bal || 0).toLocaleString('en-IN')}
                        </td>
                        <td className="py-2 px-4 text-center">
                          {bal <= 0 ? (
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-positive/10 text-positive">
                              PAID
                            </span>
                          ) : (
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-warning/10 text-warning">
                              UNPAID
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-4 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            {/* Tax Invoice PDF */}
                            <motion.button
                              whileTap={{ scale: 0.98 }}
                              onClick={() =>
                                downloadFile(
                                  `/api/invoices/${inv.id}/pdf`,
                                  `Tax_Invoice_${inv.invoice_no || inv.id}.pdf`
                                )
                              }
                              className="px-2.5 py-1 bg-card-light dark:bg-card-dark border border-hairline-light dark:border-hairline-dark hover:bg-black/5 dark:hover:bg-white/10 rounded-pill text-[11px] font-medium text-ink-light dark:text-ink-dark flex items-center gap-1 shadow-sm transition-colors"
                              title="Download Tax Invoice PDF"
                            >
                              <Download size={12} className="text-sage" />
                              <span>Invoice PDF</span>
                            </motion.button>

                            {bal > 0 && canManage && (
                              <motion.button
                                whileTap={{ scale: 0.98 }}
                                onClick={() => {
                                  setSelectedInvoice(inv);
                                  setPaymentForm({
                                    amount: bal,
                                    payment_mode: 'NEFT',
                                    reference: `UTR-${Date.now().toString().slice(-6)}`,
                                    notes: 'Customer payment receipt',
                                  });
                                  setIsPaymentModalOpen(true);
                                }}
                                className="px-3 py-1 bg-ink-light dark:bg-white text-white dark:text-ink-light rounded-pill text-[11px] font-medium shadow-sm sweep-hover"
                              >
                                Record Payment
                              </motion.button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* SUBTAB 3: OPPORTUNITIES PIPELINE                                     */}
      {/* ==================================================================== */}
      {activeSubTab === 'opportunities' && (
        displayOpportunities.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {displayOpportunities.map((opp: any) => (
              <div
                key={opp.id}
                className="bg-card-light dark:bg-card-dark rounded-card p-5 shadow-bento border border-hairline-light dark:border-hairline-dark flex flex-col justify-between space-y-4"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-sage font-mono">{opp.opportunity_no || `OPP-${opp.id}`}</span>
                    <span className="text-[10px] font-bold bg-sage/10 text-sage px-2 py-0.5 rounded-full">
                      {opp.stage || 'LEAD'}
                    </span>
                  </div>
                  <h4 className="text-base font-bold text-ink-light dark:text-ink-dark mt-2">
                    {opp.title || opp.customer_name}
                  </h4>
                  <p className="text-xs text-muted mt-1">{opp.description || '—'}</p>
                </div>

                <div className="pt-3 border-t border-hairline-light dark:border-hairline-dark flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-muted block">Deal Value</span>
                    <span className="font-mono font-bold text-sm text-ink-light dark:text-ink-dark">
                      {opp.estimated_value != null ? `₹${Number(opp.estimated_value).toLocaleString('en-IN')}` : '—'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => openQuoteModalForOpp(opp)}
                    className="text-xs text-sage font-semibold hover:underline flex items-center gap-1 group transition-all"
                  >
                    <span>Create Quote</span>
                    <ArrowRight size={12} className="group-hover:translate-x-0.5 transition-transform" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-card-light dark:bg-card-dark rounded-card p-12 text-center border border-hairline-light dark:border-hairline-dark flex flex-col items-center justify-center">
            <div className="w-12 h-12 rounded-full bg-sage/10 text-sage flex items-center justify-center mb-3">
              <Target size={24} />
            </div>
            <h3 className="text-base font-bold text-ink-light dark:text-ink-dark">
              No Active Opportunities Yet
            </h3>
            <p className="text-xs text-muted max-w-sm mt-1">
              Repeat ordering patterns and high-probability replenishment deals will automatically appear here once customers place sales orders.
            </p>
          </div>
        )
      )}

      {/* Record Payment Modal */}
      <AnimatePresence>
        {isPaymentModalOpen && selectedInvoice && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsPaymentModalOpen(false)}
              className="fixed inset-0 bg-black/40 backdrop-blur-[8px]"
            />
            <motion.div
              initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 8 }}
              animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
              exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 8 }}
              className="relative z-10 bg-card-light dark:bg-card-dark max-w-md w-full rounded-card p-6 shadow-2xl border border-hairline-light dark:border-hairline-dark text-xs"
            >
              <div className="flex items-center justify-between pb-3 border-b border-hairline-light dark:border-hairline-dark">
                <div className="flex items-center gap-2">
                  <CreditCard size={18} className="text-sage" />
                  <h3 className="text-base font-bold text-ink-light dark:text-ink-dark">
                    Record Customer Payment
                  </h3>
                </div>
                <button onClick={() => setIsPaymentModalOpen(false)} className="text-muted hover:text-ink-light">
                  <X size={16} />
                </button>
              </div>

              <div className="p-3 bg-canvas-light/60 dark:bg-black/20 rounded-tile my-3">
                <span className="text-muted block text-[11px]">Invoice Reference:</span>
                <span className="font-mono font-bold text-ink-light dark:text-ink-dark">
                  {selectedInvoice.invoice_no} • {selectedInvoice.customer_name}
                </span>
              </div>

              <form
                onSubmit={e => {
                  e.preventDefault();
                  recordPaymentMutation.mutate({
                    invoiceId: selectedInvoice.id,
                    payload: paymentForm,
                  });
                }}
                className="space-y-3"
              >
                <div>
                  <label className="block text-muted font-medium mb-1">Payment Amount (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={paymentForm.amount}
                    onChange={e => setPaymentForm({ ...paymentForm, amount: Number(e.target.value) })}
                    className="w-full bg-canvas-light dark:bg-black/20 rounded-pill px-3 py-2 border border-hairline-light dark:border-hairline-dark font-mono font-bold text-base"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-muted font-medium mb-1">Mode</label>
                    <select
                      value={paymentForm.payment_mode}
                      onChange={e => setPaymentForm({ ...paymentForm, payment_mode: e.target.value })}
                      className="w-full bg-canvas-light dark:bg-black/20 rounded-pill px-3 py-2 border border-hairline-light dark:border-hairline-dark"
                    >
                      <option value="NEFT">NEFT / RTGS</option>
                      <option value="UPI">UPI</option>
                      <option value="CHEQUE">Cheque</option>
                      <option value="CASH">Cash</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-muted font-medium mb-1">Reference UTR</label>
                    <input
                      type="text"
                      required
                      value={paymentForm.reference}
                      onChange={e => setPaymentForm({ ...paymentForm, reference: e.target.value })}
                      className="w-full bg-canvas-light dark:bg-black/20 rounded-pill px-3 py-2 border border-hairline-light dark:border-hairline-dark font-mono"
                    />
                  </div>
                </div>

                <div className="pt-3 border-t border-hairline-light dark:border-hairline-dark flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsPaymentModalOpen(false)}
                    className="px-3.5 py-1.5 bg-black/5 dark:bg-white/10 rounded-pill text-muted"
                  >
                    Cancel
                  </button>
                  <motion.button
                    whileTap={{ scale: 0.98 }}
                    type="submit"
                    disabled={recordPaymentMutation.isPending}
                    className="px-4 py-1.5 bg-positive hover:bg-positive/90 text-white rounded-pill font-semibold sweep-hover"
                  >
                    {recordPaymentMutation.isPending ? 'Recording…' : 'Record Payment'}
                  </motion.button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
        {/* Create Quotation Modal */}
        {isQuoteModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsQuoteModalOpen(false)}
              className="fixed inset-0 bg-black/40 backdrop-blur-[8px]"
            />
            <motion.div
              initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 8 }}
              animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
              exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 8 }}
              className="relative z-10 bg-card-light dark:bg-card-dark max-w-2xl w-full rounded-card p-6 shadow-2xl border border-hairline-light dark:border-hairline-dark text-xs max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between pb-3 border-b border-hairline-light dark:border-hairline-dark">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-sage/10 text-sage flex items-center justify-center">
                    <FileCheck size={18} />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-ink-light dark:text-ink-dark">
                      Create Sales Quotation
                    </h3>
                    <p className="text-[11px] text-muted">
                      {quoteOppRef ? `From Opportunity ${quoteOppRef}` : 'New Customer Commercial Quote'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsQuoteModalOpen(false)}
                  className="text-muted hover:text-ink-light p-1"
                >
                  <X size={16} />
                </button>
              </div>

              <form
                onSubmit={e => {
                  e.preventDefault();
                  if (!quoteCustomerId) {
                    triggerAlert('Please select a customer for this quote');
                    return;
                  }
                  if (quoteItems.length === 0) {
                    triggerAlert('Please add at least one line item');
                    return;
                  }
                  createQuoteMutation.mutate({
                    customer_id: Number(quoteCustomerId),
                    is_quote: true,
                    valid_until: quoteValidUntil || undefined,
                    notes: quoteNotes || undefined,
                    items: quoteItems.map(it => ({
                      item_id: Number(it.item_id),
                      qty: Number(it.qty) || 1,
                      unit_price: Number(it.unit_price) || 0,
                      discount_pct: Number(it.discount_pct) || 0,
                    })),
                  });
                }}
                className="mt-4 space-y-4"
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-muted font-medium mb-1">Customer Account</label>
                    <select
                      value={quoteCustomerId}
                      onChange={e => {
                        const cid = Number(e.target.value);
                        setQuoteCustomerId(cid);
                        const match = customers.find((c: any) => c.id === cid);
                        if (match) setQuoteCustomerName(match.name);
                      }}
                      required
                      className="w-full bg-canvas-light dark:bg-black/20 rounded-pill px-3 py-2 border border-hairline-light dark:border-hairline-dark font-medium text-ink-light dark:text-ink-dark"
                    >
                      {customers.map((c: any) => (
                        <option key={c.id} value={c.id} className="dark:bg-[#181B1A]">
                          {c.name} {c.city ? `(${c.city})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-muted font-medium mb-1">Quote Validity Date</label>
                    <input
                      type="date"
                      value={quoteValidUntil}
                      onChange={e => setQuoteValidUntil(e.target.value)}
                      className="w-full bg-canvas-light dark:bg-black/20 rounded-pill px-3 py-2 border border-hairline-light dark:border-hairline-dark font-mono text-ink-light dark:text-ink-dark"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-muted font-medium mb-1">Notes / Terms</label>
                  <input
                    type="text"
                    value={quoteNotes}
                    onChange={e => setQuoteNotes(e.target.value)}
                    placeholder="E.g. Delivery within 3 days, 30 days credit terms..."
                    className="w-full bg-canvas-light dark:bg-black/20 rounded-pill px-3 py-2 border border-hairline-light dark:border-hairline-dark text-ink-light dark:text-ink-dark"
                  />
                </div>

                {/* Line Items Section */}
                <div className="pt-2">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-ink-light dark:text-ink-dark text-xs uppercase tracking-wider">
                      Quotation Line Items ({quoteItems.length})
                    </span>
                  </div>

                  <div className="border border-hairline-light dark:border-hairline-dark rounded-tile overflow-hidden divide-y divide-hairline-light dark:divide-hairline-dark bg-canvas-light/30 dark:bg-black/10">
                    {quoteItems.map((item, idx) => {
                      const lineTaxable = (item.qty || 0) * (item.unit_price || 0) * (1 - (item.discount_pct || 0) / 100);
                      return (
                        <div key={idx} className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                          <div className="flex-1">
                            <span className="font-semibold text-ink-light dark:text-ink-dark block">
                              {item.name}
                            </span>
                            <span className="text-[10px] text-muted font-mono">{item.sku || 'SKU-ITEM'}</span>
                          </div>

                          <div className="flex items-center gap-2 flex-wrap">
                            <div className="w-20">
                              <span className="text-[10px] text-muted block mb-0.5">Qty</span>
                              <input
                                type="number"
                                min={1}
                                value={item.qty}
                                onChange={e => {
                                  const val = Math.max(1, parseInt(e.target.value) || 1);
                                  const updated = [...quoteItems];
                                  updated[idx].qty = val;
                                  setQuoteItems(updated);
                                }}
                                className="w-full bg-white dark:bg-black/30 rounded-pill px-2.5 py-1 border border-hairline-light dark:border-hairline-dark font-mono text-center"
                              />
                            </div>

                            <div className="w-24">
                              <span className="text-[10px] text-muted block mb-0.5">Price (₹)</span>
                              <input
                                type="number"
                                min={0}
                                step="any"
                                value={item.unit_price}
                                onChange={e => {
                                  const val = Math.max(0, parseFloat(e.target.value) || 0);
                                  const updated = [...quoteItems];
                                  updated[idx].unit_price = val;
                                  setQuoteItems(updated);
                                }}
                                className="w-full bg-white dark:bg-black/30 rounded-pill px-2.5 py-1 border border-hairline-light dark:border-hairline-dark font-mono text-center"
                              />
                            </div>

                            <div className="w-16">
                              <span className="text-[10px] text-muted block mb-0.5">Disc %</span>
                              <input
                                type="number"
                                min={0}
                                max={100}
                                value={item.discount_pct}
                                onChange={e => {
                                  const val = Math.min(100, Math.max(0, parseFloat(e.target.value) || 0));
                                  const updated = [...quoteItems];
                                  updated[idx].discount_pct = val;
                                  setQuoteItems(updated);
                                }}
                                className="w-full bg-white dark:bg-black/30 rounded-pill px-2 py-1 border border-hairline-light dark:border-hairline-dark font-mono text-center"
                              />
                            </div>

                            <div className="w-24 text-right">
                              <span className="text-[10px] text-muted block mb-0.5">Subtotal</span>
                              <span className="font-mono font-bold text-ink-light dark:text-ink-dark block py-1">
                                ₹{Math.round(lineTaxable).toLocaleString('en-IN')}
                              </span>
                            </div>

                            <button
                              type="button"
                              onClick={() => {
                                setQuoteItems(quoteItems.filter((_, i) => i !== idx));
                              }}
                              className="text-muted hover:text-negative p-1 self-end mb-1"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      );
                    })}

                    {/* Add SKU row */}
                    <div className="p-3 bg-canvas-light/50 dark:bg-black/20 flex flex-col sm:flex-row items-center gap-2">
                      <select
                        value={selectedItemToAdd}
                        onChange={e => setSelectedItemToAdd(e.target.value)}
                        className="flex-1 bg-white dark:bg-black/30 rounded-pill px-3 py-1.5 border border-hairline-light dark:border-hairline-dark text-xs text-ink-light dark:text-ink-dark"
                      >
                        <option value="">Select SKU to add to quote…</option>
                        {inventoryItems.map((inv: any) => (
                          <option key={inv.id} value={inv.id} className="dark:bg-[#181B1A]">
                            {inv.name} ({inv.sku}) — ₹{inv.selling_price || inv.unit_price || 0}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => {
                          if (!selectedItemToAdd) return;
                          const found = inventoryItems.find((inv: any) => String(inv.id) === String(selectedItemToAdd));
                          if (found) {
                            setQuoteItems([
                              ...quoteItems,
                              {
                                item_id: found.id,
                                name: found.name,
                                sku: found.sku,
                                qty: 5,
                                unit_price: found.selling_price || found.unit_price || 500,
                                discount_pct: 0,
                              },
                            ]);
                            setSelectedItemToAdd('');
                          }
                        }}
                        disabled={!selectedItemToAdd}
                        className="px-3 py-1.5 bg-ink-light dark:bg-white text-white dark:text-ink-light rounded-pill font-semibold disabled:opacity-40 flex items-center gap-1 shrink-0"
                      >
                        <Plus size={13} />
                        <span>Add Item</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Calculation breakdown */}
                {(() => {
                  const taxable = quoteItems.reduce(
                    (sum, it) => sum + (it.qty || 0) * (it.unit_price || 0) * (1 - (it.discount_pct || 0) / 100),
                    0
                  );
                  const gst = taxable * 0.18;
                  const grandTotal = taxable + gst;
                  return (
                    <div className="p-3 rounded-tile bg-sage/10 border border-sage/20 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="text-[11px] text-muted space-x-3">
                        <span>Taxable: <strong className="font-mono text-ink-light dark:text-ink-dark">₹{Math.round(taxable).toLocaleString('en-IN')}</strong></span>
                        <span>GST (18%): <strong className="font-mono text-ink-light dark:text-ink-dark">₹{Math.round(gst).toLocaleString('en-IN')}</strong></span>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] text-muted uppercase font-bold tracking-wider mr-2">Grand Total</span>
                        <span className="font-mono font-bold text-base text-sage">
                          ₹{Math.round(grandTotal).toLocaleString('en-IN')}
                        </span>
                      </div>
                    </div>
                  );
                })()}

                <div className="pt-3 border-t border-hairline-light dark:border-hairline-dark flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsQuoteModalOpen(false)}
                    className="px-4 py-2 bg-black/5 dark:bg-white/10 rounded-pill text-muted hover:text-ink-light font-semibold"
                  >
                    Cancel
                  </button>
                  <motion.button
                    whileTap={{ scale: 0.98 }}
                    type="submit"
                    disabled={createQuoteMutation.isPending || quoteItems.length === 0}
                    className="px-5 py-2 bg-sage hover:bg-sage-dark text-white rounded-pill font-semibold disabled:opacity-50 flex items-center gap-2 shadow-sm"
                  >
                    {createQuoteMutation.isPending ? (
                      <span>Generating Quote…</span>
                    ) : (
                      <>
                        <FileCheck size={14} />
                        <span>Generate & Send Quotation</span>
                      </>
                    )}
                  </motion.button>
                </div>
              </form>
            </motion.div>
          </div>
        )}

      </AnimatePresence>
    </div>
  );
};
