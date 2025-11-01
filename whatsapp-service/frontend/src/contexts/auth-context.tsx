'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, authHelpers, APIError } from '@/lib/api';

interface User {
  phone: string;
  role: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  error: string | null;
  login: (token: string, user: User) => void;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      if (!authHelpers.isAuthenticated()) {
        setLoading(false);
        return;
      }

      const data = await api.auth.getMe();
      setUser(data.user);
      setError(null);
    } catch (err) {
      if (err instanceof APIError && err.status === 401) {
        authHelpers.clearAuth();
        setUser(null);
      } else {
        setError(err instanceof Error ? err.message : 'Failed to authenticate');
      }
    } finally {
      setLoading(false);
    }
  };

  const login = (token: string, userData: User) => {
    localStorage.setItem('auth_token', token);
    localStorage.setItem('user_phone', userData.phone);
    localStorage.setItem('user_role', userData.role);
    setUser(userData);
    setError(null);
  };

  const logout = async () => {
    try {
      await api.auth.logout();
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      authHelpers.clearAuth();
      setUser(null);
      router.push('/login');
    }
  };

  const refreshUser = async () => {
    await checkAuth();
  };

  return (
    <AuthContext.Provider value={{ user, loading, error, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}