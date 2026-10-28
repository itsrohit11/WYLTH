/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: { sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'], display: ['Sora', '"Plus Jakarta Sans"', 'system-ui', 'sans-serif'], logo: ['Unbounded', 'Sora', 'sans-serif'] },
      colors: {
        // Single accent across the app — violet.
        brand: {
          50:'#eef3ff', 100:'#dbe6ff', 200:'#bccfff', 300:'#97b3ff', 400:'#7ea4ff',
          500:'#5b8cff', 600:'#3f6fe6', 700:'#2f55bd', 800:'#243f8c', 900:'#1a2d63',
        },
        gold: { 300:'#e6cf9f', 400:'#dcc287', 500:'#d6b875', 600:'#b8924a' },
        coral: { 400:'#f87171', 500:'#ef4444', 600:'#dc2626' },
        mint:  { 400:'#5fd3a3', 500:'#3dbe8b', 600:'#2c9a6e' },
        // Semantic, theme-aware tokens (driven by CSS variables; light & dark swap them).
        app:        'rgb(var(--app) / <alpha-value>)',
        surface:    'rgb(var(--surface) / <alpha-value>)',
        'surface-2':'rgb(var(--surface-2) / <alpha-value>)',
        content:    'rgb(var(--content) / <alpha-value>)',
        muted:      'rgb(var(--muted) / <alpha-value>)',
        faint:      'rgb(var(--faint) / <alpha-value>)',
        line:       'rgb(var(--line) / <alpha-value>)',
      },
      boxShadow: {
        soft:  '0 1px 2px 0 rgb(0 0 0 / 0.12)',
        card:  '0 1px 2px 0 rgb(0 0 0 / 0.10)',
        lift:  '0 12px 30px -14px rgb(0 0 0 / 0.45)',
        focus: '0 0 0 3px rgb(91 140 255 / 0.30)',
        glow:  '0 0 0 0 transparent',
      },
      keyframes: {
        fadeIn: { '0%': { opacity:0, transform:'translateY(4px)' }, '100%': { opacity:1, transform:'translateY(0)' } },
        scaleIn: { '0%': { opacity:0, transform:'scale(.97)' }, '100%': { opacity:1, transform:'scale(1)' } },
        overlayIn: { '0%': { opacity:0 }, '100%': { opacity:1 } },
      },
      animation: {
        'fade-in': 'fadeIn .22s ease-out',
        'scale-in': 'scaleIn .18s cubic-bezier(.16,1,.3,1)',
        'overlay-in': 'overlayIn .2s ease-out',
      },
    },
  },
  plugins: [],
}
