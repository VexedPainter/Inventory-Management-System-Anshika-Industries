import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard,
  Package,
  ArrowLeftRight,
  ShoppingCart,
  Receipt,
  Users,
  Truck,
  FileText,
  BarChart3,
  Sparkles,
  ShieldAlert,
  UserCog,
  Calculator,
  Settings,
  LogOut,
  Sun,
  Activity,
  MoreHorizontal,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export type TabKey =
  | 'dashboard'
  | 'inventory'
  | 'movements'
  | 'procurement'
  | 'sales'
  | 'customers'
  | 'suppliers'
  | 'reports'
  | 'analytics'
  | 'ai-copilot'
  | 'audit'
  | 'users'
  | 'business-impact'
  | 'settings'
  | 'dev-motion';

interface NavItem {
  key: TabKey;
  label: string;
  icon: LucideIcon;
  roles: ('admin' | 'manager' | 'storekeeper')[];
  devOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['admin', 'manager', 'storekeeper'] },
  { key: 'inventory', label: 'Inventory', icon: Package, roles: ['admin', 'manager', 'storekeeper'] },
  { key: 'movements', label: 'Movements', icon: ArrowLeftRight, roles: ['admin', 'manager', 'storekeeper'] },
  { key: 'procurement', label: 'Purchase Orders', icon: ShoppingCart, roles: ['admin', 'manager', 'storekeeper'] },
  { key: 'sales', label: 'Sales & Invoices', icon: Receipt, roles: ['admin', 'manager', 'storekeeper'] },
  { key: 'customers', label: 'Customers', icon: Users, roles: ['admin', 'manager', 'storekeeper'] },
  { key: 'suppliers', label: 'Suppliers', icon: Truck, roles: ['admin', 'manager', 'storekeeper'] },
  { key: 'reports', label: 'Reports', icon: FileText, roles: ['admin', 'manager', 'storekeeper'] },
  { key: 'analytics', label: 'Analytics', icon: BarChart3, roles: ['admin', 'manager', 'storekeeper'] },
  { key: 'ai-copilot', label: 'AI Copilot', icon: Sparkles, roles: ['admin', 'manager', 'storekeeper'] },
  { key: 'audit', label: 'Audit Trail', icon: ShieldAlert, roles: ['admin', 'manager'] },
  { key: 'users', label: 'User Accounts', icon: UserCog, roles: ['admin'] },
  { key: 'business-impact', label: 'Business Impact', icon: Calculator, roles: ['admin', 'manager'] },
  { key: 'settings', label: 'Settings', icon: Settings, roles: ['admin', 'manager', 'storekeeper'] },
  { key: 'dev-motion', label: 'Motion System (/dev/motion)', icon: Activity, roles: ['admin', 'manager', 'storekeeper'], devOnly: true },
];

interface SidebarProps {
  activeTab: TabKey;
  onTabChange: (tab: TabKey) => void;
  onOpenSettings?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onTabChange,
  onOpenSettings,
}) => {
  const { user, logout } = useAuth();
  const [hoveredTab, setHoveredTab] = useState<string | null>(null);
  const [isMoreOpen, setIsMoreOpen] = useState(false);

  const role = user?.role || 'storekeeper';
  const visibleItems = NAV_ITEMS.filter(item => {
    if (item.devOnly && !import.meta.env.DEV) return false;
    return item.roles.includes(role);
  });

  // 4 Primary Mobile tabs
  const mobilePrimaryKeys: TabKey[] = ['dashboard', 'inventory', 'procurement', 'sales'];
  const mobileSecondaryItems = visibleItems.filter(item => !mobilePrimaryKeys.includes(item.key));
  const isSecondaryActive = mobileSecondaryItems.some(item => item.key === activeTab);

  return (
    <>
      {/* ==================================================================== */}
      {/* DESKTOP / TABLET: Floating Slim Sidebar (Fixed Left, 64px wide)     */}
      {/* ==================================================================== */}
      <aside
        role="navigation"
        aria-label="Desktop Primary Navigation"
        className="hidden md:flex fixed left-4 top-4 bottom-4 w-16 bg-card-light dark:bg-card-dark rounded-card shadow-bento flex-col items-center py-4 z-40 border border-hairline-light dark:border-hairline-dark transition-colors duration-300"
      >
        {/* Top: Anishka sunburst logo mark */}
        <button
          className="w-10 h-10 rounded-full flex items-center justify-center bg-ink-light/5 dark:bg-ink-dark/10 cursor-pointer mb-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage"
          title="Anishka Industries"
          aria-label="Navigate to Dashboard"
          onClick={() => onTabChange('dashboard')}
        >
          <div className="relative flex items-center justify-center">
            <Sun className="w-5 h-5 text-sage animate-spin-slow" />
            <div className="absolute w-1.5 h-1.5 bg-sage rounded-full" />
          </div>
        </button>

        {/* Middle nav icons */}
        <nav className="flex-1 w-full flex flex-col items-center gap-1.5 overflow-y-auto no-scrollbar py-1">
          {visibleItems.map(item => {
            const Icon = item.icon;
            const isActive = activeTab === item.key;

            return (
              <div
                key={item.key}
                className="relative flex items-center justify-center"
                onMouseEnter={() => setHoveredTab(item.key)}
                onMouseLeave={() => setHoveredTab(null)}
              >
                <button
                  onClick={() => onTabChange(item.key)}
                  className={`relative w-11 h-11 rounded-full flex items-center justify-center transition-colors duration-200 z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage ${
                    isActive
                      ? 'text-white'
                      : 'text-muted hover:text-ink-light dark:hover:text-ink-dark hover:bg-black/5 dark:hover:bg-white/5'
                  }`}
                  aria-label={item.label}
                  aria-current={isActive ? 'page' : undefined}
                >
                  {isActive && (
                    <motion.div
                      layoutId="sidebar-active"
                      className="absolute inset-0 bg-ink-light dark:bg-ink-dark rounded-full -z-10 shadow-sm"
                      transition={{ type: 'spring', stiffness: 500, damping: 38 }}
                    />
                  )}
                  <Icon size={19} className={isActive ? 'dark:text-ink-light' : ''} />
                </button>

                {/* Tooltip on hover: fade + slide 6px */}
                <AnimatePresence>
                  {hoveredTab === item.key && (
                    <motion.div
                      initial={{ opacity: 0, x: -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -6 }}
                      transition={{ duration: 0.15 }}
                      className="absolute left-14 ml-2 px-3 py-1 bg-ink-light text-white text-xs font-medium rounded-pill whitespace-nowrap shadow-lg pointer-events-none z-50 flex items-center gap-1.5"
                    >
                      <span>{item.label}</span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </nav>

        {/* Bottom utility icons */}
        <div className="w-full flex flex-col items-center gap-2 pt-3 border-t border-hairline-light dark:border-hairline-dark">
          {onOpenSettings && (
            <button
              onClick={onOpenSettings}
              className="w-10 h-10 rounded-full flex items-center justify-center text-muted hover:text-ink-light dark:hover:text-ink-dark hover:bg-black/5 dark:hover:bg-white/5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage"
              title="Settings"
              aria-label="Settings"
            >
              <Settings size={18} />
            </button>
          )}

          <button
            onClick={logout}
            className="w-10 h-10 rounded-full flex items-center justify-center text-muted hover:text-negative hover:bg-negative/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-negative"
            title="Sign out"
            aria-label="Sign out"
          >
            <LogOut size={18} />
          </button>

          {/* User avatar indicator */}
          <div
            className="w-9 h-9 rounded-full bg-sage/20 border border-sage/30 flex items-center justify-center text-sage text-xs font-semibold uppercase cursor-pointer"
            title={`${user?.full_name || user?.username} (${role})`}
            aria-label={`Signed in as ${user?.username} (${role})`}
          >
            {user?.username ? user.username.slice(0, 2).toUpperCase() : 'AI'}
          </div>
        </div>
      </aside>

      {/* ==================================================================== */}
      {/* MOBILE (390px / <768px): Bottom Tab Bar (5 items + "More" sheet)   */}
      {/* ==================================================================== */}
      <nav
        role="navigation"
        aria-label="Mobile Navigation Bar"
        className="md:hidden fixed bottom-3 left-3 right-3 h-16 bg-card-light/95 dark:bg-card-dark/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-hairline-light dark:border-hairline-dark z-40 flex items-center justify-around px-2"
      >
        {/* Item 1: Dashboard */}
        <button
          onClick={() => onTabChange('dashboard')}
          className={`flex flex-col items-center justify-center flex-1 py-1 transition-colors ${
            activeTab === 'dashboard' ? 'text-sage font-bold' : 'text-muted'
          }`}
          aria-label="Dashboard"
        >
          <LayoutDashboard size={18} />
          <span className="text-[10px] mt-1">Home</span>
        </button>

        {/* Item 2: Inventory */}
        <button
          onClick={() => onTabChange('inventory')}
          className={`flex flex-col items-center justify-center flex-1 py-1 transition-colors ${
            activeTab === 'inventory' ? 'text-sage font-bold' : 'text-muted'
          }`}
          aria-label="Inventory"
        >
          <Package size={18} />
          <span className="text-[10px] mt-1">Stock</span>
        </button>

        {/* Item 3: Purchase Orders */}
        <button
          onClick={() => onTabChange('procurement')}
          className={`flex flex-col items-center justify-center flex-1 py-1 transition-colors ${
            activeTab === 'procurement' ? 'text-sage font-bold' : 'text-muted'
          }`}
          aria-label="Purchase Orders"
        >
          <ShoppingCart size={18} />
          <span className="text-[10px] mt-1">Orders</span>
        </button>

        {/* Item 4: Sales */}
        <button
          onClick={() => onTabChange('sales')}
          className={`flex flex-col items-center justify-center flex-1 py-1 transition-colors ${
            activeTab === 'sales' ? 'text-sage font-bold' : 'text-muted'
          }`}
          aria-label="Sales"
        >
          <Receipt size={18} />
          <span className="text-[10px] mt-1">Sales</span>
        </button>

        {/* Item 5: More (Bottom Sheet Trigger) */}
        <button
          onClick={() => setIsMoreOpen(true)}
          className={`flex flex-col items-center justify-center flex-1 py-1 transition-colors relative ${
            isSecondaryActive ? 'text-sage font-bold' : 'text-muted'
          }`}
          aria-label="More Navigation Options"
          aria-expanded={isMoreOpen}
        >
          <MoreHorizontal size={18} />
          <span className="text-[10px] mt-1">More</span>
          {isSecondaryActive && (
            <span className="absolute top-1 right-5 w-1.5 h-1.5 rounded-full bg-sage" />
          )}
        </button>
      </nav>

      {/* Mobile "More" Bottom Sheet Modal */}
      <AnimatePresence>
        {isMoreOpen && (
          <div className="md:hidden fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, y: '100%' }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 260 }}
              className="w-full bg-card-light dark:bg-card-dark rounded-t-3xl p-5 border-t border-hairline-light dark:border-hairline-dark max-h-[85vh] overflow-y-auto space-y-4"
            >
              {/* Drag handle & header */}
              <div className="flex flex-col items-center">
                <div className="w-12 h-1.5 bg-black/15 dark:bg-white/20 rounded-full mb-3" />
                <div className="w-full flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-full bg-sage/20 text-sage flex items-center justify-center font-bold text-xs uppercase">
                      {user?.username ? user.username.slice(0, 2).toUpperCase() : 'AI'}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-ink-light dark:text-ink-dark">
                        {user?.full_name || user?.username}
                      </p>
                      <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full bg-sage/10 text-sage font-semibold">
                        {role}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => setIsMoreOpen(false)}
                    className="p-1.5 rounded-full hover:bg-black/5 dark:hover:bg-white/5 text-muted"
                    aria-label="Close menu"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>

              {/* Grid of secondary screens */}
              <div className="grid grid-cols-2 gap-2 pt-2">
                {mobileSecondaryItems.map(item => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.key;

                  return (
                    <button
                      key={item.key}
                      onClick={() => {
                        onTabChange(item.key);
                        setIsMoreOpen(false);
                      }}
                      className={`flex items-center gap-2.5 p-3 rounded-2xl border text-left transition-all ${
                        isActive
                          ? 'border-sage bg-sage/10 text-sage font-semibold'
                          : 'border-hairline-light dark:border-hairline-dark text-ink-light dark:text-ink-dark hover:bg-black/5 dark:hover:bg-white/5'
                      }`}
                    >
                      <Icon size={16} />
                      <span className="text-xs">{item.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Bottom utilities */}
              <div className="pt-2 border-t border-hairline-light dark:border-hairline-dark flex items-center justify-between text-xs">
                {onOpenSettings && (
                  <button
                    onClick={() => {
                      onOpenSettings();
                      setIsMoreOpen(false);
                    }}
                    className="flex items-center gap-2 text-muted hover:text-ink-light py-2"
                  >
                    <Settings size={15} />
                    <span>Settings</span>
                  </button>
                )}

                <button
                  onClick={logout}
                  className="flex items-center gap-2 text-negative hover:underline py-2 font-medium"
                >
                  <LogOut size={15} />
                  <span>Sign out</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};
