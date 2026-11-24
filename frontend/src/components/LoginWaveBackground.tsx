import React, { useEffect, useRef, useState } from 'react';

export type LoginWaveStatus = 'idle' | 'authenticating' | 'failed' | 'success';

interface LoginWaveBackgroundProps {
  status?: LoginWaveStatus;
}

interface Ember {
  x: number;
  y: number;
  size: number;
  vx: number;
  vy: number;
  alpha: number;
  maxAlpha: number;
  color: string;
  twinkleSpeed: number;
  phase: number;
}

interface WaveRibbon {
  baseYPercent: number;
  thickness: number;
  f1: number;
  f2: number;
  f3: number;
  s1: number;
  s2: number;
  s3: number;
  a1: number;
  a2: number;
  phi1: number;
  phi2: number;
  phi3: number;
  colorStart: string;
  colorEnd: string;
  edgeColor: string;
  alpha: number;
  shadowBlur: number;
}

export const LoginWaveBackground: React.FC<LoginWaveBackgroundProps> = ({
  status = 'idle',
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [hasWebGlOr2D, setHasWebGlOr2D] = useState(true);
  const [fadeIn, setFadeIn] = useState(false);
  const statusRef = useRef<LoginWaveStatus>(status);
  statusRef.current = status;

  // Track fail pulse
  const failPulseTimeRef = useRef<number>(0);
  useEffect(() => {
    if (status === 'failed') {
      failPulseTimeRef.current = performance.now();
    }
  }, [status]);

  // Entrance fade-in over 900ms
  useEffect(() => {
    const timer = setTimeout(() => setFadeIn(true), 30);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      setHasWebGlOr2D(false);
      return;
    }

    // Check prefers-reduced-motion
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Device Pixel Ratio capped at 2x
    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    let width = (canvas.width = window.innerWidth * dpr);
    let height = (canvas.height = window.innerHeight * dpr);
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;

    // Film grain pattern generator
    let grainPattern: CanvasPattern | null = null;
    try {
      const grainCanvas = document.createElement('canvas');
      grainCanvas.width = 128;
      grainCanvas.height = 128;
      const gctx = grainCanvas.getContext('2d');
      if (gctx) {
        const imgData = gctx.createImageData(128, 128);
        const data = imgData.data;
        for (let i = 0; i < data.length; i += 4) {
          const val = Math.floor(Math.random() * 255);
          data[i] = val; // R
          data[i + 1] = Math.floor(val * 0.3); // G (slight reddish tint)
          data[i + 2] = Math.floor(val * 0.3); // B
          data[i + 3] = 18; // ~7% alpha noise
        }
        gctx.putImageData(imgData, 0, 0);
        grainPattern = ctx.createPattern(grainCanvas, 'repeat');
      }
    } catch {
      grainPattern = null;
    }

    // Performance adaptive quality
    let isLowQuality = window.innerWidth < 640;
    let slowFramesCount = 0;
    let totalFramesSampled = 0;

    // Pointer tracking
    const cursor = {
      x: width / 2,
      y: height / 2,
      targetX: width / 2,
      targetY: height / 2,
      lastMoveTime: performance.now(),
    };

    const handlePointerMove = (e: MouseEvent | TouchEvent) => {
      let clientX = 0;
      let clientY = 0;
      if ('touches' in e && e.touches.length > 0) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
      } else if ('clientX' in e) {
        clientX = e.clientX;
        clientY = e.clientY;
      }
      cursor.targetX = clientX * dpr;
      cursor.targetY = clientY * dpr;
      cursor.lastMoveTime = performance.now();
    };

    window.addEventListener('mousemove', handlePointerMove, { passive: true });
    window.addEventListener('touchmove', handlePointerMove, { passive: true });

    // Embers initialization
    const emberColors = ['#FF4D4D', '#FF6B4A', '#FF8A5B', '#E5233B'];
    const createEmber = (initialRandomY = false): Ember => ({
      x: Math.random() * width,
      y: initialRandomY ? Math.random() * height : height + Math.random() * 20,
      size: (Math.random() * 2 + 1) * dpr,
      vx: (Math.random() - 0.5) * 0.6 * dpr,
      vy: -(Math.random() * 0.7 + 0.3) * dpr,
      alpha: Math.random() * 0.5 + 0.2,
      maxAlpha: Math.random() * 0.6 + 0.3,
      color: emberColors[Math.floor(Math.random() * emberColors.length)],
      twinkleSpeed: Math.random() * 0.003 + 0.001,
      phase: Math.random() * Math.PI * 2,
    });

    let emberCount = isLowQuality ? 20 : 42;
    let embers: Ember[] = Array.from({ length: emberCount }, () => createEmber(true));

    // Random initial phase seed so each visit feels distinct
    const randomPhaseSeed = Math.random() * 100;

    // Ribbons definitions (5 to 7 ribbons)
    const baseRibbons: WaveRibbon[] = [
      {
        baseYPercent: 0.28,
        thickness: 90 * dpr,
        f1: 0.0012 / dpr,
        f2: 0.0028 / dpr,
        f3: 0.0006 / dpr,
        s1: 0.0007,
        s2: -0.0005,
        s3: 0.0003,
        a1: 42 * dpr,
        a2: 24 * dpr,
        phi1: randomPhaseSeed + 0.4,
        phi2: randomPhaseSeed + 1.2,
        phi3: randomPhaseSeed + 2.0,
        colorStart: '#7A0A18',
        colorEnd: '#E5233B',
        edgeColor: '#FF5A5F',
        alpha: 0.16,
        shadowBlur: 28 * dpr,
      },
      {
        baseYPercent: 0.44,
        thickness: 140 * dpr,
        f1: 0.0009 / dpr,
        f2: 0.0021 / dpr,
        f3: 0.0004 / dpr,
        s1: 0.0009,
        s2: -0.0007,
        s3: 0.0004,
        a1: 56 * dpr,
        a2: 32 * dpr,
        phi1: randomPhaseSeed + 1.8,
        phi2: randomPhaseSeed + 2.9,
        phi3: randomPhaseSeed + 0.7,
        colorStart: '#5A0914',
        colorEnd: '#D81E38',
        edgeColor: '#FF686D',
        alpha: 0.22,
        shadowBlur: 36 * dpr,
      },
      {
        baseYPercent: 0.58,
        thickness: 110 * dpr,
        f1: 0.0014 / dpr,
        f2: 0.0031 / dpr,
        f3: 0.0008 / dpr,
        s1: 0.0006,
        s2: -0.0004,
        s3: 0.0005,
        a1: 48 * dpr,
        a2: 26 * dpr,
        phi1: randomPhaseSeed + 3.1,
        phi2: randomPhaseSeed + 4.2,
        phi3: randomPhaseSeed + 1.5,
        colorStart: '#8B0D1E',
        colorEnd: '#FF2A48',
        edgeColor: '#FF7B7F',
        alpha: 0.18,
        shadowBlur: 32 * dpr,
      },
      {
        baseYPercent: 0.72,
        thickness: 160 * dpr,
        f1: 0.0008 / dpr,
        f2: 0.0019 / dpr,
        f3: 0.0005 / dpr,
        s1: 0.0011,
        s2: -0.0008,
        s3: 0.0003,
        a1: 64 * dpr,
        a2: 38 * dpr,
        phi1: randomPhaseSeed + 4.5,
        phi2: randomPhaseSeed + 0.3,
        phi3: randomPhaseSeed + 3.4,
        colorStart: '#680812',
        colorEnd: '#E5233B',
        edgeColor: '#FF5A5F',
        alpha: 0.24,
        shadowBlur: 40 * dpr,
      },
      {
        baseYPercent: 0.86,
        thickness: 120 * dpr,
        f1: 0.0013 / dpr,
        f2: 0.0026 / dpr,
        f3: 0.0007 / dpr,
        s1: 0.0008,
        s2: -0.0006,
        s3: 0.0006,
        a1: 50 * dpr,
        a2: 28 * dpr,
        phi1: randomPhaseSeed + 5.6,
        phi2: randomPhaseSeed + 2.1,
        phi3: randomPhaseSeed + 4.9,
        colorStart: '#4C060D',
        colorEnd: '#C4162E',
        edgeColor: '#FF4D53',
        alpha: 0.14,
        shadowBlur: 24 * dpr,
      },
      {
        baseYPercent: 0.36,
        thickness: 80 * dpr,
        f1: 0.0017 / dpr,
        f2: 0.0035 / dpr,
        f3: 0.0011 / dpr,
        s1: 0.0013,
        s2: -0.0009,
        s3: 0.0007,
        a1: 36 * dpr,
        a2: 18 * dpr,
        phi1: randomPhaseSeed + 2.4,
        phi2: randomPhaseSeed + 5.1,
        phi3: randomPhaseSeed + 0.9,
        colorStart: '#991124',
        colorEnd: '#FF3C55',
        edgeColor: '#FFA1A5',
        alpha: 0.12,
        shadowBlur: 26 * dpr,
      },
    ];

    // Debounced resize handler
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    const handleResize = () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        width = canvas.width = window.innerWidth * dpr;
        height = canvas.height = window.innerHeight * dpr;
        canvas.style.width = `${window.innerWidth}px`;
        canvas.style.height = `${window.innerHeight}px`;
        isLowQuality = window.innerWidth < 640;
        emberCount = isLowQuality ? 20 : 42;
        embers = Array.from({ length: emberCount }, () => createEmber(true));
      }, 150);
    };

    window.addEventListener('resize', handleResize);

    // Visibility change handler: pause loop when tab is hidden
    let isTabVisible = !document.hidden;
    const handleVisibility = () => {
      isTabVisible = !document.hidden;
    };
    document.addEventListener('visibilitychange', handleVisibility);

    // Animation loop variables
    let animId: number = 0;
    let lastTime = performance.now();
    let accumulatedTime = 0;
    const targetFps = 60;
    const frameInterval = 1000 / targetFps;

    // Single static render for prefers-reduced-motion
    if (prefersReducedMotion) {
      renderFrame(1000, 0);
      return () => {
        window.removeEventListener('resize', handleResize);
        window.removeEventListener('mousemove', handlePointerMove);
        window.removeEventListener('touchmove', handlePointerMove);
        document.removeEventListener('visibilitychange', handleVisibility);
      };
    }

    function renderFrame(time: number, speedMultiplier: number) {
      if (!ctx) return;

      // 1. Dark base background with radial glow
      const baseGrad = ctx.createRadialGradient(
        width * 0.5,
        height * 0.45,
        width * 0.05,
        width * 0.5,
        height * 0.5,
        Math.max(width, height) * 0.75
      );
      baseGrad.addColorStop(0, '#14060B');
      baseGrad.addColorStop(0.5, '#0A0507');
      baseGrad.addColorStop(1, '#050506');
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = baseGrad;
      ctx.fillRect(0, 0, width, height);

      // 2. Glow Orbs on slow Lissajous paths
      const orbs = [
        {
          x: width * 0.5 + Math.sin(time * 0.0003 + 0.5) * width * 0.35,
          y: height * 0.5 + Math.cos(time * 0.0004 + 1.2) * height * 0.28,
          radius: 340 * dpr,
          color: 'rgba(255, 46, 77, 0.16)',
        },
        {
          x: width * 0.5 + Math.sin(time * 0.00025 + 2.1) * width * 0.32,
          y: height * 0.5 + Math.sin(time * 0.00035 + 0.8) * height * 0.32,
          radius: 420 * dpr,
          color: 'rgba(179, 18, 42, 0.18)',
        },
        {
          x: width * 0.5 + Math.cos(time * 0.0003 + 4.0) * width * 0.28,
          y: height * 0.5 + Math.sin(time * 0.0002 + 3.1) * height * 0.25,
          radius: 360 * dpr,
          color: 'rgba(90, 15, 42, 0.20)',
        },
      ];

      ctx.globalCompositeOperation = 'lighter';
      for (const orb of orbs) {
        const og = ctx.createRadialGradient(orb.x, orb.y, 0, orb.x, orb.y, orb.radius);
        og.addColorStop(0, orb.color);
        og.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = og;
        ctx.beginPath();
        ctx.arc(orb.x, orb.y, orb.radius, 0, Math.PI * 2);
        ctx.fill();
      }

      // 3. Cursor Light with smooth lerp & idle wander
      const timeSinceMove = time - cursor.lastMoveTime;
      if (timeSinceMove > 2200) {
        // Slow gentle wander
        cursor.targetX = width * 0.5 + Math.sin(time * 0.0008) * width * 0.22;
        cursor.targetY = height * 0.5 + Math.cos(time * 0.0006) * height * 0.18;
      }
      cursor.x += (cursor.targetX - cursor.x) * 0.08;
      cursor.y += (cursor.targetY - cursor.y) * 0.08;

      const cursorRadius = 280 * dpr;
      const cg = ctx.createRadialGradient(cursor.x, cursor.y, 0, cursor.x, cursor.y, cursorRadius);
      cg.addColorStop(0, 'rgba(255, 59, 78, 0.14)');
      cg.addColorStop(0.6, 'rgba(180, 20, 36, 0.06)');
      cg.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = cg;
      ctx.beginPath();
      ctx.arc(cursor.x, cursor.y, cursorRadius, 0, Math.PI * 2);
      ctx.fill();

      // 4. Red Silk Waves (5 to 7 ribbons, additive glow, breathing amplitude)
      const ribbonsToDraw = isLowQuality ? baseRibbons.slice(0, 3) : baseRibbons;
      const breathingAmp = 1 + 0.22 * Math.sin(time * (Math.PI * 2 / 12000));
      const stepX = isLowQuality ? 24 * dpr : 14 * dpr;

      for (let i = 0; i < ribbonsToDraw.length; i++) {
        const r = ribbonsToDraw[i];
        const baseY = height * r.baseYPercent;
        const speed = speedMultiplier;

        ctx.beginPath();
        let firstY = 0;

        // Top line of ribbon
        for (let x = 0; x <= width + stepX; x += stepX) {
          // Sine sum wave
          const wave =
            r.a1 * breathingAmp * Math.sin(x * r.f1 + time * r.s1 * speed + r.phi1) +
            r.a2 * breathingAmp * Math.sin(x * r.f2 + time * r.s2 * speed + r.phi2) +
            (r.a1 * 0.35) * Math.sin(x * r.f3 + time * r.s3 * speed + r.phi3);

          // Cursor displacement bend (max 18px)
          const dx = x - cursor.x;
          const dy = (baseY + wave) - cursor.y;
          const distSq = dx * dx + dy * dy;
          const cursorInfluence = Math.max(0, 1 - Math.sqrt(distSq) / (260 * dpr));
          const cursorBend = cursorInfluence * 18 * dpr * Math.sign(cursor.y - (baseY + wave));

          const curY = baseY + wave + cursorBend;

          if (x === 0) {
            ctx.moveTo(x, curY);
            firstY = curY;
          } else {
            ctx.lineTo(x, curY);
          }
        }

        // Bottom line of ribbon to close filled path
        const ribbonThickness = r.thickness * (0.85 + 0.15 * Math.cos(time * 0.001 + i));
        ctx.lineTo(width, height);
        ctx.lineTo(0, height);
        ctx.closePath();

        // Fill ribbon with gradient
        const ribbonGrad = ctx.createLinearGradient(0, baseY - 60 * dpr, 0, baseY + ribbonThickness);
        ribbonGrad.addColorStop(0, r.colorEnd);
        ribbonGrad.addColorStop(0.4, r.colorStart);
        ribbonGrad.addColorStop(1, 'rgba(10, 4, 6, 0)');

        ctx.globalAlpha = r.alpha;
        ctx.fillStyle = ribbonGrad;
        ctx.fill();

        // Hot highlight edge on the leading upper border
        ctx.beginPath();
        for (let x = 0; x <= width + stepX; x += stepX) {
          const wave =
            r.a1 * breathingAmp * Math.sin(x * r.f1 + time * r.s1 * speed + r.phi1) +
            r.a2 * breathingAmp * Math.sin(x * r.f2 + time * r.s2 * speed + r.phi2) +
            (r.a1 * 0.35) * Math.sin(x * r.f3 + time * r.s3 * speed + r.phi3);
          const dx = x - cursor.x;
          const dy = (baseY + wave) - cursor.y;
          const distSq = dx * dx + dy * dy;
          const cursorInfluence = Math.max(0, 1 - Math.sqrt(distSq) / (260 * dpr));
          const cursorBend = cursorInfluence * 18 * dpr * Math.sign(cursor.y - (baseY + wave));
          const curY = baseY + wave + cursorBend;
          if (x === 0) ctx.moveTo(x, curY);
          else ctx.lineTo(x, curY);
        }

        ctx.strokeStyle = r.edgeColor;
        ctx.lineWidth = 1.6 * dpr;
        if (!isLowQuality) {
          ctx.shadowColor = r.edgeColor;
          ctx.shadowBlur = r.shadowBlur;
        } else {
          ctx.shadowBlur = 0;
        }
        ctx.stroke();
        ctx.shadowBlur = 0; // Reset
      }

      ctx.globalAlpha = 1.0;

      // 5. Scan Sweep: faint diagonal band crossing screen every 14s
      const scanPeriod = 14000;
      const scanProgress = (time % scanPeriod) / scanPeriod;
      const scanCenter = scanProgress * (width + height * 1.5) - height * 0.5;
      const scanWidth = 180 * dpr;

      ctx.save();
      ctx.translate(scanCenter, 0);
      ctx.rotate(Math.PI / 4); // 45 deg diagonal
      const scanGrad = ctx.createLinearGradient(-scanWidth, 0, scanWidth, 0);
      scanGrad.addColorStop(0, 'rgba(255, 60, 80, 0)');
      scanGrad.addColorStop(0.5, 'rgba(255, 90, 100, 0.05)');
      scanGrad.addColorStop(1, 'rgba(255, 60, 80, 0)');
      ctx.fillStyle = scanGrad;
      ctx.fillRect(-scanWidth, -height * 2, scanWidth * 2, height * 4);
      ctx.restore();

      // 6. Embers: small rising particles with sway and twinkling
      for (const em of embers) {
        em.y += em.vy;
        em.x += em.vx + Math.sin(time * 0.0015 + em.phase) * 0.4 * dpr;

        // Twinkle alpha
        const curAlpha = em.maxAlpha * (0.65 + 0.35 * Math.sin(time * em.twinkleSpeed + em.phase));

        if (em.y < -10) {
          em.y = height + 10;
          em.x = Math.random() * width;
        }

        ctx.fillStyle = em.color;
        ctx.globalAlpha = Math.max(0, Math.min(1, curAlpha));
        ctx.beginPath();
        ctx.arc(em.x, em.y, em.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1.0;

      // 7. Dark radial mask behind card (center, radius 420px, alpha 0.35)
      // Ensures card text & inputs keep full WCAG AA contrast
      ctx.globalCompositeOperation = 'source-over';
      const maskRadius = Math.min(width * 0.45, 420 * dpr);
      const maskGrad = ctx.createRadialGradient(
        width * 0.5,
        height * 0.5,
        0,
        width * 0.5,
        height * 0.5,
        maskRadius
      );
      maskGrad.addColorStop(0, 'rgba(7, 8, 10, 0.42)');
      maskGrad.addColorStop(0.7, 'rgba(7, 8, 10, 0.28)');
      maskGrad.addColorStop(1, 'rgba(7, 8, 10, 0)');
      ctx.fillStyle = maskGrad;
      ctx.beginPath();
      ctx.arc(width * 0.5, height * 0.5, maskRadius, 0, Math.PI * 2);
      ctx.fill();

      // 8. Subtle film grain overlay
      if (grainPattern) {
        ctx.fillStyle = grainPattern;
        ctx.fillRect(0, 0, width, height);
      }

      // 9. Fail pulse effect (brief red flash when login fails)
      const failElapsed = time - failPulseTimeRef.current;
      if (failElapsed >= 0 && failElapsed < 450) {
        const pulseProgress = failElapsed / 450;
        const pulseAlpha = (1 - pulseProgress) * 0.25;
        ctx.fillStyle = `rgba(229, 35, 59, ${pulseAlpha})`;
        ctx.fillRect(0, 0, width, height);
      }
    }

    const loop = (currentTime: number) => {
      animId = requestAnimationFrame(loop);

      if (!isTabVisible) {
        lastTime = currentTime;
        return;
      }

      const delta = currentTime - lastTime;
      lastTime = currentTime;

      // Frame time monitoring for adaptive performance downgrade
      totalFramesSampled++;
      if (delta > 24) {
        slowFramesCount++;
      }
      if (totalFramesSampled >= 90) {
        // Average frame time exceeded 24ms for ~1.5 - 2s
        if (slowFramesCount > 40 && !isLowQuality) {
          isLowQuality = true;
          embers = embers.slice(0, 20);
        }
        slowFramesCount = 0;
        totalFramesSampled = 0;
      }

      accumulatedTime += delta;
      if (accumulatedTime >= frameInterval) {
        const currentStatus = statusRef.current;
        // Authenticating: 1.6x speed
        const speedMult = currentStatus === 'authenticating' ? 1.6 : 1.0;
        renderFrame(currentTime, speedMult);
        accumulatedTime %= frameInterval;
      }
    };

    animId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousemove', handlePointerMove);
      window.removeEventListener('touchmove', handlePointerMove);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  return (
    <div
      className={`fixed inset-0 z-0 pointer-events-none overflow-hidden transition-opacity duration-900 ${
        fadeIn ? (status === 'success' ? 'opacity-0 duration-300' : 'opacity-100') : 'opacity-0'
      }`}
      aria-hidden="true"
    >
      {/* Canvas for silk waves & particle dynamics */}
      {hasWebGlOr2D ? (
        <canvas ref={canvasRef} className="absolute inset-0 block w-full h-full" />
      ) : (
        // CSS fallback when canvas 2D is unavailable
        <div className="absolute inset-0 bg-[#07080A] bg-[radial-gradient(ellipse_at_center,_#1c080f_0%,_#07080a_75%)]" />
      )}

      {/* CSS Vignette overlay so edges are gently framed and card area stays calm */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_transparent_0%,_rgba(0,0,0,0.55)_100%)] pointer-events-none" />
    </div>
  );
};
