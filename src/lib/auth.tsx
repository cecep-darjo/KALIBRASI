import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { api, setToken, getToken, errorMessage } from './api';
import type { Profile, UserRole } from './types';

interface AuthResult {
  error: string | null;
}

interface AuthContextValue {
  user: Profile | null;
  profile: Profile | null;
  loading: boolean;
  signIn: (username: string, password: string) => Promise<AuthResult>;
  signUp: (
    username: string,
    password: string,
    fullName: string,
    email: string,
    role: UserRole
  ) => Promise<AuthResult>;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  /* Pulihkan sesi dari token yang tersimpan saat aplikasi dimuat. */
  useEffect(() => {
    if (!getToken()) {
      setLoading(false);
      return;
    }

    let active = true;
    api<Profile>('/auth/me')
      .then((me) => {
        if (active) setProfile(me);
      })
      .catch(() => {
        // Token kedaluwarsa atau tidak valid — bersihkan.
        setToken(null);
        if (active) setProfile(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const signIn = useCallback(async (username: string, password: string): Promise<AuthResult> => {
    try {
      const res = await api<{ token: string; user: Profile }>('/auth/login', {
        method: 'POST',
        body: { username, password },
      });
      setToken(res.token);
      setProfile(res.user);
      return { error: null };
    } catch (err) {
      return { error: errorMessage(err) };
    }
  }, []);

  const signUp = useCallback(async (
    username: string,
    password: string,
    fullName: string,
    email: string,
    role: UserRole
  ): Promise<AuthResult> => {
    try {
      const res = await api<{ token: string; user: Profile }>('/auth/register', {
        method: 'POST',
        body: { username, password, full_name: fullName, email, role },
      });
      setToken(res.token);
      setProfile(res.user);
      return { error: null };
    } catch (err) {
      return { error: errorMessage(err) };
    }
  }, []);

  const signOut = useCallback(() => {
    setToken(null);
    setProfile(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{ user: profile, profile, loading, signIn, signUp, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
