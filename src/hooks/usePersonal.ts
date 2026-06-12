import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { fechaISO } from '../lib/dates';
import { LedgerMovement } from '../types';
import { esSalarioFundador } from '../lib/founderRules';

// ── Configuración del modo Personal ─────────────────────────────
export const PERSONAL_CONFIG = {
  cuenta: 'Bancolombia',
  metaAhorroPct: 0.10,        // 10% del ingreso del mes como meta inicial
  mesesFondoEmergencia: 3,    // fondo de emergencia = 3 meses de gasto promedio
};

export const CATS_PERSONAL_EGRESO = [
  'Hogar','Mercado','Salud','Transporte','Ocio','Comida fuera',
  'Ropa','Educación','Regalos','Suscripciones','Deudas','Ahorro','Otro',
];
export const CATS_PERSONAL_INGRESO = ['Salario Impulsy','Bonificación','Otro ingreso'];

export interface PersonalMovement {
  id: string;
  fecha: string;
  naturaleza: 'ingreso' | 'egreso';
  descripcion: string;
  valor: number;
  categoria?: string;
  estado: 'confirmado' | 'esperado';
  notas?: string;
  fuente: string;
}

export interface PersonalRecurring {
  id: string;
  nombre: string;
  valor: number;
  categoria?: string;
  activo: boolean;
  duracionMeses: number;
  fechaInicio: string;
}

export interface PersonalPocket {
  id: string;
  nombre: string;
  emoji: string;
  metaValor: number;
  fechaObjetivo?: string;
  esFondo: boolean;
  orden: number;
  activo: boolean;
  saldo: number; // calculado: suma de sus aportes − retiros
}

export interface PersonalDebt {
  id: string;
  acreedor: string;
  tipo: 'tarjeta' | 'prestamo' | 'credito' | 'otro';
  montoOriginal: number;
  saldoActual: number;
  cuotaMinima: number;
  tasaMensual?: number;
  fechaProximoPago?: string;
  activa: boolean;
  notas?: string;
}

export interface PersonalBudget {
  id: string;
  categoria: string;
  topeMensual: number;
  activo: boolean;
}

// Proyecta los meses de un recurrente personal que aún no existan (idempotente)
async function crearProyeccionesPersonales(id: string, item: Omit<PersonalRecurring, 'id'>) {
  const base = new Date(item.fechaInicio + 'T12:00:00');
  const dia  = base.getDate();
  const n    = item.duracionMeses > 0 ? item.duracionMeses : 6;

  const { data: existentes } = await supabase
    .from('personal_movements').select('fecha').eq('fuente', `recurring:${id}`);
  const ocupados = new Set((existentes || []).map(r => (r.fecha as string).slice(0, 7)));

  const rows = [];
  for (let i = 0; i < n; i++) {
    const ultimo = new Date(base.getFullYear(), base.getMonth() + i + 1, 0).getDate();
    const d = new Date(base.getFullYear(), base.getMonth() + i, Math.min(dia, ultimo));
    const fecha = fechaISO(d);
    if (ocupados.has(fecha.slice(0, 7))) continue;
    ocupados.add(fecha.slice(0, 7));
    rows.push({
      fecha, naturaleza: 'egreso', descripcion: item.nombre, valor: item.valor,
      categoria: item.categoria, estado: 'esperado', fuente: `recurring:${id}`,
    });
  }
  if (rows.length === 0) return;
  const { error } = await supabase.from('personal_movements').insert(rows);
  if (error) console.error('crearProyeccionesPersonales:', error.message);
}

export function usePersonal() {
  const [movements, setMovements] = useState<PersonalMovement[]>([]);
  const [recurring, setRecurring] = useState<PersonalRecurring[]>([]);
  const [pockets, setPockets]     = useState<PersonalPocket[]>([]);
  const [debts, setDebts]         = useState<PersonalDebt[]>([]);
  const [budgets, setBudgets]     = useState<PersonalBudget[]>([]);
  const [loading, setLoading]     = useState(true);
  // setupError: faltan las tablas base (SQL parte 1)
  const [setupError, setSetupError] = useState(false);
  // setup2Error: faltan bolsillos/deudas/presupuestos (SQL parte 2)
  const [setup2Error, setSetup2Error] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [movRes, recRes, pockRes, pmovRes, debtRes, budRes] = await Promise.all([
      supabase.from('personal_movements').select('*').order('fecha', { ascending: false }),
      supabase.from('personal_recurring').select('*').order('created_at'),
      supabase.from('personal_pockets').select('*').order('orden'),
      supabase.from('personal_pocket_moves').select('*'),
      supabase.from('personal_debts').select('*').order('created_at'),
      supabase.from('personal_budgets').select('*').order('categoria'),
    ]);
    if (movRes.error || recRes.error) {
      // 42P01 = la tabla no existe todavía
      setSetupError(true);
      setLoading(false);
      return;
    }
    setSetupError(false);
    setSetup2Error(Boolean(pockRes.error || pmovRes.error || debtRes.error || budRes.error));

    setMovements((movRes.data || []).map(m => ({
      id: m.id, fecha: m.fecha, naturaleza: m.naturaleza, descripcion: m.descripcion,
      valor: Number(m.valor), categoria: m.categoria || undefined, estado: m.estado,
      notas: m.notas || undefined, fuente: m.fuente,
    })));
    setRecurring((recRes.data || []).map(r => ({
      id: r.id, nombre: r.nombre, valor: Number(r.valor), categoria: r.categoria || undefined,
      activo: r.activo, duracionMeses: r.duracion_meses, fechaInicio: r.fecha_inicio,
    })));

    // saldo de cada bolsillo = suma de sus movimientos (aportes − retiros)
    const saldoPorPocket: Record<string, number> = {};
    (pmovRes.data || []).forEach((pm: any) => {
      saldoPorPocket[pm.pocket_id] = (saldoPorPocket[pm.pocket_id] || 0) + Number(pm.valor);
    });
    setPockets((pockRes.data || []).map((p: any) => ({
      id: p.id, nombre: p.nombre, emoji: p.emoji || '🎯', metaValor: Number(p.meta_valor),
      fechaObjetivo: p.fecha_objetivo || undefined, esFondo: p.es_fondo, orden: p.orden,
      activo: p.activo, saldo: saldoPorPocket[p.id] || 0,
    })));
    setDebts((debtRes.data || []).map((d: any) => ({
      id: d.id, acreedor: d.acreedor, tipo: d.tipo, montoOriginal: Number(d.monto_original),
      saldoActual: Number(d.saldo_actual), cuotaMinima: Number(d.cuota_minima),
      tasaMensual: d.tasa_mensual != null ? Number(d.tasa_mensual) : undefined,
      fechaProximoPago: d.fecha_proximo_pago || undefined, activa: d.activa, notas: d.notas || undefined,
    })));
    setBudgets((budRes.data || []).map((b: any) => ({
      id: b.id, categoria: b.categoria, topeMensual: Number(b.tope_mensual), activo: b.activo,
    })));
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── Puente: cada salario del fundador pagado en Impulsy aparece como
  // ingreso en Bancolombia. Idempotente por índice único sobre `fuente`.
  const sincronizarSalarios = useCallback(async (ledgerMovements: LedgerMovement[]) => {
    const salarios = ledgerMovements.filter(m => esSalarioFundador(m) && m.estado === 'confirmado');
    if (salarios.length === 0) return false;
    const { data: existentes, error } = await supabase
      .from('personal_movements').select('fuente').like('fuente', 'salario:%');
    if (error) return false;
    const ya = new Set((existentes || []).map(e => e.fuente));
    const nuevos = salarios
      .filter(m => !ya.has(`salario:${m.id}`))
      .map(m => ({
        fecha: m.fecha,
        naturaleza: 'ingreso',
        descripcion: m.descripcion || 'Salario Impulsy',
        valor: m.valor,
        categoria: 'Salario Impulsy',
        estado: 'confirmado',
        fuente: `salario:${m.id}`,
      }));
    if (nuevos.length === 0) return false;
    // upsert ignorando duplicados por si dos pestañas sincronizan a la vez
    await supabase.from('personal_movements').upsert(nuevos, { onConflict: 'fuente', ignoreDuplicates: true });
    await fetchAll();
    return true;
  }, [fetchAll]);

  const addMovement = async (m: Omit<PersonalMovement, 'id' | 'fuente'>) => {
    const { error } = await supabase.from('personal_movements').insert({ ...m, fuente: 'manual' });
    if (error) throw error;
    await fetchAll();
  };

  const updateMovement = async (id: string, cambios: Partial<PersonalMovement>) => {
    const { error } = await supabase.from('personal_movements')
      .update({ ...cambios, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) throw error;
    await fetchAll();
  };

  const removeMovement = async (id: string) => {
    const { error } = await supabase.from('personal_movements').delete().eq('id', id);
    if (error) throw error;
    await fetchAll();
  };

  const addRecurring = async (item: Omit<PersonalRecurring, 'id'>) => {
    const { data, error } = await supabase.from('personal_recurring').insert({
      nombre: item.nombre, valor: item.valor, categoria: item.categoria,
      activo: item.activo, duracion_meses: item.duracionMeses, fecha_inicio: item.fechaInicio,
    }).select().single();
    if (error) throw error;
    await crearProyeccionesPersonales(data.id, item);
    await fetchAll();
  };

  const toggleRecurring = async (id: string, activo: boolean) => {
    await supabase.from('personal_recurring').update({ activo, updated_at: new Date().toISOString() }).eq('id', id);
    await fetchAll();
  };

  const removeRecurring = async (id: string) => {
    await supabase.from('personal_recurring').delete().eq('id', id);
    // sus proyecciones no pagadas se van con él
    await supabase.from('personal_movements').delete().eq('fuente', `recurring:${id}`).eq('estado', 'esperado');
    await fetchAll();
  };

  // ── Bolsillos y metas ───────────────────────────────────────
  const addPocket = async (p: { nombre: string; emoji: string; metaValor: number; fechaObjetivo?: string; esFondo?: boolean }) => {
    const { error } = await supabase.from('personal_pockets').insert({
      nombre: p.nombre, emoji: p.emoji, meta_valor: p.metaValor,
      fecha_objetivo: p.fechaObjetivo || null, es_fondo: p.esFondo || false,
      orden: pockets.length,
    });
    if (error) throw error;
    await fetchAll();
  };

  const updatePocket = async (id: string, c: Partial<{ nombre: string; emoji: string; metaValor: number; fechaObjetivo?: string; activo: boolean }>) => {
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (c.nombre !== undefined) patch.nombre = c.nombre;
    if (c.emoji !== undefined) patch.emoji = c.emoji;
    if (c.metaValor !== undefined) patch.meta_valor = c.metaValor;
    if (c.fechaObjetivo !== undefined) patch.fecha_objetivo = c.fechaObjetivo || null;
    if (c.activo !== undefined) patch.activo = c.activo;
    const { error } = await supabase.from('personal_pockets').update(patch).eq('id', id);
    if (error) throw error;
    await fetchAll();
  };

  const removePocket = async (id: string) => {
    const { error } = await supabase.from('personal_pockets').delete().eq('id', id);
    if (error) throw error;
    await fetchAll();
  };

  // Aporte (valor positivo) o retiro (valor negativo) de un bolsillo
  const moverPocket = async (pocketId: string, valor: number, fecha: string, nota?: string) => {
    const { error } = await supabase.from('personal_pocket_moves').insert({
      pocket_id: pocketId, valor, fecha, nota: nota || null,
    });
    if (error) throw error;
    await fetchAll();
  };

  // ── Deudas personales ───────────────────────────────────────
  const addDebt = async (d: Omit<PersonalDebt, 'id' | 'activa'>) => {
    const { error } = await supabase.from('personal_debts').insert({
      acreedor: d.acreedor, tipo: d.tipo, monto_original: d.montoOriginal,
      saldo_actual: d.saldoActual, cuota_minima: d.cuotaMinima,
      tasa_mensual: d.tasaMensual ?? null, fecha_proximo_pago: d.fechaProximoPago || null,
      notas: d.notas || null,
    });
    if (error) throw error;
    await fetchAll();
  };

  const updateDebt = async (id: string, c: Partial<PersonalDebt>) => {
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (c.acreedor !== undefined) patch.acreedor = c.acreedor;
    if (c.saldoActual !== undefined) patch.saldo_actual = c.saldoActual;
    if (c.cuotaMinima !== undefined) patch.cuota_minima = c.cuotaMinima;
    if (c.fechaProximoPago !== undefined) patch.fecha_proximo_pago = c.fechaProximoPago || null;
    if (c.activa !== undefined) patch.activa = c.activa;
    const { error } = await supabase.from('personal_debts').update(patch).eq('id', id);
    if (error) throw error;
    await fetchAll();
  };

  const removeDebt = async (id: string) => {
    const { error } = await supabase.from('personal_debts').delete().eq('id', id);
    if (error) throw error;
    await fetchAll();
  };

  // Pagar cuota: registra el gasto en movimientos (todo conectado) y baja el saldo de la deuda
  const pagarDeuda = async (debt: PersonalDebt, valor: number, fecha: string) => {
    const { error } = await supabase.from('personal_movements').insert({
      fecha, naturaleza: 'egreso', descripcion: `Pago ${debt.acreedor}`,
      valor, categoria: 'Deudas', estado: 'confirmado', fuente: 'manual',
    });
    if (error) throw error;
    await supabase.from('personal_debts').update({
      saldo_actual: Math.max(0, debt.saldoActual - valor),
      updated_at: new Date().toISOString(),
    }).eq('id', debt.id);
    await fetchAll();
  };

  // ── Presupuestos por categoría ──────────────────────────────
  const setBudget = async (categoria: string, topeMensual: number) => {
    const existente = budgets.find(b => b.categoria === categoria);
    const { error } = existente
      ? await supabase.from('personal_budgets').update({ tope_mensual: topeMensual, activo: true, updated_at: new Date().toISOString() }).eq('id', existente.id)
      : await supabase.from('personal_budgets').insert({ categoria, tope_mensual: topeMensual });
    if (error) throw error;
    await fetchAll();
  };

  const removeBudget = async (id: string) => {
    const { error } = await supabase.from('personal_budgets').delete().eq('id', id);
    if (error) throw error;
    await fetchAll();
  };

  return {
    movements, recurring, pockets, debts, budgets,
    loading, setupError, setup2Error,
    refetch: fetchAll, sincronizarSalarios,
    addMovement, updateMovement, removeMovement,
    addRecurring, toggleRecurring, removeRecurring,
    addPocket, updatePocket, removePocket, moverPocket,
    addDebt, updateDebt, removeDebt, pagarDeuda,
    setBudget, removeBudget,
  };
}
