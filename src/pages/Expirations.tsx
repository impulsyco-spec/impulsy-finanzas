import React, { useState } from 'react';
import { useSupabaseData } from '../hooks/useSupabaseData';
import { CheckCircle2, AlertTriangle, XCircle, Search, CalendarDays } from 'lucide-react';

export const Expirations: React.FC = () => {
  const { clients, projects, loading } = useSupabaseData();
  const [filterMode, setFilterMode] = useState<'all' | 'active' | 'warning' | 'expired'>('all');

  if (loading) return <div className="p-8 flex justify-center text-main">Consultando base de datos...</div>;

  const validProjects = projects.filter(p => p.status !== 'cancelled');

  const getClientName = (clientId: string) => clients.find(c => c.id === clientId)?.name || 'Desconocido';
  
  const formatDate = (dateStr: string) => {
    if (!dateStr) return 'N/A';
    // Use T12:00:00 to prevent timezone shift when parsing YYYY-MM-DD
    const d = new Date(dateStr.includes('T') ? dateStr : `${dateStr}T12:00:00`);
    return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const extractMonthsFromPlan = (plan: string): number => {
    if (!plan) return 1;
    const p = plan.toLowerCase();
    
    // Buscar números seguidos de "mes" o "month"
    const match = p.match(/(\d+)\s*(mes|month|cuota)/);
    if (match) return parseInt(match[1]);
    
    if (p.includes('anual') || p.includes('año')) return 12;
    if (p.includes('semestral')) return 6;
    if (p.includes('trimestral')) return 3;
    if (p.includes('mensual') || p.includes('mrr')) return 12; // MRR por defecto 12 meses para vigencia
    
    return 1;
  };

  const expirationData = validProjects.map(project => {
    // Supabase created_at is a full ISO string like "2024-03-25T10:00:00Z"
    // We add T12:00:00 to date-only strings to prevent timezone shifts
    const startDateStr = project.startDate ? (project.startDate.includes('T') ? project.startDate : `${project.startDate}T12:00:00`) : new Date().toISOString();
    const startDateObj = new Date(startDateStr);
    
    const endDateObj = new Date(startDateObj);
    
    // Intentar obtener duración: Prioridad 1: durationMonths (si es > 1), Prioridad 2: Texto del plan, Fallback: durationMonths (1)
    let durationMonths = project.durationMonths;
    if (durationMonths <= 1) {
      durationMonths = extractMonthsFromPlan(project.plan);
    }
    
    endDateObj.setMonth(endDateObj.getMonth() + durationMonths);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    endDateObj.setHours(0, 0, 0, 0);
    startDateObj.setHours(0, 0, 0, 0);

    const totalMs = endDateObj.getTime() - startDateObj.getTime();
    const elapsedMs = today.getTime() - startDateObj.getTime();
    const remainingMs = endDateObj.getTime() - today.getTime();

    const daysRemaining = Math.ceil(remainingMs / (1000 * 60 * 60 * 24));
    
    let progress = totalMs > 0 ? (elapsedMs / totalMs) * 100 : 100;
    if (progress < 0) progress = 0;
    if (progress > 100) progress = 100;

    let expirationStatus: 'active' | 'warning' | 'expired' = 'active';
    if (daysRemaining < 0) expirationStatus = 'expired';
    else if (daysRemaining <= 30) expirationStatus = 'warning';

    return {
      ...project,
      clientName: getClientName(project.clientId),
      endDate: endDateObj.toISOString().split('T')[0],
      daysRemaining,
      progress,
      expirationStatus
    };
  });

  // Filter based on selected segmented control
  const filteredData = expirationData.filter(p => {
    if (filterMode === 'all') return p.expirationStatus !== 'expired'; // Default: vigentes (show active + warning)
    return p.expirationStatus === filterMode;
  });

  // Metrics
  const activeCount = expirationData.filter(p => p.expirationStatus === 'active').length;
  const warningCount = expirationData.filter(p => p.expirationStatus === 'warning').length;
  const expiredCount = expirationData.filter(p => p.expirationStatus === 'expired').length;

  return (
    <div className="flex-col gap-6" style={{ display: 'flex' }}>
      <header className="flex justify-between items-center mb-2">
        <div>
          <h1 className="text-4xl font-bold text-highlight">Vigencia de Proyectos</h1>
          <p className="text-main mt-4">Monitorea los vencimientos de contratos y planes activos.</p>
        </div>
      </header>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-6 mb-4">
        <div className="stat-card" style={{ borderColor: '#66fcf1', borderTopWidth: '4px' }}>
          <div className="flex items-center gap-3 mb-2">
            <CheckCircle2 className="text-primary" size={24} />
            <h3 className="text-main font-semibold">Activos</h3>
          </div>
          <p className="text-3xl font-bold text-highlight">{activeCount}</p>
          <p className="text-xs text-main mt-1">Más de 30 días restantes</p>
        </div>
        <div className="stat-card" style={{ borderColor: '#ecc94b', borderTopWidth: '4px' }}>
          <div className="flex items-center gap-3 mb-2">
            <AlertTriangle className="text-warning" size={24} style={{ color: '#ecc94b' }} />
            <h3 className="text-main font-semibold">Por Vencer</h3>
          </div>
          <p className="text-3xl font-bold" style={{ color: '#ecc94b' }}>{warningCount}</p>
          <p className="text-xs text-main mt-1">30 días o menos</p>
        </div>
        <div className="stat-card" style={{ borderColor: '#f56565', borderTopWidth: '4px' }}>
          <div className="flex items-center gap-3 mb-2">
            <XCircle className="text-danger" size={24} />
            <h3 className="text-main font-semibold">Vencidos</h3>
          </div>
          <p className="text-3xl font-bold text-danger">{expiredCount}</p>
          <p className="text-xs text-main mt-1">Tiempo de servicio expirado</p>
        </div>
      </div>

      <div className="card h-fit">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-highlight">Listado de Vencimientos</h2>
          <div style={{ display: 'flex', backgroundColor: 'var(--secondary-accent)', borderRadius: '12px', padding: '0.2rem' }}>
            <button 
              onClick={() => setFilterMode('all')}
              style={{ padding: '0.4rem 0.8rem', borderRadius: '10px', fontSize: '0.8rem', color: filterMode === 'all' ? '#000' : 'var(--text-main)', backgroundColor: filterMode === 'all' ? 'var(--primary-accent)' : 'transparent', border: 'none', cursor: 'pointer', fontWeight: filterMode === 'all' ? 600 : 400 }}
            >
              Todos (Vigentes)
            </button>
            <button 
              onClick={() => setFilterMode('active')}
              style={{ padding: '0.4rem 0.8rem', borderRadius: '10px', fontSize: '0.8rem', color: filterMode === 'active' ? '#000' : 'var(--text-main)', backgroundColor: filterMode === 'active' ? 'var(--primary-accent)' : 'transparent', border: 'none', cursor: 'pointer', fontWeight: filterMode === 'active' ? 600 : 400 }}
            >
              Activos
            </button>
            <button 
              onClick={() => setFilterMode('warning')}
              style={{ padding: '0.4rem 0.8rem', borderRadius: '10px', fontSize: '0.8rem', color: filterMode === 'warning' ? '#000' : 'var(--text-main)', backgroundColor: filterMode === 'warning' ? 'var(--warning)' : 'transparent', border: 'none', cursor: 'pointer', fontWeight: filterMode === 'warning' ? 600 : 400 }}
            >
              Por Vencer
            </button>
            <button 
              onClick={() => setFilterMode('expired')}
              style={{ padding: '0.4rem 0.8rem', borderRadius: '10px', fontSize: '0.8rem', color: filterMode === 'expired' ? '#000' : 'var(--text-main)', backgroundColor: filterMode === 'expired' ? 'var(--danger)' : 'transparent', border: 'none', cursor: 'pointer', fontWeight: filterMode === 'expired' ? 600 : 400 }}
            >
              Vencidos
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4">
          {filteredData.sort((a, b) => a.daysRemaining - b.daysRemaining).map(proj => {
            
            let statusColor = '#66fcf1'; // primary
            let statusBadgeClass = 'badge-success';
            let statusText = 'Activo';
            
            if (proj.expirationStatus === 'warning') {
              statusColor = '#ecc94b';
              statusBadgeClass = 'badge-warning';
              statusText = 'Por Vencer';
            } else if (proj.expirationStatus === 'expired') {
              statusColor = '#f56565';
              statusBadgeClass = 'badge-danger';
              statusText = 'Vencido';
            }

            return (
              <div key={proj.id} className="p-4 rounded border flex flex-col gap-3" style={{ borderColor: '#2d3748', backgroundColor: '#111318' }}>
                <div className="flex justify-between items-start">
                  <div>
                  <h3 className="text-lg font-bold text-highlight flex items-center gap-2">
                      {proj.name} 
                      {proj.isRecurring && <span className="badge" style={{ backgroundColor: 'rgba(255,255,255,0.05)', color: 'var(--text-highlight)', border: '1px solid var(--panel-border)', fontSize: '0.65rem' }}>MRR</span>}
                    </h3>
                    <p className="text-sm text-main">{proj.clientName} • {proj.plan}</p>
                  </div>
                  <div className="text-right">
                    <span className={`badge ${statusBadgeClass}`} style={proj.expirationStatus === 'warning' ? { backgroundColor: 'rgba(236, 201, 75, 0.1)', color: '#ecc94b', border: '1px solid #ecc94b' } : {}}>
                      {statusText}
                    </span>
                    <p className="text-xs text-main mt-2 font-mono">
                      {proj.daysRemaining < 0 
                        ? `Hace ${Math.abs(proj.daysRemaining)} días` 
                        : `Faltan ${proj.daysRemaining} días`}
                    </p>
                  </div>
                </div>

                <div className="flex justify-between items-center text-xs text-[#a0aec0]">
                  <div className="flex items-center gap-1"><CalendarDays size={14}/> {formatDate(proj.startDate)}</div>
                  <div className="flex items-center gap-1 font-semibold" style={{ color: statusColor }}>{formatDate(proj.endDate)} <CalendarDays size={14}/></div>
                </div>

                {/* Progress bar */}
                <div style={{ height: '6px', backgroundColor: '#2d3748', borderRadius: '3px', overflow: 'hidden' }}>
                  <div 
                    style={{ 
                      height: '100%', 
                      width: `${proj.progress}%`, 
                      backgroundColor: statusColor,
                      transition: 'width 0.5s ease-out'
                    }}
                  />
                </div>
              </div>
            );
          })}
          
          {filteredData.length === 0 && (
            <div className="text-center p-8 text-main border border-dashed border-[#2d3748] rounded">
              No se encontraron proyectos para mostrar.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
