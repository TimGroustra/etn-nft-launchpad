import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const supabaseUrl = (env.VITE_SUPABASE_URL || 'https://sktexilttapijefdusni.supabase.co').replace(
    /\/$/,
    '',
  )

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules/three') || id.includes('node_modules/three-stdlib')) {
              return 'gallery-3d'
            }
            if (id.includes('node_modules/gifuct-js')) {
              return 'gallery-3d'
            }
          },
        },
      },
    },
    server: {
      proxy: {
        '/m': {
          target: supabaseUrl,
          changeOrigin: true,
          rewrite: (requestPath) =>
            requestPath.replace(/^\/m\//, '/storage/v1/object/public/collection-metadata/'),
        },
        '/i': {
          target: supabaseUrl,
          changeOrigin: true,
          rewrite: (requestPath) =>
            requestPath.replace(/^\/i\//, '/storage/v1/object/public/collection-images/'),
        },
        '/gem-shards': {
          target: supabaseUrl,
          changeOrigin: true,
          rewrite: (requestPath) =>
            requestPath.replace(/^\/gem-shards\//, '/storage/v1/object/public/gem-shards/'),
        },
        '/ipfs': {
          target: 'https://cloudflare-ipfs.com',
          changeOrigin: true,
          rewrite: (requestPath) => requestPath.replace(/^\/ipfs/, '/ipfs'),
        },
        '/g': {
          target: supabaseUrl,
          changeOrigin: true,
          rewrite: (requestPath) =>
            requestPath.replace(/^\/g\//, '/storage/v1/object/public/gallery-cache/'),
        },
      },
    },
  }
})
