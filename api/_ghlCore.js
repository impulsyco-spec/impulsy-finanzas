// Nucleo de la integracion con GoHighLevel (GHL).
// Corre SOLO en el servidor (funcion Vercel en prod, middleware de Vite en dev),
// por eso el token nunca llega al navegador.
// Usa las variables de entorno: GHL_TOKEN, GHL_LOCATION_ID.

const BASE = 'https://services.leadconnectorhq.com';
const PIPELINE_NAME = 'VENTAS IMPULSY';

// Limpia caracteres invisibles (BOM ﻿, saltos de linea, tabs) que a veces
// se cuelan al copiar/pegar o al guardar la variable de entorno.
const cleanEnv = (k) => (process.env[k] || '').replace(/[﻿\r\n\t]/g, '').trim();
const TOKEN = () => cleanEnv('GHL_TOKEN');
const LOC = () => cleanEnv('GHL_LOCATION_ID');

const HEADERS = () => ({
  Authorization: `Bearer ${TOKEN()}`,
  Version: '2021-07-28',
  Accept: 'application/json',
  'Content-Type': 'application/json',
});

async function ghl(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, { headers: HEADERS(), ...opts });
  const txt = await res.text();
  if (!res.ok) throw new Error(`GHL ${res.status}: ${txt.slice(0, 300)}`);
  return txt ? JSON.parse(txt) : {};
}

let _pipeline = null;
async function getPipeline() {
  if (_pipeline) return _pipeline;
  const data = await ghl(`/opportunities/pipelines?locationId=${LOC()}`);
  _pipeline = (data.pipelines || []).find(p => (p.name || '').toUpperCase().includes(PIPELINE_NAME));
  if (!_pipeline) throw new Error(`No encontre el pipeline "${PIPELINE_NAME}"`);
  return _pipeline;
}

let _fields = null;
async function getFieldMap() {
  if (_fields) return _fields;
  const data = await ghl(`/locations/${LOC()}/customFields`);
  _fields = {};
  (data.customFields || []).forEach(f => { _fields[f.id] = f.name; });
  return _fields;
}

export async function handleGhl(action, params = {}) {
  if (!TOKEN() || !LOC()) {
    throw new Error('Faltan GHL_TOKEN o GHL_LOCATION_ID en el entorno (.env / Vercel).');
  }
  const loc = LOC();

  if (action === 'leads') {
    const pl = await getPipeline();
    const stageMap = {};
    (pl.stages || []).forEach(s => { stageMap[s.id] = s.name; });
    let ops = [], page = 1;
    while (page <= 10) {
      const r = await ghl(`/opportunities/search?location_id=${loc}&pipeline_id=${pl.id}&limit=100&page=${page}`);
      const batch = r.opportunities || [];
      ops = ops.concat(batch);
      if (batch.length < 100) break;
      page++;
    }
    const leads = ops.map(o => ({
      id: o.id,
      contactId: o.contactId,
      nombre: o.contact?.name || o.name || 'Sin nombre',
      telefono: o.contact?.phone || '',
      etapaId: o.pipelineStageId,
      etapa: stageMap[o.pipelineStageId] || '',
      actualizado: o.lastStageChangeAt || o.updatedAt || o.createdAt,
    }));
    return { pipeline: pl.name, stages: (pl.stages || []).map(s => ({ id: s.id, name: s.name })), leads };
  }

  if (action === 'contact') {
    if (!params.id) throw new Error('Falta el id del contacto.');
    const c = (await ghl(`/contacts/${params.id}`)).contact || {};
    const fmap = await getFieldMap();
    const campos = {};
    (c.customFields || []).forEach(cf => {
      const nombre = fmap[cf.id];
      if (nombre && cf.value != null && cf.value !== '') campos[nombre] = Array.isArray(cf.value) ? cf.value.join(', ') : cf.value;
    });
    return {
      nombre: c.contactName || [c.firstName, c.lastName].filter(Boolean).join(' ') || '',
      telefono: c.phone || '',
      email: c.email || '',
      campos,
    };
  }

  throw new Error(`Accion GHL desconocida: ${action}`);
}
