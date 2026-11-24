import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';

/** Shared easing curves */
export const EASE_OUT   = [0.22, 1, 0.36, 1] as const;
export const EASE_IN    = [0.64, 0, 0.78, 0] as const;
export const EASE_SPRING = [0.34, 1.56, 0.64, 1] as const;

// Keep old name for backward compat
export const CUBIC_EASE_OUT = EASE_OUT;

interface RevealProps {
  children: React.ReactNode;
  delay?: number;
  index?: number;
  className?: string;
  yOffset?: number;
  /** Override animation duration in seconds (default: 0.38) */
  duration?: number;
}

/**
 * Reveal — fade-up stagger for content sections.
 * Duration: 380ms (page-transition range 300-500ms). ✓
 * Respects prefers-reduced-motion.
 */
export const Reveal: React.FC<RevealProps> = ({
  children,
  delay,
  index = 0,
  className = '',
  yOffset = 14,
  duration = 0.38,
}) => {
  const shouldReduceMotion = useReducedMotion();
  // Max stagger cap at 400ms total (index × 55ms, capped)
  const calculatedDelay = delay !== undefined ? delay : Math.min(index * 0.055, 0.4);

  if (shouldReduceMotion) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
        className={className}
      >
        {children}
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: yOffset }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration,
        delay: calculatedDelay,
        ease: EASE_OUT,
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
};
