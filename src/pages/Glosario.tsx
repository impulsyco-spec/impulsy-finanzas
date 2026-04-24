import React, { useState } from 'react';

interface Section {
  id: string;
  title: string;
  icon: string;
  items: { term: string; def: string; tip?: string }[];
}

const SECTIONS: Section[] = [
  {
    id: 'tipos',
    title: 'Tipos de Movimiento',
    icon: '📂',
    items: [
      {
        term: 'Ingreso Operativo',
        def: 'Dinero que entra a la empresa por servicios prestados. El tipo más común: pagos de clientes.',
        tip: 'Usa este tipo cuando un cliente paga su mensualidad, anticipo o saldo de proyecto.',
      },
      {
        term: 'Egreso Operativo',
        def: 'Dinero que sale para mantener la operación: freelancers, herramientas, publicidad, suscripciones.',
        tip: 'Todo gasto del negocio que no sea sueldo del fundador ni pago de deuda.',
      },
      {
        term: 'Transferencia',
        def: 'Mover dinero entre cuentas o bolsillos. NO es ingreso ni gasto — el dinero sigue siendo tuyo, solo cambia de lugar.',
        tip: 'Úsalo en los cortes del 1 y 15 para distribuir ingresos entre bolsillos (Operación → Sueldo, Impuestos, Reserva).',
      },
      {
        term: 'Retiro Fundador',
        def: 'Cuando el dueño saca dinero para sí mismo. No es un gasto operativo del negocio.',
        tip: 'Registra aquí tu sueldo mensual. Ayuda a ver cuánto te estás llevando vs. lo que genera la empresa.',
      },
      {
        term: 'Aporte de Capital',
        def: 'Cuando el fundador mete dinero de su propio bolsillo a la empresa para financiar operación.',
        tip: 'No es ingreso operativo. No infla el margen. Solo registra que entraste plata propia.',
      },
      {
        term: 'Deuda Recibida',
        def: 'Cuando recibes un préstamo (banco, persona, tarjeta). Entra plata pero NO es ingreso — hay que devolverla.',
        tip: 'Registra el préstamo aquí y crea la deuda en la sección Deudas para hacer seguimiento.',
      },
      {
        term: 'Pago de Deuda',
        def: 'Cuota mensual de un préstamo o crédito. Sale dinero pero no es gasto operativo.',
        tip: 'Vincula este movimiento a una deuda registrada para ver cuánto has pagado.',
      },
      {
        term: 'Impuesto',
        def: 'Pago a la DIAN: IVA bimestral, retención en la fuente, renta, etc.',
        tip: 'Sepáralo de gastos operativos para ver tu carga tributaria real.',
      },
      {
        term: 'Ajuste',
        def: 'Corrección de saldo por diferencia bancaria, error de registro o conciliación.',
        tip: 'Úsalo raramente y siempre con nota explicativa.',
      },
    ],
  },
  {
    id: 'estados',
    title: 'Estados de un Movimiento',
    icon: '🚦',
    items: [
      {
        term: 'Recibido',
        def: 'El dinero ya está en tu cuenta. Este es el único estado que mueve tu caja real.',
        tip: 'El 90% de tus registros deben ser Recibido. Solo registra lo que ya ocurrió.',
      },
      {
        term: 'Esperado',
        def: 'Tienes un acuerdo (verbal o escrito) pero el dinero aún no ha entrado o salido.',
        tip: 'Útil para ver el flujo proyectado. Agrega fecha esperada de pago para que el sistema te avise si se vence.',
      },
    ],
  },
  {
    id: 'cuentas',
    title: 'Cuentas Reales vs. Bolsillos',
    icon: '🏦',
    items: [
      {
        term: 'Cuenta Real',
        def: 'Donde está físicamente el dinero. Ej: BOLD Impulsy, Bancolombia, efectivo.',
        tip: 'Siempre selecciona la cuenta donde entra o sale el dinero real. Así la caja es precisa.',
      },
      {
        term: 'Bolsillo',
        def: 'Sobre virtual que dice "este dinero está reservado para X". El dinero sigue en BOLD, pero sabes para qué es.',
        tip: 'Asigna el bolsillo según el destino del dinero: pagar herramientas → Operación. Tu sueldo → Sueldo Fundador.',
      },
    ],
  },
  {
    id: 'bolsillos',
    title: 'Distribución de Bolsillos (Cortes)',
    icon: '✂️',
    items: [
      {
        term: '¿Qué es un corte?',
        def: 'Dos veces al mes (1 y 15) haces el ejercicio de distribuir los ingresos recibidos entre los bolsillos según su porcentaje.',
        tip: 'No mueves plata físicamente — solo registras una Transferencia de bolsillo a bolsillo en el sistema.',
      },
      {
        term: 'Operación (45%)',
        def: 'Para pagar todos los costos del negocio: freelancers, tools, publicidad, servicios.',
        tip: 'Si gastas más del 45% en operación, el margen se achica. Monitorea la sección Alertas.',
      },
      {
        term: 'Sueldo Fundador (30%)',
        def: 'Tu pago mensual como dueño. Se "aparta" en el corte y se retira en dos cuotas (1 y 15).',
        tip: 'Registra cada retiro como Retiro Fundador → Sueldo del mes. No mezcles con gastos de la empresa.',
      },
      {
        term: 'Reserva / Emergencias (15%)',
        def: 'Colchón para meses con pocos ingresos o imprevistos. Meta: 3 meses de gastos operativos.',
        tip: 'No toques este bolsillo a menos que sea una emergencia real. Es tu runway.',
      },
      {
        term: 'Impuestos (10%)',
        def: 'Provisión mensual para IVA, renta y otras obligaciones tributarias.',
        tip: 'Cuando llegue la declaración, el dinero ya está apartado. Evita sorpresas fiscales.',
      },
    ],
  },
  {
    id: 'flujo',
    title: 'Flujo Recomendado del 1 y 15',
    icon: '🔄',
    items: [
      {
        term: 'Paso 1 — Suma ingresos del corte',
        def: 'En Resumen Anual o Movimientos filtra por el período (1–15 o 16–fin) y suma los ingresos Recibidos.',
      },
      {
        term: 'Paso 2 — Registra las distribuciones',
        def: 'Crea 4 movimientos tipo Transferencia: uno por cada bolsillo con el monto correspondiente al porcentaje.',
        tip: 'Ej. ingresaron $3.000.000 → Operación $1.350.000 · Sueldo $900.000 · Reserva $450.000 · Impuestos $300.000.',
      },
      {
        term: 'Paso 3 — Retira tu sueldo',
        def: 'Registra un Retiro Fundador → Sueldo del mes por el 50% de lo que apartaste en Sueldo (la otra mitad al siguiente corte).',
      },
      {
        term: 'Paso 4 — Paga operación',
        def: 'Registra los egresos operativos contra el bolsillo Operación. El saldo te dice cuánto te queda disponible.',
      },
    ],
  },
  {
    id: 'indicadores',
    title: 'Indicadores y Semáforos',
    icon: '📊',
    items: [
      {
        term: 'Caja Total',
        def: 'Todo el dinero que hay en tus cuentas reales ahora mismo (saldo inicial + ingresos confirmados − egresos confirmados).',
      },
      {
        term: 'Caja Libre',
        def: 'Caja Total menos los egresos que ya sabes que debes pagar (estado Esperado). Esto es lo que realmente puedes gastar.',
      },
      {
        term: 'Runway',
        def: 'Cuántos meses aguanta la empresa con la caja libre actual, si no entra nada más.',
        tip: 'Meta mínima: 3 meses. Si baja de 1 mes, activa cobros urgentemente.',
      },
      {
        term: 'Margen YTD',
        def: 'Utilidad del año dividida entre ingresos del año. Mide qué tan eficiente es el negocio.',
        tip: 'Bajo 10% = alerta. Entre 10–30% = normal. Más de 30% = saludable.',
      },
      {
        term: 'Higiene Fundador',
        def: 'Semáforo que muestra si los retiros del fundador son proporcionales a los ingresos.',
        tip: 'Si te llevas más del 30% de los ingresos en retiros, el semáforo se pone rojo.',
      },
    ],
  },
];

export const Glosario: React.FC = () => {
  const [active, setActive] = useState('tipos');

  const section = SECTIONS.find(s => s.id === active)!;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <header>
        <h1 style={{ color: '#fff', fontWeight: 800, fontSize: '2rem' }}>Glosario & Guía de Uso</h1>
        <p style={{ color: '#71717a', marginTop: '0.25rem' }}>Aprende qué significa cada campo y cuándo usarlo.</p>
      </header>

      {/* Nav por sección */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        {SECTIONS.map(s => (
          <button
            key={s.id}
            onClick={() => setActive(s.id)}
            style={{
              background: active === s.id ? '#fff' : '#1a1a1a',
              color: active === s.id ? '#000' : '#a0aec0',
              border: `1px solid ${active === s.id ? '#fff' : '#333'}`,
              padding: '0.4rem 0.875rem',
              borderRadius: '999px',
              fontSize: '0.82rem',
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {s.icon} {s.title}
          </button>
        ))}
      </div>

      {/* Contenido */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {section.items.map((item, i) => (
          <div
            key={i}
            className="card"
            style={{ padding: '1.1rem 1.25rem', borderColor: '#1e1e1e' }}
          >
            <div style={{ color: '#fff', fontWeight: 700, fontSize: '0.95rem', marginBottom: '0.35rem' }}>
              {item.term}
            </div>
            <div style={{ color: '#a0aec0', fontSize: '0.85rem', lineHeight: 1.5 }}>
              {item.def}
            </div>
            {item.tip && (
              <div style={{ marginTop: '0.5rem', background: 'rgba(255,255,255,0.03)', border: '1px solid #2a2a2a', borderRadius: '8px', padding: '0.5rem 0.75rem', fontSize: '0.78rem', color: '#71717a' }}>
                💡 <strong style={{ color: '#a0aec0' }}>Cuándo usarlo:</strong> {item.tip}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
