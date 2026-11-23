import React, { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Calculator, TrendingUp, DollarSign, Award, ArrowUpRight, CheckCircle2, AlertCircle } from 'lucide-react';
import { apiFetch } from '../api/client';
import { CountUp } from '../components/CountUp';
import { Skeleton } from '../components/Skeleton';

export const BusinessImpactView: React.FC = () => {
  const [activeSubtab, setActiveSubtab] = useState<'roi' | 'pilot' | 'pricing'>('roi');

  // ROI Calculator state (POST only on submit)
  const [annualRevenue, setAnnualRevenue] = useState<string>('');
  const [avgInventory, setAvgInventory] = useState<string>('');
  const [carryingCostPct, setCarryingCostPct] = useState<string>('20');
  const [stockoutRatePct, setStockoutRatePct] = useState<string>('3.5');
  const [roiResult, setRoiResult] = useState<any>(null);
  const [roiError, setRoiError] = useState<string | null>(null);

  const roiMutation = useMutation({
    mutationFn: async (payload: any) => {
      return await apiFetch('/api/business-impact/roi-calculator', {
        method: 'POST',
        body: payload,
      });
    },
    onSuccess: (data) => {
      setRoiResult(data);
      setRoiError(null);
    },
    onError: (err: any) => {
      setRoiError(err.message || 'Failed to calculate ROI');
    },
  });

  const handleRoiSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!annualRevenue || !avgInventory) {
      setRoiError('Please enter Annual Revenue and Average Inventory Value.');
      return;
    }
    roiMutation.mutate({
      inputs: {
        annual_revenue: Number(annualRevenue),
        average_inventory_value: Number(avgInventory),
        holding_cost_percentage: Number(carryingCostPct),
        estimated_stockout_loss_percentage: Number(stockoutRatePct),
      },
    });
  };

  // Pilot Tracker KPIs
  const { data: pilotKPIs, isLoading: kpisLoading } = useQuery({
    queryKey: ['pilot-kpis'],
    queryFn: () => apiFetch('/api/business-impact/pilot-kpis'),
  });

  // Pricing plans
  const { data: pricingData, isLoading: pricingLoading } = useQuery({
    queryKey: ['pricing-plans'],
    queryFn: () => apiFetch('/api/business-impact/pricing-plans'),
  });

  const kpiList: any[] = Array.isArray(pilotKPIs) ? pilotKPIs : (pilotKPIs as any)?.kpis || [];
  const planList: any[] = Array.isArray(pricingData) ? pricingData : (pricingData as any)?.plans || [];

  return (
    <div className="space-y-6">
      {/* Subtab Bar */}
      <div className="flex items-center gap-2 border-b border-hairline-light dark:border-hairline-dark pb-3">
        <button
          onClick={() => setActiveSubtab('roi')}
          className={`px-4 py-1.5 rounded-pill text-xs font-semibold transition-all ${
            activeSubtab === 'roi'
              ? 'bg-ink-light dark:bg-ink-dark text-white'
              : 'text-muted hover:text-ink-light dark:hover:text-ink-dark'
          }`}
        >
          ROI Calculator
        </button>
        <button
          onClick={() => setActiveSubtab('pilot')}
          className={`px-4 py-1.5 rounded-pill text-xs font-semibold transition-all ${
            activeSubtab === 'pilot'
              ? 'bg-ink-light dark:bg-ink-dark text-white'
              : 'text-muted hover:text-ink-light dark:hover:text-ink-dark'
          }`}
        >
          Pilot KPI Tracker
        </button>
        <button
          onClick={() => setActiveSubtab('pricing')}
          className={`px-4 py-1.5 rounded-pill text-xs font-semibold transition-all ${
            activeSubtab === 'pricing'
              ? 'bg-ink-light dark:bg-ink-dark text-white'
              : 'text-muted hover:text-ink-light dark:hover:text-ink-dark'
          }`}
        >
          Subscription & Unit Economics
        </button>
      </div>

      {/* Tab 1: ROI Calculator */}
      {activeSubtab === 'roi' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Inputs Form (No prefilled invented numbers) */}
          <div className="lg:col-span-1 bg-card-light dark:bg-card-dark rounded-card p-6 shadow-bento border border-hairline-light dark:border-hairline-dark space-y-4">
            <h3 className="text-sm font-semibold text-ink-light dark:text-ink-dark flex items-center gap-1.5">
              <Calculator size={16} className="text-sage" />
              <span>Financial Inputs</span>
            </h3>
            <p className="text-xs text-muted">
              Enter Anishka's real numbers to calculate working capital savings and downtime prevention.
            </p>

            {roiError && (
              <div className="p-3 bg-negative/10 border border-negative/20 text-negative text-xs rounded-xl flex items-center gap-2">
                <AlertCircle size={14} className="flex-shrink-0" />
                <span>{roiError}</span>
              </div>
            )}

            <form onSubmit={handleRoiSubmit} className="space-y-3 pt-1 text-xs">
              <div>
                <label className="block text-muted mb-1 font-medium">Annual Revenue (₹)</label>
                <input
                  type="number"
                  placeholder="e.g. 50000000"
                  value={annualRevenue}
                  onChange={(e) => setAnnualRevenue(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-hairline-light dark:border-hairline-dark bg-transparent font-mono text-sm focus:outline-none focus:ring-2 focus:ring-sage"
                />
              </div>

              <div>
                <label className="block text-muted mb-1 font-medium">Average Inventory Holding (₹)</label>
                <input
                  type="number"
                  placeholder="e.g. 12000000"
                  value={avgInventory}
                  onChange={(e) => setAvgInventory(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-hairline-light dark:border-hairline-dark bg-transparent font-mono text-sm focus:outline-none focus:ring-2 focus:ring-sage"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-muted mb-1 font-medium">Carrying Cost %</label>
                  <input
                    type="number"
                    value={carryingCostPct}
                    onChange={(e) => setCarryingCostPct(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-hairline-light dark:border-hairline-dark bg-transparent font-mono text-sm focus:outline-none focus:ring-2 focus:ring-sage"
                  />
                </div>
                <div>
                  <label className="block text-muted mb-1 font-medium">Stockout Loss %</label>
                  <input
                    type="number"
                    step="0.1"
                    value={stockoutRatePct}
                    onChange={(e) => setStockoutRatePct(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-hairline-light dark:border-hairline-dark bg-transparent font-mono text-sm focus:outline-none focus:ring-2 focus:ring-sage"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={roiMutation.isPending}
                className="w-full py-2.5 bg-ink-light dark:bg-white text-white dark:text-ink-light rounded-pill text-xs font-semibold shadow-bento sweep-hover mt-3"
              >
                {roiMutation.isPending ? 'Calculating...' : 'Calculate Real ROI'}
              </button>
            </form>
          </div>

          {/* Results Output */}
          <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
            {roiResult ? (
              <>
                <div className="bg-card-light dark:bg-card-dark rounded-card p-6 shadow-bento border border-hairline-light dark:border-hairline-dark flex flex-col justify-between">
                  <div>
                    <span className="text-xs text-muted font-medium">Annual Working Capital Unlocked</span>
                    <div className="text-3xl font-bold font-mono text-sage mt-2">
                      <CountUp value={roiResult.annual_capital_released || roiResult.working_capital_released || 0} prefix="₹" />
                    </div>
                  </div>
                  <p className="text-xs text-muted mt-4">
                    Released through dead-stock liquidation and dynamic reorder level reduction.
                  </p>
                </div>

                <div className="bg-card-light dark:bg-card-dark rounded-card p-6 shadow-bento border border-hairline-light dark:border-hairline-dark flex flex-col justify-between">
                  <div>
                    <span className="text-xs text-muted font-medium">Revenue Protected / Year</span>
                    <div className="text-3xl font-bold font-mono text-ink-light dark:text-ink-dark mt-2">
                      <CountUp value={roiResult.revenue_protected || roiResult.stockout_loss_prevented || 0} prefix="₹" />
                    </div>
                  </div>
                  <p className="text-xs text-muted mt-4">
                    Saved by preventing automotive production downtime and robotic spares stockouts.
                  </p>
                </div>
              </>
            ) : (
              <div className="sm:col-span-2 bg-card-light dark:bg-card-dark rounded-card p-12 shadow-bento border border-hairline-light dark:border-hairline-dark flex flex-col items-center justify-center text-center text-muted">
                <Calculator size={36} className="opacity-40 mb-3" />
                <h4 className="text-sm font-semibold text-ink-light dark:text-ink-dark">
                  Enter Anishka's real numbers
                </h4>
                <p className="text-xs max-w-sm mt-1">
                  Fill in the warehouse parameters on the left and submit to view live working capital and payback calculations.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 2: Pilot KPI Tracker */}
      {activeSubtab === 'pilot' && (
        <div className="bg-card-light dark:bg-card-dark rounded-card p-6 shadow-bento border border-hairline-light dark:border-hairline-dark">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-base font-semibold text-ink-light dark:text-ink-dark">
                Operational Pilot Tracker (Before vs. After)
              </h3>
              <p className="text-xs text-muted">Audited measurements across key supply chain milestones</p>
            </div>
            {kpiList.length > 0 && (
              <span className="text-xs font-semibold px-2.5 py-1 bg-positive/10 text-positive rounded-pill">
                {kpiList.length} Live Metrics Tracked
              </span>
            )}
          </div>

          {kpisLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Skeleton className="h-28 rounded-tile" />
              <Skeleton className="h-28 rounded-tile" />
            </div>
          ) : kpiList.length === 0 ? (
            <div className="py-12 text-center text-muted">
              <p className="text-xs font-semibold">Enter Anishka's real numbers</p>
              <p className="text-[11px] mt-1">No pilot KPI readings recorded in database yet.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {kpiList.map((kpi: any, idx: number) => (
                <div
                  key={kpi.id || idx}
                  className="p-4 bg-canvas-light/60 dark:bg-black/20 rounded-tile border border-hairline-light dark:border-hairline-dark flex flex-col justify-between"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-ink-light dark:text-ink-dark">{kpi.kpi_name || kpi.name}</span>
                    <span className="text-[11px] font-bold text-positive bg-positive/10 px-2 py-0.5 rounded-full">
                      {kpi.delta_pct != null ? `${kpi.delta_pct > 0 ? '+' : ''}${kpi.delta_pct}%` : '—'}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-hairline-light dark:border-hairline-dark text-xs">
                    <div>
                      <span className="text-muted text-[10px] block">Baseline</span>
                      <span className="font-mono text-muted">{kpi.baseline_value != null ? `${kpi.baseline_value} ${kpi.unit || ''}` : '—'}</span>
                    </div>
                    <div>
                      <span className="text-muted text-[10px] block">Measured</span>
                      <span className="font-mono font-bold text-ink-light dark:text-ink-dark">{kpi.measured_value != null ? `${kpi.measured_value} ${kpi.unit || ''}` : '—'}</span>
                    </div>
                    <div>
                      <span className="text-muted text-[10px] block">Target</span>
                      <span className="font-mono text-sage">{kpi.target_value != null ? `${kpi.target_value} ${kpi.unit || ''}` : '—'}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Subscription & Unit Economics */}
      {activeSubtab === 'pricing' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {pricingLoading ? (
            <>
              <Skeleton className="h-64 rounded-card" />
              <Skeleton className="h-64 rounded-card" />
              <Skeleton className="h-64 rounded-card" />
            </>
          ) : planList.length === 0 ? (
            <div className="md:col-span-3 py-12 text-center text-muted">
              <p className="text-xs font-semibold">Enter Anishka's real numbers</p>
              <p className="text-[11px] mt-1">No subscription tiers configured in database.</p>
            </div>
          ) : (
            planList.map((p: any, idx: number) => (
              <div
                key={p.id || idx}
                className={`rounded-card p-6 shadow-bento border flex flex-col justify-between ${
                  p.highlight
                    ? 'bg-sage-dark text-white border-sage'
                    : 'bg-card-light dark:bg-card-dark text-ink-light dark:text-ink-dark border-hairline-light dark:border-hairline-dark'
                }`}
              >
                <div>
                  {p.badge && (
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${p.highlight ? 'bg-white/20 text-white' : 'bg-black/5 dark:bg-white/10 text-muted'}`}>
                      {p.badge}
                    </span>
                  )}
                  <h3 className="text-lg font-bold mt-2">{p.name}</h3>
                  <div className="text-2xl font-bold font-mono mt-1">{p.price}</div>
                  <div className={`mt-4 space-y-2 text-xs ${p.highlight ? 'text-white/80' : 'text-muted'}`}>
                    {Array.isArray(p.features) && p.features.map((feat: string, fIdx: number) => (
                      <div key={fIdx} className="flex items-center gap-2">
                        <CheckCircle2 size={14} className={p.highlight ? 'text-white' : 'text-sage'} />
                        <span>{feat}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <button
                  className={`mt-6 w-full py-2 rounded-pill text-xs font-semibold transition-all ${
                    p.highlight
                      ? 'bg-white text-ink-light hover:bg-white/90'
                      : 'bg-ink-light dark:bg-ink-dark text-white hover:opacity-90'
                  }`}
                >
                  Select Tier
                </button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};
