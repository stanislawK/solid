import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

type User = {
  email: string;
  name: string;
  provider: string;
};

type AuthContextType = {
  user: User | null;
  token: string | null;
  isLoggedIn: boolean;
  isLoading: boolean;
  logout: () => void;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(localStorage.getItem('access_token'));
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check hash for access_token or error
    const hash = window.location.hash;
    if (hash) {
      const params = new URLSearchParams(hash.substring(1));
      const accessToken = params.get('access_token');
      const error = params.get('error');

      if (accessToken) {
        localStorage.setItem('access_token', accessToken);
        setToken(accessToken);
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
      } else if (error) {
        console.error('Login error:', error);
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
      }
    }
  }, []);

  useEffect(() => {
    if (!token) {
      setUser(null);
      setIsLoading(false);
      return;
    }

    // Fetch user profile
    fetch('/api/auth/me', {
      headers: {
        Authorization: `Bearer ${token}`
      }
    })
      .then(res => {
        if (!res.ok) {
          throw new Error('Unauthorized');
        }
        return res.json();
      })
      .then((data: User) => {
        setUser(data);
      })
      .catch((err) => {
        console.error('Failed to fetch user profile', err);
        setToken(null);
        localStorage.removeItem('access_token');
        setUser(null);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [token]);

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('access_token');
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoggedIn: !!user,
        isLoading,
        logout
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
