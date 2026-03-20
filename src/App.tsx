import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { AppProvider, useApp } from './contexts/AppContext';
import LoginPage from './pages/LoginPage';
import SheetPickerPage from './pages/SheetPickerPage';
import DashboardPage from './pages/DashboardPage';
import ExpensesPage from './pages/ExpensesPage';
import AddExpensePage from './pages/AddExpensePage';
import BalancesPage from './pages/BalancesPage';
import SettingsPage from './pages/SettingsPage';
import LoadingSpinner from './components/LoadingSpinner';
import ReconnectBanner from './components/ReconnectBanner';

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return <LoadingSpinner text="Signing in..." />;
  if (!isAuthenticated) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function SheetGuard({ children }: { children: React.ReactNode }) {
  const { spreadsheetId } = useApp();
  if (!spreadsheetId) return <Navigate to="/sheets" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  const { isAuthenticated, isLoading } = useAuth();
  const { spreadsheetId } = useApp();

  return (
    <Routes>
      <Route
        path="/"
        element={
          isLoading ? (
            <LoadingSpinner text="Signing in..." />
          ) : isAuthenticated ? (
            spreadsheetId ? (
              <Navigate to="/dashboard" replace />
            ) : (
              <Navigate to="/sheets" replace />
            )
          ) : (
            <LoginPage />
          )
        }
      />
      <Route
        path="/sheets"
        element={
          <AuthGuard>
            <SheetPickerPage />
          </AuthGuard>
        }
      />
      <Route
        path="/dashboard"
        element={
          <AuthGuard>
            <SheetGuard>
              <DashboardPage />
            </SheetGuard>
          </AuthGuard>
        }
      />
      <Route
        path="/expenses"
        element={
          <AuthGuard>
            <SheetGuard>
              <ExpensesPage />
            </SheetGuard>
          </AuthGuard>
        }
      />
      <Route
        path="/add"
        element={
          <AuthGuard>
            <SheetGuard>
              <AddExpensePage />
            </SheetGuard>
          </AuthGuard>
        }
      />
      <Route
        path="/edit/:id"
        element={
          <AuthGuard>
            <SheetGuard>
              <AddExpensePage />
            </SheetGuard>
          </AuthGuard>
        }
      />
      <Route
        path="/stats"
        element={
          <AuthGuard>
            <SheetGuard>
              <BalancesPage />
            </SheetGuard>
          </AuthGuard>
        }
      />
      <Route
        path="/settings"
        element={
          <AuthGuard>
            <SheetGuard>
              <SettingsPage />
            </SheetGuard>
          </AuthGuard>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppProvider>
          <ReconnectBanner />
          <AppRoutes />
        </AppProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
