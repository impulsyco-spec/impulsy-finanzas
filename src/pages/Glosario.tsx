import React, { useState } from 'react';

interface Item {
  term: string;
  def: string;
  tip?: string;
  example?: string;
}
interface Section {
  id: string;
  title: string;
  icon: string;
  items: Item[];
}

const SECTIONS: Section[] = [
  {
    id: 'panel',
    title: 'Panel de Inicio',
    icon: '⚡',
    items: [
      {
        term: 'Caja Total',
        def: 'Todo el dinero que tienes ahora mismo en todas tus cuentas reales. Se calcula sumando el saldo inicial de cada cuenta + todos los ingresos confirmados − todos los egresos confirmados desde siempre.',
        tip: 'Este es el número real. Si abres Bold y tu banco y sumas los saldos, debe coincidir con este. Si no coincide, revisa si hay movimientos sin cuenta asignada.',
        example: 'Saldo inicial BOLD $2.344.000 + ingresos cobrados $8.000.000 − gastos pagados $3.000.000 = Caja Total $7.344.000',
      },
      {
        term: 'Comprometida (próximos N meses)',
        def: 'Plata que ya sabes que vas a gastar dentro del período seleccionado: gastos recurrentes, freelancers agendados, cualquier egreso en estado Esperado. NO incluye compromisos fuera del horizonte.',
        tip: 'Cambia el período (1 mes, 3 meses…) con el selector del panel. Ver "3 meses" te da una foto real de tus próximos compromisos sin que gastos de dentro de 8 meses distorsionen el número.',
        example: 'Con horizonte 1 mes: Internet $55K + Canva $24K + nómina freelancer $800K = $879K comprometidos.',
      },
      {
        term: 'Caja Libre',
        def: 'Caja Total menos la Comprometida del período. Es el dinero que puedes usar sin comprometer los gastos ya planificados.',
        tip: 'Si este número es negativo, significa que tus compromisos del período superan tu caja actual. Necesitas cobrar antes de que venzan esos pagos.',
      },
      {
        term: 'Runway',
        def: 'Cuánto tiempo aguanta la empresa con la caja actual si el negocio no genera ni un peso más. Se calcula dividiendo la Caja Total entre el promedio de gastos mensuales confirmados de los últimos 3 meses. Cuando es menor a 1 mes se muestra en días para ser más claro.',
        tip: 'Meta mínima: 3 meses. Si baja de 30 días, activa cobros urgentemente y detén gastos no críticos. Si es ∞ es porque aún no hay historial de egresos suficiente.',
        example: 'Caja $7.3M ÷ gasto promedio $1.77M/mes = 4.1 meses de runway.',
      },
      {
        term: 'Margen YTD',
        def: 'Utilidad del año actual dividida entre ingresos del año actual, en porcentaje. Mide qué tan eficiente es el negocio: por cada $100 que entra, ¿cuántos quedan?',
        tip: 'Meta Impulsy: 40% o más. Menos del 25% es señal de alerta. Solo cuenta movimientos confirmados.',
        example: 'Ingresos 2026: $54M. Gastos 2026: $47M. Utilidad: $7M. Margen: 13% → amarillo.',
      },
      {
        term: 'Por Cobrar',
        def: 'Suma de todos los ingresos con estado Esperado o Facturado — dinero que los clientes te deben o que tienes proyectado cobrar. Incluye cuotas de proyectos y cobros manuales futuros.',
        tip: 'Un número alto es bueno si las fechas están cerca. Revisa la sección Cobranza para ver cuáles están vencidos.',
      },
      {
        term: 'Deuda Total',
        def: 'Suma del saldo pendiente de todas las deudas activas registradas en la sección Deudas (préstamos, tarjetas, obligaciones).',
        tip: 'Idealmente 0. Si existe, monitorea que las cuotas no superen el 10-15% de tus ingresos mensuales.',
      },
    ],
  },
  {
    id: 'semaforos',
    title: 'Semáforos',
    icon: '🚦',
    items: [
      {
        term: '¿Qué es un semáforo?',
        def: 'Cada semáforo resume un área financiera clave con un color (🟢 bien / 🟡 vigilar / 🔴 actuar) y un número concreto. Activa "Ver diagnóstico" para que el sistema explique en palabras qué significa cada color.',
        tip: 'Los semáforos cambian en tiempo real cuando actualizas movimientos. No necesitas calcular nada manualmente.',
      },
      {
        term: '🚦 Liquidez',
        def: 'Muestra la Caja Libre del período y el runway. Verde: ≥ 3 meses. Amarillo: entre 1 y 3 meses. Rojo: menos de 1 mes (se muestra en días).',
        tip: 'Si está rojo, lo primero es cobrar — no reducir gastos. La caja se recupera más rápido cobrando que recortando.',
      },
      {
        term: '🚦 Cobranza',
        def: 'Muestra cuánto te deben los clientes (Por Cobrar total). Verde: sin cobros vencidos. Amarillo: algunos vencidos (< 30% del total). Rojo: más del 30% del Por Cobrar está vencido.',
        tip: 'Un cobro está "vencido" cuando su fecha de vencimiento ya pasó y sigue en estado Esperado. Asigna fechas de vencimiento a tus movimientos de ingreso para que este indicador funcione bien.',
      },
      {
        term: '🚦 Margen',
        def: 'Muestra la utilidad del año (ingresos − gastos confirmados) y el porcentaje de margen. Verde: ≥ 30%. Amarillo: entre 10% y 30%. Rojo: menos del 10%.',
        tip: 'La meta de Impulsy es 40%. Si el margen baja, primero revisa si hay gastos sin categorizar — a veces el problema es de registro, no de operación.',
      },
      {
        term: '🚦 Caja Operativa',
        def: 'Muestra la Caja Total. El color no depende del valor absoluto sino de si la Caja Libre es positiva o negativa. Verde: caja libre positiva. Rojo: los compromisos del período superan la caja.',
        tip: 'Puedes tener $7M en caja y el semáforo estar rojo si tienes $10M de compromisos en el próximo mes. Cambia el horizonte a 3 meses para ver si es un problema real o solo de timing.',
      },
      {
        term: '🚦 Deuda',
        def: 'Compara la deuda total con los ingresos del año. Verde: deuda < 10% del ingreso anual. Amarillo: entre 10% y 30%. Rojo: más del 30%.',
        tip: 'Actualmente en $0 — excelente. Registra cualquier préstamo o crédito en la sección Deudas para que este indicador sea preciso.',
      },
      {
        term: '🚦 Higiene Fundador',
        def: 'Muestra cuánto ha retirado el fundador (tipo Retiro Fundador) en el mes actual. Verde: $0 retirados. Amarillo: retiros moderados (< 5% del ingreso YTD). Rojo: retiros altos (> 5% del ingreso YTD).',
        tip: 'No penaliza retirar — penaliza retirar desproporcionadamente. Si el negocio genera poco y el fundador retira mucho, la empresa se queda sin capital de trabajo.',
      },
    ],
  },
  {
    id: 'movimientos',
    title: 'Movimientos',
    icon: '📒',
    items: [
      {
        term: '¿Qué es un movimiento?',
        def: 'Es la unidad básica del sistema. Cada peso que entra o sale de la empresa — o que se espera que entre o salga — se registra como un movimiento. La tabla de Movimientos es la fuente única de verdad: todos los demás paneles (proyección, rentabilidad, cuentas, semáforos) se calculan desde aquí.',
        tip: 'Si un número del panel no cuadra, siempre ve primero a Movimientos a verificar.',
      },
      {
        term: 'Naturaleza: Ingreso / Egreso / Neutro',
        def: 'Ingreso: entra plata (cobra de clientes). Egreso: sale plata (pagas gastos). Neutro: movimiento interno que no afecta el total (transferencias entre cuentas).',
        tip: 'Usa los tres botones de color del header: verde para Ingreso, rojo para Egreso, gris para Otro.',
      },
      {
        term: 'Estado: Confirmado',
        def: 'El dinero ya entró o ya salió. Este es el único estado que mueve tu Caja Total y afecta los semáforos de liquidez y margen.',
        tip: 'Registra como Confirmado solo cuando el dinero ya está en tu cuenta bancaria o ya salió de ella.',
      },
      {
        term: 'Estado: Esperado',
        def: 'Tienes un acuerdo pero el dinero aún no se ha movido. Afecta la Comprometida (egresos) y el Por Cobrar (ingresos), pero NO mueve la Caja Total.',
        tip: 'Aquí van las cuotas de proyectos que faltan por cobrar, los gastos fijos del próximo mes, pagos de equipo agendados. Es la base de la Proyección.',
      },
      {
        term: 'Estado: Facturado',
        def: 'Ya enviaste la factura pero el cliente no ha pagado. Funciona igual que Esperado para efectos de proyección y Por Cobrar.',
        tip: 'Úsalo cuando tengas documento formal enviado. Ayuda a distinguir "se lo dije de palabra" de "ya le mandé factura".',
      },
      {
        term: 'Estado: Vencido',
        def: 'Un cobro o pago que debía ocurrir y no ocurrió. Activa el semáforo de Cobranza si es un ingreso.',
        tip: 'El sistema no cambia el estado automáticamente — debes hacerlo tú cuando detectes que no llegó el pago.',
      },
      {
        term: 'Sin cuenta asignada ⚠',
        def: 'Un movimiento confirmado sin cuenta asignada NO se refleja en ningún saldo de cuenta — desaparece del cálculo de Caja Total. Aparece marcado con borde naranja en la tabla.',
        tip: 'Siempre asigna la cuenta real (ej. BOLD Impulsy) al confirmar un movimiento. Si ves el aviso naranja, edita el movimiento y asigna la cuenta.',
      },
      {
        term: 'Tipo de movimiento',
        def: 'Clasifica el origen o destino del dinero dentro de su naturaleza. Ejemplos: Ingreso Operativo (pago de cliente), Egreso Operativo (gasto del negocio), Retiro Fundador (tu sueldo), Aporte de Capital, Pago de Deuda, Impuesto, Ajuste.',
        tip: 'El tipo no afecta la caja pero sí afecta los reportes de rentabilidad y la higiene financiera.',
      },
      {
        term: 'Filtros y ordenamiento',
        def: 'Puedes filtrar por naturaleza, tipo, mes, estado, proyecto y categoría. El botón ↓ / ↑ ordena por fecha. El filtro de categoría agrupa gastos para ver dónde va el dinero.',
        tip: 'Filtra por mes + estado Esperado para ver exactamente qué debes pagar o cobrar en ese mes.',
      },
    ],
  },
  {
    id: 'proyeccion',
    title: 'Proyección',
    icon: '🔮',
    items: [
      {
        term: '¿Cómo funciona la proyección?',
        def: 'Muestra los meses siguientes (empieza desde el próximo mes, no el actual) con los ingresos y egresos ya registrados como Esperado o Facturado. Todo viene de la tabla de Movimientos — no hay un sistema separado.',
        tip: 'Si agregas un cobro manual en Movimientos con estado Esperado y fecha en mayo, aparece automáticamente en la proyección de mayo.',
      },
      {
        term: 'Ingresos proyectados',
        def: 'Suma de todos los movimientos de naturaleza Ingreso con estado Esperado o Facturado para ese mes. Incluye cuotas de proyectos generadas automáticamente y cobros que agregues manualmente.',
        tip: 'Para que un cobro aparezca en la proyección: debe tener naturaleza Ingreso, estado Esperado, y fecha dentro del mes proyectado.',
      },
      {
        term: 'Egresos comprometidos',
        def: 'Suma de todos los movimientos de naturaleza Egreso con estado Esperado o Facturado para ese mes, excluyendo los que el sistema creó automáticamente para Gastos Fijos (que ya se cuentan por separado).',
        tip: 'Los gastos recurrentes (freelancers, suscripciones) se registran una vez y el sistema crea los movimientos futuros automáticamente.',
      },
      {
        term: 'Gastos Fijos Mensuales',
        def: 'Gastos que se repiten cada mes con el mismo valor. Al registrar uno, el sistema crea automáticamente un movimiento Esperado por cada cuota en los meses futuros. Esto mantiene la proyección al día sin trabajo manual.',
        tip: 'Si cambias el valor o la duración de un gasto fijo, el sistema borra los movimientos futuros y los recrea — por eso aparece el aviso de advertencia en amarillo.',
      },
      {
        term: 'Selector de meses (1m / 3m / 6m / 12m)',
        def: 'Define cuántos meses hacia adelante quieres ver en la proyección acumulada. Siempre empieza desde el próximo mes.',
        tip: 'Usa 1 mes para el flujo inmediato, 3 meses para decisiones de corto plazo, 6-12 meses para planificación anual.',
      },
    ],
  },
  {
    id: 'cuentas',
    title: 'Cuentas & Bolsillos',
    icon: '🏦',
    items: [
      {
        term: 'Cuenta Real',
        def: 'Donde físicamente está el dinero: BOLD Impulsy, Bancolombia, efectivo. El saldo de cada cuenta se calcula como: saldo inicial + ingresos confirmados asignados a esa cuenta − egresos confirmados asignados a esa cuenta.',
        tip: 'Siempre selecciona la cuenta correcta al registrar un movimiento. Si no asignas cuenta, el movimiento no suma a ningún saldo.',
      },
      {
        term: 'Saldo Inicial',
        def: 'El dinero que había en la cuenta el día que empezaste a usar el sistema. No se recalcula — es el punto de partida fijo.',
        tip: 'Si el saldo inicial está mal (por un error de configuración), usa el botón "Corregir saldo inicial" dentro del desglose de la cuenta. Eso NO crea ningún movimiento — solo corrige el valor de apertura.',
      },
      {
        term: 'Ajuste de conciliación',
        def: 'Cuando el saldo del sistema no coincide con el saldo real de tu banco, puedes corregirlo desde Cuentas. Introduces el saldo real que muestra tu app bancaria y el sistema crea automáticamente un movimiento de ajuste por la diferencia.',
        tip: 'Antes de hacer un ajuste, usa el botón "Ver desglose" para encontrar el movimiento que está causando la diferencia. Es mejor eliminar el movimiento erróneo que crear un ajuste encima.',
      },
      {
        term: 'Ver desglose',
        def: 'Abre una tabla dentro de la tarjeta de la cuenta que muestra el saldo inicial y cada movimiento confirmado asignado a esa cuenta, con el saldo acumulado después de cada uno. Los movimientos de tipo Ajuste aparecen marcados con ⚠.',
        tip: 'Usa el desglose para diagnosticar por qué el saldo no cuadra. Puedes eliminar movimientos sospechosos directamente desde ahí.',
      },
      {
        term: 'Bolsillo',
        def: 'Sobre virtual que clasifica el dinero según su destino: Operación, Sueldo, Reserva, Impuestos. El dinero sigue en la cuenta real (BOLD), pero el bolsillo te dice "esto ya está asignado para tal cosa".',
        tip: 'Los bolsillos no afectan la Caja Total — solo te ayudan a administrar el dinero que ya tienes.',
      },
    ],
  },
  {
    id: 'proyectos',
    title: 'Proyectos & Cuotas',
    icon: '📁',
    items: [
      {
        term: '¿Cómo funciona un proyecto?',
        def: 'Cada proyecto agrupa los movimientos de ingreso y egreso asociados a un cliente. Desde el proyecto puedes crear cuotas de cobro que generan movimientos Esperado automáticamente en la fecha acordada.',
        tip: 'Vincula cada movimiento a su proyecto para que la sección de Rentabilidad y el Dashboard muestren cuánto ganas por cliente.',
      },
      {
        term: 'Cuotas de cobro',
        def: 'Pagos programados dentro de un proyecto. Cada cuota genera un movimiento de ingreso en estado Esperado. Cuando el cliente paga, marcas la cuota como Cobrado y el movimiento pasa a Confirmado.',
        tip: 'La fuente de cuotas es la tabla de Movimientos — si agregas un ingreso manual vinculado al proyecto, aparece como cuota igual que las automáticas.',
      },
      {
        term: 'Rentabilidad por proyecto',
        def: 'Ingresos confirmados del proyecto menos egresos confirmados vinculados a ese proyecto, dividido entre los ingresos. Mide cuánto queda de cada proyecto después de sus costos directos.',
        tip: 'Un proyecto con mucho ingreso pero margen bajo te está consumiendo recursos. Revisa qué egresos están vinculados a él.',
      },
    ],
  },
  {
    id: 'tipos',
    title: 'Tipos de Movimiento',
    icon: '📂',
    items: [
      {
        term: 'Ingreso Operativo',
        def: 'Dinero que entra por servicios prestados. El tipo más común: pagos de clientes por proyectos, mensualidades, anticipos.',
        tip: 'Usa este tipo cuando un cliente paga su mensualidad, anticipo o saldo de proyecto.',
      },
      {
        term: 'Egreso Operativo',
        def: 'Dinero que sale para mantener la operación: freelancers, herramientas, publicidad, suscripciones, arriendo.',
        tip: 'Todo gasto del negocio que no sea sueldo del fundador ni pago de deuda.',
      },
      {
        term: 'Transferencia',
        def: 'Mover dinero entre cuentas o bolsillos. NO es ingreso ni gasto — el dinero sigue siendo tuyo, solo cambia de lugar.',
        tip: 'Úsalo en los cortes del 1 y 15 para distribuir ingresos entre bolsillos.',
      },
      {
        term: 'Retiro Fundador',
        def: 'Cuando el dueño saca dinero para sí mismo. No es un gasto operativo. Alimenta el semáforo de Higiene Fundador.',
        tip: 'Registra aquí tu sueldo mensual. El sistema mide si estás retirando de forma proporcional a lo que genera la empresa.',
      },
      {
        term: 'Aporte de Capital',
        def: 'Cuando metes dinero de tu propio bolsillo a la empresa. No es ingreso operativo — no infla el margen ni la rentabilidad.',
        tip: 'Importante para no confundir "la empresa ganó" con "el dueño metió plata".',
      },
      {
        term: 'Deuda Recibida',
        def: 'Un préstamo recibido. Entra plata pero NO es ingreso — hay que devolverla. Registra también la deuda en la sección Deudas.',
        tip: 'Sin este tipo, un préstamo inflaría el margen artificialmente.',
      },
      {
        term: 'Pago de Deuda',
        def: 'Cuota mensual de un préstamo. Sale dinero pero no es gasto operativo — no afecta el margen.',
        tip: 'Vincula al registro de deuda correspondiente para ver el saldo pendiente.',
      },
      {
        term: 'Impuesto',
        def: 'Pago a la DIAN: IVA, retención, renta. Se registra por separado para ver la carga tributaria real.',
        tip: 'El bolsillo de Impuestos (10% de los ingresos) debe cubrir estos pagos cuando lleguen.',
      },
      {
        term: 'Ajuste',
        def: 'Corrección de saldo por diferencia bancaria o error de registro. El sistema lo crea automáticamente cuando concilias una cuenta desde la sección Cuentas.',
        tip: 'Úsalo raramente. Si ves un movimiento de ajuste que no recuerdas haber creado, probablemente fue generado por el sistema al corregir un saldo — revisa si es correcto.',
      },
    ],
  },
  {
    id: 'flujo',
    title: 'Flujo Recomendado',
    icon: '🔄',
    items: [
      {
        term: 'Registro diario (5 minutos)',
        def: 'Cada vez que entra o sale dinero: abre Movimientos, usa el botón verde (Ingreso) o rojo (Egreso), llena fecha, descripción, valor y cuenta. Estado: Confirmado.',
        tip: 'No dejes acumular más de 3 días sin registrar — pierdes el hilo rápido.',
      },
      {
        term: 'Proyección semanal (10 minutos)',
        def: 'Una vez por semana entra a Finanzas → Proyección y revisa el próximo mes. ¿Hay cobros que mover o confirmar? ¿Hay gastos que agregar?',
        tip: 'Si ves que los ingresos proyectados no cubren los gastos fijos, activa cobros con los clientes antes de que llegue el mes.',
      },
      {
        term: 'Corte del 1 y 15 (15 minutos)',
        def: 'Cada quincena: (1) suma los ingresos confirmados del período. (2) Registra transferencias a bolsillos según los porcentajes. (3) Retira tu sueldo con tipo Retiro Fundador. (4) Revisa el semáforo de Liquidez.',
        example: 'Entraron $4.000.000 en la primera quincena → Operación $1.800K · Sueldo $1.200K · Reserva $600K · Impuestos $400K.',
      },
      {
        term: 'Conciliación mensual (20 minutos)',
        def: 'Al final de cada mes: (1) Compara el saldo del sistema con el saldo real de tu banco. (2) Si hay diferencia, usa "Ver desglose" en Cuentas para encontrar el movimiento que la causa. (3) Corrige o elimina el movimiento erróneo. (4) Solo si no encuentras la causa, usa "Ajuste de conciliación".',
        tip: 'Nunca hagas un ajuste sin primero investigar la causa. Un ajuste tapa el síntoma pero no resuelve el error.',
      },
      {
        term: 'Revisión de semáforos (1 minuto)',
        def: 'Al abrir la app, mira los 6 semáforos. Activa "Ver diagnóstico" si alguno está rojo o amarillo para entender qué hacer. El runway en días es la señal más urgente.',
        tip: 'No necesitas entender todos los números — si todo está verde, el negocio está sano. Si hay rojo, el sistema te dice exactamente qué hacer.',
      },
    ],
  },
];

export const Glosario: React.FC = () => {
  const [active, setActive] = useState('panel');

  const section = SECTIONS.find(s => s.id === active)!;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <header>
        <h1 style={{ color: '#fff', fontWeight: 800, fontSize: '2rem' }}>Glosario & Guía de Uso</h1>
        <p style={{ color: '#71717a', marginTop: '0.25rem' }}>Qué significa cada número y cómo usar el sistema correctamente.</p>
      </header>

      {/* Nav por sección */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        {SECTIONS.map(s => (
          <button key={s.id} onClick={() => setActive(s.id)}
            style={{
              background: active === s.id ? '#fff' : '#1a1a1a',
              color: active === s.id ? '#000' : '#a0aec0',
              border: `1px solid ${active === s.id ? '#fff' : '#333'}`,
              padding: '0.4rem 0.875rem', borderRadius: '999px',
              fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
            }}>
            {s.icon} {s.title}
          </button>
        ))}
      </div>

      {/* Contenido */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {section.items.map((item, i) => (
          <div key={i} className="card" style={{ padding: '1.1rem 1.25rem', borderColor: '#1e1e1e' }}>
            <div style={{ color: '#fff', fontWeight: 700, fontSize: '0.95rem', marginBottom: '0.35rem' }}>
              {item.term}
            </div>
            <div style={{ color: '#a0aec0', fontSize: '0.85rem', lineHeight: 1.6 }}>
              {item.def}
            </div>
            {item.example && (
              <div style={{ marginTop: '0.5rem', background: 'rgba(6,182,212,0.05)', border: '1px solid #06b6d422', borderRadius: '8px', padding: '0.5rem 0.75rem', fontSize: '0.78rem', color: '#06b6d4' }}>
                📐 <strong>Ejemplo:</strong> {item.example}
              </div>
            )}
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
