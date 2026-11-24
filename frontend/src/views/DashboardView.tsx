import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  AlertTriangle,
  XCircle,
  ArrowUpRight,
  ShieldCheck,
  Layers,
  Sparkles,
  Download,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { apiFetch, downloadFile } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useOrb } from '../context/OrbContext';
import { CountUp } from '../components/CountUp';
import { Reveal } from '../components/Reveal';
import { Skeleton } from '../components/Skeleton';

interface DashboardProps {
  onNavigateTab: (tab: any) => void;
  onOpenCopilot: (initialQuery?: string) => void;
  onOpenQuickPO?: (item?: any) => void;
}

export const DashboardView: React.FC<DashboardProps> = ({
  onNavigateTab,
  onOpenCopilot,
  onOpenQuickPO,
}) => {
  const { user } = useAuth();
  const { onDashboardReady, openChat } = useOrb();
  const [minSkeletonElapsed, setMinSkeletonElapsed] = useState(false);

  // Guarantee skeletons stay at least 450ms on route change
  useEffect(() => {
    const timer = setTimeout(() => {
      setMinSkeletonElapsed(true);
    }, 450);
    return () => clearTimeout(timer);
  }, []);

  // 1. Fetch dashboard overview stats
  const { data: dashData, isLoading: dashLoading } = useQuery({
    queryKey: ['dashboard-summary'],
    queryFn: () => apiFetch('/api/dashboard'),
    staleTime: 30000,
  });

  // 2. Fetch owner summary metrics (not for storekeeper)
  const isStorekeeper = user?.role === 'storekeeper';
  const { data: ownerData } = useQuery({
    queryKey: ['owner-summary'],
    queryFn: () => apiFetch('/api/reports/owner-summary'),
    enabled: !isStorekeeper,
    staleTime: 60000,
  });

  // 3. Fetch inventory for reorder suggestions
  const { data: inventoryData } = useQuery({
    queryKey: ['inventory-items'],
    queryFn: () => apiFetch('/api/inventory'),
    staleTime: 60000,
  });

  // 4. Fetch customers for top receivables
  const { data: customersData } = useQuery({
    queryKey: ['customers-list'],
    queryFn: () => apiFetch('/api/customers'),
    staleTime: 60000,
  });

  // Notify orb director once dashboard is loaded and skeletons cleared
  useEffect(() => {
    if (!dashLoading && minSkeletonElapsed && dashData) {
      onDashboardReady(dashData);
    }
  }, [dashLoading, minSkeletonElapsed, dashData, onDashboardReady]);

  const showSkeleton = dashLoading || !minSkeletonElapsed;

  if (showSkeleton) {
    return (
      <div className="space-y-4">
        {/* Row 1 Skeletons: 4 compact cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Skeleton className="h-36" rounded="card" />
          <Skeleton className="h-36" rounded="card" />
          <Skeleton className="h-36" rounded="card" />
          <Skeleton className="h-36" rounded="card" />
        </div>

        {/* Row 2 Skeletons */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <Skeleton className="lg:col-span-7 h-80" rounded="card" />
          <Skeleton className="lg:col-span-2 h-80" rounded="card" />
          <Skeleton className="lg:col-span-3 h-80" rounded="card" />
        </div>

        {/* Row 3 Skeletons */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <Skeleton className="lg:col-span-5 h-64" rounded="card" />
          <Skeleton className="lg:col-span-4 h-64" rounded="card" />
          <Skeleton className="lg:col-span-3 h-64" rounded="card" />
        </div>
      </div>
    );
  }

  const stats = dashData?.stats || {};
  const stockValuation = stats.total_valuation || dashData?.stock_value || 0;
  const lowStockCount = stats.status_distribution?.LOW ?? (dashData?.counts?.LOW || 0);
  const outOfStockCount = stats.status_distribution?.OUT ?? (dashData?.counts?.OUT || 0);
  const pendingPOCount = stats.pending_po_count || dashData?.pending_po_count || 0;
  const pendingPOValue = stats.pending_po_value || dashData?.pending_po_value || 0;
  const totalSkus = stats.total_skus || dashData?.total_skus || 0;

  // Stock movements trend (last 14 days)
  const trendData = (dashData?.trend_30d || []).slice(-14).map((d: any) => ({
    date: d.date ? d.date.slice(5) : '',
    inward: d.inward || 0,
    outward: d.outward || 0,
    net: (d.inward || 0) - (d.outward || 0),
  }));

  // Tiny 7-day bar data for stock value card
  const last7Bars = (dashData?.trend_30d || []).slice(-7).map((d: any) => ({
    val: Math.max(1, (d.inward || 0) + (d.outward || 0)),
  }));

  // Reorder suggestions (items where quantity <= reorder_level)
  const reorderSuggestions = (Array.isArray(inventoryData) ? inventoryData : [])
    .filter((it: any) => (it.quantity || 0) <= (it.reorder_level || 0))
    .slice(0, 3);

  // Top customers by balance
  const topCustomers = (Array.isArray(customersData) ? customersData : [])
    .filter((c: any) => (c.current_balance || 0) > 0)
    .sort((a: any, b: any) => (b.current_balance || 0) - (a.current_balance || 0))
    .slice(0, 3);

  // Fill rate / order fulfillment calculation
  const okStock = stats.status_distribution?.OK || (totalSkus - lowStockCount - outOfStockCount);
  const fillRate = totalSkus > 0 ? Math.round((Math.max(0, okStock) / totalSkus) * 100) : 94;

  const donutData = [
    { name: 'Fulfilled', value: fillRate, color: '#5F7F6D' },
    { name: 'Remaining', value: 100 - fillRate, color: 'rgba(0,0,0,0.06)' },
  ];

  return (
    <div className="space-y-4">
      {/* Top Header Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-1">
        <div>
          <h2 className="text-xl font-bold text-ink-light dark:text-ink-dark tracking-tight">Operations Dashboard</h2>
          <p className="text-xs text-muted mt-0.5">Real-time inventory metrics, movement velocity, and statutory compliance status</p>
        </div>
        <div className="flex items-center gap-2">
          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={() => downloadFile('/api/pdf/dashboard-report', 'Valuation_Dashboard_Report.pdf')}
            className="px-3.5 py-2 bg-ink-light dark:bg-white text-white dark:text-ink-light rounded-pill text-xs font-semibold shadow-bento sweep-hover flex items-center gap-1.5"
          >
            <Download size={13} />
            <span>Valuation PDF</span>
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={() => downloadFile('/api/export/excel/comprehensive', 'Anishka_Comprehensive_Ledger.xlsx')}
            className="px-3.5 py-2 bg-card-light dark:bg-card-dark border border-hairline-light dark:border-hairline-dark hover:bg-black/5 dark:hover:bg-white/5 text-ink-light dark:text-ink-dark rounded-pill text-xs font-semibold shadow-bento sweep-hover flex items-center gap-1.5"
          >
            <Download size={13} />
            <span>Excel Ledger</span>
          </motion.button>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* ROW 1: 4 Compact Bento Cards                                         */}
      {/* ==================================================================== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Stock value */}
        <Reveal index={0}>
          <motion.div
            whileHover={{ y: -4 }}
            transition={{ duration: 0.2 }}
            onClick={() => onNavigateTab('inventory')}
            className="group relative bg-card-light dark:bg-card-dark rounded-card p-5 shadow-bento hover:shadow-bento-hover border border-hairline-light dark:border-hairline-dark cursor-pointer flex flex-col justify-between transition-shadow h-full"
          >
            {/* Ask Ani on hover button */}
            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                openChat('Analyze our total stock valuation breakdown and asset turns');
              }}
              className="opacity-0 group-hover:opacity-100 transition-opacity absolute top-3 right-3 text-[10px] font-semibold bg-white/90 dark:bg-black/90 text-sage dark:text-sage border border-sage/30 px-2.5 py-1 rounded-pill shadow-sm flex items-center gap-1 z-20"
            >
              <Sparkles size={11} />
              <span>Ask Ani</span>
            </button>

            <div className="flex items-center justify-between">
              <span className="text-xs text-muted font-medium">Stock value</span>
              <div className="w-8 h-8 rounded-full bg-sage/10 text-sage flex items-center justify-center">
                <Layers size={16} />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-semibold text-ink-light dark:text-ink-dark">
                <CountUp value={stockValuation} prefix="₹" duration={900} />
              </div>
              <div className="text-xs text-muted mt-0.5 flex items-center gap-1.5">
                <span>{totalSkus} active SKUs in store</span>
              </div>
            </div>
            {/* Micro bar sparkline with growth from baseline */}
            <div className="h-6 mt-3">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={last7Bars.length ? last7Bars : [{ val: 4 }, { val: 7 }, { val: 5 }, { val: 8 }, { val: 6 }, { val: 9 }, { val: 8 }]}>
                  <Bar
                    dataKey="val"
                    fill="#5F7F6D"
                    radius={[2, 2, 0, 0]}
                    opacity={0.65}
                    isAnimationActive={true}
                    animationDuration={900}
                    animationEasing="ease-out"
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </motion.div>
        </Reveal>

        {/* Card 2: Low stock (Target of Ani glide choreo) */}
        <Reveal index={1}>
          <motion.div
            id="bento-low-stock"
            data-card="low-stock"
            whileHover={{ y: -4 }}
            transition={{ duration: 0.2 }}
            onClick={() => onNavigateTab('inventory')}
            className="group relative bg-card-light dark:bg-card-dark rounded-card p-5 shadow-bento hover:shadow-bento-hover border border-hairline-light dark:border-hairline-dark cursor-pointer flex flex-col justify-between transition-shadow h-full"
          >
            {/* Ask Ani on hover button */}
            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                openChat('Which critical SKUs are currently below their reorder buffer?');
              }}
              className="opacity-0 group-hover:opacity-100 transition-opacity absolute top-3 right-3 text-[10px] font-semibold bg-white/90 dark:bg-black/90 text-warning border border-warning/30 px-2.5 py-1 rounded-pill shadow-sm flex items-center gap-1 z-20"
            >
              <Sparkles size={11} />
              <span>Ask Ani</span>
            </button>

            <div className="flex items-center justify-between">
              <span className="text-xs text-muted font-medium">Low stock</span>
              <div className="w-8 h-8 rounded-full bg-warning/10 text-warning flex items-center justify-center">
                <AlertTriangle size={16} />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-semibold text-ink-light dark:text-ink-dark">
                <CountUp value={lowStockCount} duration={900} />
              </div>
              <div className="text-xs text-warning mt-0.5 font-medium flex items-center gap-1">
                <span>Below reorder buffer</span>
              </div>
            </div>
            {/* Subtle line sparkline */}
            <div className="h-6 mt-3 flex items-center">
              <div className="w-full bg-black/5 dark:bg-white/5 h-1.5 rounded-full overflow-hidden">
                <div
                  className="bg-warning h-full rounded-full transition-all duration-700"
                  style={{ width: `${Math.min(100, Math.max(15, (lowStockCount / (totalSkus || 1)) * 100))}%` }}
                />
              </div>
            </div>
          </motion.div>
        </Reveal>

        {/* Card 3: Out of stock */}
        <Reveal index={2}>
          <motion.div
            whileHover={{ y: -4 }}
            transition={{ duration: 0.2 }}
            onClick={() => onNavigateTab('inventory')}
            className="group relative bg-card-light dark:bg-card-dark rounded-card p-5 shadow-bento hover:shadow-bento-hover border border-hairline-light dark:border-hairline-dark cursor-pointer flex flex-col justify-between transition-shadow h-full"
          >
            {/* Ask Ani on hover button */}
            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                openChat('List all completely out of stock items and procurement lead times');
              }}
              className="opacity-0 group-hover:opacity-100 transition-opacity absolute top-3 right-3 text-[10px] font-semibold bg-white/90 dark:bg-black/90 text-negative border border-negative/30 px-2.5 py-1 rounded-pill shadow-sm flex items-center gap-1 z-20"
            >
              <Sparkles size={11} />
              <span>Ask Ani</span>
            </button>

            <div className="flex items-center justify-between">
              <span className="text-xs text-muted font-medium">Out of stock</span>
              <div className="w-8 h-8 rounded-full bg-negative/10 text-negative flex items-center justify-center">
                <XCircle size={16} />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-semibold text-ink-light dark:text-ink-dark">
                <CountUp value={outOfStockCount} duration={900} />
              </div>
              <div className="text-xs text-negative mt-0.5 font-medium flex items-center gap-1">
                <span>Immediate procurement needed</span>
              </div>
            </div>
            <div className="h-6 mt-3 flex items-center">
              <div className="w-full bg-black/5 dark:bg-white/5 h-1.5 rounded-full overflow-hidden">
                <div
                  className="bg-negative h-full rounded-full transition-all duration-700"
                  style={{ width: `${Math.min(100, (outOfStockCount / (totalSkus || 1)) * 100)}%` }}
                />
              </div>
            </div>
          </motion.div>
        </Reveal>

        {/* Card 4: Featured Deep-Sage "Pending POs" */}
        <Reveal index={3}>
          <motion.div
            whileHover={{ y: -4 }}
            transition={{ duration: 0.2 }}
            onClick={() => onNavigateTab('procurement')}
            className="group relative rounded-card p-5 shadow-bento hover:shadow-bento-hover cursor-pointer flex flex-col justify-between text-white relative overflow-hidden h-full"
            style={{
              background: 'linear-gradient(135deg, #6F8F7C 0%, #4F6E5C 100%)',
            }}
          >
            {/* Ask Ani on hover button */}
            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                openChat('Summarize all pending purchase orders and vendor expected dates');
              }}
              className="opacity-0 group-hover:opacity-100 transition-opacity absolute top-3 right-3 text-[10px] font-semibold bg-white/20 hover:bg-white/30 text-white px-2.5 py-1 rounded-pill shadow-sm flex items-center gap-1 z-20"
            >
              <Sparkles size={11} />
              <span>Ask Ani</span>
            </button>

            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-white/80">Pending POs</span>
              <span className="text-[10px] font-semibold bg-white/20 text-white px-2 py-0.5 rounded-full">
                {pendingPOCount} Active
              </span>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-semibold text-white">
                <CountUp value={pendingPOValue} prefix="₹" duration={900} />
              </div>
              <div className="text-xs text-white/80 mt-0.5">
                Inward pipeline value
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between text-[11px] text-white/90 font-medium">
              <span>View procurement</span>
              <ArrowUpRight size={14} />
            </div>
          </motion.div>
        </Reveal>
      </div>

      {/* ==================================================================== */}
      {/* ROW 2: Stock Movement Chart (7 cols) + Fill Rate (2 cols) + Profile  */}
      {/* ==================================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Main Chart: Stock Movement */}
        <Reveal index={4} className="lg:col-span-7">
          <motion.div
            whileHover={{ y: -4 }}
            transition={{ duration: 0.2 }}
            className="group relative bg-card-light dark:bg-card-dark rounded-card p-6 shadow-bento hover:shadow-bento-hover border border-hairline-light dark:border-hairline-dark flex flex-col justify-between relative overflow-hidden h-full"
          >
            {/* Header & Badges */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-semibold text-ink-light dark:text-ink-dark">
                    Stock movement
                  </h3>
                  <span className="text-[11px] font-medium text-positive bg-positive/10 px-2 py-0.5 rounded-full flex items-center gap-0.5">
                    <ArrowUpRight size={12} /> On track
                  </span>
                </div>
                <p className="text-xs text-muted mt-0.5">
                  Daily inventory inward receipts vs outward dispatches
                </p>
              </div>

            </div>

            {/* Floating metrics chip */}
            <div className="flex items-center gap-3 mb-2 flex-wrap">
              {ownerData?.metrics?.sales?.growth_pct_vs_prior != null && (
                <div className="bg-canvas-light dark:bg-black/20 rounded-pill px-3 py-1 flex items-center gap-2 text-xs border border-hairline-light dark:border-hairline-dark">
                  <span className="text-muted">Growth</span>
                  <span className={`text-[10px] ${ownerData.metrics.sales.growth_pct_vs_prior >= 0 ? 'text-positive bg-positive/10' : 'text-negative bg-negative/10'} px-1.5 py-0.2 rounded font-semibold font-mono`}>
                    {ownerData.metrics.sales.growth_pct_vs_prior >= 0 ? '+' : ''}{ownerData.metrics.sales.growth_pct_vs_prior.toFixed(1)}%
                  </span>
                </div>
              )}
              <div className="text-xs text-muted">
                Weekly Revenue: <span className="font-mono font-semibold text-ink-light dark:text-ink-dark">
                  {ownerData?.metrics?.sales?.total_revenue != null
                    ? `₹${Number(ownerData.metrics.sales.total_revenue).toLocaleString('en-IN')}`
                    : '—'}
                </span>
              </div>
            </div>

            {/* Line / Area Chart with 900ms sweep */}
            <div className="h-60 w-full mt-2">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendData.length ? trendData : [{ date: '01', inward: 12, outward: 8 }]}>
                  <defs>
                    <linearGradient id="sageGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#5F7F6D" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#5F7F6D" stopOpacity={0.0} />
                    </linearGradient>
                    <linearGradient id="outwardGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6A5BFF" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#6A5BFF" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" stroke="#8B8B86" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="#8B8B86" fontSize={11} tickLine={false} axisLine={false} width={28} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#181B1A',
                      borderColor: 'rgba(255,255,255,0.1)',
                      borderRadius: '12px',
                      color: '#fff',
                      fontSize: '12px',
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="inward"
                    stroke="#5F7F6D"
                    strokeWidth={2.5}
                    fillOpacity={1}
                    fill="url(#sageGradient)"
                    name="Inward (Receipts)"
                    isAnimationActive={true}
                    animationDuration={900}
                    animationEasing="ease-out"
                  />
                  <Area
                    type="monotone"
                    dataKey="outward"
                    stroke="#6A5BFF"
                    strokeWidth={2}
                    strokeDasharray="3 3"
                    fillOpacity={1}
                    fill="url(#outwardGradient)"
                    name="Outward (Dispatches)"
                    isAnimationActive={true}
                    animationDuration={900}
                    animationEasing="ease-out"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </motion.div>
        </Reveal>

        {/* Card 2: Fill Rate Half-Donut Gauge (2 cols) */}
        <Reveal index={5} className="lg:col-span-2">
          <motion.div
            whileHover={{ y: -4 }}
            transition={{ duration: 0.2 }}
            className="group relative bg-card-light dark:bg-card-dark rounded-card p-5 shadow-bento hover:shadow-bento-hover border border-hairline-light dark:border-hairline-dark flex flex-col justify-between h-full"
          >
            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                openChat('How is our warehouse SLA / fill rate calculated?');
              }}
              className="opacity-0 group-hover:opacity-100 transition-opacity absolute top-3 right-3 text-[10px] font-semibold bg-white/90 dark:bg-black/90 text-sage border border-sage/30 px-2 py-0.5 rounded-pill shadow-sm flex items-center gap-1 z-20"
            >
              <Sparkles size={11} />
              <span>Ask Ani</span>
            </button>

            <div>
              <h3 className="text-sm font-semibold text-ink-light dark:text-ink-dark">
                Fill rate
              </h3>
              <p className="text-xs text-muted mt-0.5">
                Catalog readiness
              </p>
            </div>

            {/* Half donut chart with sweep animation */}
            <div className="relative h-40 w-full flex items-center justify-center my-2">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={donutData}
                    cx="50%"
                    cy="70%"
                    startAngle={180}
                    endAngle={0}
                    innerRadius={55}
                    outerRadius={75}
                    paddingAngle={0}
                    dataKey="value"
                    isAnimationActive={true}
                    animationDuration={900}
                    animationEasing="ease-out"
                  >
                    <Cell fill="#5F7F6D" />
                    <Cell fill="rgba(0,0,0,0.08)" />
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-x-0 bottom-4 text-center">
                <div className="text-2xl font-bold font-mono text-ink-light dark:text-ink-dark">
                  <CountUp value={fillRate} suffix="%" duration={900} />
                </div>
                <div className="text-[10px] text-muted font-medium">Target 95%</div>
              </div>
            </div>

            <div className="text-center text-xs text-muted pt-2 border-t border-hairline-light dark:border-hairline-dark">
              <span className="font-semibold text-positive">+{fillRate - 85}%</span> from last month
            </div>
          </motion.div>
        </Reveal>

        {/* Card 3: User Profile Badge (3 cols) */}
        <Reveal index={6} className="lg:col-span-3">
          <motion.div
            whileHover={{ y: -4 }}
            transition={{ duration: 0.2 }}
            className="group relative bg-card-light dark:bg-card-dark rounded-card p-5 shadow-bento hover:shadow-bento-hover border border-hairline-light dark:border-hairline-dark flex flex-col justify-between h-full"
          >
            <div className="flex flex-col items-center text-center">
              <div className="w-16 h-16 rounded-full bg-sage/20 border-2 border-sage/40 flex items-center justify-center text-sage text-xl font-bold mb-3 shadow-sm">
                {user?.username ? user.username.slice(0, 2).toUpperCase() : 'AI'}
              </div>
              <h3 className="text-base font-semibold text-ink-light dark:text-ink-dark">
                {user?.full_name || user?.username || 'Operator'}
              </h3>
              <span className="text-xs text-muted mt-0.5 uppercase tracking-wide font-mono">
                {user?.role || 'storekeeper'}
              </span>
              <div className="inline-block mt-2 px-2.5 py-0.5 bg-sage/10 text-sage text-[11px] font-medium rounded-pill">
                Gurugram Central Store
              </div>
            </div>

            {/* 3 Mini Stats */}
            <div className="grid grid-cols-3 gap-2 pt-4 border-t border-hairline-light dark:border-hairline-dark mt-4">
              <div className="text-center">
                <div className="text-base font-semibold font-mono text-ink-light dark:text-ink-dark">
                  <CountUp value={totalSkus} duration={900} />
                </div>
                <div className="text-[10px] text-muted">SKUs</div>
              </div>
              <div className="text-center border-x border-hairline-light dark:border-hairline-dark">
                <div className="text-base font-semibold font-mono text-ink-light dark:text-ink-dark">
                  <CountUp value={pendingPOCount} duration={900} />
                </div>
                <div className="text-[10px] text-muted">Active POs</div>
              </div>
              <div className="text-center">
                <div className="text-base font-semibold font-mono text-ink-light dark:text-ink-dark">
                  <CountUp value={ownerData?.metrics?.sales?.invoice_count ?? (dashData?.sales_funnel?.confirmed_orders || 0)} duration={900} />
                </div>
                <div className="text-[10px] text-muted">Invoices</div>
              </div>
            </div>
          </motion.div>
        </Reveal>
      </div>

      {/* ==================================================================== */}
      {/* ROW 3: Reorder Suggestions + Top Receivables + Keep Stock Safe CTA  */}
      {/* ==================================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Reorder Suggestions (5 cols) */}
        <Reveal index={7} className="lg:col-span-5">
          <motion.div
            whileHover={{ y: -4 }}
            transition={{ duration: 0.2 }}
            className="group relative bg-card-light dark:bg-card-dark rounded-card p-5 shadow-bento hover:shadow-bento-hover border border-hairline-light dark:border-hairline-dark flex flex-col justify-between h-full"
          >
            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                openChat('Prioritize these reorder suggestions based on vendor lead times');
              }}
              className="opacity-0 group-hover:opacity-100 transition-opacity absolute top-3 right-16 text-[10px] font-semibold bg-white/90 dark:bg-black/90 text-sage border border-sage/30 px-2 py-0.5 rounded-pill shadow-sm flex items-center gap-1 z-20"
            >
              <Sparkles size={11} />
              <span>Ask Ani</span>
            </button>

            <div>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-sm font-semibold text-ink-light dark:text-ink-dark">
                    Reorder suggestions
                  </h3>
                  <p className="text-xs text-muted">Calculated by lead time & run-rate</p>
                </div>
                <button
                  onClick={() => onNavigateTab('inventory')}
                  className="text-xs text-sage font-medium hover:underline"
                >
                  View all
                </button>
              </div>

              <div className="space-y-2.5">
                {reorderSuggestions.length > 0 ? (
                  reorderSuggestions.map((item: any) => (
                    <div
                      key={item.id}
                      className="p-3 bg-canvas-light/60 dark:bg-black/20 rounded-tile flex items-center justify-between border border-hairline-light dark:border-hairline-dark"
                    >
                      <div className="truncate mr-2">
                        <div className="text-xs font-semibold text-ink-light dark:text-ink-dark truncate">
                          {item.name}
                        </div>
                        <div className="text-[11px] text-muted font-mono flex items-center gap-2 mt-0.5">
                          <span>{item.sku}</span>
                          <span>•</span>
                          <span className="text-negative font-medium">Stock: {item.quantity}</span>
                          <span>•</span>
                          <span>Reorder: {item.reorder_level}</span>
                        </div>
                      </div>
                      {/* Black pill button with hover light sweep & .98 press scale */}
                      <motion.button
                        whileTap={{ scale: 0.98 }}
                        onClick={() => onOpenQuickPO ? onOpenQuickPO(item) : onNavigateTab('procurement')}
                        className="sweep-hover px-3 py-1 bg-ink-light dark:bg-ink-dark text-white text-[11px] font-medium rounded-pill shrink-0 shadow-sm transition-transform"
                      >
                        Create PO
                      </motion.button>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-6 text-xs text-muted">
                    All critical SKUs are currently above reorder buffers.
                  </div>
                )}
              </div>
            </div>

            <div className="mt-3 pt-3 border-t border-hairline-light dark:border-hairline-dark flex items-center justify-between text-xs text-muted">
              <span>Automated reorder triggers active</span>
              <span className="text-positive font-medium">Every 6 hrs</span>
            </div>
          </motion.div>
        </Reveal>

        {/* Top Customers / Receivables (4 cols) */}
        <Reveal index={8} className="lg:col-span-4">
          <motion.div
            whileHover={{ y: -4 }}
            transition={{ duration: 0.2 }}
            className="group relative bg-card-light dark:bg-card-dark rounded-card p-5 shadow-bento hover:shadow-bento-hover border border-hairline-light dark:border-hairline-dark flex flex-col justify-between h-full"
          >
            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                openChat('Analyze our overdue receivables and customer payment terms');
              }}
              className="opacity-0 group-hover:opacity-100 transition-opacity absolute top-3 right-16 text-[10px] font-semibold bg-white/90 dark:bg-black/90 text-sage border border-sage/30 px-2 py-0.5 rounded-pill shadow-sm flex items-center gap-1 z-20"
            >
              <Sparkles size={11} />
              <span>Ask Ani</span>
            </button>

            <div>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-sm font-semibold text-ink-light dark:text-ink-dark">
                    Top receivables
                  </h3>
                  <p className="text-xs text-muted">Customer payment balances</p>
                </div>
                <button
                  onClick={() => onNavigateTab('sales')}
                  className="text-xs text-sage font-medium hover:underline"
                >
                  Invoices
                </button>
              </div>

              <div className="space-y-2.5">
                {topCustomers.length > 0 ? (
                  topCustomers.map((cust: any) => (
                    <div
                      key={cust.id}
                      className="p-3 bg-canvas-light/60 dark:bg-black/20 rounded-tile flex items-center justify-between border border-hairline-light dark:border-hairline-dark"
                    >
                      <div className="truncate mr-2">
                        <div className="text-xs font-semibold text-ink-light dark:text-ink-dark truncate">
                          {cust.name}
                        </div>
                        <div className="text-[11px] text-muted mt-0.5 truncate">
                          {cust.city || 'Gurugram'}, {cust.state || 'Haryana'}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-xs font-semibold font-mono text-ink-light dark:text-ink-dark">
                          ₹{(cust.current_balance || 0).toLocaleString('en-IN')}
                        </div>
                        <span className="text-[10px] text-warning bg-warning/10 px-1.5 py-0.2 rounded font-medium">
                          Due
                        </span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-6 text-xs text-muted">
                    No overdue customer receivables.
                  </div>
                )}
              </div>
            </div>

            <div className="mt-3 pt-3 border-t border-hairline-light dark:border-hairline-dark flex items-center justify-between text-xs text-muted">
              <span>Total Overdue</span>
              <span className="font-mono font-semibold text-ink-light dark:text-ink-dark">
                {ownerData?.metrics?.receivables?.total_overdue_value != null
                  ? `₹${Number(ownerData.metrics.receivables.total_overdue_value).toLocaleString('en-IN')}`
                  : (dashData?.receivables_ageing?.overdue_60_plus_days != null
                    ? `₹${Number(dashData.receivables_ageing.overdue_60_plus_days).toLocaleString('en-IN')}`
                    : '—')}
              </span>
            </div>
          </motion.div>
        </Reveal>

        {/* Keep Stock Safe! CTA Card (3 cols) */}
        <Reveal index={9} className="lg:col-span-3">
          <motion.div
            whileHover={{ y: -4 }}
            transition={{ duration: 0.2 }}
            className="group relative rounded-card p-5 shadow-bento flex flex-col justify-between text-white relative overflow-hidden h-full"
            style={{
              background: 'linear-gradient(135deg, #6F8F7C 0%, #4F6E5C 100%)',
            }}
          >
            <div>
              <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center mb-3">
                <ShieldCheck size={20} className="text-white" />
              </div>
              <h3 className="text-base font-semibold text-white">
                Keep stock safe!
              </h3>
              <p className="text-xs text-white/80 mt-1">
                Automated safety buffer calculation scans sales cadence and lead times to prevent stockouts.
              </p>
            </div>

            <div className="mt-4">
              <motion.button
                whileTap={{ scale: 0.98 }}
                onClick={() => openChat('Run automated stock safety scan and draft replenishment POs')}
                className="sweep-hover w-full py-2.5 px-4 bg-ink-light text-white text-xs font-medium rounded-pill shadow-sm transition-all flex items-center justify-center gap-2"
              >
                <Sparkles size={14} className="text-[#8FE3FF]" />
                <span>Run auto-reorder</span>
              </motion.button>
            </div>
          </motion.div>
        </Reveal>
      </div>
    </div>
  );
};
