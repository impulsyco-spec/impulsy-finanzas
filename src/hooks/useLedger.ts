import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { LedgerMovement, RealAccount, Pocket, Debt } from '../types';

export function useLedger() {
  const [movements, setMovements] = useState<LedgerMovement[]>([]);
  const [realAccounts, setRealAccounts] = useState<RealAccount[]>([]);
  const [pockets, setPockets] = useState<Pocket[]>([]);
  const [debts, setDebts] = useState<Debt[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = async () => {
    setLoading(true);
    const [movRes, accRes, pocketRes, debtRes] = await Promise.all([
      supabase.from('ledger_movements').select('*').order('fecha', { ascending: false }),
      supabase.from('real_accounts').select('*').eq('activa', true),
      supabase.from('pockets').select('*').eq('activo', true).order('orden'),
      supabase.from('debts').select('*').eq('activa', true),
    ]);

    if (movRes.data) {
      setMovements(movRes.data.map(m => ({
        id: m.id,
        fecha: m.fecha,
        tipoMovimiento: m.tipo_movimiento,
        naturaleza: m.naturaleza,
        descripcion: m.descripcion,
        valor: Number(m.valor),
        categoria: m.categoria,
        estado: m.estado,
        cuentaRealId: m.cuenta_real_id,
        pocketId: m.pocket_id,
        projectId: m.project_id,
        clientId: m.client_id,
        paymentId: m.payment_id,
        tercero: m.tercero,
        fechaVencimiento: m.fecha_vencimiento,
        notas: m.notas,
        personalFlag: Boolean(m.personal_flag),
        tipoRetiro: m.tipo_retiro,
        mes: m.mes,
        createdAt: m.created_at,
      })));
    }

    if (accRes.data) {
      setRealAccounts(accRes.data.map(a => ({
        id: a.id,
        nombre: a.nombre,
        tipo: a.tipo,
        saldoInicial: Number(a.saldo_inicial),
        activa: a.activa,
      })));
    }

    if (pocketRes.data) {
      setPockets(pocketRes.data.map(p => ({
        id: p.id,
        nombre: p.nombre,
        porcentajeDefault: p.porcentaje_default != null ? Number(p.porcentaje_default) : undefined,
        orden: p.orden,
        activo: p.activo,
      })));
    }

    if (debtRes.data) {
      setDebts(debtRes.data.map(d => ({
        id: d.id,
        acreedor: d.acreedor,
        tipo: d.tipo,
        montoOriginal: Number(d.monto_original),
        saldoActual: Number(d.saldo_actual),
        cuotaMinima: Number(d.cuota_minima),
        tasaMensual: d.tasa_mensual != null ? Number(d.tasa_mensual) : undefined,
        fechaProximoPago: d.fecha_proximo_pago,
        activa: d.activa,
        notas: d.notas,
      })));
    }

    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  return { movements, realAccounts, pockets, debts, loading, refetch: fetchAll };
}
