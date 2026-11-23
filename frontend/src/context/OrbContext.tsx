import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { OrbExpression } from '../components/AiOrb';

interface SpeechChip {
  label: string;
  action: () => void;
}

interface OrbContextType {
  stage: 'center' | 'callout' | 'docked';
  expression: OrbExpression;
  speechText: string | null;
  speechChips?: SpeechChip[];
  bubblePosition: 'top' | 'right' | 'bottom' | 'left';
  calloutCoords: { top: number; left: number } | null;
  reduceAiPopups: boolean;
  isChatOpen: boolean;
  chatQuery: string;
  setReduceAiPopups: (val: boolean) => void;
  openChat: (initialQuery?: string) => void;
  closeChat: () => void;
  dismissSpeech: () => void;
  dock: () => void;
  say: (
    text: string,
    options?: {
      chips?: SpeechChip[];
      expression?: OrbExpression;
      duration?: number;
      targetSelector?: string;
      position?: 'top' | 'right' | 'bottom' | 'left';
    }
  ) => void;
  notifyPageChange: (pageKey: string, pageData?: any) => void;
  triggerSuccess: (msg?: string) => void;
  triggerAlert: (msg?: string) => void;
  onDashboardReady: (stats?: any) => void;
}

const OrbContext = createContext<OrbContextType | undefined>(undefined);

export const OrbProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [stage, setStage] = useState<'center' | 'callout' | 'docked'>('docked');
  const [expression, setExpression] = useState<OrbExpression>('idle');
  const [speechText, setSpeechText] = useState<string | null>(null);
  const [speechChips, setSpeechChips] = useState<SpeechChip[] | undefined>(undefined);
  const [bubblePosition, setBubblePosition] = useState<'top' | 'right' | 'bottom' | 'left'>('top');
  const [calloutCoords, setCalloutCoords] = useState<{ top: number; left: number } | null>(null);

  // Settings
  const [reduceAiPopups, setReduceAiPopupsState] = useState<boolean>(() => {
    try {
      return localStorage.getItem('anishka_reduce_ai_popups') === 'true';
    } catch {
      return false;
    }
  });

  const setReduceAiPopups = (val: boolean) => {
    setReduceAiPopupsState(val);
    try {
      localStorage.setItem('anishka_reduce_ai_popups', String(val));
    } catch {}
  };

  // Chat modal state
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatQuery, setChatQuery] = useState('');

  // History tracking to satisfy: "Never repeat the same line twice in a session, and don't show it more than once per page visit."
  const spokenHistoryRef = useRef<Set<string>>(new Set());
  const visitedPagesRef = useRef<Set<string>>(new Set());
  const introDoneRef = useRef<boolean>(false);
  const speechTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleSleepyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset 20s idle timer to 'sleepy' when docked
  const resetIdleTimer = useCallback(() => {
    if (idleSleepyTimerRef.current) clearTimeout(idleSleepyTimerRef.current);
    if (expression === 'sleepy') setExpression('idle');

    idleSleepyTimerRef.current = setTimeout(() => {
      setStage(curr => {
        if (curr === 'docked') {
          setExpression('sleepy');
        }
        return curr;
      });
    }, 20000); // 20s idle
  }, [expression]);

  useEffect(() => {
    const handleUserActivity = () => {
      resetIdleTimer();
    };

    window.addEventListener('mousemove', handleUserActivity, { passive: true });
    window.addEventListener('keydown', handleUserActivity, { passive: true });
    window.addEventListener('click', handleUserActivity, { passive: true });

    resetIdleTimer();

    return () => {
      window.removeEventListener('mousemove', handleUserActivity);
      window.removeEventListener('keydown', handleUserActivity);
      window.removeEventListener('click', handleUserActivity);
      if (idleSleepyTimerRef.current) clearTimeout(idleSleepyTimerRef.current);
    };
  }, [resetIdleTimer]);

  const dismissSpeech = useCallback(() => {
    if (speechTimeoutRef.current) clearTimeout(speechTimeoutRef.current);
    setSpeechText(null);
    setSpeechChips(undefined);
    setExpression('idle');
  }, []);

  const dock = useCallback(() => {
    dismissSpeech();
    setStage('docked');
    setCalloutCoords(null);
  }, [dismissSpeech]);

  const openChat = useCallback((initialQuery?: string) => {
    dismissSpeech();
    setChatQuery(initialQuery || '');
    setIsChatOpen(true);
    setExpression('thinking');
  }, [dismissSpeech]);

  const closeChat = useCallback(() => {
    setIsChatOpen(false);
    setExpression('idle');
  }, []);

  const say = useCallback(
    (
      text: string,
      options?: {
        chips?: SpeechChip[];
        expression?: OrbExpression;
        duration?: number;
        targetSelector?: string;
        position?: 'top' | 'right' | 'bottom' | 'left';
      }
    ) => {
      if (reduceAiPopups) return;
      if (spokenHistoryRef.current.has(text)) return; // Never repeat the same line twice

      spokenHistoryRef.current.add(text);
      if (speechTimeoutRef.current) clearTimeout(speechTimeoutRef.current);

      setSpeechText(text);
      setSpeechChips(options?.chips);
      setExpression(options?.expression || 'speaking');
      setBubblePosition(options?.position || 'top');

      if (options?.targetSelector) {
        const el = document.querySelector(options.targetSelector);
        if (el) {
          const rect = el.getBoundingClientRect();
          setCalloutCoords({
            top: rect.top + window.scrollY + rect.height / 2,
            left: rect.right + 24,
          });
          setStage('callout');
        }
      }

      // Auto-hide after duration (default 4.0s)
      const dur = options?.duration || 4000;
      speechTimeoutRef.current = setTimeout(() => {
        dismissSpeech();
        dock();
      }, dur);
    },
    [reduceAiPopups, dismissSpeech, dock]
  );

  const triggerSuccess = useCallback(
    (msg?: string) => {
      setExpression('success');
      if (msg) {
        say(msg, { expression: 'success', duration: 3000 });
      } else {
        setTimeout(() => setExpression('idle'), 1200);
      }
    },
    [say]
  );

  const triggerAlert = useCallback(
    (msg?: string) => {
      setExpression('alert');
      if (msg) {
        say(msg, { expression: 'alert', duration: 4000 });
      } else {
        setTimeout(() => setExpression('idle'), 2500);
      }
    },
    [say]
  );

  // 1. Initial Login Choreography: Orb in center, then glides to low stock card
  const onDashboardReady = useCallback(
    (stats?: any) => {
      if (introDoneRef.current || reduceAiPopups) return;
      introDoneRef.current = true;

      // Stage 1: First login: orb fades in at screen centre with bubble
      setStage('center');
      setExpression('speaking');
      setSpeechText("I'm Ani, your inventory AI.");
      setSpeechChips(undefined);
      setBubblePosition('top');

      // Stage 2: After 1.8s, glide to sit beside relevant card (e.g. low stock)
      setTimeout(() => {
        const lowStockCount = stats?.status_distribution?.LOW ?? (stats?.counts?.LOW || 0);
        const speechLine =
          lowStockCount > 0
            ? `${lowStockCount} items are below reorder buffer. Want me to draft POs?`
            : 'Warehouse telemetry is optimal. All safety buffers intact.';

        const targetEl = document.getElementById('bento-low-stock') || document.querySelector('[data-card="low-stock"]');
        if (targetEl) {
          const rect = targetEl.getBoundingClientRect();
          setCalloutCoords({
            top: rect.top + window.scrollY + 20,
            left: rect.left + rect.width - 20,
          });
        }
        setStage('callout');
        setExpression('speaking');
        setSpeechText(speechLine);
        setSpeechChips([
          {
            label: 'Draft POs',
            action: () => {
              openChat('Draft purchase orders for all items below reorder buffer');
            },
          },
          {
            label: 'Not now',
            action: () => {
              dock();
            },
          },
        ]);

        // Stage 3: After 4s it shrinks to 40px and docks bottom-right
        if (speechTimeoutRef.current) clearTimeout(speechTimeoutRef.current);
        speechTimeoutRef.current = setTimeout(() => {
          dock();
        }, 4000);
      }, 2000);
    },
    [reduceAiPopups, openChat, dock]
  );

  // 4. Page change choreography: pop out of dock, glide to card, say one data-driven line, return to dock
  const notifyPageChange = useCallback(
    (pageKey: string, pageData?: any) => {
      if (reduceAiPopups || visitedPagesRef.current.has(pageKey)) return;
      visitedPagesRef.current.add(pageKey);

      let textToSay = '';
      if (pageKey === 'inventory' && typeof pageData?.counts?.OUT === 'number' && pageData.counts.OUT > 0) {
        textToSay = `${pageData.counts.OUT} SKUs are completely out of stock.`;
      } else if (pageKey === 'sales' && pageData?.overdueTotal) {
        textToSay = `₹${Number(pageData.overdueTotal).toLocaleString('en-IN')} in customer receivables are overdue.`;
      } else if (pageKey === 'procurement' && typeof pageData?.pendingCount === 'number' && pageData.pendingCount > 0) {
        textToSay = `${pageData.pendingCount} purchase orders are currently open with suppliers.`;
      } else if (pageKey === 'analytics' && pageData?.classASpendPct) {
        textToSay = `Class-A items account for ${pageData.classASpendPct}% of cumulative annual spend.`;
      }

      if (!textToSay || spokenHistoryRef.current.has(textToSay)) return;

      // Pop out of dock with spring
      spokenHistoryRef.current.add(textToSay);
      setStage('callout');
      setCalloutCoords({
        top: 140,
        left: window.innerWidth > 900 ? window.innerWidth - 180 : window.innerWidth - 80,
      });
      setExpression('speaking');
      setSpeechText(textToSay);
      setSpeechChips(undefined);
      setBubblePosition('left');

      if (speechTimeoutRef.current) clearTimeout(speechTimeoutRef.current);
      speechTimeoutRef.current = setTimeout(() => {
        dock();
      }, 4000);
    },
    [reduceAiPopups, dock]
  );

  return (
    <OrbContext.Provider
      value={{
        stage,
        expression,
        speechText,
        speechChips,
        bubblePosition,
        calloutCoords,
        reduceAiPopups,
        isChatOpen,
        chatQuery,
        setReduceAiPopups,
        openChat,
        closeChat,
        dismissSpeech,
        dock,
        say,
        notifyPageChange,
        triggerSuccess,
        triggerAlert,
        onDashboardReady,
      }}
    >
      {children}
    </OrbContext.Provider>
  );
};

export const useOrb = () => {
  const context = useContext(OrbContext);
  if (!context) {
    throw new Error('useOrb must be used within an OrbProvider');
  }
  return context;
};
