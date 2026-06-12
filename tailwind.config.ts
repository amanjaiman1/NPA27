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
        // Two-token black & white system. Everything else is composed
        // from these via opacity, so the palette is theme-agnostic.
        ink: "rgb(var(--ink) / <alpha-value>)",
        paper: "rgb(var(--paper) / <alpha-value>)",
        // A calm accent + muted semantic palette layered on top.
        accent: "rgb(var(--accent) / <alpha-value>)",
        "accent-fg": "rgb(var(--accent-fg) / <alpha-value>)",
        positive: "rgb(var(--positive) / <alpha-value>)",
        warning: "rgb(var(--warning) / <alpha-value>)",
        danger: "rgb(var(--danger) / <alpha-value>)",
        info: "rgb(var(--info) / <alpha-value>)",
        // The blooming bouquet — used for multi-colour charts & accents.
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
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
        display: ["var(--font-display)", "Georgia", "serif"],
      },
      letterSpacing: {
        tightest: "-0.04em",
        snugg: "-0.02em",
      },
      borderRadius: {
        xl: "0.875rem",
        "2xl": "1.125rem",
        "3xl": "1.5rem",
      },
      boxShadow: {
        soft: "0 1px 2px rgba(0,0,0,0.06), 0 8px 24px -12px rgba(0,0,0,0.3)",
        glow: "0 0 0 1px rgb(var(--paper) / 0.06), 0 20px 60px -20px rgb(0 0 0 / 0.6)",
        ring: "0 0 0 1px rgb(var(--paper) / 0.1)",
      },
      backgroundImage: {
        grid: "linear-gradient(rgb(var(--paper)/0.04) 1px, transparent 1px), linear-gradient(90deg, rgb(var(--paper)/0.04) 1px, transparent 1px)",
        "radial-fade":
          "radial-gradient(ellipse 80% 60% at 50% -10%, rgb(var(--paper)/0.08), transparent 70%)",
        // A scattered field of coloured blooms — the site's living backdrop.
        "bloom-field":
          "radial-gradient(38% 34% at 10% 6%, rgb(var(--bloom-1)/0.20), transparent 60%), radial-gradient(42% 38% at 90% 2%, rgb(var(--bloom-2)/0.18), transparent 60%), radial-gradient(46% 44% at 82% 90%, rgb(var(--bloom-3)/0.16), transparent 62%), radial-gradient(40% 40% at 14% 96%, rgb(var(--bloom-4)/0.14), transparent 60%), radial-gradient(34% 30% at 52% 48%, rgb(var(--bloom-5)/0.10), transparent 70%)",
        shine:
          "linear-gradient(110deg, transparent 35%, rgb(var(--paper)/0.12) 50%, transparent 65%)",
      },
      backgroundSize: {
        grid: "44px 44px",
      },
      keyframes: {
        "fade-in": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
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
          "0%": { boxShadow: "0 0 0 0 rgb(var(--paper)/0.35)" },
          "70%": { boxShadow: "0 0 0 8px rgb(var(--paper)/0)" },
          "100%": { boxShadow: "0 0 0 0 rgb(var(--paper)/0)" },
        },
        marquee: {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
        "bloom-float": {
          "0%,100%": { transform: "translate(0,0) scale(1)" },
          "50%": { transform: "translate(2.5%,-4%) scale(1.08)" },
        },
        "bloom-float-2": {
          "0%,100%": { transform: "translate(0,0) scale(1.05)" },
          "50%": { transform: "translate(-3%,3.5%) scale(0.95)" },
        },
        "bloom-drift": {
          "0%,100%": { transform: "translate(0,0)" },
          "33%": { transform: "translate(-2%,3%)" },
          "66%": { transform: "translate(3%,-2%)" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.5s cubic-bezier(0.22,1,0.36,1) both",
        "fade-in-fast": "fade-in-fast 0.3s ease-out both",
        "scale-in": "scale-in 0.4s cubic-bezier(0.22,1,0.36,1) both",
        shimmer: "shimmer 2.5s linear infinite",
        "pulse-ring": "pulse-ring 2s cubic-bezier(0.4,0,0.6,1) infinite",
        marquee: "marquee 40s linear infinite",
        "bloom-float": "bloom-float 18s ease-in-out infinite",
        "bloom-float-2": "bloom-float-2 22s ease-in-out infinite",
        "bloom-drift": "bloom-drift 28s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
export default config;
