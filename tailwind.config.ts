import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        cc: {
          bg: "#F6F7FB",
          card: "#FFFFFF",
          border: "#E4E7F0",
          ink: "#141824",
          muted: "#525A70",
          primary: "#4338CA",
          "primary-hover": "#3730A3",
          amber: "#D97706",
          "amber-fg": "#B45309",
          "amber-bg": "#FEF3C7",
          danger: "#E11D48",
          "danger-fg": "#BE123C",
          "danger-bg": "#FFE4E6",
          "ok-fg": "#15803D",
          "ok-bg": "#DCFCE7",
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "Georgia", "serif"],
        sans: ["var(--font-sans)", "var(--font-telugu)", "system-ui", "sans-serif"],
        numeric: ["var(--font-numeric)", "var(--font-sans)", "system-ui", "sans-serif"],
        telugu: ["var(--font-telugu)", "var(--font-sans)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
