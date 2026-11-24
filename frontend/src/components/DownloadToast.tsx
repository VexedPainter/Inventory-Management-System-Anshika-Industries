import React, { useState, useEffect, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Download, X, AlertCircle, CheckCircle2 } from 'lucide-react';

interface ToastItem {
  id: number;
  msg: string;
  type: 'info' | 'error';
}

let toastId = 0;

/**
 * Global download toast listener.
 * Renders fixed bottom-centre pills for `download-toast` CustomEvents.
 * Auto-dismisses after 3s. No external toast library needed.
 */
export const DownloadToast: React.FC = () => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const addToast = useCallback((msg: string, type: 'info' | 'error') => {
    const id = ++toastId;
    setToasts(prev => [...prev, { id, msg, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3200);
  }, []);

  const removeToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const { msg, type } = (e as CustomEvent<{ msg: string; type: 'info' | 'error' }>).detail;
      addToast(msg, type);
    };
    window.addEventListener('download-toast', handler);
    return () => window.removeEventListener('download-toast', handler);
  }, [addToast]);

  return (
    <div className="fixed bottom-24 md:bottom-6 left-1/2 -translate-x-1/2 z-[9999] flex flex-col items-center gap-2 pointer-events-none">
      <AnimatePresence>
        {toasts.map(t => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, y: 12, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.95 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className={`pointer-events-auto flex items-center gap-2.5 px-4 py-2.5 rounded-full shadow-xl text-xs font-semibold text-white backdrop-blur-md ${
              t.type === 'error'
                ? 'bg-red-600/90'
                : 'bg-[#2D6A4F]/90'
            }`}
          >
            {t.type === 'error' ? (
              <AlertCircle size={14} className="shrink-0" />
            ) : (
              <Download size={14} className="shrink-0 animate-bounce" />
            )}
            <span>{t.msg}</span>
            <button
              onClick={() => removeToast(t.id)}
              className="ml-1 opacity-70 hover:opacity-100 transition-opacity"
              aria-label="Dismiss"
            >
              <X size={12} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};
