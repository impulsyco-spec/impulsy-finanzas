import React, { useState, useEffect } from 'react';
import { Lock, ArrowRight, ShieldCheck } from 'lucide-react';

interface LoginProps {
  onLogin: (password: string) => void;
}

export const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);

  useEffect(() => {
    // Enforce pure white background for the entire document while on the login page
    const originalBg = document.body.style.backgroundColor;
    const originalHtmlBg = document.documentElement.style.backgroundColor;
    document.body.style.backgroundColor = '#ffffff';
    document.documentElement.style.backgroundColor = '#ffffff';
    
    return () => {
      document.body.style.backgroundColor = originalBg;
      document.documentElement.style.backgroundColor = originalHtmlBg;
    };
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password.trim() === '') return;
    
    // El password correcto asume ser 'Impulsy2026*' o lo que configuremos luego
    if (password === (import.meta.env.VITE_ADMIN_PASSWORD || 'Impulsy2026*')) {
      setError(false);
      onLogin(password);
    } else {
      setError(true);
      setPassword('');
    }
  };

  return (
    <div className="login-page-wrapper" style={{ minHeight: '100vh', width: '100vw', display: 'flex', justifyContent: 'center', alignItems: 'center', backgroundColor: '#ffffff', color: '#111111', fontFamily: 'var(--font-base)', padding: '1rem' }}>
      <style>{`
        .login-inner-container {
          display: flex;
          width: 100%;
          max-width: 1100px;
          min-height: 600px;
          background: #ffffff;
        }
        @media (max-width: 850px) {
          .login-inner-container {
            flex-direction: column !important;
            height: auto !important;
          }
          .login-left {
            padding: 3rem 1.5rem !important;
            text-align: center;
            align-items: center;
          }
          .z-index-content {
             align-items: center !important;
          }
          .login-right {
            padding: 2rem 1rem !important;
          }
          .brand-logo {
            width: 200px !important;
            margin: 0 auto 1.5rem !important;
          }
          .brand-text {
            font-size: 1.1rem !important;
            margin: 0 auto !important;
          }
          .security-tag {
            margin-top: 2rem !important;
            justify-content: center;
          }
        }
      `}</style>
      
      <div className="login-inner-container">
        {/* Left Column - Brand */}
        <div className="login-left" style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '3rem', background: '#ffffff', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: '-10%', left: '-10%', width: '400px', height: '400px', background: 'radial-gradient(circle, rgba(0,0,0,0.005) 0%, rgba(255,255,255,0) 70%)', borderRadius: '50%' }}></div>
          
          <div className="z-index-content" style={{ zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
            <img 
              src="/assets/logo.jpg" 
              alt="Impulsy" 
              className="brand-logo"
              style={{ width: '280px', height: 'auto', marginBottom: '2.5rem' }} 
            />
            <h1 style={{ fontSize: '1.5rem', fontWeight: 600, color: '#111', marginBottom: '1rem' }}>Impulsy Control</h1>
            <p className="brand-text" style={{ fontSize: '1.15rem', color: '#4a5568', maxWidth: '380px', lineHeight: 1.6 }}>
              Sistema central de gestión financiera y control de cartera.
            </p>
            
            <div className="security-tag" style={{ marginTop: '3.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#a0aec0', fontSize: '0.85rem' }}>
              <ShieldCheck size={18} />
              Acceso encriptado y restringido.
            </div>
          </div>
        </div>

        {/* Right Column - Login Form */}
        <div className="login-right" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '3rem' }}>
          <div style={{ width: '100%', maxWidth: '360px' }}>
            <div style={{ marginBottom: '2.5rem', textAlign: 'center' }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '60px', height: '60px', borderRadius: '18px', backgroundColor: '#f8fafc', color: '#111111', marginBottom: '1.25rem', border: '1px solid #e2e8f0' }}>
                <Lock size={28} />
              </div>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#111111', marginBottom: '0.5rem' }}>Acceso Autorizado</h2>
              <p style={{ color: '#64748b', fontSize: '0.9rem' }}>Ingresa tu llave maestra de administrador.</p>
            </div>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#64748b', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Llave Maestra
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(false); }}
                  autoFocus
                  placeholder="••••••••••••"
                  style={{ 
                    width: '100%', 
                    padding: '0.875rem 1rem', 
                    backgroundColor: '#ffffff', 
                    border: `1.5px solid ${error ? '#ef4444' : '#e2e8f0'}`, 
                    borderRadius: '10px', 
                    color: '#111111', 
                    fontSize: '1rem',
                    outline: 'none',
                    transition: 'border-color 0.2s ease'
                  }}
                />
                {error && (
                  <p style={{ color: '#ef4444', fontSize: '0.8rem', marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <AlertCircle size={14} /> Llave incorrecta.
                  </p>
                )}
              </div>

              <button
                type="submit"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem',
                  width: '100%',
                  padding: '1rem',
                  backgroundColor: '#000000',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '10px',
                  fontSize: '1rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'background-color 0.2s ease',
                  marginTop: '0.5rem'
                }}
                onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#1a1a1a')}
                onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#000000')}
              >
                Ingresar al Sistema <ArrowRight size={18} />
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

const AlertCircle = ({ size }: { size: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"></circle>
    <line x1="12" y1="8" x2="12" y2="12"></line>
    <line x1="12" y1="16" x2="12.01" y2="16"></line>
  </svg>
);
