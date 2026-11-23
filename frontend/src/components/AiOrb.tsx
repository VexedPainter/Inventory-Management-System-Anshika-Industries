import React from 'react';
import { motion } from 'framer-motion';

interface AiOrbProps {
  size?: number;
  interactive?: boolean;
  onClick?: () => void;
  className?: string;
  showGreeting?: boolean;
}

export const AiOrb: React.FC<AiOrbProps> = ({
  size = 56,
  interactive = false,
  onClick,
  className = '',
  showGreeting = false,
}) => {
  return (
    <div className={`relative flex items-center gap-2.5 ${className}`}>
      {showGreeting && (
        <div className="text-right hidden sm:block">
          <div className="text-xs font-semibold text-ink-light dark:text-ink-dark">
            I'm Ani, your warehouse AI
          </div>
          <div className="text-[10px] text-muted font-medium">Ready to assist</div>
        </div>
      )}

      <motion.div
        onClick={onClick}
        whileHover={interactive ? { scale: 1.08 } : undefined}
        whileTap={interactive ? { scale: 0.95 } : undefined}
        className={`relative cursor-${interactive ? 'pointer' : 'default'} select-none`}
        style={{ width: size, height: size }}
      >
        {/* Outer ambient glow */}
        <div
          className="absolute inset-0 rounded-full blur-xl opacity-60 animate-pulse pointer-events-none"
          style={{
            background: 'radial-gradient(circle, #6A5BFF 0%, #3B33F0 50%, #8FE3FF 100%)',
          }}
        />

        {/* Core sphere with rich 3D shading */}
        <div
          className="relative w-full h-full rounded-full overflow-hidden shadow-orb"
          style={{
            background: 'radial-gradient(circle at 35% 30%, #8FE3FF 0%, #6A5BFF 45%, #3B33F0 75%, #1F198C 100%)',
          }}
        >
          {/* Top specular highlight */}
          <div
            className="absolute top-1 left-2 w-1/3 h-1/4 rounded-full blur-[1px] opacity-75"
            style={{
              background: 'radial-gradient(ellipse at center, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0) 80%)',
              transform: 'rotate(-25deg)',
            }}
          />

          {/* Cute glowing eyes / smile (from reference image) */}
          <div className="absolute inset-0 flex items-center justify-center pt-1">
            <div className="flex items-center gap-2">
              {/* Left eye: happy curved line */}
              <div
                className="w-2.5 h-1.5 border-t-2 border-white rounded-t-full shadow-[0_0_6px_#FFFFFF]"
                style={{ transform: 'rotate(-5deg)' }}
              />
              {/* Right eye: happy curved line */}
              <div
                className="w-2.5 h-1.5 border-t-2 border-white rounded-t-full shadow-[0_0_6px_#FFFFFF]"
                style={{ transform: 'rotate(5deg)' }}
              />
            </div>
          </div>

          {/* Bottom rim light */}
          <div
            className="absolute bottom-0 inset-x-0 h-1/3 opacity-40 blur-[2px]"
            style={{
              background: 'linear-gradient(to top, #8FE3FF, transparent)',
            }}
          />
        </div>
      </motion.div>
    </div>
  );
};
