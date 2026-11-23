import React from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Search, Bell, Moon, Sun } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface TopBarProps {
  activeTab?: string;
  onSearchClick?: () => void;
  onNotificationsClick?: () => void;
}

const TAB_TITLES: Record<string, { title: (name: string) => string; subtitle: string }> = {
  dashboard: {
    title: name => `Hey, ${name}!`,
    subtitle: "Here's what is happening in your warehouse today",
  },
  inventory: {
    title: () => 'Warehouse Inventory',
    subtitle: 'Current live stock levels, unit valuations, and safety thresholds',
  },
  movements: {
    title: () => 'Stock Movements',
    subtitle: 'Inward receipts, outward dispatches, transfers, and ledger history',
  },
  procurement: {
    title: () => 'Procurement & Orders',
    subtitle: 'Supplier purchase orders, inbound consignments, and line item receipts',
  },
  sales: {
    title: () => 'Sales & Invoices',
    subtitle: 'Customer quotes, confirmed dispatch orders, and GST invoices',
  },
  customers: {
    title: () => 'Customer Accounts',
    subtitle: 'B2B client ledgers, outstanding balances, and credit tracking',
  },
  suppliers: {
    title: () => 'Supplier Directory',
    subtitle: 'Approved vendors, payment terms, and vendor performance',
  },
  reports: {
    title: () => 'Reports & Statements',
    subtitle: 'Statutory GST reports, inventory valuation, and owner summaries',
  },
  analytics: {
    title: () => 'Warehouse Analytics',
    subtitle: 'ABC-XYZ classification, stock velocity, and turnover metrics',
  },
  'ai-copilot': {
    title: () => 'Ani AI Copilot',
    subtitle: 'Conversational assistant for supply chain insights and recommendations',
  },
  audit: {
    title: () => 'Audit Trail',
    subtitle: 'Cryptographic tamper-evident ledger of all warehouse actions',
  },
  users: {
    title: () => 'User Accounts',
    subtitle: 'Role-based access control and warehouse privileges',
  },
  'business-impact': {
    title: () => 'Business Impact',
    subtitle: 'Pilot performance metrics, ROI calculator, and commercial terms',
  },
  'dev-motion': {
    title: () => 'Motion System Gallery',
    subtitle: 'Interactive testbed for framer-motion transitions, springs, and shimmers',
  },
};

export const TopBar: React.FC<TopBarProps> = ({
  activeTab = 'dashboard',
  onSearchClick,
  onNotificationsClick,
}) => {
  const { user, theme, toggleTheme } = useAuth();
  const shouldReduceMotion = useReducedMotion();

  // Extract first name
  const rawName = user?.full_name || user?.username || 'Operator';
  const firstName = rawName.split(' ')[0];

  const info = TAB_TITLES[activeTab] || {
    title: (n: string) => `Hey, ${n}!`,
    subtitle: "Here's what is happening in your warehouse today",
  };

  return (
    <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
      {/* Left: Greeting & subtitle with blur route-change motion */}
      <div className="min-h-[52px] flex flex-col justify-center">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, filter: 'blur(6px)' }}
            animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, filter: 'blur(0px)' }}
            exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, filter: 'blur(6px)' }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
          >
            <h1 className="text-[22px] font-semibold text-ink-light dark:text-ink-dark tracking-tight">
              {info.title(firstName)}
            </h1>
            <p className="text-xs md:text-sm text-muted mt-0.5">
              {info.subtitle}
            </p>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Right: Pill search & utility buttons */}
      <div className="flex items-center gap-3">
        {/* Search pill */}
        <div
          onClick={onSearchClick}
          className="relative flex items-center bg-card-light dark:bg-card-dark rounded-pill pl-4 pr-1.5 py-1.5 shadow-bento border border-hairline-light dark:border-hairline-dark cursor-pointer group hover:border-sage/40 transition-all w-64 sm:w-72 md:w-80"
        >
          <Search size={16} className="text-muted group-hover:text-ink-light dark:group-hover:text-ink-dark mr-2 shrink-0 transition-colors" />
          <span className="text-xs text-muted flex-1 select-none truncate">
            Search or ask Ani…
          </span>
          <span className="hidden sm:inline-block text-[10px] text-muted font-mono bg-black/5 dark:bg-white/10 px-1.5 py-0.5 rounded mr-2">
            ⌘K
          </span>
          {/* Round black search button */}
          <motion.button
            whileTap={{ scale: 0.98 }}
            type="button"
            className="w-8 h-8 rounded-full bg-ink-light dark:bg-ink-dark text-white flex items-center justify-center shrink-0 shadow-sm group-hover:scale-105 transition-transform"
          >
            <Search size={14} className="dark:text-ink-light" />
          </motion.button>
        </div>

        {/* Notifications button */}
        <motion.button
          whileTap={{ scale: 0.98 }}
          onClick={onNotificationsClick}
          className="w-10 h-10 rounded-full bg-card-light dark:bg-card-dark text-ink-light dark:text-ink-dark shadow-bento border border-hairline-light dark:border-hairline-dark flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/5 transition-all relative"
          title="Notifications"
        >
          <Bell size={17} />
          <span className="absolute top-2.5 right-2.5 w-2 h-2 bg-sage rounded-full" />
        </motion.button>

        {/* Theme toggle button */}
        <motion.button
          whileTap={{ scale: 0.98 }}
          onClick={toggleTheme}
          className="w-10 h-10 rounded-full bg-card-light dark:bg-card-dark text-ink-light dark:text-ink-dark shadow-bento border border-hairline-light dark:border-hairline-dark flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/5 transition-all"
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {theme === 'dark' ? (
            <Sun size={17} className="text-warning transition-transform hover:rotate-45" />
          ) : (
            <Moon size={17} className="text-ink-light transition-transform hover:-rotate-12" />
          )}
        </motion.button>
      </div>
    </header>
  );
};
