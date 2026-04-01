/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'selector',
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#8B5CF6',
          dark: '#7C3AED',
          light: '#A78BFA',
        },
        secondary: {
          DEFAULT: '#EC4899',
          dark: '#DB2777',
          light: '#F472B6',
        },
        accent: {
          orange: '#F97316',
          green: '#22C55E',
        },
        background: '#f5f7fb',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'soft': '0 4px 20px -2px rgba(0, 0, 0, 0.05)',
        'glow': '0 0 15px rgba(139, 92, 246, 0.3)',
      }
    },
  },
  plugins: [],
}