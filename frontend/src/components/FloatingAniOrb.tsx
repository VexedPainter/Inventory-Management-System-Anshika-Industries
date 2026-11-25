import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  motion,
  AnimatePresence,
  useMotionValue,
  motionValue,
  useSpring,
  animate,
  AnimationPlaybackControls,
  useReducedMotion,
} from 'framer-motion';
import { SlidersHorizontal, ArrowRight, Check, X } from 'lucide-react';
import { useOrb, SpeechChip } from '../context/OrbContext';
import { useAuth } from '../context/AuthContext';
import { OrbCharacter } from './OrbCharacter';
import {
  Point,
  CancelToken,
  SparkleItem,
  getHomeCoords,
  saveOrbPos,
  getViewportCenter,
  getSwoopControlPoint,
  getReturnControlPoint,
  quadraticBezier,
  createSparkles,
  clampCoords,
  getBubblePlacement,
} from '../utils/orbMotion';

export const FloatingAniOrb: React.FC = () => {
  const {
    stage,
    setStage,
    expression,
    setExpression,
    speechText,
    speechChips,
    dismissSpeech,
    openChat,
    reduceAiPopups,
    setReduceAiPopups,
    resetPosition,
    dashboardData,
    introTrigger,
    resetTrigger,
  } = useOrb();

  const { user } = useAuth();
  const shouldReduceMotion = useReducedMotion();

  // User first name with fallback "there"
  const firstName = user?.full_name
    ? user.full_name.trim().split(' ')[0]
    : user?.username
    ? user.username.charAt(0).toUpperCase() + user.username.slice(1)
    : 'there';

  // Items needing attention: N = low + critical + out
  const stats = dashboardData?.stats || {};
  const lowCount = stats.status_distribution?.LOW ?? (dashboardData?.counts?.LOW || 0);
  const outCount = stats.status_distribution?.OUT ?? (dashboardData?.counts?.OUT || 0);
  const critCount = stats.status_distribution?.CRITICAL ?? (dashboardData?.counts?.CRITICAL || 0);
  const totalAttention = lowCount + outCount + critCount;

  // Single fixed container coordinates
  const homeRef = useRef<Point>(getHomeCoords());
  const x = useMotionValue(homeRef.current.x);
  const y = useMotionValue(homeRef.current.y);

  // Layer A Body MotionValues
  const bodyScale = useMotionValue(0.72); // docked base (40px on 56px base)
  const bodyScaleX = useMotionValue(1);
  const bodyScaleY = useMotionValue(1);
  const bodyRotate = useMotionValue(0);

  // Layer B Face MotionValues
  const faceX = useMotionValue(0);
  const faceOpacity = useMotionValue(1);

  // Layer C Arms MotionValues
  const armScale = useMotionValue(0);
  const rightArmRotate = useMotionValue(0);
  const leftArmRotate = useMotionValue(0);

  // Layer D Shadow MotionValues
  const shadowScaleX = useMotionValue(0.8);
  const shadowOpacity = useMotionValue(0);

  // Layer E Trail (4 ghost copies following with different stiffness)
  const trail1X = useSpring(x, { stiffness: 260, damping: 24 });
  const trail1Y = useSpring(y, { stiffness: 260, damping: 24 });
  const trail2X = useSpring(x, { stiffness: 190, damping: 24 });
  const trail2Y = useSpring(y, { stiffness: 190, damping: 24 });
  const trail3X = useSpring(x, { stiffness: 140, damping: 24 });
  const trail3Y = useSpring(y, { stiffness: 140, damping: 24 });
  const trail4X = useSpring(x, { stiffness: 100, damping: 24 });
  const trail4Y = useSpring(y, { stiffness: 100, damping: 24 });
  const [showTrail, setShowTrail] = useState(false);

  // Layer F Sparkles
  const [sparkles, setSparkles] = useState<SparkleItem[]>([]);

  // Local state for UI / typewriter intro
  const [isWinking, setIsWinking] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [introBubbleText, setIntroBubbleText] = useState<string | null>(null);
  const [introChips, setIntroChips] = useState<SpeechChip[] | undefined>(undefined);

  // Active animation controls tracking for cancellation
  const activeControlsRef = useRef<Set<AnimationPlaybackControls>>(new Set());
  const cancelTokenRef = useRef<CancelToken>({ cancelled: false });
  const isRunningIntroRef = useRef(false);
  const dragStartPosRef = useRef<Point>({ x: 0, y: 0 });

  // Track coordinates for speech bubble placement
  const [currentCoords, setCurrentCoords] = useState<Point>(homeRef.current);

  useEffect(() => {
    const unsubX = x.on('change', latestX => {
      setCurrentCoords(prev => ({ ...prev, x: latestX }));
    });
    const unsubY = y.on('change', latestY => {
      setCurrentCoords(prev => ({ ...prev, y: latestY }));
    });
    return () => {
      unsubX();
      unsubY();
    };
  }, [x, y]);

  // Clamp on window resize
  useEffect(() => {
    const handleResize = () => {
      homeRef.current = getHomeCoords();
      const clamped = clampCoords({ x: x.get(), y: y.get() }, 28, 8);
      x.set(clamped.x);
      y.set(clamped.y);
    };

    window.addEventListener('resize', handleResize);
    window.visualViewport?.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.visualViewport?.removeEventListener('resize', handleResize);
    };
  }, [x, y]);

  // Reset position trigger (from settings popover or double-click)
  useEffect(() => {
    if (resetTrigger === 0) return;
    const home = getHomeCoords();
    stopAllAnimations();
    setStage('returning');
    Promise.all([
      animate(x, home.x, { type: 'spring', stiffness: 280, damping: 22 }),
      animate(y, home.y, { type: 'spring', stiffness: 280, damping: 22 }),
      animate(bodyScale, 0.72, { duration: 0.4 }),
      animate(bodyRotate, 0, { duration: 0.4 }),
    ]).then(() => {
      setStage('docked');
    });
  }, [resetTrigger, x, y, bodyScale, bodyRotate, setStage]);

  // Helper to stop all running animations
  const stopAllAnimations = useCallback(() => {
    cancelTokenRef.current.cancelled = true;
    activeControlsRef.current.forEach(ctrl => {
      try {
        ctrl.stop();
      } catch {}
    });
    activeControlsRef.current.clear();
    setShowTrail(false);
    setSparkles([]);
    armScale.set(0);
    faceX.set(0);
    faceOpacity.set(1);
    shadowOpacity.set(0);
    setIsWinking(false);
  }, [armScale, faceX, faceOpacity, shadowOpacity]);

  // Track an imperative animation
  const trackAnimation = useCallback((ctrl: AnimationPlaybackControls) => {
    activeControlsRef.current.add(ctrl);
    ctrl.then(() => activeControlsRef.current.delete(ctrl));
    return ctrl;
  }, []);

  // Spawn sparkles helper
  const triggerSparkleBurst = useCallback((count = 10) => {
    const newSparkles = createSparkles(count, { x: x.get(), y: y.get() });
    setSparkles(newSparkles);
    setTimeout(() => {
      setSparkles([]);
    }, 700);
  }, [x, y]);

  // Clean goodbye flight back to home (total ~1.0s)
  const runGoodbye = useCallback(
    async (cancelToken: CancelToken) => {
      if (cancelToken.cancelled) return;
      setIntroBubbleText(null);
      setIntroChips(undefined);
      dismissSpeech();

      // Right arm waves quickly + wink (~250ms)
      trackAnimation(animate(rightArmRotate, [0, 32, -10, 30, 0], { duration: 0.25 }));
      setIsWinking(true);
      await new Promise(r => setTimeout(r, 220));
      if (cancelToken.cancelled) return;
      setIsWinking(false);

      // Arms retract & Anticipation squash (~100ms)
      trackAnimation(animate(armScale, 0, { duration: 0.1 }));
      await Promise.all([
        trackAnimation(animate(bodyScaleX, 1.15, { duration: 0.1, ease: 'easeIn' })),
        trackAnimation(animate(bodyScaleY, 0.82, { duration: 0.1, ease: 'easeIn' })),
      ]);
      if (cancelToken.cancelled) return;

      // Flight back along mirrored Bezier (~500ms)
      setStage('returning');
      setShowTrail(true);
      const startPos: Point = { x: x.get(), y: y.get() };
      const homePos = getHomeCoords();
      const ctrlPoint = getReturnControlPoint(startPos, homePos);

      const progress = motionValue(0);
      const unsub = progress.on('change', p => {
        const pt = quadraticBezier(startPos, ctrlPoint, homePos, p);
        x.set(pt.x);
        y.set(pt.y);
        bodyRotate.set(12 * (1 - p) - 8 * p);
        bodyScale.set(1.7 - p * 0.98); // 1.7 -> 0.72
        bodyScaleY.set(1 + Math.sin(p * Math.PI) * 0.14);
        bodyScaleX.set(1 - Math.sin(p * Math.PI) * 0.1);
      });

      await trackAnimation(animate(progress, 1, { duration: 0.5, ease: [0.35, 0, 0.25, 1] }));
      unsub();

      if (cancelToken.cancelled) return;

      // Landing at home (~150ms)
      setShowTrail(false);
      x.set(homePos.x);
      y.set(homePos.y);
      bodyScale.set(0.72);
      bodyRotate.set(0);

      await Promise.all([
        trackAnimation(animate(bodyScaleY, [0.75, 1.05, 1], { duration: 0.15, ease: 'easeOut' })),
        trackAnimation(animate(bodyScaleX, [1.18, 0.95, 1], { duration: 0.15, ease: 'easeOut' })),
      ]);

      setStage('docked');
      setExpression('idle');
      isRunningIntroRef.current = false;
    },
    [
      dismissSpeech,
      trackAnimation,
      rightArmRotate,
      armScale,
      bodyScaleX,
      bodyScaleY,
      setStage,
      x,
      y,
      bodyRotate,
      bodyScale,
      setExpression,
    ]
  );

  // Typewriter helper
  const typewrite = useCallback(
    async (fullText: string, cancelToken: CancelToken, speedMs = 32): Promise<void> => {
      for (let i = 1; i <= fullText.length; i++) {
        if (cancelToken.cancelled) return;
        setIntroBubbleText(fullText.slice(0, i));
        await new Promise(r => setTimeout(r, speedMs));
      }
    },
    []
  );

  // Cancellable sleep helper so Escape / click immediately cancels
  const waitWithCancel = useCallback(
    async (ms: number, cancelToken: CancelToken): Promise<void> => {
      const step = 50;
      let elapsed = 0;
      while (elapsed < ms) {
        if (cancelToken.cancelled) return;
        await new Promise(r => setTimeout(r, Math.min(step, ms - elapsed)));
        elapsed += step;
      }
    },
    []
  );

  // INTRO TIMELINE (total about 7s, then 1.2s return)
  const runIntro = useCallback(
    async (cancelToken: CancelToken) => {
      try {
        isRunningIntroRef.current = true;
        setStage('intro');
        setExpression('idle');

        // Reduced motion check
        if (shouldReduceMotion || reduceAiPopups) {
          setStage('docked');
          setExpression('speaking');
          setIntroBubbleText(`Hi ${firstName}, I'm Ani! Ready to assist.`);
          setTimeout(() => {
            setIntroBubbleText(null);
            setExpression('idle');
          }, 6000);
          isRunningIntroRef.current = false;
          return;
        }

        // Home coordinates
        const p0 = getHomeCoords();
        const p2 = getViewportCenter();
        const ctrlPoint = getSwoopControlPoint(p0, p2);

        // ==================================================================
        // T0.00 to 0.20 "Anticipation": body squashes
        // ==================================================================
        await Promise.all([
          trackAnimation(animate(bodyScaleX, 1.15, { duration: 0.2, ease: 'easeInOut' })),
          trackAnimation(animate(bodyScaleY, 0.8, { duration: 0.2, ease: 'easeInOut' })),
        ]);
        if (cancelToken.cancelled) return;

        // ==================================================================
        // T0.20 to 0.90 "Swoop": curved path P0 -> P2 via Bezier
        // ==================================================================
        triggerSparkleBurst(8);
        setShowTrail(true);

        const swoopProgress = motionValue(0);
        const unsubSwoop = swoopProgress.on('change', p => {
          const pt = quadraticBezier(p0, ctrlPoint, p2, p);
          x.set(pt.x);
          y.set(pt.y);
          bodyScale.set(0.72 + p * 0.98);
          bodyRotate.set(-18 + p * 28);
          bodyScaleY.set(1 + Math.sin(p * Math.PI) * 0.18);
          bodyScaleX.set(1 - Math.sin(p * Math.PI) * 0.12);
        });

        await trackAnimation(
          animate(swoopProgress, 1, { duration: 0.7, ease: [0.65, 0, 0.35, 1] })
        );
        unsubSwoop();
        if (cancelToken.cancelled) return;

        // ==================================================================
        // T0.90 to 1.15 "Landing": settle with ground shadow
        // ==================================================================
        setShowTrail(false);
        triggerSparkleBurst(6);
        trackAnimation(animate(shadowOpacity, 0.65, { duration: 0.2 }));

        await trackAnimation(animate(bodyRotate, 0, { duration: 0.15, ease: 'easeOut' }));
        await trackAnimation(animate(bodyScaleY, 0.78, { duration: 0.1, ease: 'easeOut' }));
        await Promise.all([
          trackAnimation(animate(bodyScaleY, 1, { type: 'spring', stiffness: 500, damping: 18 })),
          trackAnimation(animate(bodyScaleX, 1, { type: 'spring', stiffness: 500, damping: 18 })),
        ]);
        if (cancelToken.cancelled) return;

        // ==================================================================
        // T1.15 to 1.65 "Turn around": quick twirl 0 -> 360 deg
        // ==================================================================
        const centerY = p2.y;
        trackAnimation(
          animate(y, [centerY, centerY - 18, centerY], { duration: 0.45, ease: [0.45, 0, 0.2, 1] })
        );

        trackAnimation(
          animate(faceX, [0, -16, 16, 0], {
            duration: 0.45,
            times: [0, 0.35, 0.7, 1],
            ease: 'easeInOut',
          })
        );
        trackAnimation(
          animate(faceOpacity, [1, 0, 0, 1], {
            duration: 0.45,
            times: [0, 0.32, 0.68, 1],
          })
        );

        await trackAnimation(
          animate(bodyRotate, [0, 360], { duration: 0.45, ease: [0.45, 0, 0.2, 1] })
        );
        bodyRotate.set(0);
        if (cancelToken.cancelled) return;

        // ==================================================================
        // T1.65 to 2.10 "Jump and bounce"
        // ==================================================================
        trackAnimation(animate(shadowScaleX, [0.8, 0.5, 1.1, 0.8], { duration: 0.4 }));
        trackAnimation(animate(shadowOpacity, [0.65, 0.3, 0.8, 0.65], { duration: 0.4 }));

        trackAnimation(animate(bodyScaleY, 1.12, { duration: 0.18, ease: 'easeOut' }));
        trackAnimation(animate(bodyScaleX, 0.94, { duration: 0.18, ease: 'easeOut' }));
        await trackAnimation(animate(y, centerY - 32, { duration: 0.18, ease: 'easeOut' }));
        triggerSparkleBurst(6);

        trackAnimation(animate(bodyScaleY, 0.85, { duration: 0.18, ease: 'easeIn' }));
        trackAnimation(animate(bodyScaleX, 1.1, { duration: 0.18, ease: 'easeIn' }));
        await trackAnimation(animate(y, centerY, { duration: 0.18, ease: 'easeIn' }));

        await Promise.all([
          trackAnimation(animate(bodyScaleY, 1, { type: 'spring', stiffness: 450, damping: 20 })),
          trackAnimation(animate(bodyScaleX, 1, { type: 'spring', stiffness: 450, damping: 20 })),
        ]);
        if (cancelToken.cancelled) return;

        // ==================================================================
        // T2.10+: "Wave and talk": arms spring out; wave; speech bubble
        // ==================================================================
        await trackAnimation(
          animate(armScale, 1, { type: 'spring', stiffness: 350, damping: 16 })
        );
        if (cancelToken.cancelled) return;

        trackAnimation(
          animate(rightArmRotate, [-10, 35, -10, 35, 0], {
            duration: 0.4,
            ease: 'easeInOut',
          })
        );
        trackAnimation(animate(bodyRotate, 6, { duration: 0.2 }));
        setExpression('speaking');

        // Gentle floating loop while speaking
        const floatCtrl = animate(y, [centerY - 6, centerY + 6, centerY - 6], {
          duration: 2.0,
          repeat: Infinity,
          ease: 'easeInOut',
        });
        activeControlsRef.current.add(floatCtrl);

        // Line 1: Introduction (32ms/char smooth typing)
        await typewrite(`Hi ${firstName}, I'm Ani!`, cancelToken, 32);
        if (cancelToken.cancelled) {
          floatCtrl.stop();
          return;
        }

        // Wait 5.5 seconds so user can comfortably read the intro text
        await waitWithCancel(2400, cancelToken);
        if (cancelToken.cancelled) {
          floatCtrl.stop();
          return;
        }
        setIsWinking(true);
        await waitWithCancel(350, cancelToken);
        setIsWinking(false);
        await waitWithCancel(2750, cancelToken);
        if (cancelToken.cancelled) {
          floatCtrl.stop();
          return;
        }

        // Line 2: Role & Context (32ms/char)
        const line2 =
          "Your inventory assistant at Anishka Industries.";
        await typewrite(line2, cancelToken, 32);
        if (cancelToken.cancelled) {
          floatCtrl.stop();
          return;
        }

        // Wait 5 seconds so user can comfortably read Line 2
        await waitWithCancel(5000, cancelToken);
        if (cancelToken.cancelled) {
          floatCtrl.stop();
          return;
        }

        // Line 3: Live Status Summary (32ms/char)
        const line3 =
          totalAttention > 0
            ? `${totalAttention} items need your attention today.`
            : 'Everything looks healthy today.';
        await typewrite(line3, cancelToken, 32);
        if (cancelToken.cancelled) {
          floatCtrl.stop();
          return;
        }

        // Fade in chips
        setIntroChips([
          {
            label: 'Show me',
            action: () => {
              stopAllAnimations();
              openChat('What needs attention today?');
              runGoodbye({ cancelled: false });
            },
          },
          {
            label: 'Got it',
            action: () => {
              floatCtrl.stop();
              runGoodbye(cancelToken);
            },
          },
        ]);

        // Auto-dismiss after 8s idle (ample time to read and click)
        await waitWithCancel(3500, cancelToken);
        if (cancelToken.cancelled) {
          floatCtrl.stop();
          return;
        }
        // One charm move: quick tilt
        trackAnimation(animate(bodyRotate, [-6, 6, 0], { duration: 0.6 }));

        await waitWithCancel(4500, cancelToken);
        if (cancelToken.cancelled) {
          floatCtrl.stop();
          return;
        }

        // 8s elapsed without user dismissal -> proceed to goodbye
        floatCtrl.stop();
        await runGoodbye(cancelToken);
      } catch (err) {
        console.error('[Ani Orb] Error during intro timeline:', err);
        stopAllAnimations();
        setStage('docked');
        setExpression('idle');
        isRunningIntroRef.current = false;
      }
    },
    [
      setStage,
      setExpression,
      shouldReduceMotion,
      reduceAiPopups,
      firstName,
      trackAnimation,
      bodyScaleX,
      bodyScaleY,
      triggerSparkleBurst,
      x,
      y,
      bodyScale,
      bodyRotate,
      shadowOpacity,
      faceX,
      faceOpacity,
      shadowScaleX,
      armScale,
      rightArmRotate,
      leftArmRotate,
      typewrite,
      waitWithCancel,
      totalAttention,
      stopAllAnimations,
      openChat,
      runGoodbye,
    ]
  );

  // Trigger intro on introTrigger change
  useEffect(() => {
    if (introTrigger === 0) return;
    cancelTokenRef.current = { cancelled: false };
    runIntro(cancelTokenRef.current);

    return () => {
      cancelTokenRef.current.cancelled = true;
      activeControlsRef.current.forEach(ctrl => {
        try {
          ctrl.stop();
        } catch {}
      });
      activeControlsRef.current.clear();
    };
  }, [introTrigger, runIntro]);

  // Global keydown: Esc cancels intro / dismisses bubble; Enter opens chat
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isRunningIntroRef.current) {
          stopAllAnimations();
          runGoodbye({ cancelled: false });
        } else if (speechText || introBubbleText) {
          dismissSpeech();
          setIntroBubbleText(null);
        }
      } else if (e.key === 'Enter') {
        const activeTag = document.activeElement?.tagName.toLowerCase();
        if (activeTag !== 'input' && activeTag !== 'textarea') {
          // If orb or nothing is focused, enter opens chat
          if (document.activeElement?.id === 'ani-master-orb') {
            e.preventDefault();
            openChat();
          }
        }
      } else if (e.key.startsWith('Arrow') && document.activeElement?.id === 'ani-master-orb') {
        e.preventDefault();
        const step = 20;
        const currentX = x.get();
        const currentY = y.get();
        let newX = currentX;
        let newY = currentY;

        if (e.key === 'ArrowLeft') newX -= step;
        if (e.key === 'ArrowRight') newX += step;
        if (e.key === 'ArrowUp') newY -= step;
        if (e.key === 'ArrowDown') newY += step;

        const clamped = clampCoords({ x: newX, y: newY }, 28, 8);
        animate(x, clamped.x, { duration: 0.1 });
        animate(y, clamped.y, { duration: 0.1 });
        saveOrbPos(clamped.x, clamped.y);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [speechText, introBubbleText, dismissSpeech, openChat, stopAllAnimations, runGoodbye, x, y]);

  // Handle Drag Events
  const handleDragStart = () => {
    stopAllAnimations();
    setStage('dragging');
    dragStartPosRef.current = { x: x.get(), y: y.get() };
    animate(bodyScale, 1.1, { duration: 0.15 });
  };

  const handleDragEnd = () => {
    const endX = x.get();
    const endY = y.get();
    const delta = Math.hypot(endX - dragStartPosRef.current.x, endY - dragStartPosRef.current.y);

    if (delta < 5) {
      // Movement under 5px = click -> open chat!
      openChat();
      animate(bodyScale, 0.72, { duration: 0.2 });
      setStage('docked');
      return;
    }

    // Dragged: clamp and save
    const clamped = clampCoords({ x: endX, y: endY }, 28, 8);
    x.set(clamped.x);
    y.set(clamped.y);
    saveOrbPos(clamped.x, clamped.y);

    animate(bodyScale, 0.72, { type: 'spring', stiffness: 350, damping: 20 });
    setStage('docked');
  };

  // Double click resets home
  const handleDoubleClick = () => {
    resetPosition();
  };

  // Determine speech bubble text and chips
  const activeBubbleText = introBubbleText || speechText;
  const activeChips = introChips || speechChips;
  const showBubble = Boolean(activeBubbleText && stage !== 'dragging');

  // Compute dynamic bubble placement
  const placement = getBubblePlacement(currentCoords.x, currentCoords.y, 28);

  const isDocked = stage === 'docked';

  return (
    <>
      {/* ================================================================== */}
      {/* INTRO SPOTLIGHT BLUR BACKDROP OVERLAY                              */}
      {/* ================================================================== */}
      <AnimatePresence>
        {stage === 'intro' && (
          <motion.div
            key="ani-intro-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35, ease: 'easeInOut' }}
            onClick={() => runGoodbye({ cancelled: false })}
            className="fixed inset-0 z-40 bg-black/40 dark:bg-black/60 backdrop-blur-md pointer-events-auto cursor-pointer"
            title="Click anywhere to skip intro"
          />
        )}
      </AnimatePresence>
      {/* ================================================================== */}
      {/* LAYER E: GHOST TRAIL (4 copies with springs)                       */}
      {/* ================================================================== */}
      {showTrail && (
        <div className="fixed inset-0 pointer-events-none z-30 overflow-hidden">
          {/* Ghost 4 (faintest, highest blur) */}
          <motion.div
            style={{ x: trail4X, y: trail4Y, translateX: '-50%', translateY: '-50%' }}
            className="absolute rounded-full pointer-events-none"
          >
            <div
              className="w-14 h-14 rounded-full filter blur-[6px] opacity-10"
              style={{
                background: 'radial-gradient(circle, #8E86FF 0%, #3328E8 60%, transparent 100%)',
              }}
            />
          </motion.div>

          {/* Ghost 3 */}
          <motion.div
            style={{ x: trail3X, y: trail3Y, translateX: '-50%', translateY: '-50%' }}
            className="absolute rounded-full pointer-events-none"
          >
            <div
              className="w-14 h-14 rounded-full filter blur-[4px] opacity-15"
              style={{
                background: 'radial-gradient(circle, #8E86FF 0%, #4D3EFF 60%, transparent 100%)',
              }}
            />
          </motion.div>

          {/* Ghost 2 */}
          <motion.div
            style={{ x: trail2X, y: trail2Y, translateX: '-50%', translateY: '-50%' }}
            className="absolute rounded-full pointer-events-none"
          >
            <div
              className="w-14 h-14 rounded-full filter blur-[3px] opacity-25"
              style={{
                background: 'radial-gradient(circle, #8E86FF 0%, #5B4DFF 70%, transparent 100%)',
              }}
            />
          </motion.div>

          {/* Ghost 1 */}
          <motion.div
            style={{ x: trail1X, y: trail1Y, translateX: '-50%', translateY: '-50%' }}
            className="absolute rounded-full pointer-events-none"
          >
            <div
              className="w-14 h-14 rounded-full filter blur-[2px] opacity-35"
              style={{
                background: 'radial-gradient(circle, #8FE3FF 0%, #5B4DFF 60%, transparent 100%)',
              }}
            />
          </motion.div>
        </div>
      )}

      {/* ================================================================== */}
      {/* LAYER F: SPARKLES (Burst 4-point stars)                            */}
      {/* ================================================================== */}
      <AnimatePresence>
        {sparkles.map(sp => (
          <motion.div
            key={sp.id}
            initial={{
              x: sp.x,
              y: sp.y,
              scale: 0,
              rotate: 0,
              opacity: 0.9,
              translateX: '-50%',
              translateY: '-50%',
            }}
            animate={{
              x: sp.targetX,
              y: sp.targetY,
              scale: [0, 1.2, 0],
              rotate: 90,
              opacity: [0.9, 1, 0],
            }}
            transition={{ duration: 0.7, ease: 'easeOut' }}
            className="fixed pointer-events-none z-[55]"
          >
            <svg
              width={sp.size}
              height={sp.size}
              viewBox="0 0 24 24"
              fill={sp.color}
              className="drop-shadow-[0_0_6px_rgba(143,227,255,0.8)]"
            >
              <path d="M12 2 Q12 12 22 12 Q12 12 12 22 Q12 12 2 12 Q12 12 12 2 Z" />
            </svg>
          </motion.div>
        ))}
      </AnimatePresence>

      {/* ================================================================== */}
      {/* ONE ALWAYS-MOUNTED ORB CONTAINER (Positioned fixed left-0 top-0)  */}
      {/* ================================================================== */}
      <motion.div
        id="ani-master-orb"
        tabIndex={0}
        role="button"
        aria-label="Ask Ani, your inventory assistant (draggable)"
        drag
        dragMomentum={true}
        dragElastic={0.1}
        dragConstraints={{
          left: 32,
          right: typeof window !== 'undefined' ? window.innerWidth - 32 : 1200,
          top: 32,
          bottom: typeof window !== 'undefined' ? window.innerHeight - 32 : 800,
        }}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDoubleClick={handleDoubleClick}
        style={{
          x,
          y,
          translateX: '-50%',
          translateY: '-50%',
          touchAction: 'none',
        }}
        className={`fixed left-0 top-0 ${stage === 'intro' ? 'z-[60]' : 'z-40'} select-none outline-none focus-visible:ring-2 focus-visible:ring-sage rounded-full cursor-grab active:cursor-grabbing`}
      >
        <div className="relative flex items-center justify-center">
          {/* Docked Pill Label ("Ask Ani" + green dot) when docked */}
          <AnimatePresence>
            {isDocked && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9, x: 8 }}
                animate={{ opacity: 1, scale: 1, x: 0 }}
                exit={{ opacity: 0, scale: 0.9, x: 8 }}
                transition={{ duration: 0.2 }}
                onClick={() => openChat()}
                className="absolute right-[80%] mr-2 flex items-center gap-2 bg-card-light dark:bg-card-dark px-3 py-1.5 rounded-pill shadow-xl border border-hairline-light dark:border-hairline-dark hover:border-sage/40 transition-colors pointer-events-auto cursor-pointer group whitespace-nowrap"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-sage animate-pulse" />
                <span className="text-xs font-semibold text-ink-light dark:text-ink-dark group-hover:text-sage transition-colors">
                  Ask Ani
                </span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Quick Settings Icon Button next to docked orb */}
          <AnimatePresence>
            {isDocked && (
              <div className="absolute right-[80%] mr-28 pointer-events-auto flex items-center">
                {showSettings && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9, x: 10 }}
                    animate={{ opacity: 1, scale: 1, x: 0 }}
                    exit={{ opacity: 0, scale: 0.9, x: 10 }}
                    className="bg-card-light dark:bg-card-dark rounded-card p-3 shadow-2xl border border-hairline-light dark:border-hairline-dark text-xs flex flex-col gap-2 mr-2 whitespace-nowrap z-50"
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
                    <button
                      onClick={() => {
                        resetPosition();
                        setShowSettings(false);
                      }}
                      className="text-left text-xs text-sage hover:underline pt-1 border-t border-hairline-light dark:border-hairline-dark"
                    >
                      Reset position to home
                    </button>
                  </motion.div>
                )}

                <button
                  onClick={e => {
                    e.stopPropagation();
                    setShowSettings(prev => !prev);
                  }}
                  className="w-7 h-7 rounded-full bg-card-light dark:bg-card-dark text-muted hover:text-ink-light dark:hover:text-ink-dark shadow-bento border border-hairline-light dark:border-hairline-dark flex items-center justify-center transition-all hover:scale-105"
                  title="AI Assistant Settings"
                >
                  <SlidersHorizontal size={13} />
                </button>
              </div>
            )}
          </AnimatePresence>

          {/* The Layered Orb Character (Body, Face, Arms, Shadow) */}
          <div
            className="pointer-events-auto"
            onClick={() => openChat()}
            role="button"
            tabIndex={0}
            aria-label="Open Ani AI Assistant"
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openChat(); } }}
          >
            <OrbCharacter
              size={56}
              expression={expression}
              bodyScale={bodyScale}
              bodyScaleX={bodyScaleX}
              bodyScaleY={bodyScaleY}
              bodyRotate={bodyRotate}
              faceX={faceX}
              faceOpacity={faceOpacity}
              armScale={armScale}
              rightArmRotate={rightArmRotate}
              leftArmRotate={leftArmRotate}
              shadowScaleX={shadowScaleX}
              shadowOpacity={shadowOpacity}
              isWinking={isWinking}
            />
          </div>

          {/* ================================================================ */}
          {/* SPEECH BUBBLE (Dynamic Placement, Never Clipped)                 */}
          {/* ================================================================ */}
          <AnimatePresence>
            {showBubble && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: placement.placement === 'top' ? 6 : -6 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                style={placement.style as any}
                aria-live="polite"
                className="pointer-events-auto"
              >
                <div className="bg-card-light dark:bg-card-dark rounded-2xl p-4 shadow-2xl border border-hairline-light dark:border-hairline-dark relative space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs text-ink-light dark:text-ink-dark leading-relaxed font-medium">
                      {activeBubbleText}
                    </p>
                    <button
                      onClick={() => {
                        dismissSpeech();
                        setIntroBubbleText(null);
                      }}
                      className="text-muted hover:text-ink-light dark:hover:text-ink-dark p-0.5 rounded-full transition-colors"
                      title="Dismiss"
                    >
                      <X size={13} />
                    </button>
                  </div>

                  {/* Clickable Chips */}
                  {activeChips && activeChips.length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-1 border-t border-hairline-light dark:border-hairline-dark">
                      {activeChips.map((chip, idx) => (
                        <button
                          key={idx}
                          onClick={chip.action}
                          className="px-3 py-1 rounded-pill bg-[#3328E8] text-white hover:bg-[#4338F8] text-[11px] font-semibold transition-all shadow-sm active:scale-95"
                        >
                          {chip.label}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Speech Bubble Arrow Tail */}
                  <div
                    className={`absolute w-2.5 h-2.5 bg-card-light dark:bg-card-dark border-hairline-light dark:border-hairline-dark rotate-45 ${
                      placement.placement === 'top'
                        ? 'top-full -mt-1.5 left-1/2 -translate-x-1/2 border-b border-r'
                        : 'bottom-full -mb-1.5 left-1/2 -translate-x-1/2 border-t border-l'
                    }`}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </>
  );
};
