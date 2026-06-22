import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export type Desenlace = 'no_contesto' | 'agendado' | 'reagendado' | 'descalificado' | 'colgo';

export interface Cualificacion {
  nombre?: string;
  negocio?: string;       // nombre del negocio -> companyName en GHL
  aQueSeDedica?: string;  // actividad de la empresa -> nota
  email?: string;         // -> email del contacto en GHL
  ticket?: string;
  volumen?: string;
  objetivo?: string;
  notas?: string;
  // checklist obligatorio
  decisor?: boolean;        // es el decisor / decisores presentes
  emailConfirmado?: boolean;// confirmó el correo para la cita
  pidioAviso?: boolean;     // pidió que avise si no puede asistir
  urgencia?: boolean;       // urgencia alta para resolver
  _contactId?: string;  // enlace al contacto en GHL (para sincronizar)
  _oppId?: string;      // id de la oportunidad (para mover etapa)
  _lead?: string;       // nombre del lead de GHL
  _pais?: string;       // país del prospecto (según el código del teléfono)
}

export interface ProdSesion {
  id: string;
  inicio: string;       // ISO
  fin?: string;         // ISO | undefined (undefined = en curso)
  nota?: string;
}

export interface ProdLlamada {
  id: string;
  sesionId: string;
  inicio: string;       // ISO
  duracionSeg?: number;
  contesto: boolean;
  desenlace: Desenlace;
  cualif?: Cualificacion;
}

export function useProductividad() {
  const [sesiones, setSesiones] = useState<ProdSesion[]>([]);
  const [llamadas, setLlamadas] = useState<ProdLlamada[]>([]);
  const [loading, setLoading] = useState(true);
  const [setupError, setSetupError] = useState(false); // faltan las tablas (correr el SQL)

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [sRes, lRes] = await Promise.all([
      supabase.from('prod_sesiones').select('*').order('inicio', { ascending: false }),
      supabase.from('prod_llamadas').select('*').order('inicio', { ascending: false }),
    ]);
    if (sRes.error || lRes.error) { setSetupError(true); setLoading(false); return; }
    setSetupError(false);
    setSesiones((sRes.data || []).map((s: any) => ({
      id: s.id, inicio: s.inicio, fin: s.fin || undefined, nota: s.nota || undefined,
    })));
    setLlamadas((lRes.data || []).map((l: any) => ({
      id: l.id, sesionId: l.sesion_id, inicio: l.inicio,
      duracionSeg: l.duracion_seg != null ? Number(l.duracion_seg) : undefined,
      contesto: l.contesto, desenlace: l.desenlace, cualif: l.cualif || undefined,
    })));
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const sesionActiva = sesiones.find(s => !s.fin) || null;

  const empezarRonda = async (): Promise<string | undefined> => {
    const { data, error } = await supabase.from('prod_sesiones').insert({}).select('id').single();
    if (error) throw error;
    await fetchAll();
    return data?.id;
  };

  const terminarRonda = async (id: string) => {
    const { error } = await supabase.from('prod_sesiones').update({ fin: new Date().toISOString() }).eq('id', id);
    if (error) throw error;
    await fetchAll();
  };

  const registrarLlamada = async (l: {
    sesionId: string; inicio: string; contesto: boolean; desenlace: Desenlace;
    duracionSeg?: number; cualif?: Cualificacion;
  }) => {
    const { error } = await supabase.from('prod_llamadas').insert({
      sesion_id: l.sesionId, inicio: l.inicio, contesto: l.contesto, desenlace: l.desenlace,
      duracion_seg: l.duracionSeg ?? null, cualif: l.cualif ?? null,
    });
    if (error) throw error;
    await fetchAll();
  };

  const borrarLlamada = async (id: string) => {
    await supabase.from('prod_llamadas').delete().eq('id', id);
    await fetchAll();
  };

  // Borra una ronda completa (sus llamadas se van solas por el ON DELETE CASCADE)
  const borrarSesion = async (id: string) => {
    const { error } = await supabase.from('prod_sesiones').delete().eq('id', id);
    if (error) throw error;
    await fetchAll();
  };

  return {
    sesiones, llamadas, loading, setupError, sesionActiva,
    refetch: fetchAll, empezarRonda, terminarRonda, registrarLlamada, borrarLlamada, borrarSesion,
  };
}
