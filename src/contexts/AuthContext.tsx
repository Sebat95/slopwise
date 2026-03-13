import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode
} from 'react';
import {
  signIn,
  signOut as authSignOut,
  isTokenValid,
  getAccessToken,
  refreshToken
} from '../services/google-auth';

interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  clientId: string;
}

interface AuthContextValue extends AuthState {
  setClientId: (id: string) => void;
  login: () => Promise<void>;
  logout: () => void;
  accessToken: string | null;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const CLIENT_ID_KEY = 'slopwise_client_id';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    isAuthenticated: isTokenValid(),
    isLoading: false,
    error: null,
    clientId:
      localStorage.getItem(CLIENT_ID_KEY) ||
      import.meta.env.VITE_GOOGLE_CLIENT_ID ||
      ''
  });

  useEffect(() => {
    let refreshing = false;
    const interval = setInterval(async () => {
      if (!state.isAuthenticated || isTokenValid() || refreshing) return;
      refreshing = true;
      try {
        await refreshToken(state.clientId);
        setState((s) => ({ ...s, isAuthenticated: true }));
      } catch {
        setState((s) => ({ ...s, isAuthenticated: false }));
      } finally {
        refreshing = false;
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [state.isAuthenticated, state.clientId]);

  const setClientId = useCallback((id: string) => {
    localStorage.setItem(CLIENT_ID_KEY, id);
    setState((s) => ({ ...s, clientId: id }));
  }, []);

  const login = useCallback(async () => {
    if (!state.clientId) {
      setState((s) => ({
        ...s,
        error: 'Please enter a Google OAuth Client ID'
      }));
      return;
    }
    setState((s) => ({ ...s, isLoading: true, error: null }));
    try {
      await signIn(state.clientId);
      setState((s) => ({ ...s, isAuthenticated: true, isLoading: false }));
    } catch (err) {
      setState((s) => ({
        ...s,
        isLoading: false,
        error: err instanceof Error ? err.message : 'Sign-in failed'
      }));
    }
  }, [state.clientId]);

  const logout = useCallback(() => {
    authSignOut();
    setState((s) => ({ ...s, isAuthenticated: false }));
    localStorage.removeItem('slopwise_spreadsheet_id');
    localStorage.removeItem('slopwise_spreadsheet_name');
  }, []);

  return (
    <AuthContext.Provider
      value={{
        ...state,
        setClientId,
        login,
        logout,
        accessToken: getAccessToken()
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
