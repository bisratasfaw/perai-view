/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import cesium from 'vite-plugin-cesium'
import path from 'node:path'

/**
 * vite-plugin-cesium injects Cesium.js as a render-blocking <script> in <head>.
 * Deferring it lets the static splash screen paint immediately; deferred and
 * module scripts still run in document order, so the global exists before the app.
 */
function deferCesiumScript(): Plugin {
  return {
    name: 'perai:defer-cesium-script',
    enforce: 'post',
    transformIndexHtml: {
      order: 'post',
      handler: (html) => html.replace(/<script src="([^"]*Cesium\.js)"><\/script>/, '<script defer src="$1"></script>'),
    },
  }
}

/** Absolute site URL for social-preview tags (crawlers ignore relative og:image URLs). */
function siteUrl(): Plugin {
  const url = process.env.VITE_SITE_URL ? process.env.VITE_SITE_URL.replace(/\/?$/, '/') : './'
  return {
    name: 'perai:site-url',
    transformIndexHtml: (html) => html.replaceAll('__SITE_URL__', url),
  }
}

export default defineConfig({
  // Relative asset URLs work both at a domain root and under a sub-path such as a GitHub Pages
  // project site. (An absolute sub-path base makes vite-plugin-cesium copy Cesium to the wrong folder.)
  base: process.env.VITE_BASE ?? './',
  plugins: [react(), cesium(), deferCesiumScript(), siteUrl()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@shared': path.resolve(__dirname, '../shared'),
    },
  },
  server: {
    port: 5173,
    fs: { allow: ['..'] },
    proxy: {
      '/api': {
        target: process.env.VITE_PROXY_TARGET ?? 'http://localhost:4000',
        changeOrigin: true,
        ws: true,
      },
    },
  },
  preview: {
    port: 4173,
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    chunkSizeWarningLimit: 900,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}', '../shared/**/*.test.ts'],
    restoreMocks: true,
  },
})
