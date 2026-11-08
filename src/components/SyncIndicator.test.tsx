import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import SyncIndicator from './SyncIndicator';

const appState = vi.hoisted(() => ({
  isLoading: false,
  isSyncing: false,
  error: null as string | null,
  loadData: vi.fn()
}));

vi.mock('../contexts/AppContext', () => ({
  useApp: () => appState
}));

describe('SyncIndicator', () => {
  beforeEach(() => {
    appState.isLoading = false;
    appState.isSyncing = false;
    appState.error = null;
    appState.loadData.mockReset();
  });

  it('shows synced when there is nothing in flight', () => {
    render(<SyncIndicator />);
    expect(screen.getByText('Synced')).toBeInTheDocument();
  });

  it('exposes the sync error and reloads the sheet when tapped', () => {
    appState.error =
      'Google rejected that request. (Range exceeds grid limits)';
    render(<SyncIndicator />);

    const button = screen.getByRole('button', { name: 'Sync error' });
    expect(button).toHaveAttribute(
      'title',
      'Google rejected that request. (Range exceeds grid limits) (tap to refresh)'
    );

    button.click();
    expect(appState.loadData).toHaveBeenCalledTimes(1);
  });
});
