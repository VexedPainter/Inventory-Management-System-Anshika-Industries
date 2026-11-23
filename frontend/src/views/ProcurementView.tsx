import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  Search,
  ShoppingCart,
  CheckCircle2,
  PackageCheck,
  FileText,
  AlertTriangle,
  Upload,
  Clock,
  ArrowRight,
  X,
  RefreshCw,
  Plus,
} from 'lucide-react';
import { apiFetch } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useOrb } from '../context/OrbContext';
import { Skeleton } from '../components/Skeleton';

interface PurchaseOrder {
  id: number;
  po_number: string;
  supplier_id?: number | string;
  supplier_name?: string;
  supplier?: { name: string };
  status: string;
  total_cost?: number;
  total_amount?: number;
  created_at: string;
  expected_date?: string;
  items?: Array<{
    id: number;
    item_id: number;
    sku?: string;
    item?: { sku: string; name: string };
    quantity: number;
    received_qty?: number;
    unit_cost: number;
    line_total?: number;
  }>;
}

export const ProcurementView: React.FC = () => {
  const { user } = useAuth();
  const { triggerSuccess, triggerAlert } = useOrb();
  const queryClient = useQueryClient();
  const shouldReduceMotion = useReducedMotion();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'RECEIVED' | 'OVERDUE'>('ALL');
  const [selectedPO, setSelectedPO] = useState<PurchaseOrder | null>(null);
  const [isReceiveModalOpen, setIsReceiveModalOpen] = useState(false);
  const [isScanChallanOpen, setIsScanChallanOpen] = useState(false);
  const [challanFile, setChallanFile] = useState<File | null>(null);
  const [scanResult, setScanResult] = useState<any>(null);
  const [isScanning, setIsScanning] = useState(false);

  // Line receipt quantities
  const [receivedQtyMap, setReceivedQtyMap] = useState<Record<number, number>>({});

  const { data, isLoading, refetch, isFetching } = useQuery<PurchaseOrder[]>({
    queryKey: ['/api/procurement'],
    queryFn: () => apiFetch('/api/procurement'),
    staleTime: 30000,
  });

  const orders = Array.isArray(data) ? data : [];

  const isOverdue = (po: PurchaseOrder) => {
    if (po.status === 'RECEIVED' || po.status === 'CANCELLED') return false;
    if (!po.expected_date) return false;
    return new Date(po.expected_date) < new Date();
  };

  const filteredOrders = useMemo(() => {
    return orders.filter(po => {
      const overdue = isOverdue(po);
      if (statusFilter === 'OVERDUE' && !overdue) return false;
      if (statusFilter !== 'ALL' && statusFilter !== 'OVERDUE' && po.status.toUpperCase() !== statusFilter) return false;
      if (!search.trim()) return true;

      const q = search.toLowerCase();
      const sup = (po.supplier_name || po.supplier?.name || '').toLowerCase();
      return po.po_number.toLowerCase().includes(q) || sup.includes(q);
    });
  }, [orders, statusFilter, search]);

  // Approve PO Mutation
  const approveMutation = useMutation({
    mutationFn: (poId: number | string) =>
      apiFetch(`/api/procurement/${poId}/approve`, {
        method: 'POST',
      }),
    onSuccess: (_, poId) => {
      queryClient.invalidateQueries({ queryKey: ['/api/procurement'] });
      triggerSuccess(`PO #${poId} approved for delivery`);
    },
    onError: (err: any) => {
      triggerAlert(err.message || 'Approval failed');
    },
  });

  // Receive PO Mutation
  const receiveMutation = useMutation({
    mutationFn: ({ poId, itemsPayload }: any) =>
      apiFetch(`/api/procurement/${poId}/receive`, {
        method: 'POST',
        body: { items: itemsPayload },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/procurement'] });
      queryClient.invalidateQueries({ queryKey: ['/api/inventory'] });
      triggerSuccess('PO delivery received into warehouse inventory');
      setIsReceiveModalOpen(false);
    },
    onError: (err: any) => {
      triggerAlert(err.message || 'Receipt failed');
    },
  });

  // Scan document handler
  const handleScanChallan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!challanFile) return;

    setIsScanning(true);
    setScanResult(null);

    const formData = new FormData();
    formData.append('file', challanFile);

    try {
      const res = await apiFetch('/api/procurement/scan-document', {
        method: 'POST',
        body: formData,
      });
      setScanResult(res);
      triggerSuccess('Challan scanned and line items matched to PO');
    } catch (err: any) {
      triggerAlert(err.message || 'Challan scanning failed');
      setScanResult({ error: err.message });
    } finally {
      setIsScanning(false);
    }
  };

  const role = user?.role || 'storekeeper';
  const canApprove = role === 'admin' || role === 'manager';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-ink-light dark:text-ink-dark tracking-tight">
            Purchase Orders & Procurement
          </h2>
          <p className="text-xs text-muted mt-0.5">
            Vendor consignments, PO approvals, line item receipt verification, and challan uploads
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={() => setIsScanChallanOpen(true)}
            className="px-3.5 py-2 bg-card-light dark:bg-card-dark hover:bg-black/5 dark:hover:bg-white/5 border border-hairline-light dark:border-hairline-dark text-xs font-semibold rounded-pill flex items-center gap-1.5 shadow-sm transition-colors"
          >
            <Upload size={14} className="text-sage" />
            <span>Scan Delivery Challan</span>
          </motion.button>

          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={() => refetch()}
            className="w-9 h-9 rounded-full bg-card-light dark:bg-card-dark border border-hairline-light dark:border-hairline-dark flex items-center justify-center text-muted hover:text-ink-light"
          >
            <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
          </motion.button>
        </div>
      </div>

      {/* Filter Tabs & Search */}
      <div className="bg-card-light dark:bg-card-dark rounded-card p-4 shadow-bento border border-hairline-light dark:border-hairline-dark flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 flex-wrap">
          {(['ALL', 'PENDING', 'APPROVED', 'RECEIVED', 'OVERDUE'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setStatusFilter(tab)}
              className={`px-3 py-1.5 rounded-pill text-xs font-semibold transition-all ${
                statusFilter === tab
                  ? tab === 'OVERDUE'
                    ? 'bg-negative text-white shadow-sm'
                    : 'bg-ink-light dark:bg-white text-white dark:text-ink-light shadow-sm'
                  : tab === 'OVERDUE'
                  ? 'bg-negative/10 text-negative hover:bg-negative/20'
                  : 'bg-black/5 dark:bg-white/10 text-muted hover:text-ink-light dark:hover:text-ink-dark'
              }`}
            >
              {tab === 'OVERDUE' ? '⚠️ Overdue' : tab}
            </button>
          ))}
        </div>

        <div className="relative flex items-center bg-canvas-light dark:bg-black/20 rounded-pill px-3 py-1.5 border border-hairline-light dark:border-hairline-dark text-xs w-64">
          <Search size={14} className="text-muted mr-2" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search PO #, supplier…"
            className="bg-transparent text-ink-light dark:text-ink-dark focus:outline-none w-full"
          />
        </div>
      </div>

      {/* Orders Table (56px rows, sticky header, hover row tint) */}
      <div className="bg-card-light dark:bg-card-dark rounded-card shadow-bento border border-hairline-light dark:border-hairline-dark overflow-hidden">
        <div className="overflow-x-auto max-h-[640px] no-scrollbar">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="sticky top-0 z-10 bg-white/85 dark:bg-[#181B1A]/90 backdrop-blur-md border-b border-hairline-light dark:border-hairline-dark text-muted font-medium uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-3.5 px-4">PO Number</th>
                <th className="py-3.5 px-4">Supplier</th>
                <th className="py-3.5 px-4">Created Date</th>
                <th className="py-3.5 px-4">Expected Date</th>
                <th className="py-3.5 px-4 text-right">PO Total</th>
                <th className="py-3.5 px-4 text-center">Status</th>
                <th className="py-3.5 px-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline-light dark:divide-hairline-dark">
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="h-14">
                    <td colSpan={7} className="px-4">
                      <Skeleton className="h-8 w-full" rounded="md" />
                    </td>
                  </tr>
                ))
              ) : filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center text-xs text-muted">
                    No purchase orders match your filter criteria.
                  </td>
                </tr>
              ) : (
                filteredOrders.map(po => {
                  const overdue = isOverdue(po);
                  const st = po.status.toUpperCase();
                  return (
                    <tr
                      key={po.id}
                      className={`h-14 hover:bg-black/2 dark:hover:bg-white/2 transition-colors ${
                        overdue ? 'bg-negative/5' : ''
                      }`}
                    >
                      <td className="py-2 px-4 font-mono font-bold text-sage">
                        {po.po_number}
                      </td>

                      <td className="py-2 px-4 font-semibold text-ink-light dark:text-ink-dark">
                        {po.supplier_name || po.supplier?.name || 'Authorized OEM'}
                      </td>

                      <td className="py-2 px-4 font-mono text-muted text-[11px]">
                        {po.created_at ? po.created_at.slice(0, 10) : '—'}
                      </td>

                      <td className="py-2 px-4 font-mono text-[11px]">
                        <span className={overdue ? 'text-negative font-bold flex items-center gap-1' : 'text-muted'}>
                          {overdue && <AlertTriangle size={12} />}
                          {po.expected_date ? po.expected_date.slice(0, 10) : '—'}
                        </span>
                      </td>

                      <td className="py-2 px-4 text-right font-mono font-bold text-ink-light dark:text-ink-dark">
                        ₹{(po.total_cost || po.total_amount || 0).toLocaleString('en-IN')}
                      </td>

                      <td className="py-2 px-4 text-center">
                        {st === 'PENDING' && (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-warning/10 text-warning">
                            PENDING
                          </span>
                        )}
                        {st === 'APPROVED' && (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-sage/10 text-sage">
                            APPROVED
                          </span>
                        )}
                        {st === 'RECEIVED' && (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-positive/10 text-positive">
                            RECEIVED
                          </span>
                        )}
                        {st === 'CANCELLED' && (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-black/5 dark:bg-white/10 text-muted">
                            CANCELLED
                          </span>
                        )}
                      </td>

                      <td className="py-2 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {/* Approve Button */}
                          {canApprove && st === 'PENDING' && (
                            <motion.button
                              whileTap={{ scale: 0.98 }}
                              onClick={() => approveMutation.mutate(po.id)}
                              className="px-2.5 py-1 bg-sage hover:bg-sage-dark text-white rounded-pill text-[11px] font-medium shadow-sm transition-colors"
                            >
                              Approve
                            </motion.button>
                          )}

                          {/* Partial Receive Line Items Button */}
                          {st !== 'RECEIVED' && st !== 'CANCELLED' && (
                            <motion.button
                              whileTap={{ scale: 0.98 }}
                              onClick={() => {
                                setSelectedPO(po);
                                const map: Record<number, number> = {};
                                (po.items || []).forEach(it => {
                                  map[it.item_id] = it.quantity - (it.received_qty || 0);
                                });
                                setReceivedQtyMap(map);
                                setIsReceiveModalOpen(true);
                              }}
                              className="px-2.5 py-1 bg-ink-light dark:bg-white text-white dark:text-ink-light hover:bg-black rounded-pill text-[11px] font-medium shadow-sm transition-colors"
                            >
                              Receive Lines
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

      {/* Partial Receive Modal */}
      <AnimatePresence>
        {isReceiveModalOpen && selectedPO && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsReceiveModalOpen(false)}
              className="fixed inset-0 bg-black/40 backdrop-blur-[8px]"
            />
            <motion.div
              initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 8 }}
              animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
              exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 8 }}
              className="relative z-10 bg-card-light dark:bg-card-dark max-w-lg w-full rounded-card p-6 shadow-2xl border border-hairline-light dark:border-hairline-dark text-xs"
            >
              <div className="flex items-center justify-between pb-3 border-b border-hairline-light dark:border-hairline-dark">
                <div>
                  <h3 className="text-base font-bold text-ink-light dark:text-ink-dark">
                    Receive PO {selectedPO.po_number}
                  </h3>
                  <p className="text-[11px] text-muted">Verify physical line items received into store</p>
                </div>
                <button onClick={() => setIsReceiveModalOpen(false)} className="text-muted hover:text-ink-light">
                  <X size={16} />
                </button>
              </div>

              <div className="space-y-3 my-4">
                {(selectedPO.items || []).map(line => (
                  <div
                    key={line.id}
                    className="p-3 bg-canvas-light/60 dark:bg-black/20 rounded-tile border border-hairline-light dark:border-hairline-dark flex items-center justify-between"
                  >
                    <div>
                      <div className="font-semibold text-ink-light dark:text-ink-dark">
                        {line.item?.name || `Part #${line.item_id}`}
                      </div>
                      <div className="font-mono text-sage text-[11px]">
                        Ordered: {line.quantity} | Previously Received: {line.received_qty || 0}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-muted">Receive:</span>
                      <input
                        type="number"
                        min="0"
                        max={line.quantity}
                        value={receivedQtyMap[line.item_id] ?? line.quantity}
                        onChange={e =>
                          setReceivedQtyMap({
                            ...receivedQtyMap,
                            [line.item_id]: Number(e.target.value),
                          })
                        }
                        className="w-16 bg-white dark:bg-black/40 border border-hairline-light dark:border-hairline-dark rounded px-2 py-1 text-center font-mono font-bold"
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="pt-3 border-t border-hairline-light dark:border-hairline-dark flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsReceiveModalOpen(false)}
                  className="px-4 py-2 bg-black/5 dark:bg-white/10 rounded-pill text-muted"
                >
                  Cancel
                </button>
                <motion.button
                  whileTap={{ scale: 0.98 }}
                  type="button"
                  disabled={receiveMutation.isPending}
                  onClick={() => {
                    const itemsPayload = Object.entries(receivedQtyMap).map(([id, qty]) => ({
                      item_id: Number(id),
                      qty_received: qty,
                    }));
                    receiveMutation.mutate({
                      poId: selectedPO.id,
                      itemsPayload,
                    });
                  }}
                  className="px-5 py-2 bg-positive hover:bg-positive/90 text-white rounded-pill font-semibold sweep-hover"
                >
                  {receiveMutation.isPending ? 'Receiving…' : 'Confirm Receipt'}
                </motion.button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Scan Delivery Challan Modal */}
      <AnimatePresence>
        {isScanChallanOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsScanChallanOpen(false)}
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
                  <Upload size={18} className="text-sage" />
                  <h3 className="text-base font-bold text-ink-light dark:text-ink-dark">
                    Scan Delivery Challan (OCR)
                  </h3>
                </div>
                <button onClick={() => setIsScanChallanOpen(false)} className="text-muted hover:text-ink-light">
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={handleScanChallan} className="space-y-4 my-4">
                <div className="p-6 border-2 border-dashed border-hairline-light dark:border-hairline-dark rounded-tile text-center bg-canvas-light/30">
                  <Upload size={28} className="mx-auto text-sage mb-2" />
                  <p className="font-semibold text-ink-light dark:text-ink-dark">
                    Upload Vendor Delivery Note / Challan
                  </p>
                  <p className="text-[11px] text-muted mt-1">PNG, JPG or PDF formats</p>
                  <input
                    type="file"
                    accept="image/*,.pdf"
                    required
                    onChange={e => setChallanFile(e.target.files ? e.target.files[0] : null)}
                    className="mt-3 block w-full text-xs text-muted file:mr-4 file:py-1.5 file:px-3 file:rounded-pill file:border-0 file:text-xs file:font-semibold file:bg-sage file:text-white"
                  />
                </div>

                {scanResult && (
                  <div className="p-3 bg-black/5 dark:bg-white/5 rounded-tile font-mono text-[11px] whitespace-pre-wrap">
                    {JSON.stringify(scanResult, null, 2)}
                  </div>
                )}

                <div className="pt-2 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsScanChallanOpen(false)}
                    className="px-3.5 py-1.5 bg-black/5 dark:bg-white/10 rounded-pill text-muted"
                  >
                    Close
                  </button>
                  <motion.button
                    whileTap={{ scale: 0.98 }}
                    type="submit"
                    disabled={isScanning || !challanFile}
                    className="px-4 py-1.5 bg-sage hover:bg-sage-dark text-white rounded-pill font-semibold sweep-hover disabled:opacity-40"
                  >
                    {isScanning ? 'Extracting…' : 'Analyze & Match PO'}
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
