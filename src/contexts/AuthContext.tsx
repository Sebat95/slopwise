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
  refreshToken,
  clearToken
} from '../services/google-auth';
import { auth } from '../services/firebase';
import { onAuthStateChanged } from 'firebase/auth';

interface AuthState {
  isAuthenticated: boolean;
  needsReconnect: boolean;
  isLoading: boolean;
  error: string | null;
}

interface AuthContextValue extends AuthState {
  login: () => Promise<void>;
  reconnect: () => Promise<void>;
  logout: () => Promise<void>;
  accessToken: string | null;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    isAuthenticated: false,
    needsReconnect: false,
    isLoading: true,
    error: null
  });

  // Firebase auth state listener — this is the source of truth for login state.
  // Firebase sessions persist across app restarts via IndexedDB.
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        // Firebase says we're logged in
        if (isTokenValid()) {
          // Access token still valid
          setState({
            isAuthenticated: true,
            needsReconnect: false,
            isLoading: false,
            error: null
          });
        } else {
          // Firebase session alive but access token expired —
          // user is still "authenticated", just needs to tap reconnect
          setState({
            isAuthenticated: true,
            needsReconnect: true,
            isLoading: false,
            error: null
          });
        }
      } else {
        // No Firebase user — truly logged out
        clearToken();
        setState({
          isAuthenticated: false,
          needsReconnect: false,
          isLoading: false,
          error: null
        });
      }
    });

    return () => unsubscribe();
  }, []);

  // Periodic check: detect token expiry while app is open
  useEffect(() => {
    const interval = setInterval(() => {
      if (state.isAuthenticated && !state.needsReconnect && !isTokenValid()) {
        setState((s) => ({ ...s, needsReconnect: true }));
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [state.isAuthenticated, state.needsReconnect]);

  const login = useCallback(async () => {
    setState((s) => ({ ...s, isLoading: true, error: null }));
    try {
      await signIn();
      setState({
        isAuthenticated: true,
        needsReconnect: false,
        isLoading: false,
        error: null
      });
    } catch (err) {
      setState({
        isAuthenticated: false,
        needsReconnect: false,
        isLoading: false,
        error: err instanceof Error ? err.message : 'Sign-in failed'
      });
    }
  }, []);

  // Reconnect: get a fresh access token (requires user tap for popup)
  const reconnect = useCallback(async () => {
    setState((s) => ({ ...s, isLoading: true, error: null }));
    try {
      await refreshToken();
      setState((s) => ({
        ...s,
        needsReconnect: false,
        isLoading: false,
        error: null
      }));
    } catch (err) {
      setState((s) => ({
        ...s,
        isLoading: false,
        error: err instanceof Error ? err.message : 'Reconnect failed'
      }));
    }
  }, []);

  const logout = useCallback(async () => {
    await authSignOut();
    setState({
      isAuthenticated: false,
      needsReconnect: false,
      isLoading: false,
      error: null
    });
    localStorage.removeItem('slopwise_spreadsheet_id');
    localStorage.removeItem('slopwise_spreadsheet_name');
  }, []);

  return (
    <AuthContext.Provider
      value={{
        ...state,
        login,
        reconnect,
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
