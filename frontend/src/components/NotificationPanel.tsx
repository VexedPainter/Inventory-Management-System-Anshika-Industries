import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import {
  Bell,
  X,
  AlertTriangle,
  XCircle,
  PackageCheck,
  ArrowDownLeft,
  ArrowUpRight,
  Clock,
  Sparkles,
  CheckCheck,
  CheckCircle2,
  Trash2,
  ExternalLink,
  Filter,
} from 'lucide-react';
import { apiFetch } from '../api/client';

export interface NotificationItem {
  id: string;
  type: 'OUT_OF_STOCK' | 'LOW_STOCK' | 'PO_OVERDUE' | 'PO_PENDING' | 'STOCK_MOVEMENT';
  title: string;
  message: string;
  category: 'alerts' | 'orders' | 'movements';
  severity: 'critical' | 'warning' | 'info' | 'success';
  timestamp: string;
  targetTab: string;
  sku?: string;
  reference?: string;
}

interface NotificationPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigateTab?: (tab: any) => void;
  onAskAni?: (query: string) => void;
  onUnreadCountChange?: (count: number) => void;
}

const STORAGE_READ_KEY = 'anishka_notifications_read_v1';
const STORAGE_DISMISSED_KEY = 'anishka_notifications_dismissed_v1';

export const NotificationPanel: React.FC<NotificationPanelProps> = ({
  isOpen,
  onClose,
  onNavigateTab,
  onAskAni,
  onUnreadCountChange,
}) => {
  const shouldReduceMotion = useReducedMotion();
  const panelRef = useRef<HTMLDivElement>(null);
  const [activeFilter, setActiveFilter] = useState<'all' | 'alerts' | 'orders' | 'movements'>('all');

  // Read IDs and dismissed IDs persisted in localStorage
  const [readIds, setReadIds] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_READ_KEY);
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch {
      return new Set();
    }
  });

  const [dismissedIds, setDismissedIds] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_DISMISSED_KEY);
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch {
      return new Set();
    }
  });

  // 1. Fetch Inventory for stock alerts
  const { data: rawInventory } = useQuery({
    queryKey: ['/api/inventory'],
    queryFn: () => apiFetch('/api/inventory'),
    staleTime: 30000,
  });

  // 2. Fetch Procurement for PO alerts
  const { data: rawProcurement } = useQuery({
    queryKey: ['/api/procurement'],
    queryFn: () => apiFetch('/api/procurement'),
    staleTime: 30000,
  });

  // 3. Fetch Stock Movements for live activity stream
  const { data: rawMovements } = useQuery({
    queryKey: ['/api/stock-movements'],
    queryFn: () => apiFetch('/api/stock-movements'),
    staleTime: 30000,
  });

  // Transform live backend data into structured notifications
  const allNotifications = useMemo<NotificationItem[]>(() => {
    const list: NotificationItem[] = [];

    // A. Inventory Alerts
    const inventory = Array.isArray(rawInventory) ? rawInventory : [];
    inventory.forEach((item: any) => {
      const qty = item.quantity || 0;
      const reorder = item.reorder_level || 0;

      if (qty === 0) {
        list.push({
          id: `stock-out-${item.id || item.sku}`,
          type: 'OUT_OF_STOCK',
          title: `Stockout: ${item.sku}`,
          message: `${item.name} has 0 units remaining. Urgent reorder recommended.`,
          category: 'alerts',
          severity: 'critical',
          timestamp: 'Immediate',
          targetTab: 'inventory',
          sku: item.sku,
        });
      } else if (qty <= reorder) {
        list.push({
          id: `stock-low-${item.id || item.sku}`,
          type: 'LOW_STOCK',
          title: `Low Stock: ${item.sku}`,
          message: `${item.name} is below buffer (${qty} ${item.unit || 'pcs'} left, min ${reorder}).`,
          category: 'alerts',
          severity: 'warning',
          timestamp: 'Buffer breach',
          targetTab: 'inventory',
          sku: item.sku,
        });
      }
    });

    // B. Procurement Alerts
    const orders = Array.isArray(rawProcurement) ? rawProcurement : [];
    const now = new Date();
    orders.forEach((po: any) => {
      if (po.status === 'RECEIVED' || po.status === 'CANCELLED') return;

      const isOverdue = po.expected_date ? new Date(po.expected_date) < now : false;
      if (isOverdue) {
        list.push({
          id: `po-overdue-${po.id || po.po_number}`,
          type: 'PO_OVERDUE',
          title: `Overdue PO: ${po.po_number}`,
          message: `Consignment from ${po.supplier_name || 'Vendor'} was expected on ${po.expected_date}.`,
          category: 'orders',
          severity: 'warning',
          timestamp: 'Overdue',
          targetTab: 'procurement',
          reference: po.po_number,
        });
      } else if (po.status === 'APPROVED' || po.status === 'DRAFT') {
        list.push({
          id: `po-pending-${po.id || po.po_number}`,
          type: 'PO_PENDING',
          title: `Order In Progress: ${po.po_number}`,
          message: `${po.supplier_name || 'Vendor'} order (${po.status}) awaiting delivery confirmation.`,
          category: 'orders',
          severity: 'info',
          timestamp: po.expected_date || 'Pending',
          targetTab: 'procurement',
          reference: po.po_number,
        });
      }
    });

    // C. Recent Stock Movements (top 4 latest)
    const movements = Array.isArray(rawMovements) ? rawMovements : [];
    movements.slice(0, 4).forEach((m: any, idx: number) => {
      const typeLabel = m.type === 'IN' ? 'Receipt Inward' : m.type === 'OUT' ? 'Dispatch Outward' : 'Adjustment';
      const isPositive = m.type === 'IN';
      list.push({
        id: `mov-${m.movement_id || m.id || idx}`,
        type: 'STOCK_MOVEMENT',
        title: `${typeLabel}: ${m.item_sku || m.sku || 'Item'}`,
        message: `${Math.abs(m.quantity || 0)} units handled by ${m.performed_by || m.user || 'Storekeeper'} (${m.reference || 'Ref'}).`,
        category: 'movements',
        severity: isPositive ? 'success' : 'info',
        timestamp: m.timestamp ? (m.timestamp.includes('T') ? m.timestamp.slice(11, 16) : m.timestamp.slice(-8, -3)) : 'Recent',
        targetTab: 'movements',
        reference: m.reference,
        sku: m.item_sku || m.sku,
      });
    });

    return list;
  }, [rawInventory, rawProcurement, rawMovements]);

  // Filter out dismissed items
  const activeNotifications = useMemo(() => {
    return allNotifications.filter(item => !dismissedIds.has(item.id));
  }, [allNotifications, dismissedIds]);

  // Filter by category
  const filteredNotifications = useMemo(() => {
    if (activeFilter === 'all') return activeNotifications;
    return activeNotifications.filter(item => item.category === activeFilter);
  }, [activeNotifications, activeFilter]);

  // Calculate unread count
  const unreadCount = useMemo(() => {
    return activeNotifications.filter(item => !readIds.has(item.id)).length;
  }, [activeNotifications, readIds]);

  // Notify parent of unread count updates
  useEffect(() => {
    if (onUnreadCountChange) {
      onUnreadCountChange(unreadCount);
    }
  }, [unreadCount, onUnreadCountChange]);

  // Mark all as read
  const handleMarkAllRead = () => {
    const next = new Set(readIds);
    activeNotifications.forEach(n => next.add(n.id));
    setReadIds(next);
    try {
      localStorage.setItem(STORAGE_READ_KEY, JSON.stringify(Array.from(next)));
    } catch {
      // ignore
    }
  };

  // Mark single as read
  const handleMarkItemRead = (id: string) => {
    if (readIds.has(id)) return;
    const next = new Set(readIds);
    next.add(id);
    setReadIds(next);
    try {
      localStorage.setItem(STORAGE_READ_KEY, JSON.stringify(Array.from(next)));
    } catch {
      // ignore
    }
  };

  // Dismiss notification
  const handleDismissItem = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const next = new Set(dismissedIds);
    next.add(id);
    setDismissedIds(next);
    try {
      localStorage.setItem(STORAGE_DISMISSED_KEY, JSON.stringify(Array.from(next)));
    } catch {
      // ignore
    }
  };

  // Clear all notifications
  const handleClearAll = () => {
    const next = new Set(dismissedIds);
    activeNotifications.forEach(n => next.add(n.id));
    setDismissedIds(next);
    try {
      localStorage.setItem(STORAGE_DISMISSED_KEY, JSON.stringify(Array.from(next)));
    } catch {
      // ignore
    }
  };

  // Click on a notification item
  const handleItemClick = (item: NotificationItem) => {
    handleMarkItemRead(item.id);
    if (onNavigateTab) {
      onNavigateTab(item.targetTab);
    }
    onClose();
  };

  // Close on Click Outside or Escape Key
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  const severityBadge = (severity: NotificationItem['severity']) => {
    switch (severity) {
      case 'critical':
        return <span className="w-2 h-2 rounded-full bg-negative shrink-0 animate-ping" />;
      case 'warning':
        return <span className="w-2 h-2 rounded-full bg-warning shrink-0" />;
      case 'success':
        return <span className="w-2 h-2 rounded-full bg-positive shrink-0" />;
      default:
        return <span className="w-2 h-2 rounded-full bg-sage shrink-0" />;
    }
  };

  const severityIcon = (item: NotificationItem) => {
    switch (item.type) {
      case 'OUT_OF_STOCK':
        return <XCircle size={15} className="text-negative shrink-0" />;
      case 'LOW_STOCK':
        return <AlertTriangle size={15} className="text-warning shrink-0" />;
      case 'PO_OVERDUE':
        return <Clock size={15} className="text-warning shrink-0" />;
      case 'PO_PENDING':
        return <PackageCheck size={15} className="text-sage shrink-0" />;
      case 'STOCK_MOVEMENT':
        return item.severity === 'success' ? (
          <ArrowDownLeft size={15} className="text-positive shrink-0" />
        ) : (
          <ArrowUpRight size={15} className="text-muted shrink-0" />
        );
      default:
        return <Bell size={15} className="text-sage shrink-0" />;
    }
  };

  if (!isOpen) return null;

  return (
    <motion.div
      ref={panelRef}
      role="dialog"
      aria-label="Notifications Center"
      aria-modal="false"
      initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.96 }}
      animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
      exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 6, scale: 0.96 }}
      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
      className="absolute right-0 top-full mt-2 w-[340px] sm:w-[420px] max-w-[calc(100vw-1.5rem)] bg-card-light dark:bg-card-dark rounded-2xl shadow-modal border border-hairline-light dark:border-hairline-dark z-50 overflow-hidden flex flex-col max-h-[82vh]"
    >
      {/* Header */}
      <div className="p-4 pb-3 border-b border-hairline-light dark:border-hairline-dark flex items-center justify-between gap-3 bg-canvas-light/40 dark:bg-black/20 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-sage/10 text-sage flex items-center justify-center">
            <Bell size={14} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-bold text-ink-light dark:text-ink-dark tracking-tight">
                Notifications Center
              </h3>
              {unreadCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold font-mono bg-sage text-white">
                  {unreadCount}
                </span>
              )}
            </div>
            <p className="text-[10px] text-muted font-medium">Real-time alerts, stockouts & supply chain activity</p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {unreadCount > 0 && (
            <button
              onClick={handleMarkAllRead}
              className="px-2 py-1 text-[11px] font-semibold text-sage hover:text-sage-dark hover:bg-sage/10 rounded-pill transition-colors flex items-center gap-1"
              title="Mark all as read"
            >
              <CheckCheck size={13} />
              <span className="hidden sm:inline">Mark read</span>
            </button>
          )}

          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full flex items-center justify-center text-muted hover:text-ink-light dark:hover:text-ink-dark hover:bg-black/5 dark:hover:bg-white/5 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sage"
            aria-label="Close notifications"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="px-4 py-2 border-b border-hairline-light dark:border-hairline-dark flex items-center gap-1.5 overflow-x-auto no-scrollbar text-[11px]">
        {(['all', 'alerts', 'orders', 'movements'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveFilter(tab)}
            className={`px-2.5 py-1 rounded-pill font-medium transition-all capitalize whitespace-nowrap ${
              activeFilter === tab
                ? 'bg-ink-light dark:bg-white text-white dark:text-ink-light font-semibold shadow-xs'
                : 'text-muted hover:text-ink-light dark:hover:text-ink-dark hover:bg-black/5 dark:hover:bg-white/5'
            }`}
          >
            {tab === 'all' ? 'All Alerts' : tab}
          </button>
        ))}
      </div>

      {/* Notifications List */}
      <div className="flex-1 overflow-y-auto divide-y divide-hairline-light dark:divide-hairline-dark max-h-[380px]">
        {filteredNotifications.length === 0 ? (
          <div className="py-12 px-6 text-center space-y-2">
            <div className="w-10 h-10 rounded-full bg-sage/10 text-sage flex items-center justify-center mx-auto">
              <CheckCircle2 size={20} />
            </div>
            <p className="text-xs font-semibold text-ink-light dark:text-ink-dark">All caught up!</p>
            <p className="text-[11px] text-muted max-w-xs mx-auto">
              No active alerts in this category. Live events and threshold notifications will automatically appear here.
            </p>
          </div>
        ) : (
          filteredNotifications.map(item => {
            const isRead = readIds.has(item.id);

            return (
              <div
                key={item.id}
                onClick={() => handleItemClick(item)}
                className={`p-3.5 sm:p-4 transition-colors cursor-pointer group flex items-start gap-3 relative ${
                  isRead
                    ? 'hover:bg-black/3 dark:hover:bg-white/3'
                    : 'bg-sage/5 dark:bg-sage/10 hover:bg-sage/10 dark:hover:bg-sage/15'
                }`}
              >
                {/* Left unread indicator bar */}
                {!isRead && (
                  <div className="absolute left-0 top-3 bottom-3 w-1 bg-sage rounded-r" aria-hidden="true" />
                )}

                {/* Icon */}
                <div className="w-8 h-8 rounded-full bg-canvas-light dark:bg-black/30 border border-hairline-light dark:border-hairline-dark flex items-center justify-center shrink-0 mt-0.5">
                  {severityIcon(item)}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0 pr-1">
                  <div className="flex items-center justify-between gap-2 mb-0.5">
                    <div className="flex items-center gap-1.5 truncate">
                      <span className="text-xs font-bold text-ink-light dark:text-ink-dark truncate">
                        {item.title}
                      </span>
                      {severityBadge(item.severity)}
                    </div>
                    <span className="text-[10px] text-muted font-mono shrink-0">
                      {item.timestamp}
                    </span>
                  </div>

                  <p className="text-[11px] text-muted leading-relaxed line-clamp-2">
                    {item.message}
                  </p>

                  {/* Action Buttons */}
                  <div className="mt-2 flex items-center gap-2">
                    {item.sku && onAskAni && (
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          onAskAni(`Draft an emergency purchase order for ${item.sku}`);
                          handleMarkItemRead(item.id);
                          onClose();
                        }}
                        className="px-2 py-0.5 rounded-pill bg-sage/10 hover:bg-sage/20 text-sage text-[10px] font-semibold flex items-center gap-1 transition-colors"
                      >
                        <Sparkles size={11} />
                        <span>Draft PO</span>
                      </button>
                    )}

                    <span className="text-[10px] text-sage font-medium group-hover:underline flex items-center gap-0.5 ml-auto">
                      <span>View details</span>
                      <ExternalLink size={10} />
                    </span>

                    <button
                      onClick={e => handleDismissItem(e, item.id)}
                      className="opacity-0 group-hover:opacity-100 p-1 text-muted hover:text-negative rounded transition-opacity"
                      title="Dismiss"
                      aria-label="Dismiss alert"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer */}
      <div className="p-3 px-4 border-t border-hairline-light dark:border-hairline-dark flex items-center justify-between bg-canvas-light/40 dark:bg-black/20 text-[11px] text-muted">
        <span>{activeNotifications.length} active notifications</span>
        {activeNotifications.length > 0 && (
          <button
            onClick={handleClearAll}
            className="text-muted hover:text-negative transition-colors font-medium text-[10px]"
          >
            Clear all
          </button>
        )}
      </div>
    </motion.div>
  );
};
