import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ShieldCheck,
  Search,
  Download,
  Filter,
  RefreshCw,
  Hash,
  User,
  Clock,
  Layers,
  FileText
} from 'lucide-react';
import { apiFetch } from '../api/client';
import { Skeleton } from '../components/Skeleton';
import { Reveal } from '../components/Reveal';

interface AuditLog {
  id: number;
  timestamp: string;
  user: string;
  action: string;
  target?: string;
  details?: string;
  hash?: string;
  prev_hash?: string;
}

export const AuditView: React.FC = () => {
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('ALL');
  const [limit, setLimit] = useState(100);

  const { data: logs = [], isLoading, refetch, isFetching } = useQuery<AuditLog[]>({
    queryKey: ['audit-logs', limit],
    queryFn: async () => {
      return await apiFetch<AuditLog[]>(`/api/audit?limit=${limit}`);
    },
  });

  const filteredLogs = logs.filter(log => {
    const matchesSearch =
      (log.user || '').toLowerCase().includes(search.toLowerCase()) ||
      (log.action || '').toLowerCase().includes(search.toLowerCase()) ||
      (log.target || '').toLowerCase().includes(search.toLowerCase()) ||
      (log.details || '').toLowerCase().includes(search.toLowerCase());

    const matchesAction =
      actionFilter === 'ALL' ||
      (log.action || '').toUpperCase().includes(actionFilter);

    return matchesSearch && matchesAction;
  });

  const handleExportCsv = () => {
    window.open('/api/inventory/export?format=csv&type=audit', '_blank');
  };

  return (
    <div className="space-y-6">
      {/* Header bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-ink dark:text-white">
              Audit Compliance Trail
            </h1>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[#5F7F6D]/15 text-[#5F7F6D] dark:text-[#8FE3FF]">
              <ShieldCheck className="w-3.5 h-3.5" />
              Cryptographic Hash Chain
            </span>
          </div>
          <p className="text-sm text-muted dark:text-gray-400 mt-1">
            Tamper-evident chronological log of all stock adjustments, order approvals, and user security events.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="p-2.5 rounded-full border border-black/10 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/5 text-ink dark:text-white transition-colors"
            title="Refresh logs"
          >
            <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={handleExportCsv}
            className="sweep-hover inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-ink text-white dark:bg-white dark:text-ink text-sm font-medium hover:scale-[0.98] transition-transform shadow-sm"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Filter and stats row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="md:col-span-2 relative">
          <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="text"
            placeholder="Search by operator, action, SKU, or event payload..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-11 pr-4 py-2.5 rounded-full bg-white dark:bg-[#181B1A] border border-black/10 dark:border-white/10 text-sm text-ink dark:text-white focus:outline-none focus:ring-2 focus:ring-[#5F7F6D]"
          />
        </div>

        <div>
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="w-full px-4 py-2.5 rounded-full bg-white dark:bg-[#181B1A] border border-black/10 dark:border-white/10 text-sm text-ink dark:text-white focus:outline-none focus:ring-2 focus:ring-[#5F7F6D]"
          >
            <option value="ALL">All Event Types</option>
            <option value="LOGIN">Authentication / Login</option>
            <option value="STOCK">Stock In / Out / Adjust</option>
            <option value="ORDER">Orders & Procurement</option>
            <option value="USER">User Governance</option>
            <option value="DISPATCH">Dispatches & Deliveries</option>
          </select>
        </div>

        <div>
          <select
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            className="w-full px-4 py-2.5 rounded-full bg-white dark:bg-[#181B1A] border border-black/10 dark:border-white/10 text-sm text-ink dark:text-white focus:outline-none focus:ring-2 focus:ring-[#5F7F6D]"
          >
            <option value={50}>Last 50 Events</option>
            <option value={100}>Last 100 Events</option>
            <option value={250}>Last 250 Events</option>
            <option value={500}>Last 500 Events</option>
          </select>
        </div>
      </div>

      {/* Main Table Card */}
      <div className="bg-white dark:bg-[#181B1A] rounded-3xl border border-black/5 dark:border-white/5 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-6 space-y-4">
            <Skeleton className="h-10 w-full rounded-xl" />
            <Skeleton className="h-14 w-full rounded-xl" />
            <Skeleton className="h-14 w-full rounded-xl" />
            <Skeleton className="h-14 w-full rounded-xl" />
            <Skeleton className="h-14 w-full rounded-xl" />
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="p-16 text-center">
            <FileText className="w-12 h-12 text-muted mx-auto mb-3 opacity-40" />
            <p className="text-base font-semibold text-ink dark:text-white">No audit events found</p>
            <p className="text-sm text-muted mt-1">Try adjusting your search or category filters.</p>
          </div>
        ) : (
          <div className="overflow-x-auto max-h-[680px]">
            <table className="w-full text-left text-sm border-collapse">
              <thead className="sticky top-0 bg-white/90 dark:bg-[#181B1A]/90 backdrop-blur-md border-b border-black/5 dark:border-white/5 z-10 text-xs font-semibold uppercase tracking-wider text-muted">
                <tr>
                  <th className="px-6 py-4">Event ID</th>
                  <th className="px-6 py-4">Timestamp</th>
                  <th className="px-6 py-4">Operator</th>
                  <th className="px-6 py-4">Action</th>
                  <th className="px-6 py-4">Target Entity</th>
                  <th className="px-6 py-4">Event Details & State Changes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5 dark:divide-white/5">
                {filteredLogs.map((log) => {
                  const isAuth = (log.action || '').toLowerCase().includes('login');
                  const isStock = (log.action || '').toLowerCase().includes('stock');
                  const isOrder = (log.action || '').toLowerCase().includes('order');

                  return (
                    <motion.tr
                      key={log.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.2 }}
                      className="h-14 hover:bg-black/2 dark:hover:bg-white/2 transition-colors"
                    >
                      <td className="px-6 py-3 font-mono text-xs text-muted">
                        #{log.id}
                      </td>
                      <td className="px-6 py-3 whitespace-nowrap text-ink dark:text-white font-mono text-xs">
                        <span className="flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-muted" />
                          {log.timestamp ? new Date(log.timestamp).toLocaleString('en-IN', {
                            dateStyle: 'short',
                            timeStyle: 'medium'
                          }) : '-'}
                        </span>
                      </td>
                      <td className="px-6 py-3 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-black/5 dark:bg-white/10 text-ink dark:text-white">
                          <User className="w-3 h-3 text-muted" />
                          {log.user || 'system'}
                        </span>
                      </td>
                      <td className="px-6 py-3 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${
                            isStock
                              ? 'bg-[#5F7F6D]/15 text-[#5F7F6D] dark:text-[#8FE3FF]'
                              : isAuth
                              ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                              : isOrder
                              ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400'
                              : 'bg-black/5 dark:bg-white/10 text-ink dark:text-white'
                          }`}
                        >
                          {log.action}
                        </span>
                      </td>
                      <td className="px-6 py-3 font-medium text-ink dark:text-white whitespace-nowrap">
                        {log.target || '—'}
                      </td>
                      <td className="px-6 py-3 text-xs text-muted max-w-md truncate font-mono">
                        {log.details || '—'}
                      </td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
