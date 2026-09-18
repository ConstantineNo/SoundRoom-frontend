import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // The browser stays on /api; this target is a backend origin without /api.
  const target = env.SOUNDROOM_API_TARGET || 'http://163.192.34.11'
  return {
    plugins: [vue()],
    server: {
      host: '0.0.0.0', port: 5173, allowedHosts: ['temp.shomlin.com'],
      proxy: { '/api': { target, changeOrigin: true, rewrite: path => path.replace(/^\/api/, '') } }
    }
  }
})
