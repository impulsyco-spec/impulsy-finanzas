import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, NavLink } from 'react-router-dom';
import { seedBoldAccount } from './lib/seedBold';

// ── V2 (piloto) ──────────────────────────────────────────
import { SidebarV2 }    from './components/SidebarV2';
import { Inicio }       from './pages/v2/Inicio';
import { ProyectosV2 }  from './pages/v2/ProyectosV2';
import { Finanzas }     from './pages/v2/Finanzas';
import { Resumen }      from './pages/v2/Resumen';
import { Equipo }       from './pages/v2/Equipo';

// ── Páginas compartidas (no cambian) ─────────────────────
import { Login }         from './pages/Login';
import { Glosario }      from './pages/Glosario';

// ── Páginas v1 (siguen existiendo en sus rutas) ──────────
import { Dashboard }     from './pages/Dashboard';
import { Projects }      from './pages/Projects';
import { Payments }      from './pages/Payments';
import { Expirations }   from './pages/Expirations';
import { Movimientos }   from './pages/Movimientos';
import { PorPagar }      from './pages/PorPagar';
import { Cuentas }       from './pages/Cuentas';
import { Deudas }        from './pages/Deudas';
import { Retiros }       from './pages/Retiros';
import { Rentabilidad }  from './pages/Rentabilidad';
import { ResumenAnual }  from './pages/ResumenAnual';
import { Alertas }       from './pages/Alertas';

import { FinancialAdvisor } from './components/FinancialAdvisor';
import { Home, FolderKanban, TrendingUp, BarChart2, LogOut } from 'lucide-react';
import './index.css';

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    if (localStorage.getItem('impulsy_auth') === 'true') {
      setIsLoggedIn(true);
      seedBoldAccount();
    }
  }, []);

  const handleLogin  = () => { localStorage.setItem('impulsy_auth', 'true'); setIsLoggedIn(true); };
  const handleLogout = () => { localStorage.removeItem('impulsy_auth'); setIsLoggedIn(false); };

  if (!isLoggedIn) return <Login onLogin={handleLogin} />;

  return (
    <Router>
      <div className="app-container">
        <SidebarV2 onLogout={handleLogout} />

        <main className="main-content">
          <Routes>
            {/* ── V2 — 4 vistas principales ── */}
            <Route path="/"          element={<Inicio />} />
            <Route path="/proyectos" element={<ProyectosV2 />} />
            <Route path="/finanzas"  element={<Finanzas />} />
            <Route path="/equipo"    element={<Equipo />} />
            <Route path="/resumen"   element={<Resumen />} />

            {/* ── Compartidas ── */}
            <Route path="/glosario"  element={<Glosario />} />

            {/* ── V1 (accesibles por URL directa, sin menú) ── */}
            <Route path="/dashboard"    element={<Dashboard />} />
            <Route path="/projects"     element={<Projects />} />
            <Route path="/payments"     element={<Payments />} />
            <Route path="/expirations"  element={<Expirations />} />
            <Route path="/movimientos"  element={<Movimientos />} />
            <Route path="/por-pagar"    element={<PorPagar />} />
            <Route path="/cuentas"      element={<Cuentas />} />
            <Route path="/deudas"       element={<Deudas />} />
            <Route path="/retiros"      element={<Retiros />} />
            <Route path="/rentabilidad" element={<Rentabilidad />} />
            <Route path="/resumen-anual" element={<ResumenAnual />} />
            <Route path="/alertas"      element={<Alertas />} />
          </Routes>
        </main>

        <FinancialAdvisor />

        {/* Mobile nav v2 */}
        <nav className="mobile-nav">
          <NavLink to="/"          end className={({ isActive }) => isActive ? 'active' : ''}>
            <Home size={20} />Hoy
          </NavLink>
          <NavLink to="/proyectos" className={({ isActive }) => isActive ? 'active' : ''}>
            <FolderKanban size={20} />Proyectos
          </NavLink>
          <NavLink to="/finanzas"  className={({ isActive }) => isActive ? 'active' : ''}>
            <TrendingUp size={20} />Finanzas
          </NavLink>
          <NavLink to="/resumen"   className={({ isActive }) => isActive ? 'active' : ''}>
            <BarChart2 size={20} />Resumen
          </NavLink>
          <button onClick={handleLogout}
            style={{ background: 'transparent', border: 'none', color: '#f56565', display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'pointer', gap: '0.2rem', fontSize: '0.65rem', fontWeight: 600 }}>
            <LogOut size={20} />Salir
          </button>
        </nav>
      </div>
    </Router>
  );
}

export default App;
