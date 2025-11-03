import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef7ff',
          100: '#d9ecff',
          200: '#b8dbff',
          300: '#8ec7ff',
          400: '#5aabff',
          500: '#2f8eff',
          600: '#1773e6',
          700: '#105abd',
          800: '#0f4793',
          900: '#0d3b77'
        }
      },
      boxShadow: {
        card: '0 10px 25px -10px rgba(0,0,0,0.15)'
      }
    },
  },
  plugins: [],
};
export default config;
