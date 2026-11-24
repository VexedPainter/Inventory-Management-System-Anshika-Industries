/**
 * orbMotion.ts
 * Motion helpers for Ani Orb: Bezier paths, viewport coordinates, sparkles, and layout.
 */

export interface Point {
  x: number;
  y: number;
}

export interface CancelToken {
  cancelled: boolean;
}

export interface SparkleItem {
  id: string;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  size: number;
  color: string;
}

/**
 * Evaluates a 2D quadratic Bezier curve at progress t (0 to 1)
 */
export function quadraticBezier(p0: Point, c: Point, p2: Point, t: number): Point {
  const oneMinusT = 1 - t;
  return {
    x: oneMinusT * oneMinusT * p0.x + 2 * oneMinusT * t * c.x + t * t * p2.x,
    y: oneMinusT * oneMinusT * p0.y + 2 * oneMinusT * t * c.y + t * t * p2.y,
  };
}

/**
 * Returns the default or saved home center point in viewport pixels.
 */
export function getHomeCoords(): Point {
  if (typeof window === 'undefined') return { x: 400, y: 600 };
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const isMobile = vw < 768;

  try {
    const saved = localStorage.getItem('ani-orb-pos');
    if (saved) {
      const { xRatio, yRatio } = JSON.parse(saved);
      if (typeof xRatio === 'number' && typeof yRatio === 'number') {
        const candidateX = Math.max(32, Math.min(vw - 32, xRatio * vw));
        const candidateY = Math.max(32, Math.min(vh - (isMobile ? 96 : 32), yRatio * vh));
        return { x: candidateX, y: candidateY };
      }
    }
  } catch {}

  // Default home: bottom-right
  const defaultX = vw - 24 - 20; // 24px right margin + 20px radius (40px dock orb)
  const defaultY = vh - (isMobile ? 88 : 24) - 20; // mobile sits above tab bar
  return { x: defaultX, y: defaultY };
}

/**
 * Persists the current orb center position as ratios of the viewport.
 */
export function saveOrbPos(x: number, y: number): void {
  if (typeof window === 'undefined') return;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  if (vw <= 0 || vh <= 0) return;
  try {
    const xRatio = Math.max(0.05, Math.min(0.95, x / vw));
    const yRatio = Math.max(0.05, Math.min(0.95, y / vh));
    localStorage.setItem('ani-orb-pos', JSON.stringify({ xRatio, yRatio }));
  } catch {}
}

/**
 * Returns exact viewport centre.
 */
export function getViewportCenter(): Point {
  if (typeof window === 'undefined') return { x: 400, y: 300 };
  return {
    x: window.innerWidth / 2,
    y: window.innerHeight / 2,
  };
}

/**
 * Computes control point for swoop from home to center:
 * C = (P0.x - 0.30 * viewportWidth, P0.y - 0.60 * (P0.y - P2.y))
 */
export function getSwoopControlPoint(p0: Point, p2: Point): Point {
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1200;
  return {
    x: p0.x - 0.30 * vw,
    y: p0.y - 0.60 * (p0.y - p2.y),
  };
}

/**
 * Computes control point for return from center back to home (mirrored Bezier).
 */
export function getReturnControlPoint(current: Point, home: Point): Point {
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1200;
  return {
    x: home.x - 0.18 * vw,
    y: home.y - 0.50 * (home.y - current.y),
  };
}

/**
 * Clamps coordinates within viewport with padding
 */
export function clampCoords(point: Point, radius: number = 28, margin: number = 8): Point {
  if (typeof window === 'undefined') return point;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const minX = margin + radius;
  const maxX = Math.max(minX, vw - margin - radius);
  const minY = margin + radius;
  const maxY = Math.max(minY, vh - margin - radius);

  return {
    x: Math.max(minX, Math.min(maxX, point.x)),
    y: Math.max(minY, Math.min(maxY, point.y)),
  };
}

/**
 * Creates 8-12 burst sparkles around a point
 */
export function createSparkles(count: number = 10, origin: Point = { x: 0, y: 0 }): SparkleItem[] {
  const sparkles: SparkleItem[] = [];
  const colors = ['#8FE3FF', '#FFE17D', '#FFFFFF', '#6F60FF', '#76F2D6'];

  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.4;
    const distance = 24 + Math.random() * 42;
    const targetX = origin.x + Math.cos(angle) * distance;
    const targetY = origin.y + Math.sin(angle) * distance;
    const size = 10 + Math.random() * 8;
    const color = colors[Math.floor(Math.random() * colors.length)];

    sparkles.push({
      id: `${Date.now()}-${i}-${Math.random()}`,
      x: origin.x,
      y: origin.y,
      targetX,
      targetY,
      size,
      color,
    });
  }

  return sparkles;
}

/**
 * Determines optimal placement of speech bubble so it never clips any viewport boundary.
 */
export function getBubblePlacement(
  orbX: number,
  orbY: number,
  orbRadius: number = 28
): {
  placement: 'top' | 'bottom';
  align: 'center' | 'left' | 'right';
  style: React.CSSProperties;
} {
  if (typeof window === 'undefined') {
    return { placement: 'top', align: 'center', style: {} };
  }

  const vw = window.innerWidth;
  const bubbleHeight = 180; // approximate max bubble height
  const placement: 'top' | 'bottom' = orbY - orbRadius < bubbleHeight + 20 ? 'bottom' : 'top';

  let align: 'center' | 'left' | 'right' = 'center';
  let horizontalTransform = '-50%';

  if (orbX < 170) {
    align = 'left';
    horizontalTransform = '-20px';
  } else if (orbX > vw - 170) {
    align = 'right';
    horizontalTransform = 'calc(-100% + 20px)';
  }

  const style: React.CSSProperties = {
    position: 'absolute',
    left: '50%',
    transform: `translateX(${horizontalTransform})`,
    maxWidth: 'min(320px, calc(100vw - 24px))',
    width: 'max-content',
    zIndex: 60,
  };

  if (placement === 'top') {
    style.bottom = `${orbRadius * 2 + 14}px`;
  } else {
    style.top = `${orbRadius * 2 + 14}px`;
  }

  return { placement, align, style };
}
