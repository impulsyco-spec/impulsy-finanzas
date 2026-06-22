import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { handleGhl } from './api/_ghlCore.js'

// Puente GHL para desarrollo: atiende /api/ghl en localhost usando el token del .env.
// En producción esto lo hace la función serverless api/ghl.js (Vercel).
function ghlDevBridge() {
  return {
    name: 'ghl-dev-bridge',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url || !req.url.startsWith('/api/ghl')) return next()
        try {
          const u = new URL(req.url, 'http://localhost')
          const params = Object.fromEntries(u.searchParams.entries())
          const data = await handleGhl(params.action, params)
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(data))
        } catch (e) {
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: e.message }))
        }
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  // Carga el .env y lo expone al proceso (para el puente en dev)
  const env = loadEnv(mode, process.cwd(), '')
  process.env.GHL_TOKEN = env.GHL_TOKEN
  process.env.GHL_LOCATION_ID = env.GHL_LOCATION_ID
  return {
    plugins: [react(), ghlDevBridge()],
  }
})
