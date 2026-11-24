import React, { useState, useEffect } from 'react';
import { motion, MotionValue, useReducedMotion } from 'framer-motion';
import { OrbExpression } from './AiOrb';

export interface OrbCharacterProps {
  size?: number; // base size (default 56px, dock is scaled to 40px via scale MotionValue 0.72)
  expression?: OrbExpression;
  isFloating?: boolean;
  bodyScale: MotionValue<number>;
  bodyScaleX: MotionValue<number>;
  bodyScaleY: MotionValue<number>;
  bodyRotate: MotionValue<number>;
  faceX: MotionValue<number>;
  faceOpacity: MotionValue<number>;
  armScale: MotionValue<number>;
  rightArmRotate: MotionValue<number>;
  leftArmRotate: MotionValue<number>;
  shadowScaleX: MotionValue<number>;
  shadowOpacity: MotionValue<number>;
  isWinking?: boolean;
}

export const OrbCharacter: React.FC<OrbCharacterProps> = ({
  size = 56,
  expression = 'idle',
  bodyScale,
  bodyScaleX,
  bodyScaleY,
  bodyRotate,
  faceX,
  faceOpacity,
  armScale,
  rightArmRotate,
  leftArmRotate,
  shadowScaleX,
  shadowOpacity,
  isWinking = false,
}) => {
  const shouldReduceMotion = useReducedMotion();
  const [isBlinking, setIsBlinking] = useState(false);

  // Periodic natural blink
  useEffect(() => {
    if (expression === 'sleepy') return;
    let timer: ReturnType<typeof setTimeout>;

    const schedule = () => {
      const delay = Math.floor(Math.random() * 3200) + 2600;
      timer = setTimeout(() => {
        setIsBlinking(true);
        setTimeout(() => {
          setIsBlinking(false);
          schedule();
        }, 140);
      }, delay);
    };

    schedule();
    return () => clearTimeout(timer);
  }, [expression]);

  const isAlert = expression === 'alert';
  const isSleepy = expression === 'sleepy';
  const isThinking = expression === 'thinking';
  const isSpeaking = expression === 'speaking';

  return (
    <div
      className="relative select-none pointer-events-none flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      {/* ==================================================================== */}
      {/* LAYER D: GROUND SHADOW                                               */}
      {/* ==================================================================== */}
      <motion.div
        style={{
          scaleX: shadowScaleX,
          opacity: shadowOpacity,
        }}
        className="absolute top-[108%] left-1/2 -translate-x-1/2 rounded-full pointer-events-none"
        style-extra={{ willChange: 'transform, opacity' }}
      >
        <div
          className="w-14 h-3 rounded-full filter blur-[3px]"
          style={{
            background: 'radial-gradient(ellipse at center, rgba(16,12,64,0.45) 0%, rgba(16,12,64,0) 75%)',
          }}
        />
      </motion.div>

      {/* ==================================================================== */}
      {/* LAYER C: ARMS (Left & Right capsule hands)                           */}
      {/* ==================================================================== */}
      {/* Left arm */}
      <motion.div
        style={{
          scale: armScale,
          rotate: leftArmRotate,
          transformOrigin: '50% 100%',
        }}
        className="absolute -left-2.5 top-[34%] w-3 h-[22px] rounded-full z-10 pointer-events-none"
      >
        <div
          className="w-full h-full rounded-full shadow-[0_2px_6px_rgba(40,30,160,0.4)]"
          style={{
            background: 'linear-gradient(135deg, #8E86FF 0%, #4D3EFF 60%, #3328E8 100%)',
            boxShadow: 'inset 0 1px 2px rgba(255,255,255,0.5)',
          }}
        />
      </motion.div>

      {/* Right arm (waving arm) */}
      <motion.div
        style={{
          scale: armScale,
          rotate: rightArmRotate,
          transformOrigin: '50% 100%',
        }}
        className="absolute -right-2.5 top-[34%] w-3 h-[22px] rounded-full z-10 pointer-events-none"
      >
        <div
          className="w-full h-full rounded-full shadow-[0_2px_6px_rgba(40,30,160,0.4)]"
          style={{
            background: 'linear-gradient(135deg, #8E86FF 0%, #4D3EFF 60%, #3328E8 100%)',
            boxShadow: 'inset 0 1px 2px rgba(255,255,255,0.5)',
          }}
        />
      </motion.div>

      {/* ==================================================================== */}
      {/* LAYER A: BODY (Squash, Stretch, Rotate, Scale)                       */}
      {/* ==================================================================== */}
      <motion.div
        style={{
          scale: bodyScale,
          scaleX: bodyScaleX,
          scaleY: bodyScaleY,
          rotate: bodyRotate,
          willChange: 'transform',
        }}
        className="relative w-full h-full rounded-full overflow-hidden"
      >
        {/* Main 3D Sphere Sphere Gradient */}
        <div
          className="w-full h-full rounded-full relative overflow-hidden"
          style={{
            background:
              'radial-gradient(circle at 35% 28%, #8E86FF 0%, #5B4DFF 38%, #3328E8 70%, #2A1FD0 100%)',
            boxShadow: isAlert
              ? '0 10px 30px rgba(217,154,43,0.55), inset 0 -8px 16px rgba(143,227,255,0.55)'
              : '0 10px 30px rgba(70,60,255,0.45), inset 0 -8px 16px rgba(143,227,255,0.55)',
          }}
        >
          {/* Top-left specular highlight */}
          <div
            className="absolute inset-0 pointer-events-none filter blur-[1px]"
            style={{
              background:
                'radial-gradient(ellipse at 32% 24%, rgba(255,255,255,0.48) 0%, rgba(255,255,255,0) 65%)',
            }}
          />

          {/* Cyan rim glow on bottom */}
          <div
            className="absolute inset-0 pointer-events-none filter blur-[2px]"
            style={{
              background:
                'radial-gradient(ellipse at 50% 105%, rgba(143,227,255,0.72) 0%, rgba(143,227,255,0) 70%)',
            }}
          />

          {/* ================================================================ */}
          {/* LAYER B: FACE & EYES (Slides via faceX, fades via faceOpacity)   */}
          {/* ================================================================ */}
          <motion.div
            style={{
              x: faceX,
              opacity: faceOpacity,
              willChange: 'transform, opacity',
            }}
            className="absolute inset-0 flex items-center justify-center pointer-events-none pt-0.5"
          >
            <div className="flex items-center gap-[14px]">
              {/* LEFT EYE */}
              <div
                className="flex items-center justify-center transition-transform duration-100"
                style={{
                  transform: isBlinking ? 'scaleY(0.1)' : 'scaleY(1)',
                }}
              >
                {isSpeaking ? (
                  /* Happy curved arc "^" */
                  <div
                    className="w-[9px] h-[5px] border-t-[2.5px] border-white rounded-t-full shadow-[0_0_6px_#FFFFFF]"
                    style={{ transform: 'rotate(-4deg)' }}
                  />
                ) : isSleepy ? (
                  <div className="w-[8px] h-[2px] bg-white rounded-full shadow-[0_0_4px_#FFFFFF]" />
                ) : isThinking ? (
                  <div className="w-[4px] h-[7px] bg-white rounded-full shadow-[0_0_5px_#FFFFFF]" />
                ) : isAlert ? (
                  <div className="w-[7px] h-[12px] bg-white rounded-full shadow-[0_0_8px_#FFFFFF]" />
                ) : (
                  /* Idle open oval */
                  <div className="w-[5px] h-[10px] bg-white rounded-full shadow-[0_0_6px_rgba(255,255,255,0.95)]" />
                )}
              </div>

              {/* RIGHT EYE */}
              <div
                className="flex items-center justify-center transition-transform duration-100"
                style={{
                  transform: isBlinking || isWinking ? 'scaleY(0.1)' : 'scaleY(1)',
                }}
              >
                {isSpeaking ? (
                  /* Happy curved arc "^" */
                  <div
                    className="w-[9px] h-[5px] border-t-[2.5px] border-white rounded-t-full shadow-[0_0_6px_#FFFFFF]"
                    style={{ transform: 'rotate(4deg)' }}
                  />
                ) : isSleepy ? (
                  <div className="w-[8px] h-[2px] bg-white rounded-full shadow-[0_0_4px_#FFFFFF]" />
                ) : isThinking ? (
                  <div className="w-[4px] h-[7px] bg-white rounded-full shadow-[0_0_5px_#FFFFFF]" />
                ) : isAlert ? (
                  <div className="w-[7px] h-[12px] bg-white rounded-full shadow-[0_0_8px_#FFFFFF]" />
                ) : (
                  /* Idle open oval */
                  <div className="w-[5px] h-[10px] bg-white rounded-full shadow-[0_0_6px_rgba(255,255,255,0.95)]" />
                )}
              </div>
            </div>
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
};
