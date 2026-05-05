import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode
} from 'react';
import type { GoogleUserProfile } from '../types';
import {
  signIn,
  signOut as authSignOut,
  getSession,
  onSessionExpired
} from '../services/google-auth';

interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  user: GoogleUserProfile | null;
}

interface AuthContextValue extends AuthState {
  login: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    isAuthenticated: false,
    isLoading: true,
    error: null,
    user: null
  });

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const session = await getSession();
        if (cancelled) return;
        setState({
          isAuthenticated: session.authenticated,
          isLoading: false,
          error: null,
          user: session.user
        });
      } catch {
        if (cancelled) return;
        setState({
          isAuthenticated: false,
          isLoading: false,
          error: null,
          user: null
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return onSessionExpired(() => {
      setState({
        isAuthenticated: false,
        isLoading: false,
        error: null,
        user: null
      });
    });
  }, []);

  const login = useCallback(async () => {
    setState((s) => ({ ...s, isLoading: true, error: null }));
    try {
      await signIn();
      const session = await getSession();
      if (!session.authenticated) {
        throw new Error('Secure session was not established');
      }
      setState({
        isAuthenticated: true,
        isLoading: false,
        error: null,
        user: session.user
      });
    } catch (err) {
      setState({
        isAuthenticated: false,
        isLoading: false,
        error: err instanceof Error ? err.message : 'Sign-in failed',
        user: null
      });
    }
  }, []);

  const logout = useCallback(async () => {
    await authSignOut();
    setState({
      isAuthenticated: false,
      isLoading: false,
      error: null,
      user: null
    });
    localStorage.removeItem('slopwise_spreadsheet_id');
    localStorage.removeItem('slopwise_spreadsheet_name');
  }, []);

  return (
    <AuthContext.Provider
      value={{
        ...state,
        login,
        logout
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
