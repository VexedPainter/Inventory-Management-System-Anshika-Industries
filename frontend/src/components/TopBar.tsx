import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Search, Bell, Moon, Sun, ArrowRight, CornerDownLeft } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { NotificationPanel } from './NotificationPanel';

interface TopBarProps {
  activeTab?: string;
  onNavigateTab?: (tab: any) => void;
  onAskAni?: (query: string) => void;
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

const PAGE_KEYWORDS: Record<string, string[]> = {
  dashboard: ['home', 'overview', 'summary', 'metrics', 'dashboard'],
  inventory: ['inventory', 'stock', 'catalog', 'skus', 'items', 'parts', 'materials'],
  movements: ['movements', 'movement', 'inward', 'outward', 'dispatch', 'transfer', 'ledger'],
  procurement: ['purchase', 'procurement', 'po', 'pos', 'vendor orders', 'inbound'],
  sales: ['sales', 'orders', 'so', 'invoices', 'quotes', 'quotations', 'revenue'],
  customers: ['customers', 'clients', 'receivables', 'debtors', 'credit'],
  suppliers: ['suppliers', 'vendors', 'sellers', 'supplier directory'],
  reports: ['reports', 'valuation', 'gst', 'tally', 'statements', 'audit summary'],
  analytics: ['analytics', 'abc', 'xyz', 'velocity', 'consumption', 'pareto'],
  audit: ['audit', 'tamper', 'security', 'log', 'trail'],
  users: ['users', 'roles', 'rbac', 'accounts', 'permissions'],
  'business-impact': ['roi', 'business impact', 'pilot', 'pricing', 'calculator'],
  'dev-motion': ['motion', 'dev', 'spring', 'animation', 'specs'],
};

export const TopBar: React.FC<TopBarProps> = ({
  activeTab = 'dashboard',
  onNavigateTab,
  onAskAni,
  onNotificationsClick,
}) => {
  const { user, theme, toggleTheme } = useAuth();
  const shouldReduceMotion = useReducedMotion();
  const [searchVal, setSearchVal] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Handle Ctrl+K to focus search input
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleSearchSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const q = searchVal.trim().toLowerCase();
    if (!q) {
      if (onAskAni) onAskAni('');
      return;
    }

    // 1. Check if it matches a known page
    for (const [tabKey, keywords] of Object.entries(PAGE_KEYWORDS)) {
      if (keywords.some(kw => q === kw || q.includes(kw))) {
        if (onNavigateTab) {
          onNavigateTab(tabKey);
          setSearchVal('');
          inputRef.current?.blur();
          return;
        }
      }
    }

    // 2. Check if it matches a SKU pattern (e.g., MIG-24, ROB-45, WIR-12, TIG-WT)
    const isSkuPattern = /^[a-z]{2,4}-[a-z0-9]+(-[a-z0-9]+)?$/i.test(q) || q.startsWith('sku:') || q.includes('mig-') || q.includes('rob-') || q.includes('tig-') || q.includes('wir-');
    if (isSkuPattern) {
      if (onNavigateTab) {
        onNavigateTab('inventory');
        setSearchVal('');
        inputRef.current?.blur();
        return;
      }
    }

    // 3. Otherwise: route query directly into Ask Ani!
    if (onAskAni) {
      onAskAni(searchVal);
      setSearchVal('');
      inputRef.current?.blur();
    }
  };

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
        {/* Search pill with Ctrl+K navigation + Ask Ani routing */}
        <form
          onSubmit={handleSearchSubmit}
          className={`relative flex items-center bg-card-light dark:bg-card-dark rounded-pill pl-4 pr-1.5 py-1.5 shadow-bento border ${
            isFocused ? 'border-sage ring-2 ring-sage/25' : 'border-hairline-light dark:border-hairline-dark'
          } group transition-all w-64 sm:w-72 md:w-80`}
          role="search"
        >
          <Search size={16} className="text-muted group-hover:text-ink-light dark:group-hover:text-ink-dark mr-2 shrink-0 transition-colors" />
          <input
            ref={inputRef}
            type="text"
            value={searchVal}
            onChange={e => setSearchVal(e.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder="Search or ask Ani…"
            aria-label="Search or ask Ani"
            className="text-xs bg-transparent text-ink-light dark:text-ink-dark outline-none flex-1 placeholder:text-muted"
          />
          {!searchVal && (
            <span className="hidden sm:inline-block text-[10px] text-muted font-mono bg-black/5 dark:bg-white/10 px-1.5 py-0.5 rounded mr-2 pointer-events-none select-none">
              ⌘K
            </span>
          )}
          {/* Round black search button */}
          <motion.button
            whileTap={{ scale: 0.92 }}
            type="submit"
            className="w-8 h-8 rounded-full bg-ink-light dark:bg-ink-dark text-white flex items-center justify-center shrink-0 shadow-sm transition-all sweep-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage focus-visible:ring-offset-1"
            aria-label="Submit search"
            title="Search or ask Ani"
          >
            {searchVal ? <CornerDownLeft size={13} /> : <Search size={14} className="dark:text-ink-light" />}
          </motion.button>
        </form>

        {/* Notifications button with Popover Panel */}
        <div className="relative">
          <motion.button
            whileTap={{ scale: 0.94 }}
            onClick={() => {
              if (onNotificationsClick) onNotificationsClick();
              setIsNotificationsOpen(prev => !prev);
            }}
            className={`w-10 h-10 rounded-full bg-card-light dark:bg-card-dark text-ink-light dark:text-ink-dark shadow-bento border transition-all relative flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage ${
              isNotificationsOpen
                ? 'border-sage ring-2 ring-sage/20 bg-sage/10 text-sage'
                : 'border-hairline-light dark:border-hairline-dark hover:bg-black/5 dark:hover:bg-white/5'
            }`}
            aria-label={unreadCount > 0 ? `Notifications — ${unreadCount} unread` : 'Notifications — All caught up'}
            aria-expanded={isNotificationsOpen}
            aria-haspopup="dialog"
            title="Notifications"
          >
            <Bell size={17} />
            {unreadCount > 0 ? (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-sage text-white text-[10px] font-bold rounded-full flex items-center justify-center shadow-xs font-mono animate-fade-in" aria-hidden="true">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            ) : (
              <span className="absolute top-2.5 right-2.5 w-2 h-2 bg-sage/60 rounded-full" aria-hidden="true" />
            )}
          </motion.button>

          {/* Floating Notifications Popover */}
          <AnimatePresence>
            {isNotificationsOpen && (
              <NotificationPanel
                isOpen={isNotificationsOpen}
                onClose={() => setIsNotificationsOpen(false)}
                onNavigateTab={onNavigateTab}
                onAskAni={onAskAni}
                onUnreadCountChange={setUnreadCount}
              />
            )}
          </AnimatePresence>
        </div>

        {/* Theme toggle button */}
        <motion.button
          whileTap={{ scale: 0.94 }}
          onClick={toggleTheme}
          className="w-10 h-10 rounded-full bg-card-light dark:bg-card-dark text-ink-light dark:text-ink-dark shadow-bento border border-hairline-light dark:border-hairline-dark flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/5 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage"
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
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
