const { defineConfig } = require('vite')
const react = require('@vitejs/plugin-react')
const path = require('path')

// Politique de sécurité du contenu de l'application construite (absente en mode dev, où Vite injecte ses scripts)
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https: terra:",
  "font-src 'self' data:",
  "connect-src 'self' terra: https://piston-meta.mojang.com https://api.modrinth.com",
  "media-src 'none'",
  "object-src 'none'",
  "frame-src 'none'",
  "worker-src 'none'",
  "base-uri 'none'",
  "form-action 'none'"
].join('; ')

const cspPlugin = {
  name: 'terra-csp',
  apply: 'build',
  transformIndexHtml: () => [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP }, injectTo: 'head-prepend' }]
}

module.exports = defineConfig({
  root: path.join(__dirname, 'src/renderer'),
  base: './',
  plugins: [react(), cspPlugin],
  css: { postcss: path.join(__dirname) },
  server: { port: 5173, strictPort: true },
  build: { outDir: path.join(__dirname, 'dist'), emptyOutDir: true }
})
