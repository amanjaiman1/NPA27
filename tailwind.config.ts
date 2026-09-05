import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class", '[data-theme="dark"]'],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Canvas / elevated surface / foreground. Everything else is composed
        // from these with opacity, so the palette stays theme-agnostic.
        ink: "rgb(var(--ink) / <alpha-value>)",
        card: "rgb(var(--card) / <alpha-value>)",
        paper: "rgb(var(--paper) / <alpha-value>)",
        line: "rgb(var(--line) / <alpha-value>)",
        // Modal / drawer backdrop — always darkens, on light and dark surfaces.
        scrim: "rgb(var(--scrim) / <alpha-value>)",
        // Brand + semantic colours.
        accent: "rgb(var(--accent) / <alpha-value>)",
        "accent-fg": "rgb(var(--accent-fg) / <alpha-value>)",
        positive: "rgb(var(--positive) / <alpha-value>)",
        warning: "rgb(var(--warning) / <alpha-value>)",
        danger: "rgb(var(--danger) / <alpha-value>)",
        info: "rgb(var(--info) / <alpha-value>)",
        // The six-colour data palette used by charts and multi-series views.
        "bloom-1": "rgb(var(--bloom-1) / <alpha-value>)",
        "bloom-2": "rgb(var(--bloom-2) / <alpha-value>)",
        "bloom-3": "rgb(var(--bloom-3) / <alpha-value>)",
        "bloom-4": "rgb(var(--bloom-4) / <alpha-value>)",
        "bloom-5": "rgb(var(--bloom-5) / <alpha-value>)",
        "bloom-6": "rgb(var(--bloom-6) / <alpha-value>)",
        // Legacy aliases kept for safety
        background: "rgb(var(--ink) / <alpha-value>)",
        foreground: "rgb(var(--paper) / <alpha-value>)",
      },
      fontFamily: {
        // The app uses exactly two faces: Poppins for text, Comfortaa for
        // display. `mono` deliberately resolves to Poppins as well — pair it
        // with the `.tabular` class for figures that need to line up — so a
        // stray `font-mono` can never pull in a third typeface.
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "var(--font-sans)", "sans-serif"],
        mono: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      letterSpacing: {
        tightest: "-0.045em",
        snugg: "-0.02em",
      },
      // Generously rounded, in the spirit of a 1.25rem base radius.
      borderRadius: {
        lg: "0.75rem",
        xl: "1rem",
        "2xl": "1.25rem",
        "3xl": "1.75rem",
        "4xl": "2.25rem",
      },
      boxShadow: {
        // Soft, wide and low-contrast: depth without a heavy edge.
        soft: "0 1px 2px rgb(var(--shadow) / 0.04), 0 12px 32px -18px rgb(var(--shadow) / 0.16)",
        lift: "0 1px 2px rgb(var(--shadow) / 0.05), 0 24px 48px -24px rgb(var(--shadow) / 0.26)",
        glow: "0 24px 60px -28px rgb(var(--shadow) / 0.35), 0 0 0 1px rgb(var(--line))",
        accent: "0 10px 26px -12px rgb(var(--accent) / 0.55)",
        ring: "0 0 0 1px rgb(var(--line))",
      },
      backgroundImage: {
        grid: "linear-gradient(rgb(var(--paper)/0.035) 1px, transparent 1px), linear-gradient(90deg, rgb(var(--paper)/0.035) 1px, transparent 1px)",
        "radial-fade":
          "radial-gradient(ellipse 80% 60% at 50% -10%, rgb(var(--paper)/0.06), transparent 70%)",
        // The ambient canvas glow. Colours come from --aura-1/--aura-2, which
        // each surface sets for itself, and the whole layer is scaled by --wash
        // — that's what separates Ivory's hint of warmth from Velvet's bloom.
        aura:
          "radial-gradient(46% 42% at 4% -6%, rgb(var(--aura-1)/0.28), transparent 62%), radial-gradient(44% 40% at 100% 4%, rgb(var(--aura-2)/0.23), transparent 62%), radial-gradient(62% 52% at 80% 104%, rgb(var(--aura-1)/0.18), transparent 68%)",
        sheen:
          "linear-gradient(180deg, rgb(var(--paper)/0.06), transparent 60%)",
        shine:
          "linear-gradient(110deg, transparent 35%, rgb(var(--paper)/0.1) 50%, transparent 65%)",
      },
      backgroundSize: {
        grid: "56px 56px",
      },
      keyframes: {
        "fade-in": {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in-fast": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "scale-in": {
          "0%": { opacity: "0", transform: "scale(0.96)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        "pulse-ring": {
          "0%": { boxShadow: "0 0 0 0 rgb(var(--accent)/0.35)" },
          "70%": { boxShadow: "0 0 0 8px rgb(var(--accent)/0)" },
          "100%": { boxShadow: "0 0 0 0 rgb(var(--accent)/0)" },
        },
        marquee: {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
        // Slow, barely-there drift for the ambient wash.
        "bloom-float": {
          "0%,100%": { transform: "translate(0,0) scale(1)" },
          "50%": { transform: "translate(2%,-3%) scale(1.06)" },
        },
        "bloom-float-2": {
          "0%,100%": { transform: "translate(0,0) scale(1.04)" },
          "50%": { transform: "translate(-2.5%,3%) scale(0.97)" },
        },
        "bloom-drift": {
          "0%,100%": { transform: "translate(0,0)" },
          "33%": { transform: "translate(-1.5%,2.5%)" },
          "66%": { transform: "translate(2.5%,-1.5%)" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.5s cubic-bezier(0.22,1,0.36,1) both",
        "fade-in-fast": "fade-in-fast 0.3s ease-out both",
        "scale-in": "scale-in 0.4s cubic-bezier(0.22,1,0.36,1) both",
        shimmer: "shimmer 2.5s linear infinite",
        "pulse-ring": "pulse-ring 2s cubic-bezier(0.4,0,0.6,1) infinite",
        marquee: "marquee 40s linear infinite",
        "bloom-float": "bloom-float 22s ease-in-out infinite",
        "bloom-float-2": "bloom-float-2 26s ease-in-out infinite",
        "bloom-drift": "bloom-drift 32s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
export default config;
