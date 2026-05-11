import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { TeamMember } from '../types';

export function useTeam() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('team_members')
        .select('*')
        .eq('activo', true)
        .order('nombre');
      if (data) {
        setMembers(data.map(m => ({
          id:            m.id,
          nombre:        m.nombre,
          rol:           m.rol,
          email:         m.email,
          telefono:      m.telefono,
          tarifaMensual: Number(m.tarifa_mensual || 0),
          activo:        Boolean(m.activo),
          notas:         m.notas,
          avatarColor:   m.avatar_color || '#a855f7',
          createdAt:     m.created_at,
        })));
      }
    } catch (e) {
      console.error('useTeam fetch:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  const add = async (data: Omit<TeamMember, 'id' | 'createdAt'>) => {
    const { error } = await supabase.from('team_members').insert({
      nombre:         data.nombre,
      rol:            data.rol,
      email:          data.email || null,
      telefono:       data.telefono || null,
      tarifa_mensual: data.tarifaMensual,
      activo:         data.activo,
      notas:          data.notas || null,
      avatar_color:   data.avatarColor,
    });
    if (error) throw error;
    await fetchAll();
  };

  const update = async (id: string, data: Partial<Omit<TeamMember, 'id' | 'createdAt'>>) => {
    const patch: Record<string, unknown> = {};
    if (data.nombre        !== undefined) patch.nombre         = data.nombre;
    if (data.rol           !== undefined) patch.rol            = data.rol;
    if (data.email         !== undefined) patch.email          = data.email || null;
    if (data.telefono      !== undefined) patch.telefono       = data.telefono || null;
    if (data.tarifaMensual !== undefined) patch.tarifa_mensual = data.tarifaMensual;
    if (data.activo        !== undefined) patch.activo         = data.activo;
    if (data.notas         !== undefined) patch.notas          = data.notas || null;
    if (data.avatarColor   !== undefined) patch.avatar_color   = data.avatarColor;
    patch.updated_at = new Date().toISOString();
    const { error } = await supabase.from('team_members').update(patch).eq('id', id);
    if (error) throw error;
    await fetchAll();
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from('team_members').update({ activo: false }).eq('id', id);
    if (error) throw error;
    await fetchAll();
  };

  return { members, loading, refetch: fetchAll, add, update, remove };
}
