import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { readFileSync } from 'node:fs'

const version = readFileSync(new URL('./VERSION', import.meta.url), 'utf8').trim()
if (!/^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)[b-z]?$/.test(version)) {
  throw new Error('Invalid component VERSION')
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue(), {
    name: 'soundroom-component-version',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({
        component: 'SoundRoom-frontend', version,
      }) + '\n' })
    },
  }],
  define: { __SOUNDROOM_VERSION__: JSON.stringify(version) },
  server: {
    host: '0.0.0.0', // 允许外部访问
    port: 5173,      // 指定端口
    allowedHosts: ['temp.shomlin.com'],
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '')
      },
      '/uploads': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      }
    }
  }
})
