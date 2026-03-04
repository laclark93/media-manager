import { useState, useEffect, useRef } from 'react';
import { fetchApi } from '../utils/api';

export function useIgnoredMismatches() {
  const [ignoredKeys, setIgnoredKeys] = useState<Set<string>>(new Set());
  const isLoadedRef = useRef(false);

  useEffect(() => {
    fetchApi<{ mismatches: string[] }>('/api/persistence/ignored')
      .then(data => {
        isLoadedRef.current = true;
        setIgnoredKeys(new Set(data.mismatches));
      })
      .catch(() => { isLoadedRef.current = true; });
  }, []);

  const ignoreItem = (key: string) => {
    setIgnoredKeys(prev => {
      const next = new Set([...prev, key]);
      fetchApi('/api/persistence/ignored/mismatches', {
        method: 'PUT',
        body: JSON.stringify([...next]),
      }).catch(() => {});
      return next;
    });
  };

  const restoreItem = (key: string) => {
    setIgnoredKeys(prev => {
      const next = new Set([...prev].filter(k => k !== key));
      fetchApi('/api/persistence/ignored/mismatches', {
        method: 'PUT',
        body: JSON.stringify([...next]),
      }).catch(() => {});
      return next;
    });
  };

  return { ignoredKeys, ignoreItem, restoreItem };
}
