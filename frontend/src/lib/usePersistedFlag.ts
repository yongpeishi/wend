import { useCallback, useState } from 'react';

/**
 * A boolean UI flag remembered across visits, e.g. whether a panel is
 * collapsed. `[value, toggle]`: lazy-inits from localStorage, and `toggle`
 * flips the value and writes it back.
 *
 * Storage access is wrapped in try/catch — private windows can throw on any
 * localStorage call — so a broken store just means the flag falls back to
 * `defaultValue` and stops persisting; the toggle itself keeps working.
 * No cross-tab sync: each tab reads once and goes its own way.
 */
export function usePersistedFlag(
  storageKey: string,
  defaultValue: boolean,
): [boolean, () => void] {
  const [value, setValue] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored === 'true') return true;
      if (stored === 'false') return false;
    } catch {
      // Storage unavailable; fall through to the default.
    }
    return defaultValue;
  });

  const toggle = useCallback(() => {
    setValue((current) => {
      const next = !current;
      try {
        localStorage.setItem(storageKey, next ? 'true' : 'false');
      } catch {
        // Persisting is best-effort; the in-memory flag still flips.
      }
      return next;
    });
  }, [storageKey]);

  return [value, toggle];
}
