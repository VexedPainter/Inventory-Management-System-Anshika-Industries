import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';

export const CUBIC_EASE_OUT = [0.22, 1, 0.36, 1];

interface RevealProps {
  children: React.ReactNode;
  delay?: number;
  index?: number;
  className?: string;
  yOffset?: number;
}

export const Reveal: React.FC<RevealProps> = ({
  children,
  delay,
  index = 0,
  className = '',
  yOffset = 16,
}) => {
  const shouldReduceMotion = useReducedMotion();
  const calculatedDelay = delay !== undefined ? delay : index * 0.06;

  if (shouldReduceMotion) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.25 }}
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
        duration: 0.42,
        delay: calculatedDelay,
        ease: CUBIC_EASE_OUT,
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
};
