import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  Search,
  ArrowDownLeft,
  ArrowUpRight,
  ClipboardCheck,
  ShieldCheck,
  Download,
  Filter,
  RefreshCw,
} from 'lucide-react';
import { apiFetch } from '../api/client';
import { Skeleton } from '../components/Skeleton';

interface MovementRecord {
  movement_id?: string;
  id?: number;
  item_id: number;
  item_sku?: string;
  sku?: string;
  type: 'IN' | 'OUT' | 'ADJUST' | 'AUDIT';
  quantity: number;
  reference?: string;
  party?: string;
  user?: string;
  performed_by?: string;
  timestamp: string;
  balance_after?: number;
}

export const MovementsView: React.FC = () => {
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'IN' | 'OUT' | 'ADJUST' | 'AUDIT'>('ALL');
  const [search, setSearch] = useState('');
  const shouldReduceMotion = useReducedMotion();

  const { data, isLoading, refetch, isFetching } = useQuery<MovementRecord[]>({
    queryKey: ['/api/stock-movements'],
    queryFn: () => apiFetch('/api/stock-movements?limit=250'),
    staleTime: 30000,
  });

  const movements = Array.isArray(data) ? data : [];

  const filteredMovements = useMemo(() => {
    return movements.filter(m => {
      if (typeFilter !== 'ALL' && m.type !== typeFilter) return false;
      if (!search.trim()) return true;

      const q = search.toLowerCase();
      const sku = (m.item_sku || m.sku || '').toLowerCase();
      const ref = (m.reference || '').toLowerCase();
      const party = (m.party || '').toLowerCase();
      const user = (m.performed_by || m.user || '').toLowerCase();

      return sku.includes(q) || ref.includes(q) || party.includes(q) || user.includes(q);
    });
  }, [movements, typeFilter, search]);

  const typeCounts = useMemo(() => {
    const c = { ALL: movements.length, IN: 0, OUT: 0, ADJUST: 0, AUDIT: 0 };
    movements.forEach(m => {
      if (m.type in c) c[m.type as keyof typeof c]++;
    });
    return c;
  }, [movements]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-ink-light dark:text-ink-dark tracking-tight">
            Stock Movement Ledger
          </h2>
          <p className="text-xs text-muted mt-0.5">
            Cryptographically sealed chronological log of material inward, dispatches, and adjustments
          </p>
        </div>

        <div className="flex items-center gap-2">
          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={() => refetch()}
            className="w-9 h-9 rounded-full bg-card-light dark:bg-card-dark border border-hairline-light dark:border-hairline-dark flex items-center justify-center text-muted hover:text-ink-light"
            title="Refresh Ledger"
          >
            <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
          </motion.button>

          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={() => window.open('/api/inventory/export?format=csv&type=movements', '_blank')}
            className="px-3.5 py-2 bg-ink-light dark:bg-white text-white dark:text-ink-light rounded-pill text-xs font-semibold shadow-bento sweep-hover flex items-center gap-1.5"
          >
            <Download size={13} />
            <span>Export CSV</span>
          </motion.button>
        </div>
      </div>

      {/* Filter Chips & Search Bar */}
      <div className="bg-card-light dark:bg-card-dark rounded-card p-4 shadow-bento border border-hairline-light dark:border-hairline-dark flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={() => setTypeFilter('ALL')}
            className={`px-3 py-1.5 rounded-pill text-xs font-semibold transition-all ${
              typeFilter === 'ALL'
                ? 'bg-ink-light dark:bg-white text-white dark:text-ink-light shadow-sm'
                : 'bg-black/5 dark:bg-white/10 text-muted hover:text-ink-light'
            }`}
          >
            All ({typeCounts.ALL})
          </button>

          <button
            onClick={() => setTypeFilter('IN')}
            className={`px-3 py-1.5 rounded-pill text-xs font-semibold transition-all ${
              typeFilter === 'IN'
                ? 'bg-positive text-white shadow-sm'
                : 'bg-positive/10 text-positive hover:bg-positive/20'
            }`}
          >
            Inward ({typeCounts.IN})
          </button>

          <button
            onClick={() => setTypeFilter('OUT')}
            className={`px-3 py-1.5 rounded-pill text-xs font-semibold transition-all ${
              typeFilter === 'OUT'
                ? 'bg-negative text-white shadow-sm'
                : 'bg-negative/10 text-negative hover:bg-negative/20'
            }`}
          >
            Dispatch ({typeCounts.OUT})
          </button>

          <button
            onClick={() => setTypeFilter('ADJUST')}
            className={`px-3 py-1.5 rounded-pill text-xs font-semibold transition-all ${
              typeFilter === 'ADJUST'
                ? 'bg-warning text-white shadow-sm'
                : 'bg-warning/10 text-warning hover:bg-warning/20'
            }`}
          >
            Adjustments ({typeCounts.ADJUST})
          </button>
        </div>

        <div className="relative flex items-center bg-canvas-light dark:bg-black/20 rounded-pill px-3 py-1.5 border border-hairline-light dark:border-hairline-dark text-xs w-64">
          <Search size={14} className="text-muted mr-2 shrink-0" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search SKU, reference, user…"
            className="bg-transparent text-ink-light dark:text-ink-dark focus:outline-none w-full"
          />
        </div>
      </div>

      {/* Movements Table (56px rows, zebra none, hover row tint, sticky header) */}
      <div className="bg-card-light dark:bg-card-dark rounded-card shadow-bento border border-hairline-light dark:border-hairline-dark overflow-hidden">
        <div className="overflow-x-auto max-h-[640px] no-scrollbar">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="sticky top-0 z-10 bg-white/85 dark:bg-[#181B1A]/90 backdrop-blur-md border-b border-hairline-light dark:border-hairline-dark text-muted font-medium uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-3.5 px-4">Timestamp</th>
                <th className="py-3.5 px-4">Spare SKU</th>
                <th className="py-3.5 px-4 text-center">Movement Type</th>
                <th className="py-3.5 px-4 text-right">Units</th>
                <th className="py-3.5 px-4 text-right">Balance After</th>
                <th className="py-3.5 px-4">Party / Source</th>
                <th className="py-3.5 px-4">Reference Doc</th>
                <th className="py-3.5 px-4">Operator</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline-light dark:divide-hairline-dark">
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="h-14">
                    <td colSpan={8} className="px-4">
                      <Skeleton className="h-8 w-full" rounded="md" />
                    </td>
                  </tr>
                ))
              ) : filteredMovements.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center text-xs text-muted">
                    No matching stock movement records found.
                  </td>
                </tr>
              ) : (
                filteredMovements.map((m, idx) => (
                  <tr
                    key={m.movement_id || m.id || idx}
                    className="h-14 hover:bg-black/2 dark:hover:bg-white/2 transition-colors"
                  >
                    <td className="py-2 px-4 font-mono text-muted text-[11px]">
                      {m.timestamp}
                    </td>

                    <td className="py-2 px-4 font-mono font-semibold text-sage">
                      {m.item_sku || m.sku || `ITEM-${m.item_id}`}
                    </td>

                    <td className="py-2 px-4 text-center">
                      {m.type === 'IN' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-positive/10 text-positive">
                          <ArrowDownLeft size={12} /> INWARD
                        </span>
                      )}
                      {m.type === 'OUT' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-negative/10 text-negative">
                          <ArrowUpRight size={12} /> DISPATCH
                        </span>
                      )}
                      {m.type === 'ADJUST' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-warning/10 text-warning">
                          <ClipboardCheck size={12} /> ADJUSTMENT
                        </span>
                      )}
                      {m.type === 'AUDIT' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-sage/10 text-sage">
                          <ShieldCheck size={12} /> AUDIT
                        </span>
                      )}
                    </td>

                    <td className="py-2 px-4 text-right font-mono font-bold text-ink-light dark:text-ink-dark">
                      {m.type === 'IN' ? `+${m.quantity}` : m.type === 'OUT' ? `-${m.quantity}` : m.quantity}
                    </td>

                    <td className="py-2 px-4 text-right font-mono text-muted">
                      {m.balance_after ?? '—'}
                    </td>

                    <td className="py-2 px-4 text-ink-light dark:text-ink-dark truncate max-w-xs">
                      {m.party || 'Central Store'}
                    </td>

                    <td className="py-2 px-4 font-mono text-muted text-[11px] truncate max-w-xs">
                      {m.reference || 'Manual Entry'}
                    </td>

                    <td className="py-2 px-4 text-muted">
                      {m.performed_by || m.user || 'system'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="p-3 border-t border-hairline-light dark:border-hairline-dark text-xs text-muted flex items-center justify-between">
          <span>Showing {filteredMovements.length} transactions</span>
          <span className="font-mono text-sage text-[11px]">Audit Compliant</span>
        </div>
      </div>
    </div>
  );
};
