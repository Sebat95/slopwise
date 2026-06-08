import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode
} from 'react';
import { onIdTokenChanged } from 'firebase/auth';
import type { GoogleUserProfile } from '../types';
import { auth, authPersistenceReady } from '../services/firebase';
import {
  signIn,
  signOut as authSignOut,
  getSession,
  onSessionExpired,
  renewServerSession
} from '../services/google-auth';

const SESSION_RENEW_DEBOUNCE_MS = 60_000;

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

function hasSpreadsheetHint(): boolean {
  return Boolean(localStorage.getItem('slopwise_spreadsheet_id'));
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const optimisticAuth = hasSpreadsheetHint();
  const [state, setState] = useState<AuthState>({
    isAuthenticated: optimisticAuth,
    isLoading: !optimisticAuth,
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

  useEffect(() => {
    if (!state.isAuthenticated) return;

    let debounceTimer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;
    let unsubscribeIdToken: (() => void) | undefined;

    const scheduleRenew = () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        if (cancelled) return;
        void renewServerSession().catch(() => {});
      }, SESSION_RENEW_DEBOUNCE_MS);
    };

    void (async () => {
      await authPersistenceReady;
      if (cancelled) return;
      unsubscribeIdToken = onIdTokenChanged(auth, (user) => {
        if (cancelled || !user) return;
        scheduleRenew();
      });
    })();

    return () => {
      cancelled = true;
      clearTimeout(debounceTimer);
      unsubscribeIdToken?.();
    };
  }, [state.isAuthenticated]);

  const login = useCallback(async () => {
    setState((s) => ({ ...s, isLoading: true, error: null }));
    try {
      await signIn();
      setState({
        isAuthenticated: true,
        isLoading: false,
        error: null,
        user: null
      });
      void getSession()
        .then((session) => {
          if (!session.authenticated) return;
          setState((s) =>
            s.isAuthenticated ? { ...s, user: session.user } : s
          );
        })
        .catch(() => {});
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
