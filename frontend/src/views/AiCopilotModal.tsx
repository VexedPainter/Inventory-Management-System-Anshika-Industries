import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { X, CornerDownLeft, Sparkles, Loader2 } from 'lucide-react';
import { apiFetch } from '../api/client';
import { AiOrb } from '../components/AiOrb';

interface AiCopilotModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialQuery?: string;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export const AiCopilotModal: React.FC<AiCopilotModalProps> = ({
  isOpen,
  onClose,
  initialQuery = '',
}) => {
  const [query, setQuery] = useState(initialQuery);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: "Namaste! I'm Ani, your Anishka Inventory AI copilot. Ask me anything about current stock levels, pending purchase orders, supplier cadence, or sales trends.",
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const shouldReduceMotion = useReducedMotion();

  useEffect(() => {
    if (initialQuery && isOpen) {
      setQuery(initialQuery);
      handleSend(initialQuery);
    }
  }, [initialQuery, isOpen]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (textToSend?: string) => {
    const text = textToSend || query;
    if (!text.trim() || isLoading) return;

    const userMsg: Message = {
      role: 'user',
      content: text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages(prev => [...prev, userMsg]);
    setQuery('');
    setIsLoading(true);

    try {
      const res = await apiFetch('/api/ai/chat', {
        method: 'POST',
        body: { query: text, language: 'en' },
      });

      const replyContent = res.reply || res.response || res.answer || JSON.stringify(res);
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: replyContent,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } catch (err: any) {
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: `Unable to process query: ${err.message || 'Check connection'}`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop with 8px blur */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/40 backdrop-blur-[8px]"
          />

          {/* Modal Container */}
          <motion.div
            initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 8 }}
            animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
            exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="relative z-10 bg-card-light dark:bg-card-dark w-full max-w-2xl rounded-card shadow-2xl border border-hairline-light dark:border-hairline-dark flex flex-col overflow-hidden max-h-[85vh]"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-hairline-light dark:border-hairline-dark">
              <div className="flex items-center gap-3">
                <AiOrb size={36} />
                <div>
                  <h3 className="text-base font-semibold text-ink-light dark:text-ink-dark">
                    Ani AI Copilot
                  </h3>
                  <p className="text-xs text-muted">Intelligent warehouse assistant</p>
                </div>
              </div>
              <motion.button
                whileTap={{ scale: 0.98 }}
                onClick={onClose}
                className="w-8 h-8 rounded-full flex items-center justify-center text-muted hover:text-ink-light dark:hover:text-ink-dark hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
              >
                <X size={18} />
              </motion.button>
            </div>

            {/* Chat Messages */}
            <div className="flex-1 p-6 overflow-y-auto space-y-4 no-scrollbar">
              {messages.map((m, idx) => (
                <div
                  key={idx}
                  className={`flex gap-3 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  {m.role === 'assistant' && (
                    <div className="w-8 h-8 rounded-full bg-sage/10 text-sage flex items-center justify-center shrink-0 mt-0.5">
                      <Sparkles size={16} />
                    </div>
                  )}
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-xs sm:text-sm leading-relaxed ${
                      m.role === 'user'
                        ? 'bg-ink-light dark:bg-ink-dark text-white rounded-br-xs'
                        : 'bg-canvas-light dark:bg-black/20 text-ink-light dark:text-ink-dark border border-hairline-light dark:border-hairline-dark rounded-bl-xs'
                    }`}
                  >
                    <div className="whitespace-pre-wrap">{m.content}</div>
                    <div className={`text-[10px] mt-1 text-right ${m.role === 'user' ? 'text-white/60' : 'text-muted'}`}>
                      {m.timestamp}
                    </div>
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="flex gap-3 items-center text-xs text-muted">
                  <Loader2 size={16} className="animate-spin text-sage" />
                  <span>Ani is analyzing warehouse telemetry…</span>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Input Box */}
            <div className="p-4 border-t border-hairline-light dark:border-hairline-dark bg-canvas-light/40 dark:bg-black/10">
              <form
                onSubmit={e => {
                  e.preventDefault();
                  handleSend();
                }}
                className="flex items-center gap-2 bg-card-light dark:bg-card-dark rounded-pill px-4 py-2 border border-hairline-light dark:border-hairline-dark shadow-sm"
              >
                <input
                  type="text"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Ask Ani anything about stock, lead times, POs or sales…"
                  className="flex-1 bg-transparent text-xs sm:text-sm text-ink-light dark:text-ink-dark focus:outline-none"
                  autoFocus
                />
                <motion.button
                  whileTap={{ scale: 0.98 }}
                  type="submit"
                  disabled={isLoading || !query.trim()}
                  className="w-8 h-8 rounded-full bg-sage text-white flex items-center justify-center hover:bg-sage-dark disabled:opacity-40 transition-colors sweep-hover"
                >
                  <CornerDownLeft size={14} />
                </motion.button>
              </form>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
