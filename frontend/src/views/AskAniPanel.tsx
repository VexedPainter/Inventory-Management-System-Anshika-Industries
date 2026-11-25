import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { useQueryClient } from '@tanstack/react-query';
import {
  X,
  Send,
  Mic,
  MicOff,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Wrench,
  CornerDownLeft,
  ChevronDown,
  ArrowRight,
  Loader2,
} from 'lucide-react';
import { apiFetch } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useOrb } from '../context/OrbContext';
import { AniOrb } from '../components/AiOrb';
import { MarkdownRenderer } from '../components/MarkdownRenderer';

interface ProposedAction {
  action: string;
  summary: string;
  endpoint: string;
  method: string;
  payload: any;
  requires_role?: string[];
  stock_impact?: {
    current_on_hand: number;
    available_before: number;
    available_after: number;
  };
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  tool_calls?: any[];
  proposed_action?: ProposedAction | null;
  actionStatus?: 'pending' | 'approved' | 'cancelled';
  timestamp: string;
  isStreaming?: boolean;
}

interface AskAniPanelProps {
  isOpen: boolean;
  onClose: () => void;
  initialQuery?: string;
}

// Word-by-word streaming reveal component for assistant messages
const StreamedText: React.FC<{
  content: string;
  isStreaming?: boolean;
  onFinish?: () => void;
}> = ({ content, isStreaming, onFinish }) => {
  const [displayedWordCount, setDisplayedWordCount] = useState(() => (isStreaming ? 1 : 999999));
  const words = content.split(' ');

  useEffect(() => {
    if (!isStreaming) {
      setDisplayedWordCount(words.length);
      return;
    }

    setDisplayedWordCount(1);
    let count = 1;
    const interval = setInterval(() => {
      count += 2; // Stream 2 words every 28ms for realistic fast fluid LLM typing
      setDisplayedWordCount(count);
      if (count >= words.length) {
        clearInterval(interval);
        if (onFinish) onFinish();
      }
    }, 28);

    return () => clearInterval(interval);
  }, [content, isStreaming, onFinish, words.length]);

  const visibleText = words.slice(0, displayedWordCount).join(' ');
  return <MarkdownRenderer content={visibleText} />;
};

export const AskAniPanel: React.FC<AskAniPanelProps> = ({
  isOpen,
  onClose,
  initialQuery = '',
}) => {
  const { user } = useAuth();
  const { triggerSuccess, triggerAlert } = useOrb();
  const queryClient = useQueryClient();
  const shouldReduceMotion = useReducedMotion();

  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  // Extract user first name
  const rawName = user?.full_name || user?.username || 'Partner';
  const firstName = rawName.split(' ')[0];

  // Initialize Speech Recognition if supported
  useEffect(() => {
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRec) {
      setSpeechSupported(true);
      const recognizer = new SpeechRec();
      recognizer.continuous = false;
      recognizer.interimResults = false;
      recognizer.lang = 'en-IN';

      recognizer.onresult = (event: any) => {
        const text = event.results[0][0].transcript;
        setInput(prev => (prev ? `${prev} ${text}` : text));
        setIsListening(false);
      };

      recognizer.onerror = () => {
        setIsListening(false);
      };

      recognizer.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognizer;
    }
  }, []);

  // Keyboard shortcut Esc to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Handle initialQuery when panel opens
  useEffect(() => {
    if (initialQuery && isOpen) {
      setInput('');
      handleSend(initialQuery);
    }
  }, [initialQuery, isOpen]);

  // Scroll to bottom on message updates
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const toggleMic = () => {
    if (!speechSupported || !recognitionRef.current) return;
    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      try {
        recognitionRef.current.start();
        setIsListening(true);
      } catch (err) {
        setIsListening(false);
      }
    }
  };

  const handleSend = async (textToSend?: string) => {
    const text = (textToSend || input).trim();
    if (!text || isLoading) return;

    if (/reorder|replenish|emergency purchase order|auto-draft/i.test(text)) {
      sessionStorage.setItem('needs_attention_dismissed', '1');
      window.dispatchEvent(new CustomEvent('replenishment-handled'));
    }

    const userMsg: ChatMessage = {
      id: String(Date.now()),
      role: 'user',
      content: text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      // Build conversation history for context memory (last 6 turns)
      const convHistory = messages.slice(-6).map(m => ({
        role: m.role,
        content: m.content,
      }));

      const res = await apiFetch('/api/ai/chat', {
        method: 'POST',
        body: {
          message: text,
          conversation_history: convHistory,
          stream: false,
        },
      });

      const replyText =
        res.response ||
        res.narrative ||
        res.reply ||
        res.answer ||
        (typeof res === 'string' ? res : 'Grounded analysis complete.');

      const assistantMsg: ChatMessage = {
        id: String(Date.now() + 1),
        role: 'assistant',
        content: replyText,
        tool_calls: res.tool_calls || [],
        proposed_action: res.proposed_action || null,
        actionStatus: res.proposed_action ? 'pending' : undefined,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        isStreaming: true,
      };

      setMessages(prev => [...prev, assistantMsg]);
    } catch (err: any) {
      const errorMsg: ChatMessage = {
        id: String(Date.now() + 1),
        role: 'assistant',
        content: `I encountered an issue connecting to the warehouse AI engine: **${
          err.message || 'Check network connection'
        }**. Please try asking about low stock or purchase orders.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  // Confirm-before-write Approve handler
  const handleApproveAction = async (msgId: string, action: ProposedAction) => {
    try {
      setMessages(prev =>
        prev.map(m => (m.id === msgId ? { ...m, actionStatus: 'approved' } : m))
      );

      // Call the existing endpoint specified in the proposed_action!
      await apiFetch(action.endpoint, {
        method: action.method || 'POST',
        body: action.payload,
      });

      // Invalidate queries across the app so all numbers refresh
      queryClient.invalidateQueries();

      // Ensure needs attention banner is dismissed and stays dismissed
      sessionStorage.setItem('needs_attention_dismissed', '1');
      window.dispatchEvent(new CustomEvent('replenishment-handled', { detail: { action } }));

      // Success animation on orb & show toast
      triggerSuccess('Action approved and recorded in audit ledger');
      setToast('Action successfully executed and recorded in tamper-evident ledger.');
      setTimeout(() => setToast(null), 4000);

      // Append confirmation note
      setMessages(prev => [
        ...prev,
        {
          id: String(Date.now()),
          role: 'assistant',
          content: `✅ **Executed Successfully:** ${action.summary}. The transaction has been cryptographically recorded in the system audit trail.`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } catch (err: any) {
      triggerAlert('Failed to execute proposed action');
      setToast(`Execution failed: ${err.message || 'Permission denied or validation error'}`);
      setTimeout(() => setToast(null), 4000);
      setMessages(prev =>
        prev.map(m => (m.id === msgId ? { ...m, actionStatus: 'pending' } : m))
      );
    }
  };

  const handleCancelAction = (msgId: string) => {
    setMessages(prev =>
      prev.map(m => (m.id === msgId ? { ...m, actionStatus: 'cancelled' } : m))
    );
  };

  const SUGGESTION_CHIPS = [
    'What is low on stock?',
    'Draft POs for critical items',
    'Who owes us money?',
    'Summarise this week',
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Mobile backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40 lg:hidden"
          />

          {/* Panel Container: Desktop = right slide-in glass panel (380px wide); Mobile = bottom sheet (85% height) */}
          <motion.div
            initial={
              shouldReduceMotion
                ? { opacity: 0 }
                : window.innerWidth < 1024
                ? { y: '100%' }
                : { x: '100%' }
            }
            animate={
              shouldReduceMotion
                ? { opacity: 1 }
                : window.innerWidth < 1024
                ? { y: 0 }
                : { x: 0 }
            }
            exit={
              shouldReduceMotion
                ? { opacity: 0 }
                : window.innerWidth < 1024
                ? { y: '100%' }
                : { x: '100%' }
            }
            transition={{
              type: 'spring',
              stiffness: 300,
              damping: 30,
              mass: 0.9,
            }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="ask-ani-title"
            className="fixed z-50 flex flex-col overflow-hidden bg-white/85 dark:bg-[#181B1A]/90 backdrop-blur-[24px] border border-hairline-light dark:border-hairline-dark shadow-2xl transition-colors
              bottom-0 left-0 right-0 h-[85vh] rounded-t-[24px]
              lg:bottom-6 lg:right-6 lg:left-auto lg:top-6 lg:h-[calc(100vh-3rem)] lg:w-[380px] lg:rounded-[24px]"
            style={{ willChange: 'transform' }}
          >
            {/* Mobile Drag Handle */}
            <div className="w-12 h-1 bg-black/15 dark:bg-white/20 rounded-full mx-auto mt-2.5 mb-1 lg:hidden" />

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-hairline-light dark:border-hairline-dark">
              <div className="flex items-center gap-3">
                <AniOrb size={32} interactive={false} isFloating={false} />
                <div>
                  <div className="flex items-center gap-1.5">
                    <h3 id="ask-ani-title" className="text-sm font-semibold text-ink-light dark:text-ink-dark">
                      Ani
                    </h3>
                    <span className="w-1.5 h-1.5 rounded-full bg-sage animate-pulse" />
                  </div>
                  <p className="text-[11px] text-muted font-medium">
                    Grounded in your live data
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1">
                <motion.button
                  whileTap={{ scale: 0.94 }}
                  onClick={onClose}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-muted hover:text-ink-light dark:hover:text-ink-dark hover:bg-black/5 dark:hover:bg-white/5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage"
                  aria-label="Close Ask Ani"
                  title="Close Ask Ani (Esc)"
                >
                  <X size={17} />
                </motion.button>
              </div>
            </div>

            {/* Toast Alert Banner */}
            <AnimatePresence>
              {toast && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="bg-positive/10 text-positive px-4 py-2 text-xs font-medium flex items-center gap-2 border-b border-positive/20"
                >
                  <CheckCircle2 size={14} className="shrink-0" />
                  <span className="truncate">{toast}</span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Chat Body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar">
              {/* Empty State */}
              {messages.length === 0 && (
                <div className="py-6 flex flex-col items-center text-center select-none">
                  <div className="my-3">
                    <AniOrb size={64} expression="speaking" interactive={false} />
                  </div>
                  <h4 className="text-base font-semibold text-ink-light dark:text-ink-dark mt-2">
                    Hi {firstName}, I'm Ani
                  </h4>
                  <p className="text-xs text-muted max-w-xs mt-1 leading-relaxed">
                    Ask me anything about warehouse stock, purchase orders, customer receivables, or sales.
                  </p>

                  {/* 4 Suggestion Chips in 2x2 Grid */}
                  <div className="grid grid-cols-2 gap-2 mt-6 w-full max-w-sm">
                    {SUGGESTION_CHIPS.map((chip, idx) => (
                      <motion.button
                        key={idx}
                        whileHover={{ scale: 1.02, y: -1 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => handleSend(chip)}
                        className="p-3 text-left rounded-tile bg-white/70 dark:bg-black/20 hover:bg-white dark:hover:bg-black/40 border border-hairline-light dark:border-hairline-dark text-xs font-medium text-ink-light dark:text-ink-dark shadow-sm hover:border-sage/40 transition-all flex flex-col justify-between"
                      >
                        <span className="leading-snug">{chip}</span>
                        <ArrowRight size={12} className="text-sage mt-2 self-end" />
                      </motion.button>
                    ))}
                  </div>
                </div>
              )}

              {/* Message List */}
              {messages.map(m => (
                <div
                  key={m.id}
                  className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'} space-y-1.5`}
                >
                  {/* Bubble */}
                  <div
                    className={`max-w-[88%] text-xs leading-relaxed ${
                      m.role === 'user'
                        ? 'bg-[#141414] dark:bg-white text-white dark:text-[#141414] rounded-2xl px-4 py-2.5 rounded-br-xs shadow-sm'
                        : 'bg-white dark:bg-black/30 text-ink-light dark:text-ink-dark rounded-2xl p-4 shadow-sm border border-hairline-light dark:border-hairline-dark rounded-bl-xs'
                    }`}
                  >
                    {m.role === 'user' ? (
                      <div className="whitespace-pre-wrap font-medium">{m.content}</div>
                    ) : (
                      <StreamedText
                        content={m.content}
                        isStreaming={m.isStreaming}
                        onFinish={() => {
                          setMessages(prev =>
                            prev.map(item => (item.id === m.id ? { ...item, isStreaming: false } : item))
                          );
                        }}
                      />
                    )}
                  </div>

                  {/* Tool Call Chips */}
                  {m.tool_calls && m.tool_calls.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                      {m.tool_calls.map((tc, idx) => {
                        const toolName = typeof tc === 'string' ? tc : tc.tool || 'tool';
                        return (
                          <span
                            key={idx}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono bg-sage/10 text-sage border border-sage/20"
                          >
                            <Wrench size={10} />
                            <span>{toolName}</span>
                          </span>
                        );
                      })}
                    </div>
                  )}

                  {/* Proposed Action Confirmation Card */}
                  {m.proposed_action && (
                    <div className="w-full max-w-[88%] bg-white dark:bg-[#181B1A] rounded-card p-3.5 shadow-md border border-hairline-light dark:border-hairline-dark space-y-2.5 my-1">
                      <div className="flex items-center gap-2">
                        <Sparkles size={14} className="text-[#3328E8] dark:text-[#8E86FF]" />
                        <span className="text-[11px] font-bold text-ink-light dark:text-ink-dark uppercase tracking-wide">
                          Proposed Action
                        </span>
                      </div>
                      <p className="text-xs text-muted leading-snug">
                        {m.proposed_action.summary}
                      </p>

                      {/* Stock Impact Preview if available */}
                      {m.proposed_action.stock_impact && (
                        <div className="p-2 rounded bg-black/5 dark:bg-white/5 text-[11px] font-mono flex items-center justify-between">
                          <span>Available: {m.proposed_action.stock_impact.available_before}</span>
                          <span>→</span>
                          <span className="font-bold text-sage">
                            After: {m.proposed_action.stock_impact.available_after}
                          </span>
                        </div>
                      )}

                      {/* Actions */}
                      {m.actionStatus === 'approved' ? (
                        <div className="text-[11px] text-positive font-semibold flex items-center gap-1.5 pt-1">
                          <CheckCircle2 size={13} />
                          <span>Approved & executed</span>
                        </div>
                      ) : m.actionStatus === 'cancelled' ? (
                        <div className="text-[11px] text-muted italic pt-1">
                          Action dismissed
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 pt-1">
                          <motion.button
                            whileTap={{ scale: 0.98 }}
                            onClick={() => handleApproveAction(m.id, m.proposed_action!)}
                            className="px-3.5 py-1.5 bg-[#141414] dark:bg-white text-white dark:text-[#141414] hover:bg-black dark:hover:bg-white/90 rounded-pill text-xs font-semibold shadow-sm transition-colors"
                          >
                            Approve
                          </motion.button>
                          <motion.button
                            whileTap={{ scale: 0.98 }}
                            onClick={() => handleCancelAction(m.id)}
                            className="px-3 py-1.5 bg-black/5 dark:bg-white/10 hover:bg-black/10 text-muted hover:text-ink-light dark:hover:text-ink-dark rounded-pill text-xs font-medium transition-colors"
                          >
                            Cancel
                          </motion.button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Timestamp */}
                  <span className="text-[10px] text-muted px-1">{m.timestamp}</span>
                </div>
              ))}

              {/* Waiting Indicator with Thinking Orb & Bouncing Dots */}
              {isLoading && (
                <div className="flex items-center gap-3 py-2">
                  <AniOrb size={28} expression="thinking" interactive={false} isFloating={false} />
                  <div className="bg-white dark:bg-black/30 rounded-2xl px-4 py-2.5 border border-hairline-light dark:border-hairline-dark shadow-sm flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-sage animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-sage animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-sage animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input Bar */}
            <div className="p-3.5 border-t border-hairline-light dark:border-hairline-dark bg-white/40 dark:bg-black/10">
              <form
                onSubmit={e => {
                  e.preventDefault();
                  handleSend();
                }}
                className="flex items-center gap-2 bg-white dark:bg-[#181B1A] rounded-pill px-3.5 py-1.5 border border-hairline-light dark:border-hairline-dark shadow-sm focus-within:border-sage/50 transition-colors"
              >
                <input
                  type="text"
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  placeholder="Ask about sales, stock, profit…"
                  className="flex-1 bg-transparent text-xs text-ink-light dark:text-ink-dark focus:outline-none placeholder:text-muted"
                  autoFocus
                />

                {/* Speech to text mic button */}
                {speechSupported && (
                  <motion.button
                    whileTap={{ scale: 0.98 }}
                    type="button"
                    onClick={toggleMic}
                    className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors ${
                      isListening
                        ? 'bg-negative text-white animate-pulse'
                        : 'text-muted hover:text-ink-light dark:hover:text-ink-dark'
                    }`}
                    title={isListening ? 'Stop listening' : 'Speak query (en-IN)'}
                  >
                    {isListening ? <MicOff size={13} /> : <Mic size={13} />}
                  </motion.button>
                )}

                {/* Send button */}
                <motion.button
                  whileTap={{ scale: 0.98 }}
                  type="submit"
                  disabled={isLoading || !input.trim()}
                  className="w-7 h-7 rounded-full bg-[#141414] dark:bg-white text-white dark:text-[#141414] flex items-center justify-center disabled:opacity-30 transition-all sweep-hover"
                  title="Send message (Enter)"
                >
                  <CornerDownLeft size={13} />
                </motion.button>
              </form>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
