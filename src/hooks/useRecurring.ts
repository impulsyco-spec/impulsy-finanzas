import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { MESES_ES } from '../types';

export interface RecurringExpense {
  id: string;
  nombre: string;
  valor: number;
  categoria: string;
  activo: boolean;
  duracionMeses: number; // número exacto de cuotas (0 = 6 por defecto)
  fechaInicio: string;   // YYYY-MM-DD — primer pago; el día se reutiliza cada mes
}

const KEY = 'impulsy_recurring_v3';

// Crea los movimientos en Supabase para un gasto recurrente dado
async function createMovements(id: string, item: Omit<RecurringExpense, 'id'>) {
  const base = new Date(item.fechaInicio + 'T12:00:00');
  const dia  = base.getDate(); // día del mes extraído de fechaInicio
  const n    = item.duracionMeses > 0 ? item.duracionMeses : 6;

  for (let i = 0; i < n; i++) {
    const d     = new Date(base.getFullYear(), base.getMonth() + i, dia);
    const fecha = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const { error } = await supabase.from('ledger_movements').insert({
      fecha,
      tipo_movimiento: 'egreso_operativo',
      naturaleza:      'egreso',
      descripcion:     item.nombre,
      valor:           item.valor,
      categoria:       item.categoria,
      estado:          'esperado',
      notas:           `recurring:${id}`,
      mes:             MESES_ES[d.getMonth()],
      personal_flag:   false,
    });
    if (error) console.error('useRecurring createMovements:', error.message);
  }
}

// Borra todos los movimientos esperados de un gasto recurrente
async function deleteMovements(id: string) {
  const { error } = await supabase
    .from('ledger_movements')
    .delete()
    .eq('estado', 'esperado')
    .like('notas', `recurring:${id}%`);
  if (error) console.error('useRecurring deleteMovements:', error.message);
}

export function useRecurring() {
  const [items, setItems] = useState<RecurringExpense[]>(() => {
    try {
      // Migrar datos de versiones anteriores (v1, v2) → v3
      const raw = localStorage.getItem(KEY)
        ?? localStorage.getItem('impulsy_recurring_v2')
        ?? localStorage.getItem('impulsy_recurring_v1');
      if (!raw) return [];
      return JSON.parse(raw).map((i: any) => ({
        id:            i.id,
        nombre:        i.nombre,
        valor:         i.valor,
        categoria:     i.categoria ?? 'Infraestructura',
        activo:        i.activo ?? true,
        duracionMeses: i.duracionMeses ?? 0,
        // fechaInicio: si no existe en el item antiguo, queda vacío (se manejará como legacy)
        fechaInicio:   i.fechaInicio ?? '',
      }));
    } catch { return []; }
  });

  // Al montar: eliminar movimientos huérfanos (gastos borrados que dejaron esperados)
  useEffect(() => {
    const cleanup = async () => {
      try {
        const stored  = localStorage.getItem(KEY);
        const validIds = new Set<string>(
          stored ? JSON.parse(stored).map((i: RecurringExpense) => i.id) : []
        );
        const { data } = await supabase
          .from('ledger_movements')
          .select('id, notas')
          .eq('estado', 'esperado')
          .like('notas', 'recurring:%');

        if (!data?.length) return;
        const orphans = data
          .filter(m => !validIds.has(m.notas?.replace('recurring:', '') ?? ''))
          .map(m => m.id);
        if (orphans.length > 0) {
          await supabase.from('ledger_movements').delete().in('id', orphans);
          console.log(`useRecurring: ${orphans.length} huérfanos eliminados`);
        }
      } catch (e) { console.error('useRecurring cleanup:', e); }
    };
    cleanup();
  }, []);

  const persist = (next: RecurringExpense[]) => {
    setItems(next);
    localStorage.setItem(KEY, JSON.stringify(next));
  };

  // ── Agregar ────────────────────────────────────────────────
  const add = async (item: Omit<RecurringExpense, 'id'>) => {
    const id = crypto.randomUUID();
    persist([...items, { ...item, id }]);
    await createMovements(id, item);
  };

  // ── Eliminar ───────────────────────────────────────────────
  const remove = async (id: string) => {
    persist(items.filter(i => i.id !== id));
    await deleteMovements(id);
  };

  // ── Actualizar solo el flag activo (sin tocar Supabase) ────
  const update = (id: string, changes: Partial<RecurringExpense>) =>
    persist(items.map(i => i.id === id ? { ...i, ...changes } : i));

  // ── Editar con sincronización completa ────────────────────
  const updateAndSync = async (id: string, changes: Partial<RecurringExpense>) => {
    const current = items.find(i => i.id === id);
    if (!current) return;
    const updated = { ...current, ...changes };
    persist(items.map(i => i.id === id ? updated : i));

    const rebuilds = changes.fechaInicio !== undefined || changes.duracionMeses !== undefined;

    if (rebuilds && updated.fechaInicio) {
      // Borrar todos los esperados y recrear con los nuevos parámetros
      await deleteMovements(id);
      await createMovements(id, updated);
    } else {
      // Solo parchear campos simples en los movimientos existentes
      const patch: Record<string, unknown> = {};
      if (changes.nombre    !== undefined) patch.descripcion = changes.nombre;
      if (changes.valor     !== undefined) patch.valor       = changes.valor;
      if (changes.categoria !== undefined) patch.categoria   = changes.categoria;
      if (Object.keys(patch).length > 0) {
        const { error } = await supabase
          .from('ledger_movements')
          .update(patch)
          .eq('estado', 'esperado')
          .like('notas', `recurring:${id}%`);
        if (error) console.error('useRecurring updateAndSync patch:', error.message);
      }
    }
  };

  const totalMensual = items.filter(i => i.activo).reduce((s, i) => s + i.valor, 0);

  return { items, add, remove, update, updateAndSync, totalMensual };
}
