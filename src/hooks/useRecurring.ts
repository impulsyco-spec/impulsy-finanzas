import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { MESES_ES } from '../types';

export interface RecurringExpense {
  id: string;
  nombre: string;
  valor: number;
  categoria: string;
  activo: boolean;
  duracionMeses: number;
  fechaInicio: string; // YYYY-MM-DD
}

// Crea los movimientos en ledger_movements para un gasto recurrente.
// Idempotente: nunca crea dos proyecciones del mismo recurrente en el mismo
// mes, aunque se invoque dos veces (doble clic, re-render, regeneración).
async function createMovements(id: string, item: Omit<RecurringExpense, 'id'>) {
  const base = new Date(item.fechaInicio + 'T12:00:00');
  const dia  = base.getDate();
  const n    = item.duracionMeses > 0 ? item.duracionMeses : 6;

  const { data: existentes, error: errExist } = await supabase
    .from('ledger_movements')
    .select('fecha')
    .like('notas', `recurring:${id}%`);
  if (errExist) { console.error('useRecurring createMovements (check):', errExist.message); return; }
  const mesesOcupados = new Set((existentes || []).map(r => (r.fecha as string).slice(0, 7)));

  const rows = [];
  for (let i = 0; i < n; i++) {
    // Si el día no existe en el mes (ej. 31 en febrero) se usa el último día
    const ultimoDia = new Date(base.getFullYear(), base.getMonth() + i + 1, 0).getDate();
    const d     = new Date(base.getFullYear(), base.getMonth() + i, Math.min(dia, ultimoDia));
    const fecha = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (mesesOcupados.has(fecha.slice(0, 7))) continue;
    mesesOcupados.add(fecha.slice(0, 7));
    rows.push({
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
  }
  if (rows.length === 0) return;
  const { error } = await supabase.from('ledger_movements').insert(rows);
  if (error) console.error('useRecurring createMovements:', error.message);
}

// Borra movimientos esperados de un gasto recurrente
async function deleteMovements(id: string) {
  const { error } = await supabase
    .from('ledger_movements')
    .delete()
    .eq('estado', 'esperado')
    .like('notas', `recurring:${id}%`);
  if (error) console.error('useRecurring deleteMovements:', error.message);
}

export function useRecurring() {
  const [items, setItems]   = useState<RecurringExpense[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Cargar desde Supabase ──────────────────────────────────
  useEffect(() => {
    const fetchItems = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('recurring_expenses')
        .select('*')
        .order('created_at', { ascending: true });

      if (error) {
        console.error('useRecurring fetch:', error.message);
      } else if (data) {
        setItems(data.map(r => ({
          id:            r.id,
          nombre:        r.nombre,
          valor:         Number(r.valor),
          categoria:     r.categoria,
          activo:        r.activo,
          duracionMeses: r.duracion_meses,
          fechaInicio:   r.fecha_inicio,
        })));
      }
      setLoading(false);
    };
    fetchItems();
  }, []);

  // ── Agregar ────────────────────────────────────────────────
  const add = async (item: Omit<RecurringExpense, 'id'>) => {
    const { data, error } = await supabase
      .from('recurring_expenses')
      .insert({
        nombre:        item.nombre,
        valor:         item.valor,
        categoria:     item.categoria,
        activo:        item.activo,
        duracion_meses: item.duracionMeses,
        fecha_inicio:  item.fechaInicio,
      })
      .select()
      .single();

    if (error) { console.error('useRecurring add:', error.message); return; }

    const newItem: RecurringExpense = {
      id:            data.id,
      nombre:        data.nombre,
      valor:         Number(data.valor),
      categoria:     data.categoria,
      activo:        data.activo,
      duracionMeses: data.duracion_meses,
      fechaInicio:   data.fecha_inicio,
    };
    setItems(prev => [...prev, newItem]);
    await createMovements(data.id, newItem);
  };

  // ── Eliminar ───────────────────────────────────────────────
  const remove = async (id: string) => {
    const { error } = await supabase
      .from('recurring_expenses')
      .delete()
      .eq('id', id);

    if (error) { console.error('useRecurring remove:', error.message); return; }
    setItems(prev => prev.filter(i => i.id !== id));
    await deleteMovements(id);
  };

  // ── Actualizar flag activo ─────────────────────────────────
  const update = async (id: string, changes: Partial<RecurringExpense>) => {
    const { error } = await supabase
      .from('recurring_expenses')
      .update({
        activo:        changes.activo,
        updated_at:    new Date().toISOString(),
      })
      .eq('id', id);

    if (error) { console.error('useRecurring update:', error.message); return; }
    setItems(prev => prev.map(i => i.id === id ? { ...i, ...changes } : i));
  };

  // ── Editar con sincronización completa ─────────────────────
  const updateAndSync = async (id: string, changes: Partial<RecurringExpense>) => {
    const current = items.find(i => i.id === id);
    if (!current) return;
    const updated = { ...current, ...changes };

    const { error } = await supabase
      .from('recurring_expenses')
      .update({
        nombre:         updated.nombre,
        valor:          updated.valor,
        categoria:      updated.categoria,
        activo:         updated.activo,
        duracion_meses: updated.duracionMeses,
        fecha_inicio:   updated.fechaInicio,
        updated_at:     new Date().toISOString(),
      })
      .eq('id', id);

    if (error) { console.error('useRecurring updateAndSync:', error.message); return; }
    setItems(prev => prev.map(i => i.id === id ? updated : i));

    const rebuilds = changes.fechaInicio !== undefined || changes.duracionMeses !== undefined;
    if (rebuilds && updated.fechaInicio) {
      await deleteMovements(id);
      await createMovements(id, updated);
    } else {
      const patch: Record<string, unknown> = {};
      if (changes.nombre    !== undefined) patch.descripcion = changes.nombre;
      if (changes.valor     !== undefined) patch.valor       = changes.valor;
      if (changes.categoria !== undefined) patch.categoria   = changes.categoria;
      if (Object.keys(patch).length > 0) {
        await supabase
          .from('ledger_movements')
          .update(patch)
          .eq('estado', 'esperado')
          .like('notas', `recurring:${id}%`);
      }
    }
  };

  const totalMensual = items.filter(i => i.activo).reduce((s, i) => s + i.valor, 0);

  return { items, loading, add, remove, update, updateAndSync, totalMensual };
}
