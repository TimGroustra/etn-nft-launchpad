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
      },
    },
  }
})
