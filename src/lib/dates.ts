// Fechas en hora LOCAL (Colombia). No usar new Date().toISOString() para
// obtener "hoy": toISOString() devuelve UTC y después de las ~7pm hora
// Colombia salta al día siguiente, corriendo fechas de registro, filtros
// de período y fronteras de quincena.

export const fechaISO = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export const hoyISO = (): string => fechaISO(new Date());
