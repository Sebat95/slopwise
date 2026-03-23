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
  isLoading: boolean;
  error: string | null;
}

interface AuthContextValue extends AuthState {
  login: () => Promise<void>;
  logout: () => Promise<void>;
  accessToken: string | null;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    isAuthenticated: false,
    isLoading: true,
    error: null
  });

  // Firebase auth state listener — source of truth for login state.
  // When Firebase has a user, silently refresh the Google access token
  // via the Cloud Function (no popup needed).
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        if (isTokenValid()) {
          setState({ isAuthenticated: true, isLoading: false, error: null });
        } else {
          // Firebase session alive, access token expired → silent refresh
          try {
            await refreshToken();
            setState({ isAuthenticated: true, isLoading: false, error: null });
          } catch (err) {
            const msg = err instanceof Error ? err.message : '';
            if (msg === 'no_refresh_token') {
              // First-time user or refresh token lost — need full sign-in
              clearToken();
              setState({ isAuthenticated: false, isLoading: false, error: null });
            } else {
              // Temporary failure (network etc.) — stay authenticated, retry later
              setState({ isAuthenticated: true, isLoading: false, error: null });
            }
          }
        }
      } else {
        clearToken();
        setState({ isAuthenticated: false, isLoading: false, error: null });
      }
    });

    return () => unsubscribe();
  }, []);

  // Periodic silent refresh when token expires while app is open
  useEffect(() => {
    let refreshing = false;
    const interval = setInterval(async () => {
      if (!state.isAuthenticated || isTokenValid() || refreshing) return;
      refreshing = true;
      try {
        await refreshToken();
      } catch {
        // Will retry on next interval
      } finally {
        refreshing = false;
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [state.isAuthenticated]);

  const login = useCallback(async () => {
    setState((s) => ({ ...s, isLoading: true, error: null }));
    try {
      await signIn();
      setState({ isAuthenticated: true, isLoading: false, error: null });
    } catch (err) {
      setState({
        isAuthenticated: false,
        isLoading: false,
        error: err instanceof Error ? err.message : 'Sign-in failed'
      });
    }
  }, []);

  const logout = useCallback(async () => {
    await authSignOut();
    setState({ isAuthenticated: false, isLoading: false, error: null });
    localStorage.removeItem('slopwise_spreadsheet_id');
    localStorage.removeItem('slopwise_spreadsheet_name');
  }, []);

  return (
    <AuthContext.Provider
      value={{
        ...state,
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
