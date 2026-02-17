/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'primary': '#1e3a5f',
        'primary-dark': '#152a45',
        'secondary': '#d4a574',
        'secondary-dark': '#b8935f',
        'cream-accent': '#e8dcc8',
        'background-light': '#fdfbf7',
        'background-dark': '#1a1a2e',
        'surface-light': '#ffffff',
        'surface-dark': '#16213e',
        'text-light': '#1f2937',
        'text-dark': '#e5e7eb',
      },
      boxShadow: {
        'soft': '0 4px 20px -2px rgba(0, 0, 0, 0.1)',
        'soft-dark': '0 4px 20px -2px rgba(0, 0, 0, 0.3)',
      }
    },
  },
  plugins: [],
};
