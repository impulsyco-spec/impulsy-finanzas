// Nucleo de la integracion con GoHighLevel (GHL).
// Corre SOLO en el servidor (funcion Vercel en prod, middleware de Vite en dev),
// por eso el token nunca llega al navegador.
// Usa las variables de entorno: GHL_TOKEN, GHL_LOCATION_ID.

const BASE = 'https://services.leadconnectorhq.com';
const PIPELINE_NAME = 'VENTAS IMPULSY';

// Limpia caracteres invisibles (BOM, saltos de linea, tabs) que a veces
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

// Normaliza para comparar nombres de etapa sin acentos/mayusculas/emojis
const norm = (s) => (s || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

let _pipeline = null;
async function getPipeline() {
  if (_pipeline) return _pipeline;
  const data = await ghl(`/opportunities/pipelines?locationId=${LOC()}`);
  _pipeline = (data.pipelines || []).find(p => norm(p.name).includes(PIPELINE_NAME));
  if (!_pipeline) throw new Error(`No encontre el pipeline "${PIPELINE_NAME}"`);
  return _pipeline;
}

// id de la etapa cuyo nombre contiene `keyword` (sin acentos/emojis)
async function stageId(keyword) {
  const pl = await getPipeline();
  const st = (pl.stages || []).find(s => norm(s.name).includes(norm(keyword)));
  return st ? st.id : null;
}

let _fields = null;
async function getFieldMap() {
  if (_fields) return _fields;
  const data = await ghl(`/locations/${LOC()}/customFields`);
  _fields = {};
  (data.customFields || []).forEach(f => { _fields[f.id] = f.name; });
  return _fields;
}

// ── Escrituras a GHL ──────────────────────────────────────────
async function addNote(contactId, body) {
  if (!contactId || !body) return;
  await ghl(`/contacts/${contactId}/notes`, { method: 'POST', body: JSON.stringify({ body }) });
}
async function updateContact(contactId, patch) {
  const clean = {};
  if (patch.companyName) clean.companyName = patch.companyName;
  if (patch.email) clean.email = patch.email;
  if (!contactId || Object.keys(clean).length === 0) return false;
  await ghl(`/contacts/${contactId}`, { method: 'PUT', body: JSON.stringify(clean) });
  return true;
}
async function addTag(contactId, tag) {
  if (!contactId || !tag) return;
  await ghl(`/contacts/${contactId}/tags`, { method: 'POST', body: JSON.stringify({ tags: [tag] }) });
}

export async function handleGhl(action, params = {}, body = {}) {
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
      valor: Number(o.monetaryValue) || 0,
      actualizado: o.lastStageChangeAt || o.updatedAt || o.createdAt,
    }));
    return { pipeline: pl.name, locationId: loc, stages: (pl.stages || []).map(s => ({ id: s.id, name: s.name })), leads };
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
      empresa: c.companyName || '',
      campos,
    };
  }

  // Escribe el resultado de una llamada de vuelta a GHL (nota + campos + etapa + valor + tag)
  if (action === 'syncCall') {
    const { contactId, opportunityId, desenlace, companyName, email, nota, intentos, valor, tag, etapaActual } = body;
    const resultado = { nota: false, contacto: false, etapa: null, valor: false };
    resultado.contacto = await updateContact(contactId, { companyName, email });
    if (nota) { await addNote(contactId, nota); resultado.nota = true; }
    if (tag) { try { await addTag(contactId, tag); } catch { /* ignora */ } }

    // Etapa + status + valor de la oportunidad, en un solo PUT
    let stageKw = null, status = null;
    if (Number(intentos) >= 7 && desenlace === 'no_contesto') stageKw = 'ENFRIADO';
    else if (desenlace === 'agendado') stageKw = 'AGENDADA';
    else if (desenlace === 'reagendado') stageKw = 'RE AGENDAR';
    else if (desenlace === 'descalificado') { stageKw = 'DESCUALIFICADO'; status = 'abandoned'; }

    if (opportunityId) {
      const pl = await getPipeline();
      const patch = { pipelineId: pl.id };
      let target = etapaActual || null;
      if (stageKw) { const sid = await stageId(stageKw); if (sid) { target = sid; resultado.etapa = stageKw; } }
      if (target) patch.pipelineStageId = target;
      if (status) patch.status = status;
      if (valor != null && valor !== '') { patch.monetaryValue = Number(valor) || 0; resultado.valor = true; }
      if (patch.pipelineStageId || patch.status || patch.monetaryValue != null) {
        await ghl(`/opportunities/${opportunityId}`, { method: 'PUT', body: JSON.stringify(patch) });
      }
    }
    return { ok: true, ...resultado };
  }

  throw new Error(`Accion GHL desconocida: ${action}`);
}
