// Tailwind 3.x — NativeWind 4 targets v3's config format, not v4's CSS-first
// one. The palette below is the web app's `styles.css` design tokens converted
// from oklch (which React Native cannot parse) to sRGB hex, so the two apps
// stay visually the same colour rather than "about the same".
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        background: "#fcfaf1",
        foreground: "#0f1b2d",
        card: "#ffffff",
        primary: { DEFAULT: "#ee343b", foreground: "#fcfcfc" },
        muted: { DEFAULT: "#e7f0f8", foreground: "#586474" },
        accent: "#f9d544",
        border: "#d4dfeb",
        poke: {
          red: "#ee343b",
          yellow: "#f9c718",
          blue: "#0076d2",
          dark: "#0f1b2d",
        },
      },
      borderRadius: { card: "16px" },
    },
  },
  plugins: [],
};
