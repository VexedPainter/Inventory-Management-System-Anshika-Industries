import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';

export type OrbExpression = 'idle' | 'speaking' | 'thinking' | 'sleepy' | 'alert' | 'success';

export interface AniOrbProps {
  size?: number;
  expression?: OrbExpression;
  speechText?: string | null;
  speechChips?: { label: string; action: () => void }[];
  onDismissSpeech?: () => void;
  onClick?: () => void;
  interactive?: boolean;
  className?: string;
  isFloating?: boolean;
  bubblePosition?: 'top' | 'right' | 'bottom' | 'left';
  showGreeting?: boolean;
}

export const AniOrb: React.FC<AniOrbProps> = ({
  size = 56,
  expression = 'idle',
  speechText = null,
  speechChips,
  onDismissSpeech,
  onClick,
  interactive = true,
  className = '',
  isFloating = true,
  bubblePosition = 'top',
  showGreeting = false,
}) => {
  const shouldReduceMotion = useReducedMotion();
  const orbRef = useRef<HTMLDivElement>(null);

  // Blinking state
  const [isBlinking, setIsBlinking] = useState(false);
  const [isTabVisible, setIsTabVisible] = useState(true);

  // Eye tracking cursor
  const [eyeShift, setEyeShift] = useState({ x: 0, y: 0 });

  // Typewriter effect state
  const [displayedText, setDisplayedText] = useState('');
  const [isTyping, setIsTyping] = useState(false);

  // Handle document visibility
  useEffect(() => {
    const handleVisibility = () => {
      setIsTabVisible(!document.hidden);
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  // Blinking loop (every 3-6s random)
  useEffect(() => {
    if (!isTabVisible || expression === 'sleepy') return;

    let timeoutId: ReturnType<typeof setTimeout>;
    const scheduleBlink = () => {
      const delay = Math.floor(Math.random() * 3000) + 3000;
      timeoutId = setTimeout(() => {
        setIsBlinking(true);
        setTimeout(() => {
          setIsBlinking(false);
          scheduleBlink();
        }, 150);
      }, delay);
    };

    scheduleBlink();
    return () => clearTimeout(timeoutId);
  }, [isTabVisible, expression]);

  // Mouse move listener to subtly track cursor (max 3px)
  useEffect(() => {
    if (!isTabVisible || shouldReduceMotion) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!orbRef.current) return;
      const rect = orbRef.current.getBoundingClientRect();
      const orbCenterX = rect.left + rect.width / 2;
      const orbCenterY = rect.top + rect.height / 2;

      const deltaX = e.clientX - orbCenterX;
      const deltaY = e.clientY - orbCenterY;
      const distance = Math.hypot(deltaX, deltaY);

      if (distance === 0) return;

      // Limit shift to max 3px with subtle easing
      const factor = Math.min(distance / 400, 1) * 3;
      const shiftX = (deltaX / distance) * factor;
      const shiftY = (deltaY / distance) * factor;

      setEyeShift({
        x: Math.round(shiftX * 10) / 10,
        y: Math.round(shiftY * 10) / 10,
      });
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [isTabVisible, shouldReduceMotion]);

  // Typewriter effect for speech text (28ms per character)
  useEffect(() => {
    if (!speechText) {
      setDisplayedText('');
      setIsTyping(false);
      return;
    }

    if (shouldReduceMotion) {
      setDisplayedText(speechText);
      setIsTyping(false);
      return;
    }

    setDisplayedText('');
    setIsTyping(true);
    let index = 0;

    const intervalId = setInterval(() => {
      index++;
      setDisplayedText(speechText.slice(0, index));
      if (index >= speechText.length) {
        clearInterval(intervalId);
        setIsTyping(false);
      }
    }, 28);

    return () => clearInterval(intervalId);
  }, [speechText, shouldReduceMotion]);

  // 6 orbiting particles for thinking mode
  const orbitParticles = useMemo(
    () => Array.from({ length: 6 }).map((_, i) => ({ id: i, angle: (i * 360) / 6 })),
    []
  );

  // Expression-based eye styling
  const isAlert = expression === 'alert';
  const isSuccess = expression === 'success';
  const isThinking = expression === 'thinking';
  const isSpeaking = expression === 'speaking' || isTyping;
  const isSleepy = expression === 'sleepy';

  return (
    <div
      ref={orbRef}
      className={`relative inline-flex items-center justify-center select-none ${className}`}
      style={{ width: size, height: size }}
    >
      {/* Optional side greeting */}
      {showGreeting && (
        <div className="text-right hidden sm:block absolute right-full mr-3 whitespace-nowrap">
          <div className="text-xs font-semibold text-ink-light dark:text-ink-dark">
            I'm Ani, your inventory AI
          </div>
          <div className="text-[10px] text-muted font-medium">Ready to assist</div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* 1. OUTER BREATHING HALO RING                                         */}
      {/* ==================================================================== */}
      <motion.div
        animate={
          isTabVisible && !shouldReduceMotion
            ? {
                scale: [1, 1.18, 1],
                opacity: isAlert ? [0.6, 0.95, 0.6] : [0.5, 0.88, 0.5],
              }
            : { scale: 1, opacity: 0.6 }
        }
        transition={{
          duration: 3.2,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
        className="absolute inset-[-6px] rounded-full pointer-events-none filter blur-md"
        style={{
          background: isAlert
            ? 'radial-gradient(circle, rgba(217,154,43,0.65) 0%, rgba(212,87,78,0.3) 60%, transparent 100%)'
            : 'radial-gradient(circle, rgba(111,96,255,0.65) 0%, rgba(59,51,240,0.35) 55%, transparent 100%)',
          willChange: 'transform, opacity',
        }}
      />

      {/* ==================================================================== */}
      {/* 2. ORBITING PARTICLES (Thinking expression)                          */}
      {/* ==================================================================== */}
      <AnimatePresence>
        {isThinking && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="absolute inset-[-12px] pointer-events-none"
          >
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 6, repeat: Infinity, ease: 'linear' }}
              className="w-full h-full relative"
              style={{ willChange: 'transform' }}
            >
              {orbitParticles.map(p => {
                const rad = (p.angle * Math.PI) / 180;
                const radius = (size + 14) / 2;
                const px = Math.cos(rad) * radius + (size + 14) / 2;
                const py = Math.sin(rad) * radius + (size + 14) / 2;
                return (
                  <div
                    key={p.id}
                    className="absolute w-1.5 h-1.5 rounded-full bg-cyan-200/70 shadow-[0_0_6px_#8FE3FF]"
                    style={{
                      left: px - 3,
                      top: py - 3,
                    }}
                  />
                );
              })}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ==================================================================== */}
      {/* 3. MAIN SPHERE CONTAINER (Floating & Bouncing)                       */}
      {/* ==================================================================== */}
      <motion.div
        onClick={onClick}
        whileHover={interactive ? { scale: 1.06 } : undefined}
        whileTap={interactive ? { scale: 0.95 } : undefined}
        animate={
          isSuccess
            ? { y: [0, -12, 0, -4, 0], scaleY: [1, 0.94, 1.05, 0.98, 1] }
            : isFloating && isTabVisible && !shouldReduceMotion
            ? {
                y: [-6, 6, -6],
                scaleY: [1, 1.03, 1],
              }
            : { y: 0, scaleY: 1 }
        }
        transition={
          isSuccess
            ? { duration: 0.65, ease: 'easeOut' }
            : {
                y: { duration: 4.0, repeat: Infinity, ease: 'easeInOut' },
                scaleY: { duration: 4.0, repeat: Infinity, ease: 'easeInOut' },
              }
        }
        className={`relative w-full h-full rounded-full overflow-hidden cursor-${
          interactive ? 'pointer' : 'default'
        }`}
        style={{
          boxShadow: isAlert
            ? '0 10px 30px rgba(217,154,43,0.55), inset 0 -8px 16px rgba(143,227,255,0.55)'
            : '0 10px 30px rgba(70,60,255,0.45), inset 0 -8px 16px rgba(143,227,255,0.55)',
          background:
            'radial-gradient(circle at 35% 28%, #8E86FF 0%, #5B4DFF 38%, #3328E8 70%, #2A1FD0 100%)',
          willChange: 'transform, opacity',
        }}
      >
        {/* Top-left inner specular highlight */}
        <div
          className="absolute inset-0 pointer-events-none filter blur-[1px]"
          style={{
            background:
              'radial-gradient(ellipse at 32% 24%, rgba(255,255,255,0.45) 0%, rgba(255,255,255,0) 65%)',
          }}
        />

        {/* Bottom rim light (pale cyan glow #8FE3FF) */}
        <div
          className="absolute inset-0 pointer-events-none filter blur-[2px]"
          style={{
            background:
              'radial-gradient(ellipse at 50% 105%, rgba(143,227,255,0.7) 0%, rgba(143,227,255,0) 70%)',
          }}
        />

        {/* Speaking gentle pulse ripple */}
        {isSpeaking && (
          <motion.div
            animate={{ opacity: [0.2, 0.5, 0.2] }}
            transition={{ duration: 0.8, repeat: Infinity, ease: 'easeInOut' }}
            className="absolute inset-0 pointer-events-none rounded-full"
            style={{
              background: 'radial-gradient(circle, rgba(143,227,255,0.3) 0%, transparent 80%)',
            }}
          />
        )}

        {/* ================================================================== */}
        {/* 4. EYES LAYER (Expression State Machine + Blink + Cursor Tracking) */}
        {/* ================================================================== */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none pt-0.5">
          <motion.div
            animate={
              isThinking
                ? { x: 3, y: -2 }
                : isAlert
                ? { x: 0, y: -1 }
                : { x: eyeShift.x, y: eyeShift.y }
            }
            transition={{ type: 'spring', stiffness: 350, damping: 25 }}
            className="flex items-center gap-[14px]"
            style={{ willChange: 'transform' }}
          >
            {/* LEFT EYE */}
            <motion.div
              animate={{
                scaleY: isBlinking ? 0.1 : 1,
              }}
              transition={{ duration: 0.1 }}
              className="flex items-center justify-center"
            >
              {isSpeaking ? (
                /* Happy curved arc "^" */
                <div
                  className="w-[9px] h-[5px] border-t-[2.5px] border-white rounded-t-full shadow-[0_0_6px_#FFFFFF]"
                  style={{ transform: 'rotate(-4deg)' }}
                />
              ) : isSleepy ? (
                /* Sleepy horizontal arc "-" */
                <div className="w-[8px] h-[2px] bg-white rounded-full shadow-[0_0_4px_#FFFFFF]" />
              ) : isThinking ? (
                /* Thinking shrunk eye looking up */
                <div className="w-[4px] h-[7px] bg-white rounded-full shadow-[0_0_5px_#FFFFFF]" />
              ) : isAlert ? (
                /* Alert wide eye */
                <div className="w-[7px] h-[12px] bg-white rounded-full shadow-[0_0_8px_#FFFFFF]" />
              ) : (
                /* Idle open oval (5x10px, soft glow) */
                <div className="w-[5px] h-[10px] bg-white rounded-full shadow-[0_0_6px_rgba(255,255,255,0.9)]" />
              )}
            </motion.div>

            {/* RIGHT EYE */}
            <motion.div
              animate={{
                scaleY: isBlinking ? 0.1 : 1,
              }}
              transition={{ duration: 0.1 }}
              className="flex items-center justify-center"
            >
              {isSpeaking ? (
                /* Happy curved arc "^" */
                <div
                  className="w-[9px] h-[5px] border-t-[2.5px] border-white rounded-t-full shadow-[0_0_6px_#FFFFFF]"
                  style={{ transform: 'rotate(4deg)' }}
                />
              ) : isSleepy ? (
                /* Sleepy horizontal arc "-" */
                <div className="w-[8px] h-[2px] bg-white rounded-full shadow-[0_0_4px_#FFFFFF]" />
              ) : isThinking ? (
                /* Thinking shrunk eye looking up */
                <div className="w-[4px] h-[7px] bg-white rounded-full shadow-[0_0_5px_#FFFFFF]" />
              ) : isAlert ? (
                /* Alert wide eye */
                <div className="w-[7px] h-[12px] bg-white rounded-full shadow-[0_0_8px_#FFFFFF]" />
              ) : (
                /* Idle open oval (5x10px, soft glow) */
                <div className="w-[5px] h-[10px] bg-white rounded-full shadow-[0_0_6px_rgba(255,255,255,0.9)]" />
              )}
            </motion.div>
          </motion.div>
        </div>

        {/* Success sparkles overlay */}
        {isSuccess && (
          <motion.div
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: [0, 1, 0], scale: [0.5, 1.2, 1] }}
            transition={{ duration: 0.8 }}
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
          >
            <div className="text-white text-xs font-bold drop-shadow">✨</div>
          </motion.div>
        )}
      </motion.div>

      {/* ==================================================================== */}
      {/* 5. SPEECH BUBBLE WITH TYPEWRITER EFFECT & OPTIONAL ACTION CHIPS      */}
      {/* ==================================================================== */}
      <AnimatePresence>
        {speechText && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: bubblePosition === 'top' ? 8 : -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: bubblePosition === 'top' ? 8 : -8 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className={`absolute z-50 pointer-events-auto select-text ${
              bubblePosition === 'top'
                ? 'bottom-full mb-3 left-1/2 -translate-x-1/2'
                : bubblePosition === 'right'
                ? 'left-full ml-3 top-1/2 -translate-y-1/2'
                : bubblePosition === 'bottom'
                ? 'top-full mt-3 left-1/2 -translate-x-1/2'
                : 'right-full mr-3 top-1/2 -translate-y-1/2'
            }`}
          >
            <div className="relative bg-white dark:bg-[#181B1A] text-ink-light dark:text-ink-dark rounded-pill px-4 py-2.5 shadow-2xl border border-hairline-light dark:border-hairline-dark whitespace-nowrap min-w-[220px] max-w-sm sm:max-w-md">
              {/* Message text with bold indigo name prefix */}
              <div className="text-xs sm:text-[14px] leading-snug flex items-center gap-1.5 flex-wrap">
                <span className="font-bold text-[#3328E8] dark:text-[#8E86FF]">Ani</span>
                <span className="font-normal">{displayedText}</span>
                {isTyping && (
                  <span className="inline-block w-1.5 h-3 bg-[#3328E8] dark:bg-[#8E86FF] animate-pulse ml-0.5" />
                )}
              </div>

              {/* Action chips (e.g. [Draft POs] [Not now]) */}
              {speechChips && speechChips.length > 0 && !isTyping && (
                <div className="mt-2 pt-2 border-t border-hairline-light dark:border-hairline-dark flex items-center gap-2">
                  {speechChips.map((chip, idx) => (
                    <button
                      key={idx}
                      onClick={e => {
                        e.stopPropagation();
                        chip.action();
                      }}
                      className={`text-[11px] font-semibold px-2.5 py-1 rounded-pill transition-all ${
                        idx === 0
                          ? 'bg-[#3328E8] text-white hover:bg-[#2A1FD0] shadow-sm'
                          : 'bg-black/5 dark:bg-white/10 text-muted hover:text-ink-light dark:hover:text-ink-dark'
                      }`}
                    >
                      {chip.label}
                    </button>
                  ))}
                  {onDismissSpeech && (
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        onDismissSpeech();
                      }}
                      className="ml-auto text-[10px] text-muted hover:text-ink-light"
                    >
                      Dismiss
                    </button>
                  )}
                </div>
              )}

              {/* Tail pointing toward the orb */}
              <div
                className={`absolute w-2.5 h-2.5 bg-white dark:bg-[#181B1A] border-hairline-light dark:border-hairline-dark rotate-45 ${
                  bubblePosition === 'top'
                    ? 'top-full -mt-1.5 left-1/2 -translate-x-1/2 border-b border-r'
                    : bubblePosition === 'right'
                    ? 'right-full -mr-1.5 top-1/2 -translate-y-1/2 border-b border-l'
                    : bubblePosition === 'bottom'
                    ? 'bottom-full -mb-1.5 left-1/2 -translate-x-1/2 border-t border-l'
                    : 'left-full -ml-1.5 top-1/2 -translate-y-1/2 border-t border-r'
                }`}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// Also export as AiOrb for backward compatibility
export const AiOrb = AniOrb;
