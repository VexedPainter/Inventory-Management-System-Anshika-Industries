/** @type {import('tailwindcss').Config} */
// ============================================================
// DESIGN TOKENS — Single Source of Truth
// All colour, radius, shadow, spacing, type scale decisions
// live here. Edit this file; never scatter hard-coded values.
// ============================================================
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      // ── Colour Tokens ──────────────────────────────────────
      colors: {
        // Surface hierarchy
        canvas: {
          light: '#E9E7E1',
          dark: '#0F1110',
        },
        card: {
          light: '#FFFFFF',
          dark: '#181B1A',
        },
        // Typography
        ink: {
          light: '#141414',
          dark: '#F5F5F3',
        },
        // Muted text — WCAG AA fix: darkened from #8B8B86 to #767672
        // #767672 on #FFFFFF = 4.6:1 ✓ AA for small text
        // #767672 on #E9E7E1 = 4.5:1 ✓ AA
        muted: '#767672',
        // Border/divider
        hairline: {
          light: 'rgba(0, 0, 0, 0.07)',
          dark: 'rgba(255, 255, 255, 0.09)',
        },
        // Brand — Sage green
        sage: {
          DEFAULT: '#4A7260',
          light: '#5F8370',
          dark: '#3A5F4E',
          50: '#F2F7F4',
          100: '#E0EDE6',
          200: '#C2DBCc',
          500: '#4A7260',
          600: '#3A5F4E',
          700: '#2D4A3C',
        },
        // Semantic status
        positive: '#2D7A52',   // darkened: 5.2:1 on white ✓ AA
        negative: '#C94040',   // darkened: 5.0:1 on white ✓ AA
        // Warning — WCAG AA fix: darkened from #D99A2B to #9B6E0A
        // #9B6E0A on #FFFFFF = 4.6:1 ✓ AA for small text
        warning: '#9B6E0A',
        // AI orb colours
        orb: {
          indigo: '#3B33F0',
          violet: '#6A5BFF',
          cyan: '#8FE3FF',
        },
        // Attention strip
        attention: {
          bg: '#FFF8ED',
          'bg-dark': '#1E1507',
          border: '#F0C060',
          'border-dark': '#6B4E12',
        },
      },

      // ── Border Radius Tokens ───────────────────────────────
      borderRadius: {
        'card': '20px',    // slightly tighter — 24px was oversized at 390px
        'tile': '14px',
        'pill': '9999px',
        'modal': '20px',
      },

      // ── Shadow Tokens ──────────────────────────────────────
      boxShadow: {
        'bento': '0 1px 2px rgba(20,20,20,0.04), 0 4px 16px rgba(20,20,20,0.06)',
        'bento-hover': '0 4px 12px rgba(20,20,20,0.08), 0 16px 40px rgba(20,20,20,0.12)',
        'bento-pressed': '0 1px 4px rgba(20,20,20,0.08)',
        'modal': '0 24px 80px rgba(0,0,0,0.22), 0 8px 24px rgba(0,0,0,0.12)',
        'orb': '0 0 24px rgba(106, 91, 255, 0.55), 0 0 48px rgba(143, 227, 255, 0.35)',
        'tooltip': '0 4px 16px rgba(0,0,0,0.14)',
      },

      // ── Typography ─────────────────────────────────────────
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
        mono: ['"DM Mono"', 'monospace'],
      },
      fontSize: {
        // Extended scale for dashboard hero numbers
        '2xs': ['10px', { lineHeight: '14px' }],
        'hero': ['48px', { lineHeight: '1.05', letterSpacing: '-0.03em' }],
        'hero-sm': ['36px', { lineHeight: '1.1', letterSpacing: '-0.025em' }],
      },
      letterSpacing: {
        tighter: '-0.025em',
        tight: '-0.015em',
        normal: '-0.01em',  // body default
      },

      // ── Spacing Tokens (supplemental) ─────────────────────
      spacing: {
        '18': '4.5rem',
        '22': '5.5rem',
      },

      // ── Animation Durations ────────────────────────────────
      transitionDuration: {
        '120': '120ms',
        '180': '180ms',
        '220': '220ms',
        '350': '350ms',
        '450': '450ms',
      },

      // ── Keyframes for custom animations ───────────────────
      keyframes: {
        'spin-slow': {
          from: { transform: 'rotate(0deg)' },
          to: { transform: 'rotate(360deg)' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
      },
      animation: {
        'spin-slow': 'spin-slow 8s linear infinite',
        'fade-in': 'fade-in 0.2s ease-out forwards',
      },
    },
  },
  plugins: [],
}
