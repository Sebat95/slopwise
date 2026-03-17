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
    isAuthenticated: isTokenValid(),
    isLoading: true, // Start loading to check Firebase state
    error: null
  });

  // Listen to Firebase Auth state
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        // User is logged into Firebase.
        // We still need to check if the Google Access Token for Sheets API is valid.
        if (isTokenValid()) {
          setState({ isAuthenticated: true, isLoading: false, error: null });
        } else {
          // Token expired, but user is known. Try to refresh or prompt.
          refreshToken()
            .then(() => {
              setState({
                isAuthenticated: true,
                isLoading: false,
                error: null
              });
            })
            .catch(() => {
              // Silent refresh failed (common in PWAs). User needs to interact.
              setState({
                isAuthenticated: false,
                isLoading: false,
                error: null
              });
            });
        }
      } else {
        // No Firebase user
        setState({ isAuthenticated: false, isLoading: false, error: null });
      }
    });

    return () => unsubscribe();
  }, []);

  // Periodic check: if token expires while app is open, we can't silently refresh
  // easily in a PWA with Firebase without user interaction, but we can update state.
  useEffect(() => {
    const interval = setInterval(() => {
      if (state.isAuthenticated && !isTokenValid()) {
        setState((s) => ({ ...s, isAuthenticated: false }));
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
