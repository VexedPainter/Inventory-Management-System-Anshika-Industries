import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BarChart3,
  TrendingUp,
  Sliders,
  AlertTriangle,
  RefreshCw,
  Search,
  ArrowRight,
  ShieldAlert,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
} from 'recharts';
import { apiFetch } from '../api/client';
import { Skeleton } from '../components/Skeleton';

export const AnalyticsView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'abc-xyz' | 'forecast' | 'what-if'>('abc-xyz');

  // Fetch ABC-XYZ
  const { data: rawAbc, isLoading: abcLoading, refetch: refetchAbc } = useQuery({
    queryKey: ['/api/analytics/abc-xyz'],
    queryFn: () => apiFetch('/api/analytics/abc-xyz'),
    staleTime: 60000,
  });

  const abcList: any[] = rawAbc?.items || (Array.isArray(rawAbc) ? rawAbc : []);

  // What-If State
  const [leadTimeDelta, setLeadTimeDelta] = useState(3);
  const [demandIncreasePct, setDemandIncreasePct] = useState(20);
  const [whatIfResult, setWhatIfResult] = useState<any>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [whatIfError, setWhatIfError] = useState<string | null>(null);

  const handleSimulate = async () => {
    setIsSimulating(true);
    setWhatIfError(null);
    try {
      const res = await apiFetch('/api/analytics/what-if', {
        method: 'POST',
        body: {
          lead_time_delta_days: Number(leadTimeDelta),
          demand_increase_pct: Number(demandIncreasePct),
        },
      });
      setWhatIfResult(res);
    } catch (err: any) {
      setWhatIfError(err.message || 'What-If calculation failed');
      setWhatIfResult(null);
    } finally {
      setIsSimulating(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-ink-light dark:text-ink-dark tracking-tight">
            Warehouse Analytics & Demand Forecasting
          </h2>
          <p className="text-xs text-muted mt-0.5">
            ABC-XYZ Pareto classification, consumption run-rates, and supply chain stress testing
          </p>
        </div>

        <motion.button
          whileTap={{ scale: 0.98 }}
          onClick={() => refetchAbc()}
          className="w-9 h-9 rounded-full bg-card-light dark:bg-card-dark border border-hairline-light dark:border-hairline-dark flex items-center justify-center text-muted hover:text-ink-light"
        >
          <RefreshCw size={14} className={abcLoading ? 'animate-spin' : ''} />
        </motion.button>
      </div>

      {/* Subtab Navigation */}
      <div className="bg-card-light dark:bg-card-dark rounded-card p-4 shadow-bento border border-hairline-light dark:border-hairline-dark flex items-center gap-2">
        <button
          onClick={() => setActiveTab('abc-xyz')}
          className={`px-4 py-2 rounded-pill text-xs font-semibold transition-all ${
            activeTab === 'abc-xyz'
              ? 'bg-ink-light dark:bg-white text-white dark:text-ink-light shadow-sm'
              : 'bg-black/5 dark:bg-white/10 text-muted hover:text-ink-light'
          }`}
        >
          ABC-XYZ Matrix
        </button>

        <button
          onClick={() => setActiveTab('what-if')}
          className={`px-4 py-2 rounded-pill text-xs font-semibold transition-all ${
            activeTab === 'what-if'
              ? 'bg-ink-light dark:bg-white text-white dark:text-ink-light shadow-sm'
              : 'bg-black/5 dark:bg-white/10 text-muted hover:text-ink-light'
          }`}
        >
          Demand What-If Simulator
        </button>
      </div>

      {/* ==================================================================== */}
      {/* 1. ABC-XYZ CLASSIFICATION MATRIX                                     */}
      {/* ==================================================================== */}
      {activeTab === 'abc-xyz' && (
        <div className="space-y-6">
          {/* Matrix Overview Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-card-light dark:bg-card-dark rounded-card p-5 shadow-bento border border-hairline-light dark:border-hairline-dark">
              <span className="text-xs text-muted font-medium">Class AX / AY (Top Spares)</span>
              <div className="text-xl font-bold font-mono text-positive mt-1">
                {rawAbc?.matrix ? `${(rawAbc.matrix.AX || []).length + (rawAbc.matrix.AY || []).length} SKUs` : '—'}
              </div>
              <p className="text-[11px] text-muted mt-1">High revenue value + stable predictable consumption run rate.</p>
            </div>

            <div className="bg-card-light dark:bg-card-dark rounded-card p-5 shadow-bento border border-hairline-light dark:border-hairline-dark">
              <span className="text-xs text-muted font-medium">Class AZ (Critical Risk)</span>
              <div className="text-xl font-bold font-mono text-negative mt-1">
                {rawAbc?.matrix ? `${(rawAbc.matrix.AZ || []).length} SKUs` : '—'}
              </div>
              <p className="text-[11px] text-muted mt-1">High revenue impact + volatile unpredictable factory demand spikes.</p>
            </div>

            <div className="bg-card-light dark:bg-card-dark rounded-card p-5 shadow-bento border border-hairline-light dark:border-hairline-dark">
              <span className="text-xs text-muted font-medium">Class CZ (Long Tail)</span>
              <div className="text-xl font-bold font-mono text-muted mt-1">
                {rawAbc?.matrix ? `${(rawAbc.matrix.CZ || []).length} SKUs` : '—'}
              </div>
              <p className="text-[11px] text-muted mt-1">Low revenue consumption + erratic sporadic demand.</p>
            </div>
          </div>

          {/* Table */}
          <div className="bg-card-light dark:bg-card-dark rounded-card shadow-bento border border-hairline-light dark:border-hairline-dark overflow-hidden">
            <div className="p-4 border-b border-hairline-light dark:border-hairline-dark flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-ink-light dark:text-ink-dark">
                  Pareto Classification Table
                </h3>
                <p className="text-xs text-muted">Ranked by annual consumption spend value and demand volatility coefficient</p>
              </div>
              <span className="text-xs font-mono font-medium text-muted">
                {abcList.length} SKUs analyzed
              </span>
            </div>

            <div className="overflow-x-auto max-h-[560px]">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="sticky top-0 bg-card-light/95 dark:bg-card-dark/95 backdrop-blur-md border-b border-hairline-light dark:border-hairline-dark z-10 text-[11px] font-semibold text-muted uppercase">
                  <tr>
                    <th className="py-3 px-4">SKU</th>
                    <th className="py-3 px-4">Part Description</th>
                    <th className="py-3 px-4 text-center">Matrix Class</th>
                    <th className="py-3 px-4 text-right">Annual Qty Consumed</th>
                    <th className="py-3 px-4 text-right">Annual Spend Value</th>
                    <th className="py-3 px-4 text-right">Cumulative %</th>
                    <th className="py-3 px-4 text-center">Procurement Strategy</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline-light dark:divide-hairline-dark">
                  {abcLoading ? (
                    <tr>
                      <td colSpan={7} className="p-6">
                        <div className="space-y-3">
                          <Skeleton className="h-6 w-full" />
                          <Skeleton className="h-6 w-full" />
                          <Skeleton className="h-6 w-full" />
                        </div>
                      </td>
                    </tr>
                  ) : abcList.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-muted">
                        No ABC-XYZ items classified yet.
                      </td>
                    </tr>
                  ) : (
                    abcList.map((a: any, idx: number) => {
                      const cls = a.matrix_class || `${a.abc || ''}${a.xyz || ''}` || '—';
                      const isHighPriority = cls.startsWith('A');

                      return (
                        <tr key={a.id || idx} className="h-14 hover:bg-black/2 dark:hover:bg-white/2 transition-colors">
                          <td className="py-2 px-4 font-mono font-bold text-sage">
                            {a.sku}
                          </td>
                          <td className="py-2 px-4 font-semibold text-ink-light dark:text-ink-dark">
                            {a.name}
                          </td>
                          <td className="py-2 px-4 text-center">
                            <span
                              className={`font-mono text-xs font-bold px-2.5 py-0.5 rounded-full ${
                                isHighPriority
                                  ? 'bg-positive/10 text-positive border border-positive/20'
                                  : 'bg-sage/10 text-sage'
                              }`}
                            >
                              {cls}
                            </span>
                          </td>
                          <td className="py-2 px-4 text-right font-mono font-semibold">
                            {a.annual_quantity_consumed != null ? `${Number(a.annual_quantity_consumed).toLocaleString('en-IN')} units` : '—'}
                          </td>
                          <td className="py-2 px-4 text-right font-mono font-bold text-ink-light dark:text-ink-dark">
                            {a.annual_consumption_value != null ? `₹${Number(a.annual_consumption_value).toLocaleString('en-IN')}` : '—'}
                          </td>
                          <td className="py-2 px-4 text-right font-mono text-muted">
                            {a.cum_pct != null ? `${a.cum_pct}%` : '—'}
                          </td>
                          <td className="py-2 px-4 text-center text-[11px] text-muted">
                            {isHighPriority ? 'Strict Control & JIT Reorder' : 'Standard Buffer'}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* 2. DEMAND WHAT-IF SIMULATOR                                          */}
      {/* ==================================================================== */}
      {activeTab === 'what-if' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Controls */}
          <div className="bg-card-light dark:bg-card-dark rounded-card p-6 shadow-bento border border-hairline-light dark:border-hairline-dark space-y-5">
            <div>
              <h3 className="text-sm font-semibold text-ink-light dark:text-ink-dark flex items-center gap-1.5">
                <Sliders size={16} className="text-sage" />
                <span>Simulation Parameters</span>
              </h3>
              <p className="text-xs text-muted mt-1">
                Stress-test factory replenishment buffers against supplier lead-time delays and surging automotive demand.
              </p>
            </div>

            <div className="space-y-4 pt-2">
              <div>
                <div className="flex justify-between text-xs font-medium mb-1">
                  <span>Vendor Lead Time Delay:</span>
                  <span className="font-mono text-sage font-bold">+{leadTimeDelta} Days</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="14"
                  value={leadTimeDelta}
                  onChange={(e) => setLeadTimeDelta(Number(e.target.value))}
                  className="w-full accent-sage cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs font-medium mb-1">
                  <span>Demand Increase Surge:</span>
                  <span className="font-mono text-sage font-bold">+{demandIncreasePct}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={demandIncreasePct}
                  onChange={(e) => setDemandIncreasePct(Number(e.target.value))}
                  className="w-full accent-sage cursor-pointer"
                />
              </div>

              <motion.button
                whileTap={{ scale: 0.98 }}
                onClick={handleSimulate}
                disabled={isSimulating}
                className="w-full py-2.5 bg-ink-light dark:bg-white text-white dark:text-ink-light rounded-pill text-xs font-semibold shadow-bento sweep-hover flex items-center justify-center gap-2 mt-4"
              >
                <span>{isSimulating ? 'Simulating...' : 'Run What-If Scenario'}</span>
                <ArrowRight size={13} />
              </motion.button>
            </div>
          </div>

          {/* Results Output */}
          <div className="lg:col-span-2 bg-card-light dark:bg-card-dark rounded-card p-6 shadow-bento border border-hairline-light dark:border-hairline-dark flex flex-col justify-between">
            {whatIfError ? (
              <div className="p-4 rounded-tile bg-negative/10 border border-negative/20 text-negative text-xs">
                {whatIfError}
              </div>
            ) : whatIfResult ? (
              <div className="space-y-5">
                <div className="flex items-center gap-2 text-warning">
                  <AlertTriangle size={18} />
                  <h4 className="text-sm font-bold text-ink-light dark:text-ink-dark">
                    Scenario Impact Assessment
                  </h4>
                </div>

                <p className="text-xs text-muted leading-relaxed">
                  {whatIfResult.impact_summary || whatIfResult.summary || 'Simulation completed.'}
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
                  <div className="p-4 rounded-tile bg-canvas-light/60 dark:bg-black/20 border border-hairline-light dark:border-hairline-dark">
                    <span className="text-[11px] text-muted block">Recommended Buffer Increase</span>
                    <span className="text-lg font-bold font-mono text-positive mt-1 block">
                      {whatIfResult.recommended_buffer_increase_pct != null ? `+${whatIfResult.recommended_buffer_increase_pct}%` : '—'}
                    </span>
                  </div>

                  <div className="p-4 rounded-tile bg-canvas-light/60 dark:bg-black/20 border border-hairline-light dark:border-hairline-dark">
                    <span className="text-[11px] text-muted block">SKUs at Stockout Risk</span>
                    <span className="text-lg font-bold font-mono text-negative mt-1 block">
                      {whatIfResult.at_risk_skus_count != null ? `${whatIfResult.at_risk_skus_count} Parts` : '—'}
                    </span>
                  </div>

                  <div className="p-4 rounded-tile bg-canvas-light/60 dark:bg-black/20 border border-hairline-light dark:border-hairline-dark">
                    <span className="text-[11px] text-muted block">Est. Working Capital Impact</span>
                    <span className="text-lg font-bold font-mono text-sage mt-1 block">
                      {whatIfResult.estimated_capital_requirement != null ? `₹${Number(whatIfResult.estimated_capital_requirement).toLocaleString('en-IN')}` : '—'}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center py-16 text-center text-muted">
                <Sliders size={32} className="opacity-40 mb-2" />
                <p className="text-xs font-semibold">Select parameters and click "Run What-If Scenario"</p>
                <p className="text-[11px] max-w-xs mt-1">Calculates safety stock buffer changes against real catalog lead times.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
