/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Dark navy background palette (fotmob-inspired).
        navy: {
          950: "#070b14",
          900: "#0b111f",
          850: "#0f1626",
          800: "#141d30",
          700: "#1c2740",
          600: "#26344f",
        },
        // Electric green accent.
        accent: {
          DEFAULT: "#00e389",
          bright: "#2dffa6",
          dim: "#00b06a",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["'JetBrains Mono'", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};
