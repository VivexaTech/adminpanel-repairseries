/** Tailwind runs through PostCSS (avoids @tailwindcss/vite native edge cases on some Windows setups). */
export default {
  plugins: {
    '@tailwindcss/postcss': {},
  },
}
