import React, { useState, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Search, Download, RefreshCw, AlertCircle, FileQuestion, Inbox } from 'lucide-react';
import { apiFetch } from '../api/client';
import { TableRowSkeleton } from '../components/Skeleton';

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
  /** Message shown when no data exists (not filtered out) */
  emptyTitle?: string;
  emptyMessage?: string;
  emptyAction?: { label: string; onClick: () => void };
  /** Number of skeleton rows to show while loading */
  skeletonRows?: number;
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
  emptyTitle = 'No records found',
  emptyMessage = 'There are no records matching your search.',
  emptyAction,
  skeletonRows = 6,
}: GenericTableViewProps<T>) {
  const [search, setSearch] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const shouldReduceMotion = useReducedMotion();
  const tableRef = useRef<HTMLDivElement>(null);

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

  const isFiltering = search.trim().length > 0;
  const hasNoData = rawList.length === 0;

  return (
    <div className="bg-card-light dark:bg-card-dark rounded-[20px] p-5 shadow-bento border border-hairline-light dark:border-hairline-dark space-y-4">
      {/* Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-ink-light dark:text-ink-dark tracking-tight">
            {title}
          </h2>
          <p className="text-xs text-muted mt-0.5">{subtitle}</p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Search Input — enhanced focus ring */}
          <div
            className={`relative flex items-center bg-canvas-light dark:bg-black/20 rounded-full px-3 py-1.5 border text-xs w-56 transition-all ${
              isFocused
                ? 'border-sage ring-2 ring-sage/20 shadow-sm'
                : 'border-hairline-light dark:border-hairline-dark'
            }`}
          >
            <Search size={13} className="text-muted mr-2 shrink-0" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              placeholder={searchPlaceholder}
              aria-label={`Search ${title}`}
              className="bg-transparent text-ink-light dark:text-ink-dark outline-none w-full text-xs"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="ml-1 text-muted hover:text-ink-light dark:hover:text-ink-dark transition-colors"
                aria-label="Clear search"
              >
                <span className="text-[10px]">✕</span>
              </button>
            )}
          </div>

          <motion.button
            whileTap={{ scale: 0.92 }}
            onClick={() => refetch()}
            disabled={isFetching}
            className="w-8 h-8 rounded-full bg-canvas-light dark:bg-black/20 border border-hairline-light dark:border-hairline-dark text-muted hover:text-ink-light dark:hover:text-ink-dark flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage"
            title="Refresh data"
            aria-label="Refresh data"
          >
            <RefreshCw size={13} className={isFetching ? 'animate-spin' : ''} />
          </motion.button>

          {exportEndpoint && (
            <motion.button
              whileTap={{ scale: 0.94 }}
              onClick={handleExport}
              className="px-3 py-1.5 bg-canvas-light dark:bg-black/20 hover:bg-black/5 dark:hover:bg-white/5 border border-hairline-light dark:border-hairline-dark text-xs font-medium text-ink-light dark:text-ink-dark rounded-full flex items-center gap-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage"
            >
              <Download size={13} />
              <span>Export CSV</span>
            </motion.button>
          )}

          {actionButton}
        </div>
      </div>

      {/* Table Content */}
      <div ref={tableRef} className="overflow-x-auto rounded-[14px]">
        {isLoading ? (
          /* Skeleton rows that match the actual column count */
          <table className="w-full text-left text-xs border-collapse" aria-label={`Loading ${title}`}>
            <thead>
              <tr className="border-b border-hairline-light dark:border-hairline-dark text-muted font-medium">
                {columns.map((col, idx) => (
                  <th
                    key={idx}
                    className={`py-2.5 px-3 uppercase tracking-wider text-[11px] ${
                      col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'
                    } ${col.className || ''}`}
                  >
                    {col.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline-light dark:divide-hairline-dark">
              {Array.from({ length: skeletonRows }).map((_, i) => (
                <TableRowSkeleton key={i} cols={columns.length} />
              ))}
            </tbody>
          </table>
        ) : error ? (
          /* Error state with retry */
          <div className="py-14 text-center space-y-3" role="alert">
            <div className="w-12 h-12 rounded-full bg-negative/10 flex items-center justify-center mx-auto">
              <AlertCircle size={22} className="text-negative" />
            </div>
            <div>
              <p className="text-sm font-semibold text-ink-light dark:text-ink-dark">Failed to load data</p>
              <p className="text-xs text-muted mt-0.5">{(error as Error).message}</p>
            </div>
            <button
              onClick={() => refetch()}
              className="mt-2 px-4 py-2 text-xs font-semibold bg-sage text-white rounded-full shadow-sm hover:bg-sage-dark transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage"
            >
              Try again
            </button>
          </div>
        ) : filteredList.length === 0 ? (
          /* Empty state — contextual message + call to action */
          <div className="py-16 text-center space-y-3">
            <div className="w-14 h-14 rounded-full bg-black/5 dark:bg-white/5 flex items-center justify-center mx-auto">
              {isFiltering ? (
                <FileQuestion size={24} className="text-muted" />
              ) : (
                <Inbox size={24} className="text-muted" />
              )}
            </div>
            <div>
              <p className="text-sm font-semibold text-ink-light dark:text-ink-dark">
                {isFiltering ? 'No results for this search' : (hasNoData ? emptyTitle : 'No matching records')}
              </p>
              <p className="text-xs text-muted mt-1 max-w-xs mx-auto">
                {isFiltering
                  ? `No records match "${search}". Try adjusting your search.`
                  : emptyMessage}
              </p>
            </div>
            {isFiltering ? (
              <button
                onClick={() => setSearch('')}
                className="mt-1 px-4 py-1.5 text-xs font-semibold text-sage border border-sage/40 rounded-full hover:bg-sage/5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage"
              >
                Clear search
              </button>
            ) : emptyAction ? (
              <button
                onClick={emptyAction.onClick}
                className="mt-1 px-4 py-2 text-xs font-semibold bg-ink-light dark:bg-ink-dark text-white dark:text-ink-light rounded-full shadow-sm hover:opacity-90 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage"
              >
                {emptyAction.label}
              </button>
            ) : null}
          </div>
        ) : (
          /* Data table — sticky header, keyboard-navigable rows */
          <table
            className="w-full text-left text-xs border-collapse sticky-thead"
            role="grid"
            aria-label={title}
            aria-rowcount={filteredList.length}
          >
            <thead>
              <tr className="border-b border-hairline-light dark:border-hairline-dark text-muted font-medium">
                {columns.map((col, idx) => (
                  <th
                    key={idx}
                    scope="col"
                    className={`py-2.5 px-3 uppercase tracking-wider text-[11px] font-semibold ${
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
            <tbody className="divide-y divide-hairline-light dark:divide-hairline-dark">
              <AnimatePresence initial={false}>
                {filteredList.map((item, rowIdx) => (
                  <motion.tr
                    key={item.id || item.sku || item.username || rowIdx}
                    initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 6 }}
                    animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
                    exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, height: 0, overflow: 'hidden' }}
                    transition={{
                      duration: 0.2,
                      delay: Math.min(rowIdx * 0.02, 0.28),
                      ease: [0.22, 1, 0.36, 1],
                    }}
                    className="table-row-hover focus-within:bg-black/3 dark:focus-within:bg-white/3 cursor-default"
                    role="row"
                    tabIndex={-1}
                    aria-rowindex={rowIdx + 1}
                    onKeyDown={e => {
                      // Arrow key navigation between rows
                      if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        const next = tableRef.current?.querySelectorAll('tbody tr')[rowIdx + 1] as HTMLElement;
                        next?.focus();
                      } else if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        const prev = tableRef.current?.querySelectorAll('tbody tr')[rowIdx - 1] as HTMLElement;
                        prev?.focus();
                      }
                    }}
                  >
                    {columns.map((col, colIdx) => (
                      <td
                        key={colIdx}
                        className={`py-2.5 px-3 ${
                          col.align === 'right'
                            ? 'text-right'
                            : col.align === 'center'
                            ? 'text-center'
                            : 'text-left'
                        } ${col.className || ''}`}
                        role="gridcell"
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
      {!isLoading && !error && filteredList.length > 0 && (
        <div className="text-[11px] text-muted flex items-center justify-between pt-2 border-t border-hairline-light dark:border-hairline-dark">
          <span>
            {isFiltering
              ? `${filteredList.length} of ${rawList.length} records`
              : `${filteredList.length} total records`}
          </span>
          <span className="font-mono text-sage text-[10px]">Live Sync</span>
        </div>
      )}
    </div>
  );
}
