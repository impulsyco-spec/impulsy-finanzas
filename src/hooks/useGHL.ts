import { useState, useCallback } from 'react';

export interface GhlLead {
  id: string;
  contactId: string;
  nombre: string;
  telefono: string;
  etapaId: string;
  etapa: string;
  actualizado?: string;
}

export interface GhlContacto {
  nombre: string;
  telefono: string;
  email: string;
  campos: Record<string, string>;
}

export function useGHL() {
  const [leads, setLeads] = useState<GhlLead[]>([]);
  const [stages, setStages] = useState<{ id: string; name: string }[]>([]);
  const [pipeline, setPipeline] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cargado, setCargado] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true); setError(null);
    try {
      const r = await fetch('/api/ghl?action=leads');
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'No se pudo conectar con GHL');
      setLeads(d.leads || []); setStages(d.stages || []); setPipeline(d.pipeline || '');
      setCargado(true);
    } catch (e: any) { setError(e.message); } finally { setCargando(false); }
  }, []);

  const traerContacto = useCallback(async (id: string): Promise<GhlContacto> => {
    const r = await fetch(`/api/ghl?action=contact&id=${encodeURIComponent(id)}`);
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || 'No se pudo traer el contacto');
    return d as GhlContacto;
  }, []);

  // Escribe de vuelta a GHL: nota + empresa/email + mover etapa
  const sincronizar = useCallback(async (payload: {
    contactId?: string; opportunityId?: string; desenlace: string;
    companyName?: string; email?: string; nota?: string; intentos?: number;
  }) => {
    const r = await fetch('/api/ghl?action=syncCall', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || 'No se pudo sincronizar con GHL');
    return d as { ok: boolean; nota: boolean; contacto: boolean; etapa: string | null };
  }, []);

  return { leads, stages, pipeline, cargando, error, cargado, cargar, traerContacto, sincronizar };
}
