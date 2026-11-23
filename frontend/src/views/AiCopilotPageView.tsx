import React, { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles,
  Send,
  CornerDownLeft,
  Wrench,
  Activity,
  Cpu,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Layers,
} from 'lucide-react';
import { apiFetch } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useOrb } from '../context/OrbContext';
import { AniOrb } from '../components/AiOrb';
import { MarkdownRenderer } from '../components/MarkdownRenderer';

export const AiCopilotPageView: React.FC = () => {
  const { user } = useAuth();
  const { triggerSuccess, triggerAlert } = useOrb();

  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<any[]>([
    {
      id: '1',
      role: 'assistant',
      content:
        "Namaste! I'm Ani, your full-scale warehouse AI assistant. I have full read access to your inventory catalogs, purchase orders, sales ledgers, customer balances, and valuation models. Ask me anything or request an action.",
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const [aiMode, setAiMode] = useState<'live' | 'offline' | null>(null);
  const [aiReason, setAiReason] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Fetch AI token usage & model health
  const { data: usageData, refetch: refetchUsage } = useQuery({
    queryKey: ['/api/ai/usage'],
    queryFn: () => apiFetch('/api/ai/usage'),
    staleTime: 30000,
  });

  const { data: healthData } = useQuery({
    queryKey: ['/api/ai/health'],
    queryFn: () => apiFetch('/api/ai/health'),
    staleTime: 60000,
  });

  // Sync initial mode from health endpoint if not set by chat response yet
  const effectiveMode = aiMode ?? (healthData?.status === 'connected' ? 'live' : 'offline');
  const effectiveReason = aiReason ?? (healthData?.status === 'connected' ? null : (healthData?.message || healthData?.error_detail || 'Rule-based fallback active'));

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const handleSend = async (queryText?: string) => {
    const text = (queryText || input).trim();
    if (!text || isLoading) return;

    const userMsg = {
      id: String(Date.now()),
      role: 'user',
      content: text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      const res = await apiFetch('/api/ai/chat', {
        method: 'POST',
        body: {
          message: text,
          conversation_history: messages.slice(-6).map(m => ({ role: m.role, content: m.content })),
          stream: false,
        },
      });

      if (res.mode) {
        setAiMode(res.mode);
        setAiReason(res.reason || null);
      }

      const reply = res.response || res.narrative || res.reply || 'Analysis complete.';
      setMessages(prev => [
        ...prev,
        {
          id: String(Date.now() + 1),
          role: 'assistant',
          content: reply,
          tool_calls: res.tool_calls || [],
          proposed_action: res.proposed_action || null,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
      refetchUsage();
    } catch (err: any) {
      setMessages(prev => [
        ...prev,
        {
          id: String(Date.now() + 1),
          role: 'assistant',
          content: `Error: ${err.message || 'Unable to connect to AI engine.'}`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleApproveAction = async (msgId: string, action: any) => {
    try {
      await apiFetch(action.endpoint, {
        method: action.method || 'POST',
        body: action.payload,
      });
      triggerSuccess('Action approved and recorded');
      setMessages(prev =>
        prev.map(m => (m.id === msgId ? { ...m, actionStatus: 'approved' } : m))
      );
    } catch (err: any) {
      triggerAlert(err.message || 'Execution failed');
    }
  };

  const PROMPT_SUGGESTIONS = [
    'Analyze items with zero stock and recommend purchase orders',
    'Who are our top 3 overdue debtor customers?',
    'Show ABC-XYZ distribution summary for Class-A parts',
    'What is our total weekly sales revenue and invoice count?',
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[calc(100vh-10rem)] min-h-[600px]">
      {/* Left Chat Window (8 cols) */}
      <div className="lg:col-span-8 bg-card-light dark:bg-card-dark rounded-card shadow-bento border border-hairline-light dark:border-hairline-dark flex flex-col overflow-hidden h-full">
        {/* Header */}
        <div className="px-6 py-4 border-b border-hairline-light dark:border-hairline-dark flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AniOrb size={36} interactive={false} isFloating={false} />
            <div>
              <h3 className="text-sm font-bold text-ink-light dark:text-ink-dark">
                Ani Enterprise Copilot
              </h3>
              <div className="flex items-center gap-1.5 mt-0.5">
                {effectiveMode === 'live' ? (
                  <span
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 cursor-default"
                    title="Live AI model (Groq LLM) active"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Live AI
                  </span>
                ) : (
                  <span
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 cursor-help"
                    title={effectiveReason || 'Rule-based fallback active'}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                    Offline mode (rule-based)
                  </span>
                )}
                <span className="text-[10px] text-muted">• Direct tool integration</span>
              </div>
            </div>
          </div>
          <span className="font-mono text-xs text-sage bg-sage/10 px-2.5 py-1 rounded-full font-semibold">
            Tool Grounded
          </span>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 no-scrollbar">
          {messages.map(m => (
            <div
              key={m.id}
              className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'} space-y-1.5`}
            >
              <div
                className={`max-w-[85%] text-xs leading-relaxed ${
                  m.role === 'user'
                    ? 'bg-[#141414] dark:bg-white text-white dark:text-[#141414] rounded-2xl px-4 py-2.5 rounded-br-xs'
                    : 'bg-canvas-light/60 dark:bg-black/20 text-ink-light dark:text-ink-dark rounded-2xl p-4 border border-hairline-light dark:border-hairline-dark rounded-bl-xs'
                }`}
              >
                {m.role === 'user' ? m.content : <MarkdownRenderer content={m.content} />}
              </div>

              {/* Tools executed */}
              {m.tool_calls && m.tool_calls.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-0.5">
                  {m.tool_calls.map((tc: any, i: number) => (
                    <span
                      key={i}
                      className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-sage/10 text-sage border border-sage/20 flex items-center gap-1"
                    >
                      <Wrench size={10} />
                      <span>{typeof tc === 'string' ? tc : tc.tool}</span>
                    </span>
                  ))}
                </div>
              )}

              {/* Proposed Action Card */}
              {m.proposed_action && (
                <div className="p-3.5 bg-white dark:bg-[#181B1A] border border-hairline-light dark:border-hairline-dark rounded-card max-w-[85%] shadow-sm space-y-2">
                  <span className="font-bold text-[11px] text-sage uppercase">Proposed Action:</span>
                  <p className="text-xs text-ink-light dark:text-ink-dark">{m.proposed_action.summary}</p>
                  {m.actionStatus === 'approved' ? (
                    <span className="text-positive font-semibold text-xs flex items-center gap-1">
                      <CheckCircle2 size={13} /> Executed & Sealed
                    </span>
                  ) : (
                    <div className="flex gap-2 pt-1">
                      <motion.button
                        whileTap={{ scale: 0.98 }}
                        onClick={() => handleApproveAction(m.id, m.proposed_action)}
                        className="px-3.5 py-1 bg-ink-light dark:bg-white text-white dark:text-ink-light rounded-pill font-semibold text-xs"
                      >
                        Approve Action
                      </motion.button>
                    </div>
                  )}
                </div>
              )}

              <span className="text-[10px] text-muted px-1">{m.timestamp}</span>
            </div>
          ))}

          {isLoading && (
            <div className="flex items-center gap-2 text-xs text-muted">
              <AniOrb size={24} expression="thinking" interactive={false} isFloating={false} />
              <span>Ani is analyzing catalog database telemetry…</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="p-4 border-t border-hairline-light dark:border-hairline-dark bg-canvas-light/20">
          <form
            onSubmit={e => {
              e.preventDefault();
              handleSend();
            }}
            className="flex items-center gap-2 bg-card-light dark:bg-card-dark rounded-pill px-4 py-2 border border-hairline-light dark:border-hairline-dark shadow-sm"
          >
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Ask Ani anything or propose a transaction…"
              className="flex-1 bg-transparent text-xs text-ink-light dark:text-ink-dark focus:outline-none"
            />
            <motion.button
              whileTap={{ scale: 0.98 }}
              type="submit"
              disabled={isLoading || !input.trim()}
              className="w-8 h-8 rounded-full bg-ink-light dark:bg-white text-white dark:text-ink-light flex items-center justify-center sweep-hover disabled:opacity-40"
            >
              <CornerDownLeft size={14} />
            </motion.button>
          </form>
        </div>
      </div>

      {/* Right Column: Telemetry & Prompts (4 cols) */}
      <div className="lg:col-span-4 space-y-4">
        {/* Engine Specs */}
        <div className="bg-card-light dark:bg-card-dark rounded-card p-5 shadow-bento border border-hairline-light dark:border-hairline-dark space-y-3">
          <div className="flex items-center gap-2">
            <Cpu size={16} className="text-sage" />
            <h4 className="font-bold text-xs text-ink-light dark:text-ink-dark uppercase tracking-wider">
              AI Engine Status
            </h4>
          </div>

          <div className="space-y-2 text-xs">
            <div className="flex justify-between py-1 border-b border-hairline-light dark:border-hairline-dark">
              <span className="text-muted">Engine Mode</span>
              <span
                className={`font-semibold ${effectiveMode === 'live' ? 'text-positive' : 'text-amber-500'} cursor-help`}
                title={effectiveReason || 'Ready'}
              >
                {effectiveMode === 'live' ? 'Live AI' : 'Offline (rule-based)'}
              </span>
            </div>
            <div className="flex justify-between py-1 border-b border-hairline-light dark:border-hairline-dark">
              <span className="text-muted">Model</span>
              <span className="font-mono font-semibold text-sage">
                {usageData?.configured_model || healthData?.configured_model || 'llama-3.3-70b'}
              </span>
            </div>
            <div className="flex justify-between py-1 border-b border-hairline-light dark:border-hairline-dark">
              <span className="text-muted">Total Requests</span>
              <span className="font-mono font-semibold">{usageData?.total_requests != null ? usageData.total_requests : '—'}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-hairline-light dark:border-hairline-dark">
              <span className="text-muted">Cumulative Tokens</span>
              <span className="font-mono font-semibold">{usageData?.total_tokens != null ? usageData.total_tokens : '—'}</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-muted">Safety Mode</span>
              <span className="text-positive font-semibold">Strict Write Confirmation</span>
            </div>
          </div>
        </div>

        {/* Quick Prompts */}
        <div className="bg-card-light dark:bg-card-dark rounded-card p-5 shadow-bento border border-hairline-light dark:border-hairline-dark space-y-3">
          <h4 className="font-bold text-xs text-ink-light dark:text-ink-dark uppercase tracking-wider">
            Operational Quick Prompts
          </h4>
          <div className="space-y-2">
            {PROMPT_SUGGESTIONS.map((prompt, i) => (
              <button
                key={i}
                onClick={() => handleSend(prompt)}
                className="w-full p-2.5 text-left text-xs bg-canvas-light/60 dark:bg-black/20 hover:bg-white dark:hover:bg-black/40 rounded-tile border border-hairline-light dark:border-hairline-dark font-medium transition-all flex items-center justify-between group"
              >
                <span className="truncate mr-2">{prompt}</span>
                <ArrowRight size={12} className="text-sage group-hover:translate-x-0.5 transition-transform shrink-0" />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
