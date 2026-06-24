/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#071826',
        cyanbrand: { 50: '#ecfeff', 100: '#cffafe', 400: '#22d3ee', 500: '#13c8de', 600: '#0891b2' }
      },
      boxShadow: { soft: '0 18px 50px rgba(7, 24, 38, 0.10)' }
    }
  },
  plugins: []
};
