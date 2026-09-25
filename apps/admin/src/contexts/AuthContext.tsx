import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { apiFetch, setAccessToken } from '../lib/api';

export type AdminUser = {
  id: string;
  email: string;
  name: string;
  role: 'OWNER' | 'MANAGER' | 'KITCHEN' | 'CASHIER';
  totpEnabled?: boolean;
};

type AuthContextValue = {
  admin: AdminUser | null;
  loading: boolean;
  login: (email: string, password: string, totpCode?: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [admin, setAdmin] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const refreshed = await apiFetch<{
          accessToken: string;
          admin: { id: string; email: string; role: AdminUser['role'] };
        }>('/api/admin/auth/refresh', { method: 'POST' });
        setAccessToken(refreshed.accessToken);
        const me = await apiFetch<{ admin: AdminUser }>('/api/admin/auth/me');
        if (!cancelled) setAdmin(me.admin);
      } catch {
        setAccessToken(null);
        if (!cancelled) setAdmin(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string, totpCode?: string) => {
    const data = await apiFetch<{ accessToken: string; admin: AdminUser }>(
      '/api/admin/auth/login',
      {
        method: 'POST',
        body: { email, password, totpCode },
      },
    );
    setAccessToken(data.accessToken);
    setAdmin(data.admin);
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiFetch<void>('/api/admin/auth/logout', { method: 'POST' });
    } finally {
      setAccessToken(null);
      setAdmin(null);
    }
  }, []);

  const value = useMemo(() => ({ admin, loading, login, logout }), [admin, loading, login, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
