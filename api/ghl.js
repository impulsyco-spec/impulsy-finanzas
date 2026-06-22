// Función serverless (Vercel) que atiende /api/ghl en producción.
// Mantiene el token de GHL en el servidor (variables de entorno de Vercel).
import { handleGhl } from './_ghlCore.js';

export default async function handler(req, res) {
  try {
    const { action, ...params } = req.query || {};
    const body = req.method === 'POST' ? (req.body || {}) : {};
    const data = await handleGhl(action, params, body);
    res.status(200).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
