import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { MESES_ES } from '../types';

export interface RecurringExpense {
  id: string;
  nombre: string;
  valor: number;
  categoria: string;
  diaCobro: number;
  activo: boolean;
  duracionMeses: number; // 0 = indefinido (se crean 6 meses por defecto), N = plazo exacto
  fechaInicio?: string;  // YYYY-MM-DD — mes desde donde se crean los movimientos
}

const KEY = 'impulsy_recurring_v2';

export function useRecurring() {
  const [items, setItems] = useState<RecurringExpense[]>(() => {
    try {
      // Migrar desde v1 si existe
      const v1 = localStorage.getItem('impulsy_recurring_v1');
      const v2 = localStorage.getItem(KEY);
      if (v2) return JSON.parse(v2);
      if (v1) {
        const migrated = JSON.parse(v1).map((i: any) => ({ ...i, duracionMeses: 0 }));
        localStorage.setItem(KEY, JSON.stringify(migrated));
        return migrated;
      }
      return [];
    } catch { return []; }
  });

  const persist = (next: RecurringExpense[]) => {
    setItems(next);
    localStorage.setItem(KEY, JSON.stringify(next));
  };

  const add = async (item: Omit<RecurringExpense, 'id'>) => {
    const id = crypto.randomUUID();
    persist([...items, { ...item, id }]);

    // Usar fechaInicio si se especificó, si no, el mes actual
    const base = item.fechaInicio
      ? new Date(item.fechaInicio + 'T12:00:00')
      : new Date();
    const mesesACrear = item.duracionMeses > 0 ? item.duracionMeses : 6;

    for (let i = 0; i < mesesACrear; i++) {
      const d = new Date(base.getFullYear(), base.getMonth() + i, item.diaCobro);
      const fecha = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      try {
        await supabase.from('ledger_movements').insert({
          fecha,
          tipo_movimiento: 'egreso_operativo',
          naturaleza: 'egreso',
          descripcion: item.nombre,
          valor: item.valor,
          categoria: item.categoria,
          estado: 'esperado',
          notas: `recurring:${id}`,
          mes: MESES_ES[d.getMonth()],
          personal_flag: false,
        });
      } catch { /* silencio si falla un mes */ }
    }
  };

  const remove = async (id: string) => {
    persist(items.filter(i => i.id !== id));
    // Eliminar solo los movimientos NO pagados (esperado) de este recurrente
    try {
      await supabase
        .from('ledger_movements')
        .delete()
        .eq('estado', 'esperado')
        .like('notas', `recurring:${id}%`);
    } catch { /* tabla puede no existir */ }
  };

  const update = (id: string, changes: Partial<RecurringExpense>) =>
    persist(items.map(i => i.id === id ? { ...i, ...changes } : i));

  // Edita y sincroniza los movimientos pendientes en Supabase
  const updateAndSync = async (id: string, changes: Partial<RecurringExpense>) => {
    persist(items.map(i => i.id === id ? { ...i, ...changes } : i));
    const patch: Record<string, unknown> = {};
    if (changes.nombre    !== undefined) patch.descripcion = changes.nombre;
    if (changes.valor     !== undefined) patch.valor       = changes.valor;
    if (changes.categoria !== undefined) patch.categoria   = changes.categoria;
    if (Object.keys(patch).length > 0) {
      try {
        await supabase
          .from('ledger_movements')
          .update(patch)
          .eq('estado', 'esperado')
          .like('notas', `recurring:${id}%`);
      } catch { /* silencio */ }
    }
  };

  const totalMensual = items.filter(i => i.activo).reduce((s, i) => s + i.valor, 0);

  return { items, add, remove, update, updateAndSync, totalMensual };
}
