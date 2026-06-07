/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        bg: '#0A0A0F',
        surface: '#12121A',
        card: '#1A1A28',
        border: '#2A2A3E',
        primary: {
          DEFAULT: '#7C6EFF',
          dark: '#5A52E0',
          muted: 'rgba(124,110,255,0.15)',
        },
        accent: '#00D4B4',
        muted: '#8A8AA3',
        danger: '#FF4757',
      },
    },
  },
  plugins: [],
};
