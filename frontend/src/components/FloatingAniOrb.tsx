import React from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { MessageSquare, SlidersHorizontal, Check, Sparkles } from 'lucide-react';
import { useOrb } from '../context/OrbContext';
import { AniOrb } from './AiOrb';

export const FloatingAniOrb: React.FC = () => {
  const {
    stage,
    expression,
    speechText,
    speechChips,
    bubblePosition,
    calloutCoords,
    openChat,
    dismissSpeech,
    reduceAiPopups,
    setReduceAiPopups,
  } = useOrb();

  const shouldReduceMotion = useReducedMotion();
  const [showSettings, setShowSettings] = React.useState(false);

  // When docked: render bottom-right pill
  if (stage === 'docked') {
    return (
      <div className="fixed bottom-20 md:bottom-6 right-4 md:right-6 z-40 flex items-center gap-2 select-none">
        {/* Reduce AI popups quick toggle */}
        <AnimatePresence>
          {showSettings && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9, x: 10 }}
              animate={{ opacity: 1, scale: 1, x: 0 }}
              exit={{ opacity: 0, scale: 0.9, x: 10 }}
              className="bg-card-light dark:bg-card-dark rounded-card p-3 shadow-2xl border border-hairline-light dark:border-hairline-dark text-xs flex items-center gap-3 mr-1"
            >
              <label className="flex items-center gap-2 cursor-pointer text-ink-light dark:text-ink-dark font-medium">
                <input
                  type="checkbox"
                  checked={reduceAiPopups}
                  onChange={e => setReduceAiPopups(e.target.checked)}
                  className="rounded text-sage focus:ring-sage"
                />
                <span>Reduce AI popups</span>
              </label>
            </motion.div>
          )}
        </AnimatePresence>

        <button
          onClick={() => setShowSettings(prev => !prev)}
          className="w-8 h-8 rounded-full bg-card-light dark:bg-card-dark text-muted hover:text-ink-light dark:hover:text-ink-dark shadow-bento border border-hairline-light dark:border-hairline-dark flex items-center justify-center transition-all hover:scale-105"
          title="AI Assistant Settings"
        >
          <SlidersHorizontal size={14} />
        </button>

        {/* Docked Pill: "● Ask Ani" with mini orb */}
        <motion.div
          layoutId="ani-orb-master"
          whileHover={{ scale: 1.04, y: -2 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => openChat()}
          className="flex items-center gap-2.5 bg-card-light dark:bg-card-dark pl-2 pr-4 py-1.5 rounded-pill shadow-2xl border border-hairline-light dark:border-hairline-dark cursor-pointer group hover:border-sage/40 transition-colors"
        >
          <AniOrb
            size={28}
            expression={expression}
            interactive={false}
            isFloating={false}
          />
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-sage animate-pulse" />
            <span className="text-xs font-semibold text-ink-light dark:text-ink-dark group-hover:text-sage transition-colors">
              Ask Ani
            </span>
          </div>
        </motion.div>
      </div>
    );
  }

  // When center: Stage 1 First login intro
  if (stage === 'center') {
    return (
      <div className="fixed inset-0 z-50 pointer-events-none flex items-center justify-center">
        <motion.div
          layoutId="ani-orb-master"
          initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.8 }}
          animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1 }}
          exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.9 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          className="pointer-events-auto"
        >
          <AniOrb
            size={56}
            expression={expression}
            speechText={speechText}
            speechChips={speechChips}
            onDismissSpeech={dismissSpeech}
            onClick={() => openChat()}
            bubblePosition={bubblePosition}
          />
        </motion.div>
      </div>
    );
  }

  // When callout: glides (spring 900ms) to sit beside relevant card
  return (
    <div className="fixed inset-0 z-40 pointer-events-none">
      <motion.div
        layoutId="ani-orb-master"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{
          opacity: 1,
          scale: 1,
          x: calloutCoords ? calloutCoords.left : window.innerWidth - 120,
          y: calloutCoords ? calloutCoords.top : 120,
        }}
        transition={{
          type: 'spring',
          stiffness: 220,
          damping: 26,
          mass: 1,
          duration: 0.9,
        }}
        className="absolute pointer-events-auto"
        style={{ willChange: 'transform, opacity' }}
      >
        <AniOrb
          size={56}
          expression={expression}
          speechText={speechText}
          speechChips={speechChips}
          onDismissSpeech={dismissSpeech}
          onClick={() => openChat()}
          bubblePosition={bubblePosition}
        />
      </motion.div>
    </div>
  );
};
