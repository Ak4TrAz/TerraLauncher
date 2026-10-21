const path = require('path')

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [path.join(__dirname, 'src/renderer/index.html'), path.join(__dirname, 'src/renderer/src/**/*.{js,jsx}')],
  theme: {
    extend: {
      colors: {
        // Palette du pack de maquettes (theme.css)
        bark: { 950: '#16110d', 900: '#1c1612', 850: '#271e18', 800: '#33271f', 700: '#49382b', 600: '#5c4736' },
        ember: { 300: '#ffae6e', 400: '#f27a29', 500: '#e46b1a', 600: '#c85a12' },
        cream: { DEFAULT: '#f6e9df', muted: '#c6b4a7' }
      },
      borderRadius: { tl: '10px', 'tl-lg': '14px' },
      fontFamily: { sans: ['Inter', 'Segoe UI Variable Display', 'Segoe UI', 'system-ui', 'sans-serif'] }
    }
  },
  plugins: []
}
