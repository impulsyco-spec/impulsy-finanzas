import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { fechaISO } from '../lib/dates';
import { LedgerMovement } from '../types';
import { esSalarioFundador } from '../lib/founderRules';

// ── Configuración del modo Personal ─────────────────────────────
// Calibrada con Agustín (16 jun 2026): priorizar inversión/deuda, ocio medido.
export const PERSONAL_CONFIG = {
  cuenta: 'Bancolombia',
  invPct: 0.15,               // (legado) 15% del ingreso — reemplazado por la cascada inteligente
  metaAhorroPct: 0.15,        // meta de ahorro del mes
  ocioMensual: 650_000,       // presupuesto de ocio/fiesta del mes (referencia)
  mesesFondoEmergencia: 3,    // fondo de emergencia = 3 meses de gasto promedio
  bolsilloLibertad: 'Libertad', // nombre del bolsillo que mata deuda
  // ── Cascada inteligente de distribución (calibrada con Agustín, 16 jun 2026) ──
  supervivenciaQuincena: 400_000, // mínimo intocable para comer/moverse por quincena
  pctLibertadExcedente: 0.50,     // del excedente: 50% acelera deuda (Libertad), 50% fiesta
  fraccionCuotaDeudaPorQuincena: 0.5, // cada quincena reserva la mitad de las cuotas del mes
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

export interface PersonalPocketMove {
  id: string;
  pocketId: string;
  valor: number;   // positivo = aporte, negativo = retiro
  fecha: string;
  nota?: string;
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

// Proyecta las cuotas FALTANTES de una deuda como movimientos 'esperado' (categoría
// Deudas), un mes por cuota desde su próximo pago. Idempotente: borra las esperadas
// previas y regenera SIEMPRE desde el saldo actual → si abonas de más, las cuotas
// futuras se reducen/recortan solas. No toca las ya pagadas (confirmadas).
const HORIZONTE_CUOTAS = 18; // hasta 18 meses adelante (suficiente para ver y planear)
async function reproyectarCuotasDeuda(debt: PersonalDebt) {
  await supabase.from('personal_movements').delete()
    .like('fuente', `deuda:${debt.id}:%`).eq('estado', 'esperado');
  if (!debt.activa || debt.saldoActual <= 0 || debt.cuotaMinima <= 0 || !debt.fechaProximoPago) return;

  const { data: pagadas } = await supabase.from('personal_movements')
    .select('fuente').like('fuente', `deuda:${debt.id}:%`).eq('estado', 'confirmado');
  const mesesPagados = new Set((pagadas || []).map((p: any) => p.fuente as string));

  const base = new Date(debt.fechaProximoPago + 'T12:00:00');
  const dia = base.getDate();
  let saldo = debt.saldoActual;
  const rows: Record<string, unknown>[] = [];
  for (let i = 0; i < HORIZONTE_CUOTAS && saldo > 0; i++) {
    const ultimo = new Date(base.getFullYear(), base.getMonth() + i + 1, 0).getDate();
    const d = new Date(base.getFullYear(), base.getMonth() + i, Math.min(dia, ultimo));
    const fecha = fechaISO(d);
    const fuente = `deuda:${debt.id}:${fecha.slice(0, 7)}`;
    const valor = Math.min(debt.cuotaMinima, saldo);
    if (!mesesPagados.has(fuente)) {
      rows.push({ fecha, naturaleza: 'egreso', descripcion: `Cuota ${debt.acreedor}`, valor, categoria: 'Deudas', estado: 'esperado', fuente });
    }
    saldo -= valor;
  }
  if (rows.length) {
    const { error } = await supabase.from('personal_movements').insert(rows);
    if (error) console.error('reproyectarCuotasDeuda:', error.message);
  }
}

export function usePersonal() {
  const [movements, setMovements] = useState<PersonalMovement[]>([]);
  const [recurring, setRecurring] = useState<PersonalRecurring[]>([]);
  const [pockets, setPockets]     = useState<PersonalPocket[]>([]);
  const [pocketMoves, setPocketMoves] = useState<PersonalPocketMove[]>([]);
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
    setPocketMoves((pmovRes.data || []).map((pm: any) => ({
      id: pm.id, pocketId: pm.pocket_id, valor: Number(pm.valor), fecha: pm.fecha, nota: pm.nota || undefined,
    })));
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

  // ── Puente bidireccional del salario ────────────────────────────
  // Cada salario del fundador CONFIRMADO en Impulsy aparece como ingreso en
  // Bancolombia. Reconcilia en ambos sentidos: crea los espejos que faltan y
  // BORRA los huérfanos (salarios que se borraron o se volvieron 'esperado' en
  // la empresa). Así el mundo Personal es siempre un reflejo fiel del ledger.
  const sincronizarSalarios = useCallback(async (ledgerMovements: LedgerMovement[]) => {
    // Salvaguarda: si el ledger viene vacío (probable error de carga), NO reconciliar
    // para no borrar espejos válidos por accidente.
    if (ledgerMovements.length === 0) return false;
    const salarios = ledgerMovements.filter(m => esSalarioFundador(m) && m.estado === 'confirmado');
    const fuentesValidas = new Set(salarios.map(m => `salario:${m.id}`));

    const { data: espejosData, error } = await supabase
      .from('personal_movements').select('id,fuente').like('fuente', 'salario:%');
    if (error) return false;
    const espejos = espejosData || [];
    const yaEspejadas = new Set(espejos.map(e => e.fuente));

    // 1) Crear los espejos que faltan
    const nuevos = salarios
      .filter(m => !yaEspejadas.has(`salario:${m.id}`))
      .map(m => ({
        fecha: m.fecha,
        naturaleza: 'ingreso',
        descripcion: m.descripcion || 'Salario Impulsy',
        valor: m.valor,
        categoria: 'Salario Impulsy',
        estado: 'confirmado',
        fuente: `salario:${m.id}`,
      }));

    // 2) Borrar huérfanos: espejos cuyo salario ya no existe (o se desconfirmó)
    const huerfanos = espejos.filter(e => !fuentesValidas.has(e.fuente)).map(e => e.id);

    let cambios = false;
    if (nuevos.length > 0) {
      const { error: insErr } = await supabase.from('personal_movements').insert(nuevos);
      if (!insErr) cambios = true;
    }
    if (huerfanos.length > 0) {
      const { error: delErr } = await supabase.from('personal_movements').delete().in('id', huerfanos);
      if (!delErr) cambios = true;
    }
    if (cambios) await fetchAll();
    return cambios;
  }, [fetchAll]);

  // Registra un movimiento. Si se indica `bolsilloId`, además mueve ese bolsillo:
  // gasto → resta; ingreso → suma. Así cada peso entra/sale de su sobre.
  const addMovement = async (
    mIn: Omit<PersonalMovement, 'id' | 'fuente'> & { bolsilloId?: string },
    bolsilloIdArg?: string,
  ) => {
    const { bolsilloId: bidInline, ...m } = mIn;
    const bid = bolsilloIdArg ?? bidInline;
    const { error } = await supabase.from('personal_movements').insert({ ...m, fuente: 'manual' });
    if (error) throw error;
    if (bid) {
      const signo = m.naturaleza === 'ingreso' ? 1 : -1;
      const { error: pErr } = await supabase.from('personal_pocket_moves').insert({
        pocket_id: bid, valor: signo * m.valor, fecha: m.fecha,
        nota: `${m.naturaleza === 'ingreso' ? 'Ingreso' : 'Gasto'}: ${m.descripcion}`,
      });
      if (pErr) console.error('movimiento→bolsillo:', pErr.message);
    }
    await fetchAll();
  };

  const updateMovement = async (id: string, cambiosIn: Partial<PersonalMovement> & { bolsilloId?: string }) => {
    const { bolsilloId: _omit, ...cambios } = cambiosIn; // bolsilloId no es columna
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
    const { data, error } = await supabase.from('personal_debts').insert({
      acreedor: d.acreedor, tipo: d.tipo, monto_original: d.montoOriginal,
      saldo_actual: d.saldoActual, cuota_minima: d.cuotaMinima,
      tasa_mensual: d.tasaMensual ?? null, fecha_proximo_pago: d.fechaProximoPago || null,
      notas: d.notas || null,
    }).select().single();
    if (error) throw error;
    if (data) await reproyectarCuotasDeuda({ ...d, id: data.id, activa: true });
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
    // Reproyecta las cuotas con el estado fresco de la deuda
    const { data } = await supabase.from('personal_debts').select('*').eq('id', id).single();
    if (data) await reproyectarCuotasDeuda({
      id: data.id, acreedor: data.acreedor, tipo: data.tipo,
      montoOriginal: Number(data.monto_original), saldoActual: Number(data.saldo_actual),
      cuotaMinima: Number(data.cuota_minima),
      tasaMensual: data.tasa_mensual != null ? Number(data.tasa_mensual) : undefined,
      fechaProximoPago: data.fecha_proximo_pago || undefined, activa: data.activa, notas: data.notas || undefined,
    });
    await fetchAll();
  };

  const removeDebt = async (id: string) => {
    const { error } = await supabase.from('personal_debts').delete().eq('id', id);
    if (error) throw error;
    await fetchAll();
  };

  // Pagar (cuota o abono extra): registra el gasto, baja el saldo y REPROYECTA las
  // cuotas futuras desde el nuevo saldo. Si abonas de más, las próximas se recortan solas.
  const pagarDeuda = async (debt: PersonalDebt, valor: number, fecha: string) => {
    const { error } = await supabase.from('personal_movements').insert({
      fecha, naturaleza: 'egreso', descripcion: `Pago ${debt.acreedor}`,
      valor, categoria: 'Deudas', estado: 'confirmado', fuente: 'manual',
    });
    if (error) throw error;
    // Método de sobres: el pago SALE del bolsillo "Deudas" (lo que reservaste al
    // distribuir). Así el disponible libre no se descuenta dos veces. Drena hasta
    // lo que haya en el sobre; si pagaste de más, el exceso sale del libre.
    const sobreDeuda = pockets.find(p => p.activo && p.nombre.toLowerCase() === 'deudas');
    if (sobreDeuda) {
      const drena = Math.min(valor, Math.max(0, sobreDeuda.saldo));
      if (drena > 0) await supabase.from('personal_pocket_moves').insert({
        pocket_id: sobreDeuda.id, valor: -drena, fecha, nota: `Pago ${debt.acreedor}`,
      });
    }
    const nuevoSaldo = Math.max(0, debt.saldoActual - valor);
    // Avanza el próximo pago un mes (consumiste la cuota de este ciclo)
    let nuevaFecha = debt.fechaProximoPago;
    if (debt.fechaProximoPago) {
      const f = new Date(debt.fechaProximoPago + 'T12:00:00');
      f.setMonth(f.getMonth() + 1);
      nuevaFecha = fechaISO(f);
    }
    await supabase.from('personal_debts').update({
      saldo_actual: nuevoSaldo, fecha_proximo_pago: nuevaFecha || null,
      updated_at: new Date().toISOString(),
    }).eq('id', debt.id);
    await reproyectarCuotasDeuda({ ...debt, saldoActual: nuevoSaldo, fechaProximoPago: nuevaFecha });
    await fetchAll();
  };

  // Regenera la proyección de TODAS las deudas activas (idempotente). Lee fresco
  // para no depender del estado (que puede estar desfasado tras una mutación).
  const reproyectarDeudas = useCallback(async () => {
    const { data } = await supabase.from('personal_debts').select('*').eq('activa', true);
    for (const d of (data || [])) {
      await reproyectarCuotasDeuda({
        id: d.id, acreedor: d.acreedor, tipo: d.tipo,
        montoOriginal: Number(d.monto_original), saldoActual: Number(d.saldo_actual),
        cuotaMinima: Number(d.cuota_minima),
        tasaMensual: d.tasa_mensual != null ? Number(d.tasa_mensual) : undefined,
        fechaProximoPago: d.fecha_proximo_pago || undefined, activa: d.activa, notas: d.notas || undefined,
      });
    }
    await fetchAll();
  }, [fetchAll]);

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
    movements, recurring, pockets, pocketMoves, debts, budgets,
    loading, setupError, setup2Error,
    refetch: fetchAll, sincronizarSalarios,
    addMovement, updateMovement, removeMovement,
    addRecurring, toggleRecurring, removeRecurring,
    addPocket, updatePocket, removePocket, moverPocket,
    addDebt, updateDebt, removeDebt, pagarDeuda, reproyectarDeudas,
    setBudget, removeBudget,
  };
}
