const { defineConfig } = require('vite')
const react = require('@vitejs/plugin-react')
const path = require('path')

module.exports = defineConfig({
  root: path.join(__dirname, 'src/renderer'),
  base: './',
  plugins: [react()],
  css: { postcss: path.join(__dirname) },
  server: { port: 5173, strictPort: true },
  build: { outDir: path.join(__dirname, 'dist'), emptyOutDir: true }
})
