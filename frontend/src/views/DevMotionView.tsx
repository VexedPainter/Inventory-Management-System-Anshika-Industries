import React, { useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  RefreshCw,
  Plus,
  Trash2,
  X,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  XAxis,
  Tooltip,
} from 'recharts';
import { CountUp } from '../components/CountUp';
import { Skeleton } from '../components/Skeleton';
import { Reveal, CUBIC_EASE_OUT } from '../components/Reveal';
import { OrbExpression } from '../components/AiOrb';

const SAMPLE_CHART_DATA = [
  { day: 'Mon', inward: 40, outward: 24 },
  { day: 'Tue', inward: 30, outward: 18 },
  { day: 'Wed', inward: 65, outward: 42 },
  { day: 'Thu', inward: 45, outward: 35 },
  { day: 'Fri', inward: 80, outward: 60 },
  { day: 'Sat', inward: 55, outward: 48 },
  { day: 'Sun', inward: 90, outward: 70 },
];

const GAUGE_DATA = [
  { name: 'Active', value: 78, color: '#5F7F6D' },
  { name: 'Remaining', value: 22, color: 'rgba(0,0,0,0.06)' },
];

export const DevMotionView: React.FC = () => {
  const shouldReduceMotion = useReducedMotion();

  // AniOrb Showcase state
  const [orbDemoExpr, setOrbDemoExpr] = useState<OrbExpression>('idle');
  const [orbDemoSpeech, setOrbDemoSpeech] = useState<string | null>("I'm Ani, your inventory AI.");
  const [orbDemoSize, setOrbDemoSize] = useState<number>(56);

  // Pattern 1: Skeleton to Reveal simulation
  const [isSimulatingRoute, setIsSimulatingRoute] = useState(false);
  const [showDemoSkeletons, setShowDemoSkeletons] = useState(false);

  const triggerRouteSim = () => {
    setIsSimulatingRoute(true);
    setShowDemoSkeletons(true);
    setTimeout(() => {
      setShowDemoSkeletons(false);
      setIsSimulatingRoute(false);
    }, 600); // >= 450ms
  };

  // Pattern 2: Count-up trigger key
  const [countKey, setCountKey] = useState(0);

  // Pattern 3: Charts replay key
  const [chartKey, setChartKey] = useState(0);

  // Pattern 4: List items for stagger & collapse
  const [listItems, setListItems] = useState([
    { id: '1', sku: 'MIG-NZ-CON24', name: 'Gas Nozzle Conical 24KD', qty: 240, status: 'OPTIMAL' },
    { id: '2', sku: 'ROB-SN-45', name: 'Robotic Swan Neck 45°', qty: 12, status: 'LOW' },
    { id: '3', sku: 'WIR-MIG-70S-12', name: 'MIG Wire ER70S-6 1.2mm Spool', qty: 185, status: 'OPTIMAL' },
    { id: '4', sku: 'TIG-TE-WT20-24', name: 'Tungsten Electrode 2.4mm Red', qty: 450, status: 'OPTIMAL' },
  ]);

  const removeRow = (id: string) => {
    setListItems(prev => prev.filter(item => item.id !== id));
  };

  const addRow = () => {
    const nextId = String(Date.now());
    setListItems(prev => [
      ...prev,
      {
        id: nextId,
        sku: `AUTO-${nextId.slice(-4)}`,
        name: `Automated Consumable Kit #${nextId.slice(-3)}`,
        qty: Math.floor(Math.random() * 200) + 20,
        status: 'OPTIMAL',
      },
    ]);
  };

  const resetRows = () => {
    setListItems([
      { id: '1', sku: 'MIG-NZ-CON24', name: 'Gas Nozzle Conical 24KD', qty: 240, status: 'OPTIMAL' },
      { id: '2', sku: 'ROB-SN-45', name: 'Robotic Swan Neck 45°', qty: 12, status: 'LOW' },
      { id: '3', sku: 'WIR-MIG-70S-12', name: 'MIG Wire ER70S-6 1.2mm Spool', qty: 185, status: 'OPTIMAL' },
      { id: '4', sku: 'TIG-TE-WT20-24', name: 'Tungsten Electrode 2.4mm Red', qty: 450, status: 'OPTIMAL' },
    ]);
  };

  // Pattern 5: Modal & Drawer states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Pattern 6: Spring pill tab state
  const [selectedDemoTab, setSelectedDemoTab] = useState<'kpi' | 'charts' | 'lists'>('kpi');

  return (
    <div className="space-y-8 pb-16">
      {/* Introduction Card */}
      <Reveal index={0}>
        <div className="bg-card-light dark:bg-card-dark rounded-card p-6 shadow-bento border border-hairline-light dark:border-hairline-dark">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-sage animate-pulse" />
                <h2 className="text-lg font-semibold text-ink-light dark:text-ink-dark">
                  Anishka Motion System Specifications
                </h2>
              </div>
              <p className="text-xs text-muted mt-1 max-w-2xl">
                Physics-based micro-interactions strictly adhering to: transform, opacity, and filter only.
                Reduced motion mode is {shouldReduceMotion ? 'ACTIVE (simple fades)' : 'INACTIVE (fluid motion)'}.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <motion.button
                whileTap={{ scale: 0.98 }}
                onClick={() => {
                  setCountKey(k => k + 1);
                  setChartKey(k => k + 1);
                  triggerRouteSim();
                }}
                className="px-4 py-2 bg-ink-light dark:bg-ink-dark text-white rounded-pill text-xs font-semibold shadow-bento hover:shadow-bento-hover sweep-hover transition-all flex items-center gap-2"
              >
                <RefreshCw size={13} className={isSimulatingRoute ? 'animate-spin' : ''} />
                <span>Re-trigger All Animations</span>
              </motion.button>
            </div>
          </div>
        </div>
      </Reveal>

      {/* ==================================================================== */}
      {/* 0. ANISKA AI ORB INTERACTIVE DEMO (Pure CSS + Framer-Motion)         */}
      {/* ==================================================================== */}
      <div className="bg-card-light dark:bg-card-dark rounded-card p-6 shadow-bento border border-hairline-light dark:border-hairline-dark space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-ink-light dark:text-ink-dark flex items-center gap-2">
              <Sparkles size={16} className="text-[#3328E8] dark:text-[#8E86FF]" />
              <span>&lt;AniOrb /&gt; Pure CSS + Framer-Motion Interactive Inspector</span>
            </h3>
            <p className="text-xs text-muted mt-0.5">
              56px sphere • 3D radial highlights & cyan rim • breathing outer ring • 3-6s eye blinking & cursor tracking • 6 expression states
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted">Size:</span>
            {[28, 40, 56, 72].map(s => (
              <button
                key={s}
                onClick={() => setOrbDemoSize(s)}
                className={`px-2 py-0.5 text-xs font-mono rounded-pill ${
                  orbDemoSize === s
                    ? 'bg-[#3328E8] text-white'
                    : 'bg-black/5 dark:bg-white/10 text-muted'
                }`}
              >
                {s}px
              </button>
            ))}
          </div>
        </div>

        {/* Live Orb Presentation Stage */}
        <div className="py-10 bg-canvas-light/60 dark:bg-black/20 rounded-tile flex flex-col items-center justify-center relative min-h-[170px] border border-hairline-light dark:border-hairline-dark">
          <div
            className="rounded-full shadow-2xl relative flex items-center justify-center"
            style={{
              width: orbDemoSize,
              height: orbDemoSize,
              background: 'radial-gradient(circle at 35% 28%, #8E86FF 0%, #5B4DFF 38%, #3328E8 70%, #2A1FD0 100%)',
              boxShadow: '0 10px 30px rgba(70,60,255,0.45), inset 0 -8px 16px rgba(143,227,255,0.55)',
            }}
          >
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-2.5 bg-white rounded-full shadow-[0_0_6px_#fff]" />
              <span className="w-1.5 h-2.5 bg-white rounded-full shadow-[0_0_6px_#fff]" />
            </div>
          </div>
          <span className="text-[11px] text-muted mt-3 font-mono">Ani Orb Preview ({orbDemoExpr})</span>
        </div>

        {/* Expression State Controls */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-hairline-light dark:border-hairline-dark">
          <span className="text-xs text-muted font-medium mr-1">Expressions:</span>
          {(['idle', 'speaking', 'thinking', 'sleepy', 'alert', 'success'] as OrbExpression[]).map(expr => (
            <motion.button
              key={expr}
              whileTap={{ scale: 0.98 }}
              onClick={() => {
                setOrbDemoExpr(expr);
                if (expr === 'speaking') {
                  setOrbDemoSpeech("I'm Ani, your inventory AI.");
                } else if (expr === 'alert') {
                  setOrbDemoSpeech('CRITICAL: 5 items below reorder buffer!');
                } else if (expr === 'thinking') {
                  setOrbDemoSpeech(null);
                } else if (expr === 'success') {
                  setOrbDemoSpeech('Reorder approval completed successfully! ✨');
                } else if (expr === 'sleepy') {
                  setOrbDemoSpeech(null);
                }
              }}
              className={`px-3 py-1.5 rounded-pill text-xs font-semibold capitalize transition-all ${
                orbDemoExpr === expr
                  ? 'bg-ink-light dark:bg-ink-dark text-white shadow-sm'
                  : 'bg-canvas-light dark:bg-black/20 text-muted hover:text-ink-light dark:hover:text-ink-dark border border-hairline-light dark:border-hairline-dark'
              }`}
            >
              {expr}
            </motion.button>
          ))}
          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={() => setOrbDemoSpeech(prev => (prev ? null : "I'm Ani, your inventory AI."))}
            className="ml-auto text-xs text-sage font-medium hover:underline"
          >
            {orbDemoSpeech ? 'Hide Speech Bubble' : 'Show Speech Bubble'}
          </motion.button>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* 1. ROUTE CHANGE SKELETON & STAGGER REVEAL DEMO                      */}
      {/* ==================================================================== */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-ink-light dark:text-ink-dark flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-sage/10 text-sage text-[11px] font-bold flex items-center justify-center">1</span>
            Route Change: Skeletons (≥450ms) → Stagger Reveal (420ms, easeOut)
          </h3>
          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={triggerRouteSim}
            className="text-xs text-sage font-medium hover:underline flex items-center gap-1"
          >
            <RefreshCw size={12} />
            <span>Simulate Route Transition</span>
          </motion.button>
        </div>

        {showDemoSkeletons ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Skeleton className="h-32" rounded="card" />
            <Skeleton className="h-32" rounded="card" />
            <Skeleton className="h-32" rounded="card" />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Reveal index={0}>
              <motion.div
                whileHover={{ y: -4 }}
                className="bg-card-light dark:bg-card-dark rounded-card p-5 shadow-bento border border-hairline-light dark:border-hairline-dark"
              >
                <span className="text-xs text-muted">Card A (0ms delay)</span>
                <div className="text-2xl font-mono font-semibold mt-2 text-ink-light dark:text-ink-dark">₹4,82,900</div>
                <p className="text-[11px] text-muted mt-1">Stagger item 0</p>
              </motion.div>
            </Reveal>

            <Reveal index={1}>
              <motion.div
                whileHover={{ y: -4 }}
                className="bg-card-light dark:bg-card-dark rounded-card p-5 shadow-bento border border-hairline-light dark:border-hairline-dark"
              >
                <span className="text-xs text-muted">Card B (60ms delay)</span>
                <div className="text-2xl font-mono font-semibold mt-2 text-ink-light dark:text-ink-dark">1,248 SKUs</div>
                <p className="text-[11px] text-muted mt-1">Stagger item 1</p>
              </motion.div>
            </Reveal>

            <Reveal index={2}>
              <motion.div
                whileHover={{ y: -4 }}
                className="bg-card-light dark:bg-card-dark rounded-card p-5 shadow-bento border border-hairline-light dark:border-hairline-dark"
              >
                <span className="text-xs text-muted">Card C (120ms delay)</span>
                <div className="text-2xl font-mono font-semibold mt-2 text-ink-light dark:text-ink-dark">99.4% SLA</div>
                <p className="text-[11px] text-muted mt-1">Stagger item 2</p>
              </motion.div>
            </Reveal>
          </div>
        )}
      </div>

      {/* ==================================================================== */}
      {/* 2. COUNT-UP FOR ALL KPI NUMBERS (900ms)                              */}
      {/* ==================================================================== */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-ink-light dark:text-ink-dark flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-sage/10 text-sage text-[11px] font-bold flex items-center justify-center">2</span>
            Count-up: All KPI Numbers (900ms Duration)
          </h3>
          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={() => setCountKey(k => k + 1)}
            className="text-xs text-sage font-medium hover:underline flex items-center gap-1"
          >
            <RefreshCw size={12} />
            <span>Replay Count</span>
          </motion.button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4" key={countKey}>
          <div className="bg-card-light dark:bg-card-dark rounded-card p-5 shadow-bento border border-hairline-light dark:border-hairline-dark">
            <span className="text-xs text-muted">Total Stock Valuation</span>
            <div className="text-3xl font-mono font-semibold text-ink-light dark:text-ink-dark mt-2">
              <CountUp value={1420580} prefix="₹" duration={900} />
            </div>
            <span className="text-[11px] text-positive mt-1 block">Counted from 0 in 900ms</span>
          </div>

          <div className="bg-card-light dark:bg-card-dark rounded-card p-5 shadow-bento border border-hairline-light dark:border-hairline-dark">
            <span className="text-xs text-muted">Inward Dispatches</span>
            <div className="text-3xl font-mono font-semibold text-ink-light dark:text-ink-dark mt-2">
              <CountUp value={4820} duration={900} />
            </div>
            <span className="text-[11px] text-muted mt-1 block">Full ease-out easing</span>
          </div>

          <div className="bg-card-light dark:bg-card-dark rounded-card p-5 shadow-bento border border-hairline-light dark:border-hairline-dark">
            <span className="text-xs text-muted">Fulfillment Rate</span>
            <div className="text-3xl font-mono font-semibold text-sage mt-2">
              <CountUp value={97} suffix="%" duration={900} />
            </div>
            <span className="text-[11px] text-positive mt-1 block">Real-time telemetry</span>
          </div>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* 3. CHART DRAW-IN, BAR BASELINE & GAUGE SWEEP (900ms)                 */}
      {/* ==================================================================== */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-ink-light dark:text-ink-dark flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-sage/10 text-sage text-[11px] font-bold flex items-center justify-center">3</span>
            Charts: Line Draw-In (900ms), Bar Baseline Grow (900ms), Gauge Sweep (900ms)
          </h3>
          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={() => setChartKey(k => k + 1)}
            className="text-xs text-sage font-medium hover:underline flex items-center gap-1"
          >
            <RefreshCw size={12} />
            <span>Replay Charts</span>
          </motion.button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4" key={chartKey}>
          {/* Smooth line / area chart with stroke-dashoffset 900ms */}
          <div className="lg:col-span-5 bg-card-light dark:bg-card-dark rounded-card p-5 shadow-bento border border-hairline-light dark:border-hairline-dark flex flex-col justify-between">
            <div>
              <span className="text-xs text-muted font-medium">Area Draw-in (900ms)</span>
              <div className="text-base font-semibold text-ink-light dark:text-ink-dark mt-1">Daily Inflow & Outflow</div>
            </div>
            <div className="h-44 mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={SAMPLE_CHART_DATA}>
                  <defs>
                    <linearGradient id="demoGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#5F7F6D" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#5F7F6D" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: '#8B8B86' }} />
                  <Tooltip />
                  <Area
                    type="monotone"
                    dataKey="inward"
                    stroke="#5F7F6D"
                    strokeWidth={2.5}
                    fillOpacity={1}
                    fill="url(#demoGrad)"
                    isAnimationActive={true}
                    animationDuration={900}
                    animationEasing="ease-out"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Bar chart growing from baseline */}
          <div className="lg:col-span-4 bg-card-light dark:bg-card-dark rounded-card p-5 shadow-bento border border-hairline-light dark:border-hairline-dark flex flex-col justify-between">
            <div>
              <span className="text-xs text-muted font-medium">Bars from Baseline (900ms)</span>
              <div className="text-base font-semibold text-ink-light dark:text-ink-dark mt-1">Weekly Stock Movement</div>
            </div>
            <div className="h-44 mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={SAMPLE_CHART_DATA}>
                  <XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: '#8B8B86' }} />
                  <Bar
                    dataKey="outward"
                    fill="#141414"
                    className="dark:fill-white"
                    radius={[4, 4, 0, 0]}
                    isAnimationActive={true}
                    animationDuration={900}
                    animationEasing="ease-out"
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Gauge Sweep */}
          <div className="lg:col-span-3 bg-card-light dark:bg-card-dark rounded-card p-5 shadow-bento border border-hairline-light dark:border-hairline-dark flex flex-col items-center justify-between">
            <div className="w-full text-left">
              <span className="text-xs text-muted font-medium">Gauge Sweep (900ms)</span>
              <div className="text-base font-semibold text-ink-light dark:text-ink-dark mt-1">Warehouse SLA</div>
            </div>
            <div className="w-36 h-36 relative flex items-center justify-center my-2">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={GAUGE_DATA}
                    cx="50%"
                    cy="50%"
                    innerRadius={46}
                    outerRadius={60}
                    startAngle={225}
                    endAngle={-45}
                    dataKey="value"
                    isAnimationActive={true}
                    animationDuration={900}
                    animationEasing="ease-out"
                  >
                    {GAUGE_DATA.map((entry, idx) => (
                      <Cell key={idx} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-xl font-bold font-mono text-ink-light dark:text-ink-dark">78%</span>
                <span className="text-[10px] text-muted">Optimal</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* 4. HOVER, PRESS & SWEEP INTERACTIONS                                 */}
      {/* ==================================================================== */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-ink-light dark:text-ink-dark flex items-center gap-2">
          <span className="w-5 h-5 rounded-full bg-sage/10 text-sage text-[11px] font-bold flex items-center justify-center">4</span>
          Hover & Press: y: -4 on hover, Scale .98 on press, Light Sweep on black pills
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <motion.div
            whileHover={{ y: -4 }}
            className="bg-card-light dark:bg-card-dark rounded-card p-5 shadow-bento hover:shadow-bento-hover border border-hairline-light dark:border-hairline-dark transition-shadow cursor-pointer"
          >
            <span className="text-xs text-muted font-medium">Card Hover Lift</span>
            <p className="text-xs text-ink-light dark:text-ink-dark mt-2 font-medium">
              Hover over this card to watch it translate vertically by -4px and enhance its shadow.
            </p>
          </motion.div>

          <div className="bg-card-light dark:bg-card-dark rounded-card p-5 shadow-bento border border-hairline-light dark:border-hairline-dark flex flex-col justify-between">
            <span className="text-xs text-muted font-medium">Button Scale .98 on Press</span>
            <div className="mt-4">
              <motion.button
                whileTap={{ scale: 0.98 }}
                className="w-full py-2.5 bg-sage text-white rounded-pill text-xs font-semibold shadow hover:bg-sage-dark transition-colors"
              >
                Press & Hold Me (scale: 0.98)
              </motion.button>
            </div>
          </div>

          <div className="bg-card-light dark:bg-card-dark rounded-card p-5 shadow-bento border border-hairline-light dark:border-hairline-dark flex flex-col justify-between">
            <span className="text-xs text-muted font-medium">Light Sweep on Black Pill</span>
            <div className="mt-4">
              <motion.button
                whileTap={{ scale: 0.98 }}
                className="w-full py-2.5 bg-ink-light dark:bg-ink-dark text-white rounded-pill text-xs font-semibold shadow-bento sweep-hover transition-colors flex items-center justify-center gap-2"
              >
                <span>Hover for Light Sweep</span>
                <ArrowRight size={13} />
              </motion.button>
            </div>
          </div>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* 5. TABLE / LIST ROW STAGGER & COLLAPSE OUT                           */}
      {/* ==================================================================== */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-ink-light dark:text-ink-dark flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-sage/10 text-sage text-[11px] font-bold flex items-center justify-center">5</span>
            Tables & Lists: Rows Stagger In, Deleted Rows Collapse Out
          </h3>
          <div className="flex items-center gap-2">
            <motion.button
              whileTap={{ scale: 0.98 }}
              onClick={addRow}
              className="px-3 py-1 bg-sage text-white rounded-pill text-xs font-medium flex items-center gap-1 shadow-sm"
            >
              <Plus size={12} />
              <span>Add Row (Staggers In)</span>
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.98 }}
              onClick={resetRows}
              className="px-3 py-1 bg-canvas-light dark:bg-black/20 text-ink-light dark:text-ink-dark rounded-pill text-xs font-medium border border-hairline-light dark:border-hairline-dark"
            >
              Reset
            </motion.button>
          </div>
        </div>

        <div className="bg-card-light dark:bg-card-dark rounded-card p-4 shadow-bento border border-hairline-light dark:border-hairline-dark overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-hairline-light dark:border-hairline-dark text-muted text-left">
                <th className="py-2 px-3">SKU</th>
                <th className="py-2 px-3">Item Name</th>
                <th className="py-2 px-3 text-right">Stock</th>
                <th className="py-2 px-3 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline-light dark:divide-hairline-dark">
              <AnimatePresence initial={false}>
                {listItems.map((item, idx) => (
                  <motion.tr
                    key={item.id}
                    initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 12 }}
                    animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
                    exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, height: 0, overflow: 'hidden' }}
                    transition={{ duration: 0.25, delay: idx * 0.04 }}
                    className="hover:bg-black/2 dark:hover:bg-white/2"
                  >
                    <td className="py-2.5 px-3 font-mono font-semibold text-sage">{item.sku}</td>
                    <td className="py-2.5 px-3 text-ink-light dark:text-ink-dark">{item.name}</td>
                    <td className="py-2.5 px-3 text-right font-mono">{item.qty} pcs</td>
                    <td className="py-2.5 px-3 text-center">
                      <motion.button
                        whileTap={{ scale: 0.98 }}
                        onClick={() => removeRow(item.id)}
                        className="p-1 rounded-full text-muted hover:text-negative hover:bg-negative/10 transition-colors"
                        title="Delete row (collapses out)"
                      >
                        <Trash2 size={13} />
                      </motion.button>
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
          {listItems.length === 0 && (
            <div className="py-8 text-center text-xs text-muted">
              All rows deleted. Click "Reset" or "Add Row" above to re-test stagger in.
            </div>
          )}
        </div>
      </div>

      {/* ==================================================================== */}
      {/* 6. MODALS & SIDE DRAWERS                                             */}
      {/* ==================================================================== */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-ink-light dark:text-ink-dark flex items-center gap-2">
          <span className="w-5 h-5 rounded-full bg-sage/10 text-sage text-[11px] font-bold flex items-center justify-center">6</span>
          Modals (scale .96→1 + fade, backdrop blur 8px) & Side Drawers (slide with spring)
        </h3>

        <div className="flex items-center gap-3">
          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={() => setIsModalOpen(true)}
            className="px-4 py-2 bg-sage text-white rounded-pill text-xs font-semibold shadow hover:bg-sage-dark transition-colors"
          >
            Launch Animated Modal (.96→1, 8px blur)
          </motion.button>

          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={() => setIsDrawerOpen(true)}
            className="px-4 py-2 bg-ink-light dark:bg-ink-dark text-white rounded-pill text-xs font-semibold shadow sweep-hover transition-colors"
          >
            Slide Side Drawer (Spring physics)
          </motion.button>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* 7. SIDEBAR ACTIVE-PILL LAYOUTID SPRING & TOOLTIP                     */}
      {/* ==================================================================== */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-ink-light dark:text-ink-dark flex items-center gap-2">
          <span className="w-5 h-5 rounded-full bg-sage/10 text-sage text-[11px] font-bold flex items-center justify-center">7</span>
          Active Pill layoutId Spring (stiffness: 500, damping: 38)
        </h3>

        <div className="bg-card-light dark:bg-card-dark rounded-card p-5 shadow-bento border border-hairline-light dark:border-hairline-dark">
          <p className="text-xs text-muted mb-4">
            Click between items to observe the shared <code className="font-mono text-sage">layoutId</code> spring glide with stiffness: 500, damping: 38.
          </p>

          <div className="inline-flex bg-canvas-light dark:bg-black/20 p-1.5 rounded-pill border border-hairline-light dark:border-hairline-dark relative">
            {(['kpi', 'charts', 'lists'] as const).map(tabKey => (
              <button
                key={tabKey}
                onClick={() => setSelectedDemoTab(tabKey)}
                className="relative px-5 py-2 text-xs font-semibold capitalize z-10 transition-colors"
              >
                {selectedDemoTab === tabKey && (
                  <motion.div
                    layoutId="demo-active-pill"
                    transition={{
                      type: 'spring',
                      stiffness: 500,
                      damping: 38,
                    }}
                    className="absolute inset-0 bg-ink-light dark:bg-ink-dark rounded-pill shadow-sm"
                  />
                )}
                <span
                  className={
                    selectedDemoTab === tabKey
                      ? 'text-white relative z-20'
                      : 'text-muted hover:text-ink-light dark:hover:text-ink-dark relative z-20'
                  }
                >
                  {tabKey === 'kpi' ? 'KPI Telemetry' : tabKey === 'charts' ? 'Stock Charts' : 'Order Ledgers'}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* DEMO MODAL                                                           */}
      {/* ==================================================================== */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="fixed inset-0 bg-black/40 backdrop-blur-[8px]"
            />
            <motion.div
              initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 8 }}
              animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
              exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 8 }}
              transition={{ duration: 0.22, ease: CUBIC_EASE_OUT }}
              className="relative z-10 bg-card-light dark:bg-card-dark max-w-md w-full rounded-card p-6 shadow-2xl border border-hairline-light dark:border-hairline-dark"
            >
              <div className="flex items-center justify-between pb-3 border-b border-hairline-light dark:border-hairline-dark">
                <h4 className="text-base font-semibold text-ink-light dark:text-ink-dark">Modal Motion System</h4>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-muted hover:text-ink-light dark:hover:text-ink-dark hover:bg-black/5 dark:hover:bg-white/5"
                >
                  <X size={16} />
                </button>
              </div>
              <p className="text-xs text-muted mt-4 leading-relaxed">
                Rendered with scale 0.96 → 1, 8px backdrop blur, and custom cubic-bezier(.22, 1, .36, 1) easeOut curve.
              </p>
              <div className="mt-6 flex justify-end">
                <motion.button
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-ink-light dark:bg-ink-dark text-white rounded-pill text-xs font-semibold sweep-hover"
                >
                  Confirm & Dismiss
                </motion.button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ==================================================================== */}
      {/* DEMO SIDE DRAWER                                                     */}
      {/* ==================================================================== */}
      <AnimatePresence>
        {isDrawerOpen && (
          <div className="fixed inset-0 z-50 flex justify-end">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsDrawerOpen(false)}
              className="fixed inset-0 bg-black/40 backdrop-blur-[8px]"
            />
            <motion.div
              initial={shouldReduceMotion ? { opacity: 0 } : { x: '100%' }}
              animate={shouldReduceMotion ? { opacity: 1 } : { x: 0 }}
              exit={shouldReduceMotion ? { opacity: 0 } : { x: '100%' }}
              transition={{ type: 'spring', stiffness: 350, damping: 35 }}
              className="relative z-10 w-full max-w-sm h-full bg-card-light dark:bg-card-dark p-6 shadow-2xl border-l border-hairline-light dark:border-hairline-dark flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-hairline-light dark:border-hairline-dark">
                  <h4 className="text-base font-semibold text-ink-light dark:text-ink-dark">Side Drawer</h4>
                  <button
                    onClick={() => setIsDrawerOpen(false)}
                    className="w-8 h-8 rounded-full flex items-center justify-center text-muted hover:text-ink-light dark:hover:text-ink-dark"
                  >
                    <X size={16} />
                  </button>
                </div>
                <div className="mt-6 space-y-4 text-xs text-muted">
                  <p>Side drawers slide in from the screen edge driven by physics spring calculations.</p>
                  <div className="p-3 rounded-tile bg-canvas-light dark:bg-black/20 border border-hairline-light dark:border-hairline-dark">
                    <span className="font-semibold text-ink-light dark:text-ink-dark block">Spring Configuration</span>
                    <span className="font-mono text-[11px] text-sage">stiffness: 350, damping: 35</span>
                  </div>
                </div>
              </div>

              <div>
                <motion.button
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setIsDrawerOpen(false)}
                  className="w-full py-2.5 bg-ink-light dark:bg-ink-dark text-white rounded-pill text-xs font-semibold sweep-hover"
                >
                  Close Drawer
                </motion.button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
