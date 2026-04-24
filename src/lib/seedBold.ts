import { supabase } from './supabase';

// Runs once on app load. Idempotent — safe to call multiple times.
export async function seedBoldAccount() {
  try {
    // Check if BOLD account already exists
    const { data: existing } = await supabase
      .from('real_accounts')
      .select('id')
      .ilike('nombre', '%bold%')
      .limit(1);

    if (!existing || existing.length === 0) {
      await supabase.from('real_accounts').insert({
        nombre: 'BOLD Impulsy',
        tipo: 'digital',
        saldo_inicial: 0,
        activa: true,
      });
    }

    // Seed pockets if none exist
    const { data: existingPockets } = await supabase
      .from('pockets')
      .select('id')
      .limit(1);

    if (!existingPockets || existingPockets.length === 0) {
      await supabase.from('pockets').insert([
        { nombre: 'Operación',       porcentaje_default: 45, activa: true },
        { nombre: 'Sueldo Fundador', porcentaje_default: 30, activa: true },
        { nombre: 'Reserva',         porcentaje_default: 15, activa: true },
        { nombre: 'Impuestos',       porcentaje_default: 10, activa: true },
      ]);
    }
  } catch {
    // Silently fail — non-critical
  }
}
