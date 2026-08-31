import type { Config } from "tailwindcss";

const config: Config = {
  // Dark mode is always on (class is set on <html> in layout.tsx).
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Slate-based dark palette used across the app.
        bg: "#0b0f17",
        surface: "#111827",
        "surface-2": "#1a2234",
        border: "#243045",
        muted: "#8b97ad",
        accent: "#6366f1",
      },
    },
  },
  plugins: [],
};

export default config;
