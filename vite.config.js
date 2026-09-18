import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { readFileSync } from 'node:fs'

const version = readFileSync(new URL('./VERSION', import.meta.url), 'utf8').trim()
if (!/^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)[b-z]?$/.test(version)) {
  throw new Error('Invalid component VERSION')
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // The browser stays on /api; this target is a backend origin without /api.
  const target = env.SOUNDROOM_API_TARGET || 'http://163.192.34.11'
  return {
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
      host: '0.0.0.0', port: 5173, allowedHosts: ['temp.shomlin.com'],
      proxy: { '/api': { target, changeOrigin: true, rewrite: path => path.replace(/^\/api/, '') } }
    }
  }
})
