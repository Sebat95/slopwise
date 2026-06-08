import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { AuthProvider, useAuth } from './AuthContext';

const mockGetSession = vi.fn();
const mockSignIn = vi.fn();
const mockSignOut = vi.fn();
const mockOnSessionExpired = vi.fn();
const mockRenewServerSession = vi.fn();

vi.mock('../services/firebase', () => ({
  auth: {},
  authPersistenceReady: Promise.resolve()
}));

vi.mock('firebase/auth', () => ({
  onIdTokenChanged: vi.fn(() => () => {})
}));

vi.mock('../services/google-auth', () => ({
  signIn: () => mockSignIn(),
  signOut: () => mockSignOut(),
  getSession: () => mockGetSession(),
  onSessionExpired: (cb: () => void) => mockOnSessionExpired(cb),
  renewServerSession: () => mockRenewServerSession()
}));

function AuthConsumer() {
  const { isAuthenticated, isLoading } = useAuth();
  return (
    <div>
      <div data-testid="auth">{String(isAuthenticated)}</div>
      <div data-testid="loading">{String(isLoading)}</div>
    </div>
  );
}

describe('AuthProvider optimistic bootstrap', () => {
  beforeEach(() => {
    mockGetSession.mockReset();
    mockOnSessionExpired.mockImplementation(() => () => {});
    localStorage.removeItem('slopwise_spreadsheet_id');
  });

  afterEach(() => {
    localStorage.removeItem('slopwise_spreadsheet_id');
    vi.restoreAllMocks();
  });

  it('starts authenticated without loading when spreadsheet id exists', async () => {
    localStorage.setItem('slopwise_spreadsheet_id', 'sheet123');
    mockGetSession.mockResolvedValue({
      authenticated: true,
      user: { name: 'Test', email: 't@example.com', picture: '' }
    });

    render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>
    );

    expect(screen.getByTestId('auth')).toHaveTextContent('true');
    expect(screen.getByTestId('loading')).toHaveTextContent('false');

    await act(async () => {});
    expect(mockGetSession).toHaveBeenCalled();
  });

  it('revokes optimistic auth when background session check fails', async () => {
    localStorage.setItem('slopwise_spreadsheet_id', 'sheet123');
    mockGetSession.mockResolvedValue({ authenticated: false, user: null });

    render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>
    );

    expect(screen.getByTestId('auth')).toHaveTextContent('true');

    await act(async () => {});

    expect(screen.getByTestId('auth')).toHaveTextContent('false');
  });

  it('blocks on session check when no spreadsheet hint exists', async () => {
    mockGetSession.mockResolvedValue({ authenticated: false, user: null });

    render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>
    );

    expect(screen.getByTestId('loading')).toHaveTextContent('true');

    await act(async () => {});

    expect(screen.getByTestId('loading')).toHaveTextContent('false');
    expect(screen.getByTestId('auth')).toHaveTextContent('false');
  });
});
