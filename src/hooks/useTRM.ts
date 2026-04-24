import { useState, useEffect } from 'react';

export function useTRM() {
  // Ponemos un fallback seguro aproximado en caso de que la API falle
  const [trm, setTrm] = useState<number>(4000); 
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Usamos una API gratuita y pública de tasas de cambio
    fetch('https://open.er-api.com/v6/latest/USD')
      .then(res => res.json())
      .then(data => {
        if (data && data.rates && data.rates.COP) {
          setTrm(data.rates.COP);
        }
        setLoading(false);
      })
      .catch(err => {
        console.error("Error fetching TRM", err);
        setLoading(false);
      });
  }, []);

  return { trm, loadingTRM: loading };
}
