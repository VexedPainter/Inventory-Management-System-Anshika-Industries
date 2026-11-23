import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Settings,
  RefreshCw,
  Cpu,
  Play,
  Square,
  RotateCcw,
  ShieldAlert,
  CheckCircle2,
  Sliders,
  Database,
  Download,
  AlertCircle,
  Activity,
  Layers,
  Sparkles
} from 'lucide-react';
import { apiFetch } from '../api/client';
import { useAuth } from '../context/AuthContext';

export const SettingsView: React.FC = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const isManagerOrAdmin = user?.role === 'admin' || user?.role === 'manager';

  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  // 1. Automation Settings Query
  const { data: autoSettings, refetch: refetchAuto } = useQuery({
    queryKey: ['settings-automation'],
    queryFn: async () => {
      return await apiFetch('/api/settings/automation');
    },
  });

  // 2. Service Level Query
  const { data: serviceLevel, refetch: refetchSL } = useQuery({
    queryKey: ['settings-service-level'],
    queryFn: async () => {
      return await apiFetch('/api/settings/service-level');
    },
  });

  // 3. Simulator Status Query
  const { data: simStatus, refetch: refetchSim } = useQuery({
    queryKey: ['simulator-status'],
    queryFn: async () => {
      return await apiFetch('/api/simulator/status');
    },
  });

  // 4. AI Engine Health Query
  const { data: aiHealth, refetch: refetchAiHealth, isFetching: isFetchingAiHealth } = useQuery({
    queryKey: ['settings-ai-health'],
    queryFn: async () => {
      return await apiFetch('/api/ai/health');
    },
    staleTime: 15000,
  });

  // Automation update mutation
  const updateAutoMutation = useMutation({
    mutationFn: async (payload: any) => {
      return await apiFetch('/api/settings/automation', {
        method: 'PUT',
        body: payload,
      });
    },
    onSuccess: () => {
      refetchAuto();
      showToast('Automation parameters updated successfully.');
    },
    onError: (err: any) => {
      showToast(err.message || 'Failed to update automation parameters');
    },
  });

  // Run cycle now mutation
  const runNowMutation = useMutation({
    mutationFn: async () => {
      return await apiFetch('/api/automation/run-now', { method: 'POST' });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries();
      showToast(`Automation cycle completed: ${data?.scanned || 0} items analyzed.`);
    },
    onError: (err: any) => {
      showToast(err.message || 'Failed to trigger automation cycle');
    },
  });

  // Service level update mutation
  const updateSLMutation = useMutation({
    mutationFn: async (val: string) => {
      return await apiFetch('/api/settings/service-level', {
        method: 'POST',
        body: { service_level: val },
      });
    },
    onSuccess: () => {
      refetchSL();
      showToast('Service level target updated.');
    },
  });

  // Simulator toggle mutation
  const toggleSimMutation = useMutation({
    mutationFn: async () => {
      return await apiFetch('/api/simulator/toggle', { method: 'POST' });
    },
    onSuccess: () => {
      refetchSim();
      showToast('Simulator toggled.');
    },
  });

  // Demo reset mutation
  const resetDemoMutation = useMutation({
    mutationFn: async () => {
      return await apiFetch('/api/demo/reset', { method: 'POST' });
    },
    onSuccess: () => {
      queryClient.clear();
      queryClient.refetchQueries();
      showToast('Database reset to fresh baseline.');
    },
    onError: (err: any) => {
      showToast(err.message || 'Demo reset failed');
    },
  });

  // Hard Refresh Handler
  const handleHardRefresh = () => {
    queryClient.clear();
    sessionStorage.removeItem('last_tab');
    queryClient.refetchQueries();
    showToast('Hard refreshed: In-memory cache cleared and live endpoints re-synced.');
  };

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Toast Notification */}
      {toast && (
        <div className="fixed top-20 right-8 z-50 p-4 rounded-2xl bg-ink text-white dark:bg-white dark:text-ink shadow-2xl flex items-center gap-3 border border-black/10 dark:border-white/10 text-sm">
          <CheckCircle2 className="w-4 h-4 text-[#5F7F6D]" />
          {toast}
        </div>
      )}

      {/* Header bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink dark:text-white">
            System Settings & Operations
          </h1>
          <p className="text-sm text-muted dark:text-gray-400 mt-1">
            Configure automated replenishment triggers, simulator controls, and service-level targets.
          </p>
        </div>

        <button
          onClick={handleHardRefresh}
          className="sweep-hover inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-ink text-white dark:bg-white dark:text-ink text-sm font-medium hover:scale-[0.98] transition-transform shadow-sm"
        >
          <RefreshCw className="w-4 h-4" />
          Hard Refresh App
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* 1. Automation Engine Card */}
        <div className="bg-white dark:bg-[#181B1A] rounded-3xl p-6 border border-black/5 dark:border-white/5 shadow-sm space-y-5">
          <div className="flex items-center justify-between border-b border-black/5 dark:border-white/5 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-[#5F7F6D]/15 flex items-center justify-center text-[#5F7F6D]">
                <Cpu className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-ink dark:text-white">Autopilot & Replenishment</h3>
                <p className="text-xs text-muted">Continuous background safety stock evaluation</p>
              </div>
            </div>

            {isManagerOrAdmin && (
              <button
                onClick={() => runNowMutation.mutate()}
                disabled={runNowMutation.isPending}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-[#5F7F6D]/15 text-[#5F7F6D] hover:bg-[#5F7F6D]/25 transition-colors"
              >
                <Play className="w-3.5 h-3.5" />
                {runNowMutation.isPending ? 'Running...' : 'Run Now'}
              </button>
            )}
          </div>

          <div className="space-y-4 text-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-ink dark:text-white">Auto-Reorder Engine</p>
                <p className="text-xs text-muted">Automatically draft purchase orders for LOW/OUT stock</p>
              </div>
              <input
                type="checkbox"
                disabled={!isManagerOrAdmin}
                checked={autoSettings?.auto_reorder_enabled ?? true}
                onChange={(e) =>
                  updateAutoMutation.mutate({ auto_reorder_enabled: e.target.checked })
                }
                className="w-5 h-5 accent-[#5F7F6D] rounded cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-ink dark:text-white">Smart EOQ Calculation</p>
                <p className="text-xs text-muted">Use lead-time variability and safety stock formulas</p>
              </div>
              <input
                type="checkbox"
                disabled={!isManagerOrAdmin}
                checked={autoSettings?.smart_qty_enabled ?? true}
                onChange={(e) =>
                  updateAutoMutation.mutate({ smart_qty_enabled: e.target.checked })
                }
                className="w-5 h-5 accent-[#5F7F6D] rounded cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-ink dark:text-white">Manager Auto-Approval</p>
                <p className="text-xs text-muted">Approve POs under limit for 4.0+ rated vendors</p>
              </div>
              <input
                type="checkbox"
                disabled={!isManagerOrAdmin}
                checked={autoSettings?.auto_approve_enabled ?? false}
                onChange={(e) =>
                  updateAutoMutation.mutate({ auto_approve_enabled: e.target.checked })
                }
                className="w-5 h-5 accent-[#5F7F6D] rounded cursor-pointer"
              />
            </div>

            <div className="pt-2 border-t border-black/5 dark:border-white/5 flex items-center justify-between">
              <span className="text-xs text-muted">Scan Interval</span>
              <span className="text-xs font-mono font-bold text-ink dark:text-white">
                Every {autoSettings?.scan_interval_minutes || 5} min
              </span>
            </div>
          </div>
        </div>

        {/* 2. Service Level & Safety Buffer */}
        <div className="bg-white dark:bg-[#181B1A] rounded-3xl p-6 border border-black/5 dark:border-white/5 shadow-sm space-y-5">
          <div className="flex items-center gap-3 border-b border-black/5 dark:border-white/5 pb-4">
            <div className="w-10 h-10 rounded-2xl bg-blue-500/10 flex items-center justify-center text-blue-600">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-ink dark:text-white">Target Service Level</h3>
              <p className="text-xs text-muted">Statistical non-stockout probability</p>
            </div>
          </div>

          <div className="space-y-4">
            <p className="text-xs text-muted">
              Higher service levels increase safety stock holding requirements to prevent stockouts during demand spikes.
            </p>

            <div className="grid grid-cols-3 gap-3">
              {['90%', '95%', '98%'].map((lvl) => {
                const active = (serviceLevel?.service_level || '95%') === lvl;
                return (
                  <button
                    key={lvl}
                    disabled={!isManagerOrAdmin}
                    onClick={() => updateSLMutation.mutate(lvl)}
                    className={`py-3 px-4 rounded-2xl border text-center transition-all ${
                      active
                        ? 'border-[#5F7F6D] bg-[#5F7F6D]/15 text-[#5F7F6D] font-bold shadow-sm'
                        : 'border-black/10 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/5 text-ink dark:text-white'
                    }`}
                  >
                    <div className="text-lg font-mono">{lvl}</div>
                    <div className="text-[10px] text-muted">
                      {lvl === '90%' ? 'Lean (1.28σ)' : lvl === '95%' ? 'Standard (1.65σ)' : 'Critical (2.05σ)'}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="pt-2 text-xs text-muted flex items-center justify-between">
              <span>Safety Stock Method</span>
              <span className="font-semibold text-ink dark:text-white">
                {serviceLevel?.safety_stock_method || 'lead_time_demand'}
              </span>
            </div>
          </div>
        </div>

        {/* 3. Live Factory Simulator */}
        <div className="bg-white dark:bg-[#181B1A] rounded-3xl p-6 border border-black/5 dark:border-white/5 shadow-sm space-y-5">
          <div className="flex items-center justify-between border-b border-black/5 dark:border-white/5 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-500/10 flex items-center justify-center text-amber-600">
                <Activity className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-ink dark:text-white">Welding Spares Simulator</h3>
                <p className="text-xs text-muted">Simulates live consumption & receipt events</p>
              </div>
            </div>

            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${
                simStatus?.simulator_running
                  ? 'bg-[#3E8E63]/10 text-[#3E8E63]'
                  : 'bg-black/5 dark:bg-white/10 text-muted'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  simStatus?.simulator_running ? 'bg-[#3E8E63] animate-pulse' : 'bg-muted'
                }`}
              />
              {simStatus?.simulator_running ? 'Active (Live)' : 'Paused'}
            </span>
          </div>

          <p className="text-xs text-muted">
            When enabled, the background engine generates periodic robotic line consumable issues and vendor deliveries every 6-12 seconds.
          </p>

          {isManagerOrAdmin && (
            <button
              onClick={() => toggleSimMutation.mutate()}
              className={`w-full py-2.5 rounded-full text-sm font-semibold transition-all ${
                simStatus?.simulator_running
                  ? 'bg-amber-500/15 text-amber-600 hover:bg-amber-500/25'
                  : 'bg-ink text-white dark:bg-white dark:text-ink sweep-hover'
              }`}
            >
              {simStatus?.simulator_running ? 'Pause Simulator' : 'Start Live Simulator'}
            </button>
          )}
        </div>

        {/* 4. Data Operations & Maintenance */}
        <div className="bg-white dark:bg-[#181B1A] rounded-3xl p-6 border border-black/5 dark:border-white/5 shadow-sm space-y-5">
          <div className="flex items-center gap-3 border-b border-black/5 dark:border-white/5 pb-4">
            <div className="w-10 h-10 rounded-2xl bg-purple-500/10 flex items-center justify-center text-purple-600">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-ink dark:text-white">Data Governance & Backups</h3>
              <p className="text-xs text-muted">Export data dumps and reset demo state</p>
            </div>
          </div>

          <div className="space-y-3">
            <a
              href="/api/inventory/export?format=csv&type=full"
              download
              className="w-full flex items-center justify-between p-3 rounded-2xl border border-black/10 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/5 text-sm transition-colors"
            >
              <span className="font-medium text-ink dark:text-white">Export Full Inventory CSV</span>
              <Download className="w-4 h-4 text-muted" />
            </a>

            {isAdmin && (
              <div className="pt-2">
                <button
                  onClick={() => {
                    if (
                      window.confirm(
                        'WARNING: This will reset the database to baseline demo records (62 SKUs, 14 suppliers, recent invoices). Proceed?'
                      )
                    ) {
                      resetDemoMutation.mutate();
                    }
                  }}
                  className="w-full py-2.5 rounded-full border border-red-500/30 text-red-600 dark:text-red-400 hover:bg-red-500/10 text-xs font-semibold transition-colors flex items-center justify-center gap-2"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Reset Database to Clean Demo Baseline
                </button>
              </div>
            )}
          </div>
        </div>

        {/* 5. AI Engine & Copilot Health */}
        <div className="bg-white dark:bg-[#181B1A] rounded-3xl p-6 border border-black/5 dark:border-white/5 shadow-sm space-y-5 md:col-span-2">
          <div className="flex items-center justify-between border-b border-black/5 dark:border-white/5 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-600">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-ink dark:text-white">AI Copilot System Health</h3>
                <p className="text-xs text-muted">Groq LLM connectivity & tool agent diagnostics</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <span
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${
                  aiHealth?.status === 'connected'
                    ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20'
                    : 'bg-amber-500/10 text-amber-600 border border-amber-500/20'
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    aiHealth?.status === 'connected' ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
                  }`}
                />
                {aiHealth?.status === 'connected' ? 'Connected (Live AI)' : 'Offline (Rule-based)'}
              </span>

              <button
                onClick={() => refetchAiHealth()}
                disabled={isFetchingAiHealth}
                className="p-1.5 rounded-full hover:bg-black/5 dark:hover:bg-white/5 text-muted hover:text-ink dark:hover:text-white transition-colors"
                title="Test AI Connectivity"
              >
                <RefreshCw className={`w-4 h-4 ${isFetchingAiHealth ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div className="p-3 rounded-2xl bg-black/5 dark:bg-white/5 space-y-1">
              <span className="text-muted">Configured Model</span>
              <p className="font-mono font-semibold text-ink dark:text-white truncate">
                {aiHealth?.configured_model || 'llama-3.3-70b-versatile'}
              </p>
            </div>
            <div className="p-3 rounded-2xl bg-black/5 dark:bg-white/5 space-y-1">
              <span className="text-muted">Model Validation</span>
              <p className={`font-semibold ${aiHealth?.is_model_valid ? 'text-positive' : 'text-amber-500'}`}>
                {aiHealth?.is_model_valid ? 'Verified on Provider' : 'Local Fallback'}
              </p>
            </div>
            <div className="p-3 rounded-2xl bg-black/5 dark:bg-white/5 space-y-1">
              <span className="text-muted">Operational State</span>
              <p className="font-semibold text-ink dark:text-white truncate">
                {aiHealth?.status === 'connected' ? 'Live Tool-Calling Enabled' : 'Intelligent Rule Engine'}
              </p>
            </div>
          </div>

          <div className="pt-1">
            <p className="text-xs text-muted">
              {aiHealth?.message || aiHealth?.error_detail || 'Grounded inventory agent operational.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
