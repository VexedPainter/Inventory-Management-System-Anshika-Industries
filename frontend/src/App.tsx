import React, { useState, useEffect, Suspense, lazy } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { AuthProvider, useAuth } from './context/AuthContext';
import { OrbProvider, useOrb } from './context/OrbContext';
import { Sidebar, TabKey } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { FloatingAniOrb } from './components/FloatingAniOrb';
import { DownloadToast } from './components/DownloadToast';
import { AskAniPanel } from './views/AskAniPanel';
import { LoginView } from './views/LoginView';
import { ForcedPasswordModal } from './components/ForcedPasswordModal';
import { Skeleton } from './components/Skeleton';
import { ExternalLink } from 'lucide-react';

// Code-split route components for optimized initial load performance
const DashboardView = lazy(() => import('./views/DashboardView').then(m => ({ default: m.DashboardView })));
const InventoryCatalogView = lazy(() => import('./views/InventoryCatalogView').then(m => ({ default: m.InventoryCatalogView })));
const MovementsView = lazy(() => import('./views/MovementsView').then(m => ({ default: m.MovementsView })));
const ProcurementView = lazy(() => import('./views/ProcurementView').then(m => ({ default: m.ProcurementView })));
const SalesView = lazy(() => import('./views/SalesView').then(m => ({ default: m.SalesView })));
const CustomersView = lazy(() => import('./views/CustomersView').then(m => ({ default: m.CustomersView })));
const SuppliersView = lazy(() => import('./views/SuppliersView').then(m => ({ default: m.SuppliersView })));
const ReportsView = lazy(() => import('./views/ReportsView').then(m => ({ default: m.ReportsView })));
const AnalyticsView = lazy(() => import('./views/AnalyticsView').then(m => ({ default: m.AnalyticsView })));
const AiCopilotPageView = lazy(() => import('./views/AiCopilotPageView').then(m => ({ default: m.AiCopilotPageView })));
const AuditView = lazy(() => import('./views/AuditView').then(m => ({ default: m.AuditView })));
const UsersView = lazy(() => import('./views/UsersView').then(m => ({ default: m.UsersView })));
const SettingsView = lazy(() => import('./views/SettingsView').then(m => ({ default: m.SettingsView })));
const BusinessImpactView = lazy(() => import('./views/BusinessImpactView').then(m => ({ default: m.BusinessImpactView })));
const DevMotionView = lazy(() => import('./views/DevMotionView').then(m => ({ default: m.DevMotionView })));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const RouteFallback: React.FC = () => (
  <div className="space-y-6 animate-pulse" role="status" aria-label="Loading view">
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
      <Skeleton className="h-9 w-64 rounded-2xl" />
      <Skeleton className="h-9 w-32 rounded-full" />
    </div>
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      <Skeleton className="h-28 rounded-3xl" />
      <Skeleton className="h-28 rounded-3xl" />
      <Skeleton className="h-28 rounded-3xl" />
      <Skeleton className="h-28 rounded-3xl" />
    </div>
    <Skeleton className="h-96 rounded-3xl" />
  </div>
);

const MainShell: React.FC = () => {
  const { user, showForcedPasswordModal } = useAuth();
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
  const mustChangePwd = Boolean(user.must_change_password || showForcedPasswordModal);

  return (
    <div className="min-h-screen bg-canvas-light dark:bg-canvas-dark text-ink-light dark:text-ink-dark transition-colors duration-300 relative overflow-x-hidden">
      {/* Forced Password Change Modal */}
      {mustChangePwd && <ForcedPasswordModal />}

      {/* Navigation: Desktop left slim bar + Mobile bottom tab bar */}
      <Sidebar
        activeTab={activeTab}
        onTabChange={(tab) => setActiveTab(tab)}
        onOpenSettings={() => setActiveTab('settings')}
      />

      {/* Main Content Area (Fluid responsive: 390, 768, 1024, 1440) */}
      <motion.div
        animate={{
          marginRight: !shouldReduceMotion && windowWidth >= 1024 && isChatOpen ? 388 : 0,
        }}
        transition={{ type: 'spring', damping: 28, stiffness: 220 }}
        className="pl-4 md:pl-24 pr-4 md:pr-8 pt-4 md:pt-6 pb-28 md:pb-16 min-h-screen flex flex-col justify-between transition-all"
      >
        <div className="max-w-[1480px] w-full mx-auto space-y-6">
          {/* Top Bar (Search, Role indicator, Quick Actions, Ask Ani pill) */}
          <TopBar
            activeTab={activeTab}
            onNavigateTab={(tab) => setActiveTab(tab)}
            onAskAni={(q) => openChat(q)}
          />

          {/* Page Route View with Motion Transitions and Code-Split Suspense */}
          <AnimatePresence mode="wait">
            <motion.main
              key={activeTab}
              role="main"
              aria-label={`${activeTab} view`}
              initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 16, filter: 'blur(6px)' }}
              animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, filter: 'blur(6px)' }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className="w-full"
            >
              <Suspense fallback={<RouteFallback />}>
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
              </Suspense>
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

      {/* Download Toast Notifications */}
      <DownloadToast />

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
