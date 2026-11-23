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
  { key: 'dev-motion', label: 'Motion System (/dev/motion)', icon: Activity, roles: ['admin', 'manager', 'storekeeper'] },
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

  const role = user?.role || 'storekeeper';
  const visibleItems = NAV_ITEMS.filter(item => item.roles.includes(role));

  return (
    <aside className="fixed left-4 top-4 bottom-4 w-16 bg-card-light dark:bg-card-dark rounded-card shadow-bento flex flex-col items-center py-4 z-40 border border-hairline-light dark:border-hairline-dark transition-colors duration-300">
      {/* Top: Anishka sunburst logo mark */}
      <div
        className="w-10 h-10 rounded-full flex items-center justify-center bg-ink-light/5 dark:bg-ink-dark/10 cursor-pointer mb-5"
        title="Anishka Industries"
        onClick={() => onTabChange('dashboard')}
      >
        <div className="relative flex items-center justify-center">
          <Sun className="w-5 h-5 text-sage animate-spin-slow" />
          <div className="absolute w-1.5 h-1.5 bg-sage rounded-full" />
        </div>
      </div>

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
                className={`relative w-11 h-11 rounded-full flex items-center justify-center transition-colors duration-200 z-10 ${
                  isActive
                    ? 'text-white'
                    : 'text-muted hover:text-ink-light dark:hover:text-ink-dark hover:bg-black/5 dark:hover:bg-white/5'
                }`}
                aria-label={item.label}
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
            className="w-10 h-10 rounded-full flex items-center justify-center text-muted hover:text-ink-light dark:hover:text-ink-dark hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
            title="Settings"
          >
            <Settings size={18} />
          </button>
        )}

        <button
          onClick={logout}
          className="w-10 h-10 rounded-full flex items-center justify-center text-muted hover:text-negative hover:bg-negative/10 transition-colors"
          title="Sign out"
        >
          <LogOut size={18} />
        </button>

        {/* User avatar indicator */}
        <div
          className="w-9 h-9 rounded-full bg-sage/20 border border-sage/30 flex items-center justify-center text-sage text-xs font-semibold uppercase cursor-pointer"
          title={`${user?.full_name || user?.username} (${role})`}
        >
          {user?.username ? user.username.slice(0, 2).toUpperCase() : 'AI'}
        </div>
      </div>
    </aside>
  );
};
