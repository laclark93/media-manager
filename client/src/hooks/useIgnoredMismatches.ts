import { useState } from 'react';

const STORAGE_KEY = 'mmd_ignored_mismatches';

function loadIgnored(): Set<string> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return new Set(stored ? JSON.parse(stored) : []);
  } catch {
    return new Set();
  }
}

export function useIgnoredMismatches() {
  const [ignoredKeys, setIgnoredKeys] = useState<Set<string>>(loadIgnored);

  const ignoreItem = (key: string) => {
    setIgnoredKeys(prev => {
      const next = new Set([...prev, key]);
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
      return next;
    });
  };

  const restoreItem = (key: string) => {
    setIgnoredKeys(prev => {
      const next = new Set([...prev].filter(k => k !== key));
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
      return next;
    });
  };

  return { ignoredKeys, ignoreItem, restoreItem };
}
