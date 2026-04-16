import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        bg: {
          primary: "#0f172a",    // slate-900
          secondary: "#1e293b",  // slate-800
          tertiary: "#334155",   // slate-700
        },
        accent: {
          primary: "#0891b2",    // cyan-600
          hover: "#0e7490",      // cyan-700
          soft: "#22d3ee",       // cyan-400
        },
        star: "#facc15",          // yellow-400
        boundary: {
          black: "#000000",
          white: "#FFFFFF",
        },
      },
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          '"Segoe UI"',
          "Roboto",
          '"Helvetica Neue"',
          "Arial",
          '"Noto Sans JP"',
          "sans-serif",
        ],
      },
      boxShadow: {
        card: "0 1px 2px 0 rgb(0 0 0 / 0.3), 0 2px 8px -2px rgb(0 0 0 / 0.4)",
      },
    },
  },
  plugins: [],
};

export default config;
