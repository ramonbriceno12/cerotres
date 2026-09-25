import preset from '@cerotres/config/tailwind.preset.js';

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  presets: [preset],
  theme: {
    extend: {},
  },
  plugins: [],
};
