/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Dark navy background palette (fotmob-inspired). Retained for any
        // not-yet-migrated spots; the Liquid Glass theme uses the tokens below.
        navy: {
          950: "#070b14",
          900: "#0b111f",
          850: "#0f1626",
          800: "#141d30",
          700: "#1c2740",
          600: "#26344f",
        },
        // Semantic, theme-aware tokens — resolve to the active theme's CSS
        // variables (see src/index.css). Swapping data-theme reskins these.
        accent: {
          DEFAULT: "var(--accent)",
          strong: "var(--accent-strong)",
          bright: "#2dffa6",
          dim: "#00b06a",
        },
        fg: "var(--fg)",
        muted: "var(--muted)",
        faint: "var(--faint)",
        line: "var(--divider)",
        edge: "var(--border)",
        surface: "var(--surface)",
        "surface-2": "var(--surface-2)",
        pos: "var(--pos)",
        neg: "var(--neg)",
        warn: "var(--warn)",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["'JetBrains Mono'", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};
