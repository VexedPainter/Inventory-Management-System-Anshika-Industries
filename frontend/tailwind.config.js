/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        canvas: {
          light: '#E9E7E1',
          dark: '#0F1110',
        },
        card: {
          light: '#FFFFFF',
          dark: '#181B1A',
        },
        ink: {
          light: '#141414',
          dark: '#F5F5F3',
        },
        muted: '#8B8B86',
        hairline: {
          light: 'rgba(0, 0, 0, 0.06)',
          dark: 'rgba(255, 255, 255, 0.08)',
        },
        sage: {
          DEFAULT: '#5F7F6D',
          light: '#6F8F7C',
          dark: '#4F6E5C',
          50: '#F4F7F5',
          100: '#E4ECE7',
          200: '#CAD9D0',
          500: '#5F7F6D',
          600: '#4F6E5C',
          700: '#3D5547',
        },
        positive: '#3E8E63',
        negative: '#D4574E',
        warning: '#D99A2B',
        orb: {
          indigo: '#3B33F0',
          violet: '#6A5BFF',
          cyan: '#8FE3FF',
        }
      },
      borderRadius: {
        'card': '24px',
        'tile': '16px',
        'pill': '9999px',
      },
      boxShadow: {
        'bento': '0 1px 2px rgba(20,20,20,0.04), 0 8px 24px rgba(20,20,20,0.05)',
        'bento-hover': '0 4px 12px rgba(20,20,20,0.06), 0 16px 32px rgba(20,20,20,0.09)',
        'orb': '0 0 25px rgba(106, 91, 255, 0.5), 0 0 50px rgba(143, 227, 255, 0.3)',
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
        mono: ['"DM Mono"', 'monospace'],
      }
    },
  },
  plugins: [],
}
