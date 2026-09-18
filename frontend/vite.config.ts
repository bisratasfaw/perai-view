/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import cesium from 'vite-plugin-cesium'
import path from 'node:path'
import fs from 'node:fs'

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

/**
 * Serves the real-data snapshots in ../data/real at /data/real during development and copies
 * them into dist/data/real at build time, so the static site ships the same files the pipeline
 * validated. They are fetched at runtime rather than bundled: they change nightly and are small.
 */
function realDataDir(): Plugin {
  const dir = path.resolve(__dirname, '../data/real')
  return {
    name: 'perai:real-data',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const match = /^\/data\/real\/([\w.-]+\.json)$/.exec(req.url?.split('?')[0] ?? '')
        if (!match) return next()
        const file = path.join(dir, match[1])
        if (!fs.existsSync(file)) {
          res.statusCode = 404
          return res.end('not found')
        }
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.setHeader('Cache-Control', 'no-cache')
        fs.createReadStream(file).pipe(res)
      })
    },
    closeBundle() {
      if (!fs.existsSync(dir)) return
      const out = path.resolve(__dirname, 'dist/data/real')
      fs.mkdirSync(out, { recursive: true })
      for (const name of fs.readdirSync(dir)) {
        if (name.endsWith('.json') && !name.startsWith('.')) fs.copyFileSync(path.join(dir, name), path.join(out, name))
      }
    },
  }
}

export default defineConfig({
  // Relative asset URLs work both at a domain root and under a sub-path such as a GitHub Pages
  // project site. (An absolute sub-path base makes vite-plugin-cesium copy Cesium to the wrong folder.)
  base: process.env.VITE_BASE ?? './',
  plugins: [react(), cesium(), deferCesiumScript(), siteUrl(), realDataDir()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@shared': path.resolve(__dirname, '../shared'),
      // shared/ has no node_modules of its own; resolve its zod import to ours.
      zod: path.resolve(__dirname, 'node_modules/zod'),
    },
    dedupe: ['zod'],
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
