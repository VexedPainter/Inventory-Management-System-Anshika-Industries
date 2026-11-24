import React, { useState, useEffect, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Download, X, AlertCircle, CheckCircle2 } from 'lucide-react';

interface ToastItem {
  id: number;
  msg: string;
  type: 'info' | 'error' | 'success';
}

let toastId = 0;

/**
 * Global toast notification system.
 * Renders fixed bottom-centre pills for `download-toast` CustomEvents.
 * Auto-dismisses after 3.5s. Respects prefers-reduced-motion.
 * Enter: ease-out 220ms. Exit: ease-in 180ms. No bounce animation.
 */
export const DownloadToast: React.FC = () => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const addToast = useCallback((msg: string, type: 'info' | 'error' | 'success' = 'info') => {
    const id = ++toastId;
    setToasts(prev => [...prev, { id, msg, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3500);
  }, []);

  const removeToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const { msg, type } = (e as CustomEvent<{ msg: string; type: 'info' | 'error' | 'success' }>).detail;
      addToast(msg, type || 'info');
    };
    window.addEventListener('download-toast', handler);
    return () => window.removeEventListener('download-toast', handler);
  }, [addToast]);

  const toastStyles = {
    info: 'bg-[#1C3A2C]/95 border-[#2D7A52]/30',
    success: 'bg-[#1C3A2C]/95 border-[#2D7A52]/30',
    error: 'bg-[#3A1C1C]/95 border-[#C94040]/30',
  };

  const toastIcons = {
    info: <Download size={14} className="shrink-0 text-[#5F9B7A]" />,
    success: <CheckCircle2 size={14} className="shrink-0 text-[#5F9B7A]" />,
    error: <AlertCircle size={14} className="shrink-0 text-[#D95050]" />,
  };

  return (
    <div
      className="fixed bottom-24 md:bottom-6 left-1/2 -translate-x-1/2 z-[9999] flex flex-col items-center gap-2 pointer-events-none"
      role="region"
      aria-label="Notifications"
      aria-live="polite"
    >
      <AnimatePresence>
        {toasts.map(t => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, y: 10, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.97 }}
            transition={{
              enter: { duration: 0.22, ease: [0.22, 1, 0.36, 1] },
              exit: { duration: 0.18, ease: [0.64, 0, 0.78, 0] },
              duration: 0.22,
              ease: [0.22, 1, 0.36, 1],
            }}
            role="status"
            aria-live="polite"
            className={`pointer-events-auto flex items-center gap-2.5 px-4 py-2.5 rounded-full border shadow-xl text-xs font-semibold text-white backdrop-blur-md ${toastStyles[t.type]}`}
          >
            {toastIcons[t.type]}
            <span>{t.msg}</span>
            <button
              onClick={() => removeToast(t.id)}
              className="ml-1 opacity-60 hover:opacity-100 transition-opacity focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/50 rounded-full"
              aria-label="Dismiss notification"
            >
              <X size={12} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};
