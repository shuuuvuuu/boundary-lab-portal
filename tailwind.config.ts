import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        boundary: {
          black: "#000000",
          white: "#FFFFFF",
        },
      },
    },
  },
  plugins: [],
};

export default config;
