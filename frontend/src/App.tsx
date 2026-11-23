import React, { useState, useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { AuthProvider, useAuth } from './context/AuthContext';
import { OrbProvider, useOrb } from './context/OrbContext';
import { Sidebar, TabKey } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { FloatingAniOrb } from './components/FloatingAniOrb';
import { DashboardView } from './views/DashboardView';
import { InventoryCatalogView } from './views/InventoryCatalogView';
import { MovementsView } from './views/MovementsView';
import { ProcurementView } from './views/ProcurementView';
import { SalesView } from './views/SalesView';
import { CustomersView } from './views/CustomersView';
import { SuppliersView } from './views/SuppliersView';
import { ReportsView } from './views/ReportsView';
import { AnalyticsView } from './views/AnalyticsView';
import { AiCopilotPageView } from './views/AiCopilotPageView';
import { AuditView } from './views/AuditView';
import { UsersView } from './views/UsersView';
import { SettingsView } from './views/SettingsView';
import { BusinessImpactView } from './views/BusinessImpactView';
import { DevMotionView } from './views/DevMotionView';
import { AskAniPanel } from './views/AskAniPanel';
import { LoginView } from './views/LoginView';
import { ExternalLink } from 'lucide-react';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const MainShell: React.FC = () => {
  const { user } = useAuth();
  const {
    isChatOpen,
    chatQuery,
    openChat,
    closeChat,
    notifyPageChange,
  } = useOrb();

  const shouldReduceMotion = useReducedMotion();
  const [windowWidth, setWindowWidth] = useState(
    typeof window !== 'undefined' ? window.innerWidth : 1200
  );

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Detect /dev/motion or query params on load
  const [activeTab, setActiveTab] = useState<TabKey>(() => {
    if (typeof window !== 'undefined') {
      if (window.location.pathname.includes('/dev/motion') || window.location.hash.includes('dev-motion')) {
        return 'dev-motion';
      }
    }
    return 'dashboard';
  });

  // Notify orb director of page transition
  useEffect(() => {
    if (activeTab !== 'dashboard') {
      notifyPageChange(activeTab);
    }
  }, [activeTab, notifyPageChange]);

  if (!user) {
    return <LoginView />;
  }

  const role = user.role || 'storekeeper';

  return (
    <div className="min-h-screen bg-canvas-light dark:bg-canvas-dark text-ink-light dark:text-ink-dark transition-colors duration-300 relative overflow-x-hidden">
      {/* Floating Slim Sidebar (64px wide, 16px from edges) */}
      <Sidebar
        activeTab={activeTab}
        onTabChange={(tab) => setActiveTab(tab)}
        onOpenSettings={() => setActiveTab('settings')}
      />

      {/* Main Content Area */}
      <motion.div
        animate={{
          marginRight: !shouldReduceMotion && windowWidth >= 1024 && isChatOpen ? 388 : 0,
        }}
        transition={{ type: 'spring', damping: 28, stiffness: 220 }}
        className="pl-24 pr-6 sm:pr-8 pt-6 pb-16 min-h-screen flex flex-col justify-between transition-all"
      >
        <div className="max-w-[1480px] w-full mx-auto space-y-6">
          {/* Top Bar (Search, Role indicator, Quick Actions, Ask Ani pill) */}
          <TopBar
            activeTab={activeTab}
            onNavigateTab={(tab) => setActiveTab(tab)}
            onAskAni={(q) => openChat(q)}
          />

          {/* Page Route View with Motion Transitions */}
          <AnimatePresence mode="wait">
            <motion.main
              key={activeTab}
              initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 16, filter: 'blur(6px)' }}
              animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, filter: 'blur(6px)' }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className="w-full"
            >
              {activeTab === 'dashboard' && (
                <DashboardView
                  onNavigateTab={(t) => setActiveTab(t)}
                  onOpenCopilot={(q) => openChat(q)}
                />
              )}

              {activeTab === 'inventory' && <InventoryCatalogView />}

              {activeTab === 'movements' && <MovementsView />}

              {activeTab === 'procurement' && <ProcurementView />}

              {activeTab === 'sales' && <SalesView />}

              {activeTab === 'customers' && <CustomersView />}

              {activeTab === 'suppliers' && <SuppliersView />}

              {activeTab === 'reports' && <ReportsView />}

              {activeTab === 'analytics' && <AnalyticsView />}

              {activeTab === 'ai-copilot' && <AiCopilotPageView />}

              {activeTab === 'audit' && (role === 'admin' || role === 'manager') && <AuditView />}

              {activeTab === 'users' && role === 'admin' && <UsersView />}

              {activeTab === 'business-impact' && (role === 'admin' || role === 'manager') && <BusinessImpactView />}

              {activeTab === 'settings' && <SettingsView />}

              {activeTab === 'dev-motion' && <DevMotionView />}
            </motion.main>
          </AnimatePresence>
        </div>

        {/* Footer with Legacy UI Switcher */}
        <footer className="mt-12 pt-4 border-t border-hairline-light dark:border-hairline-dark flex flex-col sm:flex-row items-center justify-between text-xs text-muted gap-2">
          <div>
            <span>Anishka Inventory Enterprise • v2.5.0-pilot • Gurugram Facility</span>
          </div>
          <div className="flex items-center gap-4">
            <a
              href="/static/legacy.html"
              className="flex items-center gap-1.5 text-sage hover:underline font-medium"
            >
              <span>Switch to Classic UI</span>
              <ExternalLink size={12} />
            </a>
          </div>
        </footer>
      </motion.div>

      {/* Floating Animated Ani Orb Director */}
      <FloatingAniOrb />

      {/* Sliding Glass Ask Ani Chat Panel */}
      <AskAniPanel
        isOpen={isChatOpen}
        onClose={closeChat}
        initialQuery={chatQuery}
      />
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <OrbProvider>
          <MainShell />
        </OrbProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
};
