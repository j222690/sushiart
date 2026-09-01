import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { settings } from '../lib/api';

const StoreContext = createContext(null);

/**
 * Dados do restaurante que praticamente toda tela precisa: se está aberto,
 * horários, taxas por bairro e formas de pagamento ativas.
 */
export function StoreProvider({ children }) {
  const [restaurant, setRestaurant] = useState(null);
  const [hours, setHours] = useState([]);
  const [zones, setZones] = useState([]);
  const [methods, setMethods] = useState([]);
  const [isOpen, setIsOpen] = useState(true);
  const [closedReason, setClosedReason] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [r, h, z, m, open, motivo] = await Promise.all([
        settings.restaurant(),
        settings.hours(),
        settings.zones(),
        settings.paymentMethods(),
        settings.isOpen(),
        settings.closedReason(),
      ]);
      setRestaurant(r);
      setHours(h);
      setZones(z.filter((zone) => zone.active));
      setMethods(m);
      setIsOpen(open);
      setClosedReason(motivo);
    } catch {
      // Sem conexão: o app continua navegável, mas com o aviso de fechado.
      setIsOpen(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    // O status abre/fecha sozinho no horário — revalida de minuto em minuto
    // para o cliente não conseguir finalizar um pedido depois do fechamento.
    const timer = setInterval(() => {
      settings.isOpen().then(setIsOpen);
      settings.closedReason().then(setClosedReason);
    }, 60_000);
    return () => clearInterval(timer);
  }, [load]);

  const zoneFor = useCallback(
    (neighborhood) => {
      // NFD + remoção dos acentos combinantes: "São Cristóvão" casa com
      // "sao cristovao" digitado pelo cliente.
      const normalize = (s) =>
        String(s || '')
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .trim()
          .toLowerCase();
      return zones.find((z) => normalize(z.neighborhood) === normalize(neighborhood)) ?? null;
    },
    [zones]
  );

  return (
    <StoreContext.Provider
      value={{ restaurant, hours, zones, methods, isOpen, closedReason, loading, reload: load, zoneFor }}
    >
      {children}
    </StoreContext.Provider>
  );
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore precisa estar dentro de <StoreProvider>.');
  return ctx;
}
