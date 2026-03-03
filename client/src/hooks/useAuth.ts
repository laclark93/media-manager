import { useState, useEffect, useCallback, createContext, useContext } from 'react';

const TOKEN_KEY = 'mmd_token';
const USERNAME_KEY = 'mmd_username';

export interface AuthState {
  token: string | null;
  username: string | null;
  configured: boolean | null; // null = loading
  login: (username: string, password: string) => Promise<void>;
  setup: (username: string, password: string) => Promise<void>;
  logout: () => void;
  changePassword: (currentPassword: string, newUsername: string, newPassword: string) => Promise<void>;
  refreshStatus: () => Promise<void>;
}

async function fetchAuthStatus(): Promise<boolean> {
  const res = await fetch('/api/auth/status');
  if (!res.ok) throw new Error('Failed to fetch auth status');
  const data = await res.json();
  return data.configured as boolean;
}

export function useAuthState(): AuthState {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [username, setUsername] = useState<string | null>(() => localStorage.getItem(USERNAME_KEY));
  const [configured, setConfigured] = useState<boolean | null>(null);

  const refreshStatus = useCallback(async () => {
    try {
      const isConfigured = await fetchAuthStatus();
      setConfigured(isConfigured);
    } catch {
      setConfigured(false);
    }
  }, []);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  // Any API call that receives a 401 fires this event — clear the session
  useEffect(() => {
    const handleUnauthorized = () => {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USERNAME_KEY);
      setToken(null);
      setUsername(null);
    };
    window.addEventListener('auth:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('auth:unauthorized', handleUnauthorized);
  }, []);

  const login = useCallback(async (user: string, password: string) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: user, password }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Login failed');
    }
    const data = await res.json();
    localStorage.setItem(TOKEN_KEY, data.token);
    localStorage.setItem(USERNAME_KEY, data.username);
    setToken(data.token);
    setUsername(data.username);
  }, []);

  const setup = useCallback(async (user: string, password: string) => {
    const res = await fetch('/api/auth/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: user, password }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Setup failed');
    }
    const data = await res.json();
    localStorage.setItem(TOKEN_KEY, data.token);
    localStorage.setItem(USERNAME_KEY, data.username);
    setToken(data.token);
    setUsername(data.username);
    setConfigured(true);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USERNAME_KEY);
    setToken(null);
    setUsername(null);
  }, []);

  const changePassword = useCallback(async (currentPassword: string, newUsername: string, newPassword: string) => {
    const currentToken = localStorage.getItem(TOKEN_KEY);
    const res = await fetch('/api/auth/change-password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${currentToken}`,
      },
      body: JSON.stringify({ currentPassword, newUsername, newPassword }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to change password');
    }
    const data = await res.json();
    localStorage.setItem(TOKEN_KEY, data.token);
    localStorage.setItem(USERNAME_KEY, data.username);
    setToken(data.token);
    setUsername(data.username);
  }, []);

  return { token, username, configured, login, setup, logout, changePassword, refreshStatus };
}

export const AuthContext = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthContext.Provider');
  return ctx;
}
