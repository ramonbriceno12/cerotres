import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'cerotres-admin-sidebar-expanded';

export function useSidebarState() {
  const [expanded, setExpandedState] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(STORAGE_KEY) === 'true';
  });

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, String(expanded));
  }, [expanded]);

  const toggle = useCallback(() => {
    setExpandedState((prev) => !prev);
  }, []);

  const collapse = useCallback(() => {
    setExpandedState(false);
  }, []);

  const expand = useCallback(() => {
    setExpandedState(true);
  }, []);

  return { expanded, toggle, collapse, expand };
}
