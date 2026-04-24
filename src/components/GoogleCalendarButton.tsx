import React, { useState, useEffect } from 'react';
import { CalendarCheck, CalendarX } from 'lucide-react';
import { isGCalConnected, getGCalToken, disconnectGCal } from '../hooks/useGoogleCalendar';

interface Props {
  onConnectionChange?: (connected: boolean) => void;
}

export const GoogleCalendarButton: React.FC<Props> = ({ onConnectionChange }) => {
  const [connected, setConnected] = useState(isGCalConnected());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setConnected(isGCalConnected());
  }, []);

  const handleConnect = async () => {
    setLoading(true);
    try {
      await getGCalToken();
      setConnected(true);
      onConnectionChange?.(true);
    } catch (err) {
      alert('No se pudo conectar con Google Calendar. Intenta de nuevo.');
    }
    setLoading(false);
  };

  const handleDisconnect = () => {
    disconnectGCal();
    setConnected(false);
    onConnectionChange?.(false);
  };

  if (connected) {
    return (
      <button
        onClick={handleDisconnect}
        title="Desconectar Google Calendar"
        className="btn btn-outline"
        style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', padding: '0.4rem 0.8rem', color: '#68d391', borderColor: '#68d391' }}
      >
        <CalendarCheck size={15} />
        Calendar Conectado
      </button>
    );
  }

  return (
    <button
      onClick={handleConnect}
      disabled={loading}
      className="btn btn-outline"
      style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', padding: '0.4rem 0.8rem' }}
    >
      <CalendarX size={15} />
      {loading ? 'Conectando...' : 'Conectar Google Calendar'}
    </button>
  );
};
