import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Search, Download, RefreshCw, AlertCircle } from 'lucide-react';
import { apiFetch } from '../api/client';

interface Column<T> {
  header: string;
  accessor: (item: T) => React.ReactNode;
  align?: 'left' | 'center' | 'right';
  className?: string;
}

interface GenericTableViewProps<T> {
  title: string;
  subtitle: string;
  endpoint: string;
  columns: Column<T>[];
  searchPlaceholder?: string;
  searchFilter?: (item: T, search: string) => boolean;
  actionButton?: React.ReactNode;
  exportEndpoint?: string;
}

export function GenericTableView<T extends Record<string, any>>({
  title,
  subtitle,
  endpoint,
  columns,
  searchPlaceholder = 'Search records…',
  searchFilter,
  actionButton,
  exportEndpoint,
}: GenericTableViewProps<T>) {
  const [search, setSearch] = useState('');
  const shouldReduceMotion = useReducedMotion();

  const { data, isLoading, error, refetch, isFetching } = useQuery<T[]>({
    queryKey: [endpoint],
    queryFn: () => apiFetch(endpoint),
    staleTime: 30000,
  });

  const rawList = Array.isArray(data) ? data : (data as any)?.items || (data as any)?.users || [];

  const filteredList = useMemo(() => {
    if (!search.trim()) return rawList;
    const lower = search.toLowerCase();
    if (searchFilter) {
      return rawList.filter(item => searchFilter(item, lower));
    }
    return rawList.filter(item =>
      Object.values(item).some(val =>
        String(val || '').toLowerCase().includes(lower)
      )
    );
  }, [rawList, search, searchFilter]);

  const handleExport = () => {
    if (exportEndpoint) {
      window.open(exportEndpoint, '_blank');
    }
  };

  return (
    <div className="bg-card-light dark:bg-card-dark rounded-card p-6 shadow-bento border border-hairline-light dark:border-hairline-dark space-y-5">
      {/* Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-ink-light dark:text-ink-dark">
            {title}
          </h2>
          <p className="text-xs text-muted mt-0.5">{subtitle}</p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Search Input */}
          <div className="relative flex items-center bg-canvas-light dark:bg-black/20 rounded-pill px-3 py-1.5 border border-hairline-light dark:border-hairline-dark text-xs w-60">
            <Search size={14} className="text-muted mr-2" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={searchPlaceholder}
              className="bg-transparent text-ink-light dark:text-ink-dark focus:outline-none w-full"
            />
          </div>

          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={() => refetch()}
            disabled={isFetching}
            className="w-8 h-8 rounded-full bg-canvas-light dark:bg-black/20 border border-hairline-light dark:border-hairline-dark text-muted hover:text-ink-light dark:hover:text-ink-dark flex items-center justify-center transition-colors"
            title="Refresh data"
          >
            <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
          </motion.button>

          {exportEndpoint && (
            <motion.button
              whileTap={{ scale: 0.98 }}
              onClick={handleExport}
              className="px-3 py-1.5 bg-canvas-light dark:bg-black/20 hover:bg-black/5 dark:hover:bg-white/5 border border-hairline-light dark:border-hairline-dark text-xs font-medium text-ink-light dark:text-ink-dark rounded-pill flex items-center gap-1.5 transition-colors"
            >
              <Download size={13} />
              <span>Export CSV</span>
            </motion.button>
          )}

          {actionButton}
        </div>
      </div>

      {/* Table Content */}
      <div className="overflow-x-auto no-scrollbar">
        {isLoading ? (
          <div className="py-16 text-center text-xs text-muted">
            <RefreshCw size={20} className="animate-spin text-sage mx-auto mb-2" />
            <span>Loading records from server…</span>
          </div>
        ) : error ? (
          <div className="py-12 text-center text-xs text-negative">
            <AlertCircle size={20} className="mx-auto mb-2" />
            <span>Failed to load data: {(error as Error).message}</span>
          </div>
        ) : filteredList.length === 0 ? (
          <div className="py-16 text-center text-xs text-muted">
            No matching records found.
          </div>
        ) : (
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-hairline-light dark:border-hairline-dark text-muted font-medium">
                {columns.map((col, idx) => (
                  <th
                    key={idx}
                    className={`py-2.5 px-3 uppercase tracking-wider text-[11px] ${
                      col.align === 'right'
                        ? 'text-right'
                        : col.align === 'center'
                        ? 'text-center'
                        : 'text-left'
                    } ${col.className || ''}`}
                  >
                    {col.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline-light dark:divide-hairline-dark font-medium">
              <AnimatePresence initial={false}>
                {filteredList.map((item, rowIdx) => (
                  <motion.tr
                    key={item.id || item.sku || item.username || rowIdx}
                    initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
                    animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
                    exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, height: 0, overflow: 'hidden' }}
                    transition={{
                      duration: 0.22,
                      delay: Math.min(rowIdx * 0.025, 0.35),
                      ease: [0.22, 1, 0.36, 1],
                    }}
                    className="hover:bg-black/2 dark:hover:bg-white/2 transition-colors"
                  >
                    {columns.map((col, colIdx) => (
                      <td
                        key={colIdx}
                        className={`py-3 px-3 ${
                          col.align === 'right'
                            ? 'text-right'
                            : col.align === 'center'
                            ? 'text-center'
                            : 'text-left'
                        } ${col.className || ''}`}
                      >
                        {col.accessor(item)}
                      </td>
                    ))}
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
        )}
      </div>

      {/* Footer counter */}
      <div className="text-[11px] text-muted flex items-center justify-between pt-2 border-t border-hairline-light dark:border-hairline-dark">
        <span>Showing {filteredList.length} of {rawList.length} total entries</span>
        <span className="font-mono text-sage">Active Data Sync</span>
      </div>
    </div>
  );
}
