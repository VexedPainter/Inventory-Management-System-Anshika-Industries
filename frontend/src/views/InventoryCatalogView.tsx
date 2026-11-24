import React, { useState, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  Search,
  Plus,
  ArrowDownLeft,
  ArrowUpRight,
  ClipboardCheck,
  FileSpreadsheet,
  QrCode,
  Download,
  Filter,
  Check,
  X,
  AlertTriangle,
  RefreshCw,
  Printer,
  UploadCloud,
  CheckCircle2,
  Trash2,
} from 'lucide-react';
import { apiFetch, downloadFile } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useOrb } from '../context/OrbContext';
import { CountUp } from '../components/CountUp';
import { Skeleton } from '../components/Skeleton';
import { Reveal } from '../components/Reveal';

interface InventoryItem {
  id: number;
  sku: string;
  name: string;
  category: string;
  quantity: number;
  reorder_level: number;
  unit: string;
  unit_cost: number;
  selling_price: number;
  location?: string;
  bin_location?: string;
  status?: string;
  last_updated?: string;
}

export const InventoryCatalogView: React.FC = () => {
  const { user } = useAuth();
  const { triggerSuccess, triggerAlert } = useOrb();
  const queryClient = useQueryClient();
  const shouldReduceMotion = useReducedMotion();

  // Filters & Search
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'OK' | 'LOW' | 'CRITICAL' | 'OUT' | 'DEAD'>('ALL');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');

  // Modals state
  const [isAddPartOpen, setIsAddPartOpen] = useState(false);
  const [isStockModalOpen, setIsStockModalOpen] = useState(false);
  const [stockModalType, setStockModalType] = useState<'IN' | 'OUT'>('IN');
  const [selectedItemForStock, setSelectedItemForStock] = useState<InventoryItem | null>(null);
  const [isCycleCountOpen, setIsCycleCountOpen] = useState(false);
  const [isCsvImportOpen, setIsCsvImportOpen] = useState(false);
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [selectedItemForQr, setSelectedItemForQr] = useState<InventoryItem | null>(null);
  const [isLabelsMenuOpen, setIsLabelsMenuOpen] = useState(false);
  const [dispatchNoteId, setDispatchNoteId] = useState<string | null>(null);

  // Form states
  const [addForm, setAddForm] = useState({
    sku: '',
    name: '',
    category: 'MIG Torch Spares',
    quantity: 50,
    unit: 'pcs',
    unit_cost: 120,
    selling_price: 180,
    reorder_level: 20,
    location: 'R1-B01',
  });

  const [stockForm, setStockForm] = useState({
    quantity: 10,
    reason: 'Restock shipment',
    reference: 'GRN-101',
    supplier: 'Authorized OEM',
  });

  const [cycleForm, setCycleForm] = useState({
    physical_count: 0,
    reason: 'Monthly Cycle Count Reconciliation',
  });

  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvUploading, setCsvUploading] = useState(false);
  const [csvResult, setCsvResult] = useState<string | null>(null);

  // Fetch Inventory
  const { data: rawInventory, isLoading, refetch } = useQuery<InventoryItem[]>({
    queryKey: ['/api/inventory'],
    queryFn: () => apiFetch('/api/inventory'),
    staleTime: 30000,
  });

  const items = Array.isArray(rawInventory) ? rawInventory : [];

  // Extract unique categories
  const categories = useMemo(() => {
    const set = new Set<string>();
    items.forEach(it => {
      if (it.category) set.add(it.category);
    });
    return Array.from(set);
  }, [items]);

  // Compute status for an item
  const getItemStatus = (item: InventoryItem): 'OK' | 'LOW' | 'CRITICAL' | 'OUT' | 'DEAD' => {
    const qty = item.quantity || 0;
    const reorder = item.reorder_level || 0;
    if (qty === 0) return 'OUT';
    if (qty <= Math.ceil(reorder * 0.4)) return 'CRITICAL';
    if (qty <= reorder) return 'LOW';
    if (item.status === 'DEAD' || (qty > reorder * 5 && qty > 500)) return 'DEAD';
    return 'OK';
  };

  // Filtered items
  const filteredItems = useMemo(() => {
    return items.filter(item => {
      const status = getItemStatus(item);
      if (statusFilter !== 'ALL' && status !== statusFilter) return false;
      if (selectedCategory !== 'ALL' && item.category !== selectedCategory) return false;
      if (!search.trim()) return true;

      const q = search.toLowerCase();
      return (
        item.sku.toLowerCase().includes(q) ||
        item.name.toLowerCase().includes(q) ||
        (item.location && item.location.toLowerCase().includes(q))
      );
    });
  }, [items, search, statusFilter, selectedCategory]);

  // Status counts for pills
  const statusCounts = useMemo(() => {
    const counts = { ALL: items.length, OK: 0, LOW: 0, CRITICAL: 0, OUT: 0, DEAD: 0 };
    items.forEach(item => {
      const s = getItemStatus(item);
      counts[s]++;
    });
    return counts;
  }, [items]);

  // Add Item Mutation
  const addItemMutation = useMutation({
    mutationFn: (data: any) =>
      apiFetch('/api/items', {
        method: 'POST',
        body: data,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/inventory'] });
      triggerSuccess('New part added to catalog');
      setIsAddPartOpen(false);
      setAddForm({
        sku: '',
        name: '',
        category: 'MIG Torch Spares',
        quantity: 50,
        unit: 'pcs',
        unit_cost: 120,
        selling_price: 180,
        reorder_level: 20,
        location: 'R1-B01',
      });
    },
    onError: (err: any) => {
      triggerAlert(err.message || 'Failed to create item');
    },
  });

  // Stock In / Out Mutation
  const stockMutation = useMutation({
    mutationFn: async ({ type, itemId, sku, payload }: any) => {
      const endpoint = type === 'IN' ? '/api/stock/in' : '/api/stock/out';
      return apiFetch(endpoint, {
        method: 'POST',
        body: {
          item_id: itemId,
          sku: sku,
          quantity: Number(payload.quantity),
          reason: payload.reason,
          reference: payload.reference,
          supplier: payload.supplier,
        },
      });
    },
    onSuccess: (res, vars) => {
      queryClient.invalidateQueries({ queryKey: ['/api/inventory'] });
      triggerSuccess(`Stock ${vars.type === 'IN' ? 'receipt' : 'dispatch'} recorded`);
      setIsStockModalOpen(false);
      if (vars.type === 'OUT' && (res?.movement_id || res?.data?.movement_id)) {
        setDispatchNoteId(res.movement_id || res.data?.movement_id);
      }
    },
    onError: (err: any) => {
      triggerAlert(err.message || 'Transaction failed');
    },
  });

  // Cycle count adjustment Mutation
  const cycleCountMutation = useMutation({
    mutationFn: async ({ item, physicalCount, reason }: any) => {
      const qtyDiff = physicalCount - item.quantity;
      return apiFetch('/api/stock/adjust', {
        method: 'POST',
        body: {
          item_id: item.id,
          sku: item.sku,
          quantity_change: qtyDiff,
          reason: reason,
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/inventory'] });
      triggerSuccess('Cycle count reconciled and ledger adjusted');
      setIsCycleCountOpen(false);
    },
    onError: (err: any) => {
      triggerAlert(err.message || 'Reconciliation failed');
    },
  });

  // CSV Import Submit
  const handleCsvUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!csvFile) return;

    setCsvUploading(true);
    setCsvResult(null);

    const formData = new FormData();
    formData.append('file', csvFile);

    try {
      const res = await apiFetch('/api/import/csv', {
        method: 'POST',
        body: formData,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/inventory'] });
      triggerSuccess(`CSV imported: ${res.imported || res.message || 'Success'}`);
      setCsvResult(`Success: ${res.imported || res.total_records || 'File'} records processed.`);
      setTimeout(() => {
        setIsCsvImportOpen(false);
        setCsvResult(null);
        setCsvFile(null);
      }, 1800);
    } catch (err: any) {
      triggerAlert(err.message || 'CSV Import failed');
      setCsvResult(`Error: ${err.message}`);
    } finally {
      setCsvUploading(false);
    }
  };

  const role = user?.role || 'storekeeper';
  const canManage = role === 'admin' || role === 'manager';

  return (
    <div className="space-y-6">
      {/* ==================================================================== */}
      {/* 1. TOP HEADER & PRIMARY ACTIONS                                      */}
      {/* ==================================================================== */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-ink-light dark:text-ink-dark tracking-tight">
            Warehouse Inventory Catalog
          </h2>
          <p className="text-xs text-muted mt-0.5">
            Active bin locations, valuation matrices, and automated safety buffers
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Add Part Button (Black Pill with light sweep) */}
          {canManage && (
            <motion.button
              whileTap={{ scale: 0.98 }}
              onClick={() => setIsAddPartOpen(true)}
              className="px-4 py-2 bg-ink-light dark:bg-white text-white dark:text-ink-light rounded-pill text-xs font-semibold shadow-bento sweep-hover flex items-center gap-1.5 transition-all"
            >
              <Plus size={14} />
              <span>Add New Part</span>
            </motion.button>
          )}

          {/* Quick Stock In / Out */}
          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={() => {
              setSelectedItemForStock(items[0] || null);
              setStockModalType('IN');
              setIsStockModalOpen(true);
            }}
            className="px-3.5 py-2 bg-card-light dark:bg-card-dark hover:bg-black/5 dark:hover:bg-white/5 border border-hairline-light dark:border-hairline-dark text-xs font-semibold rounded-pill flex items-center gap-1.5 shadow-sm transition-colors"
          >
            <ArrowDownLeft size={14} className="text-positive" />
            <span>Stock In / Out</span>
          </motion.button>

          {/* Cycle Count */}
          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={() => {
              setSelectedItemForStock(items[0] || null);
              setCycleForm({
                physical_count: items[0]?.quantity || 0,
                reason: 'Routine Cycle Count Reconciliation',
              });
              setIsCycleCountOpen(true);
            }}
            className="px-3.5 py-2 bg-card-light dark:bg-card-dark hover:bg-black/5 dark:hover:bg-white/5 border border-hairline-light dark:border-hairline-dark text-xs font-semibold rounded-pill flex items-center gap-1.5 shadow-sm transition-colors"
          >
            <ClipboardCheck size={14} className="text-sage" />
            <span>Cycle Count</span>
          </motion.button>

          {/* CSV Import */}
          {canManage && (
            <motion.button
              whileTap={{ scale: 0.98 }}
              onClick={() => setIsCsvImportOpen(true)}
              className="px-3.5 py-2 bg-card-light dark:bg-card-dark hover:bg-black/5 dark:hover:bg-white/5 border border-hairline-light dark:border-hairline-dark text-xs font-semibold rounded-pill flex items-center gap-1.5 shadow-sm transition-colors"
            >
              <UploadCloud size={14} />
              <span>Import CSV</span>
            </motion.button>
          )}

          {/* Low-stock Exports */}
          <div className="flex items-center gap-1 bg-card-light dark:bg-card-dark border border-hairline-light dark:border-hairline-dark rounded-pill px-2.5 py-1 text-xs">
            <span className="text-muted font-medium pr-1">Low-stock:</span>
            <button
              onClick={() => downloadFile('/api/export/low-stock/pdf', 'Low_Stock_Report.pdf')}
              className="text-sage hover:underline font-semibold px-1"
            >
              PDF
            </button>
            <span className="text-muted">•</span>
            <button
              onClick={() => downloadFile('/api/export/low-stock/excel', 'Low_Stock_Report.xlsx')}
              className="text-sage hover:underline font-semibold px-1"
            >
              Excel
            </button>
            <span className="text-muted">•</span>
            <button
              onClick={() => downloadFile('/api/export/low-stock/csv', 'Low_Stock_Report.csv')}
              className="text-sage hover:underline font-semibold px-1"
            >
              CSV
            </button>
          </div>

          {/* QR Labels Dropdown Menu */}
          <div className="relative">
            <motion.button
              whileTap={{ scale: 0.98 }}
              onClick={() => setIsLabelsMenuOpen(!isLabelsMenuOpen)}
              className="px-3.5 py-2 bg-card-light dark:bg-card-dark hover:bg-black/5 dark:hover:bg-white/5 border border-hairline-light dark:border-hairline-dark text-xs font-semibold rounded-pill flex items-center gap-1.5 shadow-sm transition-colors"
            >
              <QrCode size={14} className="text-sage" />
              <span>QR Labels</span>
            </motion.button>

            {isLabelsMenuOpen && (
              <div
                className="absolute right-0 mt-1.5 w-44 bg-card-light dark:bg-card-dark border border-hairline-light dark:border-hairline-dark rounded-card shadow-xl p-1.5 z-30 text-xs flex flex-col gap-1"
                onMouseLeave={() => setIsLabelsMenuOpen(false)}
              >
                <button
                  onClick={() => {
                    setIsLabelsMenuOpen(false);
                    downloadFile('/api/labels/items/pdf?all=1', 'Item_Labels_All.pdf');
                  }}
                  className="w-full text-left px-3 py-1.5 rounded hover:bg-black/5 dark:hover:bg-white/10 text-ink-light dark:text-ink-dark font-medium"
                >
                  All Items
                </button>
                <button
                  onClick={() => {
                    setIsLabelsMenuOpen(false);
                    downloadFile(
                      `/api/labels/items/pdf?category=${encodeURIComponent(selectedCategory === 'ALL' ? '' : selectedCategory)}`,
                      `Item_Labels_${selectedCategory === 'ALL' ? 'General' : selectedCategory}.pdf`
                    );
                  }}
                  className="w-full text-left px-3 py-1.5 rounded hover:bg-black/5 dark:hover:bg-white/10 text-ink-light dark:text-ink-dark font-medium"
                >
                  By Category {selectedCategory !== 'ALL' ? `(${selectedCategory})` : ''}
                </button>
                <button
                  onClick={() => {
                    setIsLabelsMenuOpen(false);
                    downloadFile('/api/labels/bins/pdf?all=1', 'Bin_Labels.pdf');
                  }}
                  className="w-full text-left px-3 py-1.5 rounded hover:bg-black/5 dark:hover:bg-white/10 text-ink-light dark:text-ink-dark font-medium"
                >
                  Bin Labels
                </button>
              </div>
            )}
          </div>

          {/* Export Catalog CSV */}
          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={() => downloadFile('/api/export/csv/inventory', 'Anishka_Inventory_Catalog.csv')}
            className="w-9 h-9 rounded-full bg-card-light dark:bg-card-dark hover:bg-black/5 dark:hover:bg-white/5 border border-hairline-light dark:border-hairline-dark flex items-center justify-center text-muted hover:text-ink-light transition-colors"
            title="Download Catalog CSV"
          >
            <Download size={15} />
          </motion.button>
        </div>
      </div>

      {/* Dispatch Note Banner if stock-out was just performed */}
      {dispatchNoteId && (
        <div className="bg-[#2D6A4F]/10 border border-[#2D6A4F]/30 text-ink-light dark:text-ink-dark rounded-card p-3.5 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={16} className="text-[#2D6A4F]" />
            <span>Stock dispatched successfully (Ref #{dispatchNoteId})</span>
          </div>
          <div className="flex items-center gap-2">
            <motion.button
              whileTap={{ scale: 0.98 }}
              onClick={() =>
                downloadFile(`/api/pdf/dispatch/${dispatchNoteId}`, `Dispatch_Note_${dispatchNoteId}.pdf`)
              }
              className="px-3.5 py-1.5 bg-[#2D6A4F] text-white rounded-pill font-semibold flex items-center gap-1.5 shadow-sm sweep-hover"
            >
              <Download size={13} />
              <span>Download Goods Dispatch Note (PDF)</span>
            </motion.button>
            <button
              onClick={() => setDispatchNoteId(null)}
              className="p-1 text-muted hover:text-ink-light"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* 2. FILTER PILLS & SEARCH BAR                                         */}
      {/* ==================================================================== */}
      <div className="bg-card-light dark:bg-card-dark rounded-card p-4 shadow-bento border border-hairline-light dark:border-hairline-dark flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Status filter pills in required soft tints */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={() => setStatusFilter('ALL')}
            className={`px-3 py-1.5 rounded-pill text-xs font-semibold transition-all ${
              statusFilter === 'ALL'
                ? 'bg-ink-light dark:bg-white text-white dark:text-ink-light shadow-sm'
                : 'bg-black/5 dark:bg-white/10 text-muted hover:text-ink-light dark:hover:text-ink-dark'
            }`}
          >
            All ({statusCounts.ALL})
          </button>

          {/* OK: green soft tint */}
          <button
            onClick={() => setStatusFilter('OK')}
            className={`px-3 py-1.5 rounded-pill text-xs font-semibold transition-all ${
              statusFilter === 'OK'
                ? 'bg-positive text-white shadow-sm'
                : 'bg-positive/10 text-positive hover:bg-positive/20'
            }`}
          >
            OK ({statusCounts.OK})
          </button>

          {/* LOW: amber soft tint */}
          <button
            onClick={() => setStatusFilter('LOW')}
            className={`px-3 py-1.5 rounded-pill text-xs font-semibold transition-all ${
              statusFilter === 'LOW'
                ? 'bg-warning text-white shadow-sm'
                : 'bg-warning/10 text-warning hover:bg-warning/20'
            }`}
          >
            LOW ({statusCounts.LOW})
          </button>

          {/* CRITICAL: red soft tint */}
          <button
            onClick={() => setStatusFilter('CRITICAL')}
            className={`px-3 py-1.5 rounded-pill text-xs font-semibold transition-all ${
              statusFilter === 'CRITICAL'
                ? 'bg-negative text-white shadow-sm'
                : 'bg-negative/10 text-negative hover:bg-negative/20'
            }`}
          >
            CRITICAL ({statusCounts.CRITICAL})
          </button>

          {/* OUT: dark red soft tint */}
          <button
            onClick={() => setStatusFilter('OUT')}
            className={`px-3 py-1.5 rounded-pill text-xs font-semibold transition-all ${
              statusFilter === 'OUT'
                ? 'bg-[#991B1B] text-white shadow-sm'
                : 'bg-[#991B1B]/15 text-[#991B1B] hover:bg-[#991B1B]/25'
            }`}
          >
            OUT ({statusCounts.OUT})
          </button>

          {/* DEAD: grey soft tint */}
          <button
            onClick={() => setStatusFilter('DEAD')}
            className={`px-3 py-1.5 rounded-pill text-xs font-semibold transition-all ${
              statusFilter === 'DEAD'
                ? 'bg-ink-light/80 text-white shadow-sm'
                : 'bg-black/5 dark:bg-white/10 text-muted hover:bg-black/10'
            }`}
          >
            DEAD ({statusCounts.DEAD})
          </button>
        </div>

        {/* Right: Category Selector & Search Input */}
        <div className="flex items-center gap-2.5">
          {/* Category Dropdown */}
          <select
            value={selectedCategory}
            onChange={e => setSelectedCategory(e.target.value)}
            className="bg-canvas-light dark:bg-black/20 border border-hairline-light dark:border-hairline-dark rounded-pill px-3 py-1.5 text-xs text-ink-light dark:text-ink-dark focus:outline-none"
          >
            <option value="ALL">All Categories</option>
            {categories.map(c => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          {/* Search Input */}
          <div className="relative flex items-center bg-canvas-light dark:bg-black/20 rounded-pill px-3 py-1.5 border border-hairline-light dark:border-hairline-dark text-xs w-56 sm:w-64">
            <Search size={14} className="text-muted mr-2 shrink-0" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search SKU, name, bin…"
              className="bg-transparent text-ink-light dark:text-ink-dark focus:outline-none w-full"
            />
            {search && (
              <button onClick={() => setSearch('')} className="text-muted hover:text-ink-light">
                <X size={12} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* 3. CATALOG TABLE (56px rows, zebra none, hover tint, sticky header) */}
      {/* ==================================================================== */}
      <div className="bg-card-light dark:bg-card-dark rounded-card shadow-bento border border-hairline-light dark:border-hairline-dark overflow-hidden">
        <div className="overflow-x-auto max-h-[640px] no-scrollbar">
          <table className="w-full text-left text-xs border-collapse">
            {/* Sticky Header with Backdrop Blur */}
            <thead className="sticky top-0 z-10 bg-white/85 dark:bg-[#181B1A]/90 backdrop-blur-md border-b border-hairline-light dark:border-hairline-dark text-muted font-medium uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-3.5 px-4">SKU / Code</th>
                <th className="py-3.5 px-4">Spare Part Name</th>
                <th className="py-3.5 px-4">Category</th>
                <th className="py-3.5 px-4 text-center">Bin Location</th>
                <th className="py-3.5 px-4 text-right">Available Stock</th>
                <th className="py-3.5 px-4 text-right">Reorder Buffer</th>
                <th className="py-3.5 px-4 text-right">Unit Cost</th>
                <th className="py-3.5 px-4 text-center">Status</th>
                <th className="py-3.5 px-4 text-center">Actions</th>
              </tr>
            </thead>

            {/* Table Body with 56px rows & hover tint */}
            <tbody className="divide-y divide-hairline-light dark:divide-hairline-dark">
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="h-14">
                    <td colSpan={9} className="px-4">
                      <Skeleton className="h-8 w-full" rounded="md" />
                    </td>
                  </tr>
                ))
              ) : filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-16 text-center text-xs text-muted">
                    No matching inventory items found for current filters.
                  </td>
                </tr>
              ) : (
                <AnimatePresence initial={false}>
                  {filteredItems.map((item, idx) => {
                    const status = getItemStatus(item);
                    return (
                      <motion.tr
                        key={item.id || item.sku}
                        initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 6 }}
                        animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
                        exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
                        transition={{ duration: 0.2, delay: Math.min(idx * 0.02, 0.2) }}
                        className="h-14 hover:bg-black/2 dark:hover:bg-white/2 transition-colors group"
                      >
                        {/* SKU */}
                        <td className="py-2 px-4 font-mono font-semibold text-sage">
                          {item.sku}
                        </td>

                        {/* Name */}
                        <td className="py-2 px-4">
                          <span className="font-semibold text-ink-light dark:text-ink-dark block truncate max-w-xs">
                            {item.name}
                          </span>
                        </td>

                        {/* Category */}
                        <td className="py-2 px-4 text-muted">
                          {item.category}
                        </td>

                        {/* Location */}
                        <td className="py-2 px-4 text-center">
                          <span className="font-mono text-[11px] bg-black/5 dark:bg-white/10 px-2 py-0.5 rounded text-muted">
                            {item.location || item.bin_location || 'R1-B01'}
                          </span>
                        </td>

                        {/* Quantity */}
                        <td className="py-2 px-4 text-right">
                          <span className="font-mono font-bold text-ink-light dark:text-ink-dark text-sm">
                            {item.quantity}
                          </span>
                          <span className="text-[10px] text-muted ml-1">{item.unit || 'pcs'}</span>
                        </td>

                        {/* Reorder Level */}
                        <td className="py-2 px-4 text-right font-mono text-muted">
                          {item.reorder_level}
                        </td>

                        {/* Unit Cost */}
                        <td className="py-2 px-4 text-right font-mono text-muted">
                          ₹{(item.unit_cost || 0).toLocaleString('en-IN')}
                        </td>

                        {/* Status Chip in required soft tints */}
                        <td className="py-2 px-4 text-center">
                          {status === 'OK' && (
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-positive/10 text-positive">
                              OK
                            </span>
                          )}
                          {status === 'LOW' && (
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-warning/10 text-warning">
                              LOW BUFFER
                            </span>
                          )}
                          {status === 'CRITICAL' && (
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-negative/10 text-negative animate-pulse">
                              CRITICAL
                            </span>
                          )}
                          {status === 'OUT' && (
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#991B1B]/15 text-[#991B1B]">
                              OUT OF STOCK
                            </span>
                          )}
                          {status === 'DEAD' && (
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-black/5 dark:bg-white/10 text-muted">
                              DEAD STOCK
                            </span>
                          )}
                        </td>

                        {/* Row Actions */}
                        <td className="py-2 px-4 text-center">
                          <div className="flex items-center justify-center gap-1.5 opacity-80 group-hover:opacity-100 transition-opacity">
                            {/* Fast Stock In */}
                            <button
                              onClick={() => {
                                setSelectedItemForStock(item);
                                setStockModalType('IN');
                                setIsStockModalOpen(true);
                              }}
                              className="p-1 rounded text-muted hover:text-positive hover:bg-positive/10 transition-colors"
                              title="Stock In (+)"
                            >
                              <ArrowDownLeft size={14} />
                            </button>

                            {/* Fast Stock Out */}
                            <button
                              onClick={() => {
                                setSelectedItemForStock(item);
                                setStockModalType('OUT');
                                setIsStockModalOpen(true);
                              }}
                              className="p-1 rounded text-muted hover:text-negative hover:bg-negative/10 transition-colors"
                              title="Stock Out (-)"
                            >
                              <ArrowUpRight size={14} />
                            </button>

                            {/* Cycle Count */}
                            <button
                              onClick={() => {
                                setSelectedItemForStock(item);
                                setCycleForm({
                                  physical_count: item.quantity,
                                  reason: 'Cycle Count Audit',
                                });
                                setIsCycleCountOpen(true);
                              }}
                              className="p-1 rounded text-muted hover:text-sage hover:bg-sage/10 transition-colors"
                              title="Cycle Count Adjust"
                            >
                              <ClipboardCheck size={14} />
                            </button>

                            {/* QR Label Print */}
                            <button
                              onClick={() => {
                                setSelectedItemForQr(item);
                                setIsQrModalOpen(true);
                              }}
                              className="p-1 rounded text-muted hover:text-ink-light dark:hover:text-ink-dark hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                              title="View & Print QR Label"
                            >
                              <QrCode size={14} />
                            </button>
                          </div>
                        </td>
                      </motion.tr>
                    );
                  })}
                </AnimatePresence>
              )}
            </tbody>
          </table>
        </div>

        {/* Footer info bar */}
        <div className="p-3 border-t border-hairline-light dark:border-hairline-dark text-xs text-muted flex items-center justify-between">
          <span>
            Showing <strong className="text-ink-light dark:text-ink-dark">{filteredItems.length}</strong> of {items.length} parts
          </span>
          <span className="font-mono text-sage text-[11px]">Grounded Central Catalog</span>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* MODAL 1: ADD NEW PART                                                */}
      {/* ==================================================================== */}
      <AnimatePresence>
        {isAddPartOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAddPartOpen(false)}
              className="fixed inset-0 bg-black/40 backdrop-blur-[8px]"
            />
            <motion.div
              initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 8 }}
              animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
              exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 8 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="relative z-10 bg-card-light dark:bg-card-dark max-w-lg w-full rounded-card p-6 shadow-2xl border border-hairline-light dark:border-hairline-dark max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between pb-3 border-b border-hairline-light dark:border-hairline-dark">
                <h3 className="text-base font-bold text-ink-light dark:text-ink-dark">
                  Add New Welding Spare Part
                </h3>
                <button onClick={() => setIsAddPartOpen(false)} className="text-muted hover:text-ink-light">
                  <X size={16} />
                </button>
              </div>

              <form
                onSubmit={e => {
                  e.preventDefault();
                  addItemMutation.mutate(addForm);
                }}
                className="space-y-4 mt-4 text-xs"
              >
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-muted font-medium mb-1">Part SKU *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. MIG-NZ-CON28"
                      value={addForm.sku}
                      onChange={e => setAddForm({ ...addForm, sku: e.target.value.toUpperCase() })}
                      className="w-full bg-canvas-light dark:bg-black/20 rounded-pill px-3 py-2 border border-hairline-light dark:border-hairline-dark focus:outline-none font-mono font-semibold"
                    />
                  </div>
                  <div>
                    <label className="block text-muted font-medium mb-1">Category *</label>
                    <input
                      type="text"
                      required
                      value={addForm.category}
                      onChange={e => setAddForm({ ...addForm, category: e.target.value })}
                      className="w-full bg-canvas-light dark:bg-black/20 rounded-pill px-3 py-2 border border-hairline-light dark:border-hairline-dark focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-muted font-medium mb-1">Part Description / Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Conical Gas Nozzle 28mm Brass"
                    value={addForm.name}
                    onChange={e => setAddForm({ ...addForm, name: e.target.value })}
                    className="w-full bg-canvas-light dark:bg-black/20 rounded-pill px-3 py-2 border border-hairline-light dark:border-hairline-dark focus:outline-none font-medium"
                  />
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-muted font-medium mb-1">Initial Stock</label>
                    <input
                      type="number"
                      min="0"
                      value={addForm.quantity}
                      onChange={e => setAddForm({ ...addForm, quantity: Number(e.target.value) })}
                      className="w-full bg-canvas-light dark:bg-black/20 rounded-pill px-3 py-2 border border-hairline-light dark:border-hairline-dark focus:outline-none font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-muted font-medium mb-1">Reorder Level</label>
                    <input
                      type="number"
                      min="1"
                      value={addForm.reorder_level}
                      onChange={e => setAddForm({ ...addForm, reorder_level: Number(e.target.value) })}
                      className="w-full bg-canvas-light dark:bg-black/20 rounded-pill px-3 py-2 border border-hairline-light dark:border-hairline-dark focus:outline-none font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-muted font-medium mb-1">Bin Location</label>
                    <input
                      type="text"
                      value={addForm.location}
                      onChange={e => setAddForm({ ...addForm, location: e.target.value })}
                      className="w-full bg-canvas-light dark:bg-black/20 rounded-pill px-3 py-2 border border-hairline-light dark:border-hairline-dark focus:outline-none font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-muted font-medium mb-1">Unit Cost (₹)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={addForm.unit_cost}
                      onChange={e => setAddForm({ ...addForm, unit_cost: Number(e.target.value) })}
                      className="w-full bg-canvas-light dark:bg-black/20 rounded-pill px-3 py-2 border border-hairline-light dark:border-hairline-dark focus:outline-none font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-muted font-medium mb-1">Selling Price (₹)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={addForm.selling_price}
                      onChange={e => setAddForm({ ...addForm, selling_price: Number(e.target.value) })}
                      className="w-full bg-canvas-light dark:bg-black/20 rounded-pill px-3 py-2 border border-hairline-light dark:border-hairline-dark focus:outline-none font-mono"
                    />
                  </div>
                </div>

                <div className="pt-3 border-t border-hairline-light dark:border-hairline-dark flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsAddPartOpen(false)}
                    className="px-4 py-2 bg-black/5 dark:bg-white/10 rounded-pill text-muted hover:text-ink-light"
                  >
                    Cancel
                  </button>
                  <motion.button
                    whileTap={{ scale: 0.98 }}
                    type="submit"
                    disabled={addItemMutation.isPending}
                    className="px-5 py-2 bg-sage hover:bg-sage-dark text-white rounded-pill font-semibold shadow-sm sweep-hover"
                  >
                    {addItemMutation.isPending ? 'Saving…' : 'Save to Catalog'}
                  </motion.button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ==================================================================== */}
      {/* MODAL 2: STOCK IN / OUT                                              */}
      {/* ==================================================================== */}
      <AnimatePresence>
        {isStockModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsStockModalOpen(false)}
              className="fixed inset-0 bg-black/40 backdrop-blur-[8px]"
            />
            <motion.div
              initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 8 }}
              animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
              exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 8 }}
              className="relative z-10 bg-card-light dark:bg-card-dark max-w-md w-full rounded-card p-6 shadow-2xl border border-hairline-light dark:border-hairline-dark"
            >
              <div className="flex items-center justify-between pb-3 border-b border-hairline-light dark:border-hairline-dark">
                <div className="flex items-center gap-2">
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center ${
                      stockModalType === 'IN' ? 'bg-positive/10 text-positive' : 'bg-negative/10 text-negative'
                    }`}
                  >
                    {stockModalType === 'IN' ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}
                  </div>
                  <h3 className="text-base font-bold text-ink-light dark:text-ink-dark">
                    {stockModalType === 'IN' ? 'Material Receipt (Stock In)' : 'Material Issue (Stock Out)'}
                  </h3>
                </div>
                <button onClick={() => setIsStockModalOpen(false)} className="text-muted hover:text-ink-light">
                  <X size={16} />
                </button>
              </div>

              {/* Mode switch pills */}
              <div className="flex items-center bg-canvas-light dark:bg-black/20 p-1 rounded-pill my-4 border border-hairline-light dark:border-hairline-dark">
                <button
                  type="button"
                  onClick={() => setStockModalType('IN')}
                  className={`flex-1 py-1 text-xs font-semibold rounded-pill transition-all ${
                    stockModalType === 'IN'
                      ? 'bg-positive text-white shadow-sm'
                      : 'text-muted hover:text-ink-light'
                  }`}
                >
                  Stock In (Inward)
                </button>
                <button
                  type="button"
                  onClick={() => setStockModalType('OUT')}
                  className={`flex-1 py-1 text-xs font-semibold rounded-pill transition-all ${
                    stockModalType === 'OUT'
                      ? 'bg-negative text-white shadow-sm'
                      : 'text-muted hover:text-ink-light'
                  }`}
                >
                  Stock Out (Dispatch)
                </button>
              </div>

              <form
                onSubmit={e => {
                  e.preventDefault();
                  if (!selectedItemForStock) return;
                  stockMutation.mutate({
                    type: stockModalType,
                    itemId: selectedItemForStock.id,
                    sku: selectedItemForStock.sku,
                    payload: stockForm,
                  });
                }}
                className="space-y-3.5 text-xs"
              >
                <div>
                  <label className="block text-muted font-medium mb-1">Select Spare Part</label>
                  <select
                    value={selectedItemForStock?.id || ''}
                    onChange={e => {
                      const found = items.find(it => it.id === Number(e.target.value));
                      setSelectedItemForStock(found || null);
                    }}
                    className="w-full bg-canvas-light dark:bg-black/20 rounded-pill px-3 py-2 border border-hairline-light dark:border-hairline-dark font-medium"
                  >
                    {items.map(it => (
                      <option key={it.id} value={it.id}>
                        {it.sku} - {it.name} (Stock: {it.quantity})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-muted font-medium mb-1">Quantity</label>
                    <input
                      type="number"
                      required
                      min="1"
                      value={stockForm.quantity}
                      onChange={e => setStockForm({ ...stockForm, quantity: Number(e.target.value) })}
                      className="w-full bg-canvas-light dark:bg-black/20 rounded-pill px-3 py-2 border border-hairline-light dark:border-hairline-dark font-mono font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-muted font-medium mb-1">Reference Doc #</label>
                    <input
                      type="text"
                      value={stockForm.reference}
                      onChange={e => setStockForm({ ...stockForm, reference: e.target.value })}
                      className="w-full bg-canvas-light dark:bg-black/20 rounded-pill px-3 py-2 border border-hairline-light dark:border-hairline-dark font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-muted font-medium mb-1">Reason / Notes</label>
                  <input
                    type="text"
                    required
                    value={stockForm.reason}
                    onChange={e => setStockForm({ ...stockForm, reason: e.target.value })}
                    className="w-full bg-canvas-light dark:bg-black/20 rounded-pill px-3 py-2 border border-hairline-light dark:border-hairline-dark"
                  />
                </div>

                <div className="pt-3 border-t border-hairline-light dark:border-hairline-dark flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsStockModalOpen(false)}
                    className="px-4 py-2 bg-black/5 dark:bg-white/10 rounded-pill text-muted"
                  >
                    Cancel
                  </button>
                  <motion.button
                    whileTap={{ scale: 0.98 }}
                    type="submit"
                    disabled={stockMutation.isPending}
                    className={`px-5 py-2 text-white rounded-pill font-semibold shadow-sm sweep-hover ${
                      stockModalType === 'IN' ? 'bg-positive hover:bg-positive/90' : 'bg-negative hover:bg-negative/90'
                    }`}
                  >
                    {stockMutation.isPending ? 'Processing…' : 'Record Transaction'}
                  </motion.button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ==================================================================== */}
      {/* MODAL 3: CYCLE COUNT ADJUSTMENT                                      */}
      {/* ==================================================================== */}
      <AnimatePresence>
        {isCycleCountOpen && selectedItemForStock && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsCycleCountOpen(false)}
              className="fixed inset-0 bg-black/40 backdrop-blur-[8px]"
            />
            <motion.div
              initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 8 }}
              animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
              exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 8 }}
              className="relative z-10 bg-card-light dark:bg-card-dark max-w-md w-full rounded-card p-6 shadow-2xl border border-hairline-light dark:border-hairline-dark"
            >
              <div className="flex items-center justify-between pb-3 border-b border-hairline-light dark:border-hairline-dark">
                <div className="flex items-center gap-2">
                  <ClipboardCheck size={18} className="text-sage" />
                  <h3 className="text-base font-bold text-ink-light dark:text-ink-dark">
                    Physical Cycle Count
                  </h3>
                </div>
                <button onClick={() => setIsCycleCountOpen(false)} className="text-muted hover:text-ink-light">
                  <X size={16} />
                </button>
              </div>

              <div className="p-3 bg-canvas-light/60 dark:bg-black/20 rounded-tile border border-hairline-light dark:border-hairline-dark my-4 text-xs">
                <div className="font-semibold text-ink-light dark:text-ink-dark">{selectedItemForStock.name}</div>
                <div className="font-mono text-sage mt-0.5">{selectedItemForStock.sku}</div>
                <div className="flex justify-between mt-2 pt-2 border-t border-hairline-light dark:border-hairline-dark text-muted">
                  <span>System Recorded Quantity:</span>
                  <span className="font-mono font-bold text-ink-light dark:text-ink-dark">
                    {selectedItemForStock.quantity} units
                  </span>
                </div>
              </div>

              <form
                onSubmit={e => {
                  e.preventDefault();
                  cycleCountMutation.mutate({
                    item: selectedItemForStock,
                    physicalCount: cycleForm.physical_count,
                    reason: cycleForm.reason,
                  });
                }}
                className="space-y-3.5 text-xs"
              >
                <div>
                  <label className="block text-muted font-medium mb-1">Physical Verified Count</label>
                  <input
                    type="number"
                    required
                    min="0"
                    value={cycleForm.physical_count}
                    onChange={e => setCycleForm({ ...cycleForm, physical_count: Number(e.target.value) })}
                    className="w-full bg-canvas-light dark:bg-black/20 rounded-pill px-3 py-2 border border-hairline-light dark:border-hairline-dark font-mono font-bold text-base"
                  />
                  <div className="text-[11px] text-muted mt-1">
                    Discrepancy:{' '}
                    <span
                      className={`font-mono font-bold ${
                        cycleForm.physical_count - selectedItemForStock.quantity === 0
                          ? 'text-positive'
                          : 'text-warning'
                      }`}
                    >
                      {cycleForm.physical_count - selectedItemForStock.quantity > 0 ? '+' : ''}
                      {cycleForm.physical_count - selectedItemForStock.quantity} units
                    </span>
                  </div>
                </div>

                <div>
                  <label className="block text-muted font-medium mb-1">Audit Justification</label>
                  <input
                    type="text"
                    required
                    value={cycleForm.reason}
                    onChange={e => setCycleForm({ ...cycleForm, reason: e.target.value })}
                    className="w-full bg-canvas-light dark:bg-black/20 rounded-pill px-3 py-2 border border-hairline-light dark:border-hairline-dark"
                  />
                </div>

                <div className="pt-3 border-t border-hairline-light dark:border-hairline-dark flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsCycleCountOpen(false)}
                    className="px-4 py-2 bg-black/5 dark:bg-white/10 rounded-pill text-muted"
                  >
                    Cancel
                  </button>
                  <motion.button
                    whileTap={{ scale: 0.98 }}
                    type="submit"
                    disabled={cycleCountMutation.isPending}
                    className="px-5 py-2 bg-sage hover:bg-sage-dark text-white rounded-pill font-semibold sweep-hover"
                  >
                    {cycleCountMutation.isPending ? 'Reconciling…' : 'Confirm & Reconcile'}
                  </motion.button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ==================================================================== */}
      {/* MODAL 4: CSV IMPORT WIZARD                                           */}
      {/* ==================================================================== */}
      <AnimatePresence>
        {isCsvImportOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsCsvImportOpen(false)}
              className="fixed inset-0 bg-black/40 backdrop-blur-[8px]"
            />
            <motion.div
              initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 8 }}
              animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
              exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 8 }}
              className="relative z-10 bg-card-light dark:bg-card-dark max-w-md w-full rounded-card p-6 shadow-2xl border border-hairline-light dark:border-hairline-dark"
            >
              <div className="flex items-center justify-between pb-3 border-b border-hairline-light dark:border-hairline-dark">
                <div className="flex items-center gap-2">
                  <FileSpreadsheet size={18} className="text-sage" />
                  <h3 className="text-base font-bold text-ink-light dark:text-ink-dark">
                    CSV Batch Import Wizard
                  </h3>
                </div>
                <button onClick={() => setIsCsvImportOpen(false)} className="text-muted hover:text-ink-light">
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={handleCsvUpload} className="space-y-4 mt-4 text-xs">
                <div className="p-6 border-2 border-dashed border-hairline-light dark:border-hairline-dark rounded-tile text-center bg-canvas-light/40 dark:bg-black/10">
                  <UploadCloud size={32} className="mx-auto text-sage mb-2" />
                  <p className="font-semibold text-ink-light dark:text-ink-dark">
                    Upload Inventory CSV File
                  </p>
                  <p className="text-[11px] text-muted mt-1">
                    Columns: sku, name, category, quantity, unit_cost, reorder_level
                  </p>
                  <input
                    type="file"
                    accept=".csv"
                    required
                    onChange={e => setCsvFile(e.target.files ? e.target.files[0] : null)}
                    className="mt-3 block w-full text-xs text-muted file:mr-4 file:py-1.5 file:px-3 file:rounded-pill file:border-0 file:text-xs file:font-semibold file:bg-sage file:text-white hover:file:bg-sage-dark cursor-pointer"
                  />
                </div>

                {csvResult && (
                  <div className="p-3 rounded-tile bg-black/5 dark:bg-white/5 text-[11px] font-mono whitespace-pre-wrap">
                    {csvResult}
                  </div>
                )}

                <div className="flex items-center justify-between pt-2">
                  <a
                    href="/api/import/sample"
                    download="inventory_sample.csv"
                    className="text-[11px] text-sage hover:underline flex items-center gap-1"
                  >
                    <Download size={12} />
                    <span>Download Sample CSV</span>
                  </a>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setIsCsvImportOpen(false)}
                      className="px-3 py-1.5 bg-black/5 dark:bg-white/10 rounded-pill text-muted"
                    >
                      Close
                    </button>
                    <motion.button
                      whileTap={{ scale: 0.98 }}
                      type="submit"
                      disabled={csvUploading || !csvFile}
                      className="px-4 py-1.5 bg-sage hover:bg-sage-dark text-white rounded-pill font-semibold sweep-hover disabled:opacity-40"
                    >
                      {csvUploading ? 'Importing…' : 'Start Import'}
                    </motion.button>
                  </div>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ==================================================================== */}
      {/* MODAL 5: QR LABEL PRINT VIEW                                         */}
      {/* ==================================================================== */}
      <AnimatePresence>
        {isQrModalOpen && selectedItemForQr && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsQrModalOpen(false)}
              className="fixed inset-0 bg-black/40 backdrop-blur-[8px]"
            />
            <motion.div
              initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 8 }}
              animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
              exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 8 }}
              className="relative z-10 bg-card-light dark:bg-card-dark max-w-sm w-full rounded-card p-6 shadow-2xl border border-hairline-light dark:border-hairline-dark text-center"
            >
              <div className="flex items-center justify-between pb-3 border-b border-hairline-light dark:border-hairline-dark">
                <h3 className="text-sm font-bold text-ink-light dark:text-ink-dark">
                  Warehouse Bin QR Tag
                </h3>
                <button onClick={() => setIsQrModalOpen(false)} className="text-muted hover:text-ink-light">
                  <X size={16} />
                </button>
              </div>

              {/* Printable Tag Card */}
              <div id="printable-qr-tag" className="p-5 my-4 bg-white text-ink-light rounded-tile border-2 border-black/10 shadow-sm flex flex-col items-center">
                <div className="w-32 h-32 bg-black/5 rounded-tile flex items-center justify-center p-2 mb-3">
                  {/* Clean SVG QR Representation */}
                  <svg viewBox="0 0 100 100" className="w-full h-full">
                    <rect x="10" y="10" width="30" height="30" fill="#141414" />
                    <rect x="15" y="15" width="20" height="20" fill="#FFFFFF" />
                    <rect x="20" y="20" width="10" height="10" fill="#141414" />

                    <rect x="60" y="10" width="30" height="30" fill="#141414" />
                    <rect x="65" y="15" width="20" height="20" fill="#FFFFFF" />
                    <rect x="70" y="20" width="10" height="10" fill="#141414" />

                    <rect x="10" y="60" width="30" height="30" fill="#141414" />
                    <rect x="15" y="65" width="20" height="20" fill="#FFFFFF" />
                    <rect x="20" y="70" width="10" height="10" fill="#141414" />

                    <rect x="45" y="45" width="10" height="10" fill="#141414" />
                    <rect x="60" y="60" width="12" height="12" fill="#141414" />
                    <rect x="75" y="75" width="15" height="15" fill="#141414" />
                  </svg>
                </div>
                <div className="font-mono font-bold text-base tracking-wider text-black">
                  {selectedItemForQr.sku}
                </div>
                <div className="text-xs font-semibold text-black/80 truncate max-w-[240px] mt-0.5">
                  {selectedItemForQr.name}
                </div>
                <div className="mt-2 text-[10px] font-mono text-black/60 bg-black/5 px-2 py-0.5 rounded">
                  BIN: {selectedItemForQr.location || 'R1-B01'} • ANISHKA ERP
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsQrModalOpen(false)}
                  className="px-4 py-2 bg-black/5 dark:bg-white/10 rounded-pill text-xs text-muted"
                >
                  Dismiss
                </button>
                <motion.button
                  whileTap={{ scale: 0.98 }}
                  onClick={() => window.print()}
                  className="px-4 py-2 bg-ink-light text-white rounded-pill text-xs font-semibold shadow-sm flex items-center gap-1.5 sweep-hover"
                >
                  <Printer size={13} />
                  <span>Print Tag</span>
                </motion.button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
