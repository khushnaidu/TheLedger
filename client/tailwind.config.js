/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"FKT Sinvoll Sans Mono"', '"Space Mono"', 'monospace'],
        mono: ['"FKT Sinvoll Sans Mono"', '"Space Mono"', 'monospace'],
        display: ['"FKT Sinvoll Sans Mono"', '"Space Mono"', 'monospace'],
        body: ['"FKT Sinvoll Sans Mono"', '"Space Mono"', 'monospace'],
      },
    },
  },
  plugins: [],
}
