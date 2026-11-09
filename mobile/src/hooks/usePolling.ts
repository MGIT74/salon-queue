// Hook de polling (le web rafraîchit toutes les 4 s — même cadence ici).
// IMPORTANT : passer `fetcher` via useCallback (deps [salonSlug, token]) —
// une fonction recréée à chaque rendu ferait tourner l'effet en boucle.
import { useCallback, useEffect, useRef, useState } from 'react';

export type UsePollingResult<T> = {
  data: T | null;
  error: unknown;
  loading: boolean;
  /** Rechargement immédiat (pull-to-refresh, après une action). */
  reload: () => void;
};

export function usePolling<T>(fetcher: () => Promise<T>, intervalMs = 4000, immediate = true): UsePollingResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(Boolean(immediate));
  const inFlight = useRef(false);

  const tick = useCallback(
    async (withSpinner: boolean) => {
      if (inFlight.current) return;
      inFlight.current = true;
      if (withSpinner) setLoading(true);
      try {
        const result = await fetcher();
        setData(result);
        setError(null);
      } catch (err) {
        setError(err);
      } finally {
        inFlight.current = false;
        setLoading(false);
      }
    },
    [fetcher]
  );

  useEffect(() => {
    if (immediate) void tick(true);
    const id = setInterval(() => void tick(false), intervalMs);
    return () => clearInterval(id);
  }, [tick, intervalMs, immediate]);

  const reload = useCallback(() => void tick(true), [tick]);

  return { data, error, loading, reload };
}
