import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { OrbExpression } from '../components/AiOrb';

export type OrbStage = 'docked' | 'intro' | 'callout' | 'dragging' | 'returning';

export interface SpeechChip {
  label: string;
  action: () => void;
}

export interface OrbContextType {
  stage: OrbStage;
  setStage: (stage: OrbStage) => void;
  expression: OrbExpression;
  setExpression: (expr: OrbExpression) => void;
  speechText: string | null;
  speechChips?: SpeechChip[];
  bubblePosition: 'top' | 'right' | 'bottom' | 'left';
  calloutCoords: { top: number; left: number } | null;
  reduceAiPopups: boolean;
  isChatOpen: boolean;
  chatQuery: string;
  dashboardData: any;
  introTrigger: number;
  resetTrigger: number;
  setReduceAiPopups: (val: boolean) => void;
  openChat: (initialQuery?: string) => void;
  closeChat: () => void;
  dismissSpeech: () => void;
  dock: () => void;
  resetPosition: () => void;
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
  const [stage, setStage] = useState<OrbStage>('docked');
  const [expression, setExpression] = useState<OrbExpression>('idle');
  const [speechText, setSpeechText] = useState<string | null>(null);
  const [speechChips, setSpeechChips] = useState<SpeechChip[] | undefined>(undefined);
  const [bubblePosition, setBubblePosition] = useState<'top' | 'right' | 'bottom' | 'left'>('top');
  const [calloutCoords, setCalloutCoords] = useState<{ top: number; left: number } | null>(null);
  const [dashboardData, setDashboardData] = useState<any>(null);
  const [introTrigger, setIntroTrigger] = useState(0);
  const [resetTrigger, setResetTrigger] = useState(0);

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

  // Tracking history
  const spokenHistoryRef = useRef<Set<string>>(new Set());
  const visitedPagesRef = useRef<Set<string>>(new Set());
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
    }, 20000);
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

  const resetPosition = useCallback(() => {
    try {
      localStorage.removeItem('ani-orb-pos');
    } catch {}
    setResetTrigger(prev => prev + 1);
  }, []);

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
      if (spokenHistoryRef.current.has(text)) return;

      spokenHistoryRef.current.add(text);
      if (speechTimeoutRef.current) clearTimeout(speechTimeoutRef.current);

      setSpeechText(text);
      setSpeechChips(options?.chips);
      setExpression(options?.expression || 'speaking');
      setBubblePosition(options?.position || 'top');
      setStage('callout');

      const dur = options?.duration || 4500;
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

  const onDashboardReady = useCallback(
    (stats?: any) => {
      let alreadyDone = false;
      try {
        alreadyDone = sessionStorage.getItem('ani-intro-done') === '1';
      } catch {}

      if (stats) setDashboardData(stats);

      if (alreadyDone) {
        return;
      }

      // Mark session flag immediately to avoid race condition / double effect
      try {
        sessionStorage.setItem('ani-intro-done', '1');
      } catch {}

      if (reduceAiPopups) {
        setStage('docked');
        return;
      }

      setStage('intro');
      setIntroTrigger(prev => prev + 1);
    },
    [reduceAiPopups]
  );

  const notifyPageChange = useCallback(
    (pageKey: string, pageData?: any) => {
      if (reduceAiPopups || visitedPagesRef.current.has(pageKey)) return;
      if (stage === 'intro' || stage === 'dragging' || isChatOpen) return;
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

      say(textToSay, { expression: 'speaking', duration: 4000 });
    },
    [reduceAiPopups, stage, isChatOpen, say]
  );

  return (
    <OrbContext.Provider
      value={{
        stage,
        setStage,
        expression,
        setExpression,
        speechText,
        speechChips,
        bubblePosition,
        calloutCoords,
        reduceAiPopups,
        isChatOpen,
        chatQuery,
        dashboardData,
        introTrigger,
        resetTrigger,
        setReduceAiPopups,
        openChat,
        closeChat,
        dismissSpeech,
        dock,
        resetPosition,
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
