import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Calm, trustworthy palette (PRD §7)
        ink: "#1b2733",
        slate: {
          850: "#1a2332",
        },
        brand: {
          50: "#eef4fb",
          100: "#d8e6f5",
          200: "#b3cdeb",
          300: "#85addd",
          400: "#5689cb",
          500: "#356bb4",
          600: "#285496",
          700: "#22447a",
          800: "#203a66",
          900: "#1e3255",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
