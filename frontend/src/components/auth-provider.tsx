import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

import { SESSION_EXPIRED_EVENT, apiFetch, refreshAuthSession } from '@/lib/api';

type User = {
  email: string;
  name: string;
  picture?: string | null;
  provider: string;
  is_active: boolean;
  is_admin: boolean;
};

type AuthContextType = {
  user: User | null;
  isLoggedIn: boolean;
  isLoading: boolean;
  logout: () => Promise<void>;
  refreshSession: () => Promise<boolean>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const error = params.get('auth_error');

    if (!error) {
      return;
    }

    console.error('Login error:', error);
    params.delete('auth_error');
    const nextSearch = params.toString();
    const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}${window.location.hash}`;
    window.history.replaceState(null, '', nextUrl);
  }, []);

  useEffect(() => {
    let isCancelled = false;

    const syncUser = async () => {
      setIsLoading(true);

      try {
        const response = await apiFetch('/api/auth/me', {}, { notifyOnUnauthorized: false });

        if (response.status === 401) {
          if (!isCancelled) {
            setUser(null);
          }
          return;
        }

        if (!response.ok) {
          throw new Error('Failed to fetch user profile');
        }

        const data = (await response.json()) as User;
        if (!isCancelled) {
          setUser(data);
        }
      } catch (err) {
        console.error('Failed to fetch user profile', err);
        if (!isCancelled) {
          setUser(null);
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    };

    void syncUser();

    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    const handleSessionExpired = () => {
      setUser(null);
      setIsLoading(false);
    };

    window.addEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);
    return () => {
      window.removeEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);
    };
  }, []);

  const refreshSession = async () => {
    const refreshed = await refreshAuthSession();
    if (!refreshed) {
      setUser(null);
      return false;
    }

    try {
      const response = await apiFetch('/api/auth/me', {}, { retryOnUnauthorized: false, notifyOnUnauthorized: false });
      if (!response.ok) {
        setUser(null);
        return false;
      }

      const data = (await response.json()) as User;
      setUser(data);
      return true;
    } catch (error) {
      console.error('Failed to reload user profile after refresh', error);
      setUser(null);
      return false;
    }
  };

  const logout = async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' }, { retryOnUnauthorized: false, notifyOnUnauthorized: false });
    } catch (error) {
      console.error('Failed to log out cleanly', error);
    } finally {
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoggedIn: !!user,
        isLoading,
        logout,
        refreshSession
      }}
    >
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
