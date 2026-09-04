import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import Toast from '../components/ui/Toast';

/**
 * Short confirmations — "Booking requested", "Appointment cancelled".
 *
 * One `<Toast>` is mounted at the app root and every screen calls
 * `toast.success(...)`. Screens do not mount their own, which is what stops
 * two from stacking when a screen navigates while one is still on screen —
 * the most common way an ad-hoc toast implementation goes wrong.
 *
 * A toast is for something that SUCCEEDED and needs no action. Errors that
 * need a decision belong in an `ErrorState` or beside the field that caused
 * them, where they stay put; a message that disappears after three seconds is
 * the wrong shape for something the user has to act on.
 */
const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null);

  const show = useCallback((message, tone = 'info', duration) => {
    // The key forces a remount, so a second toast arriving while the first is
    // visible restarts the animation and the timer instead of being swallowed.
    setToast({ key: Date.now(), message, tone, duration });
  }, []);

  const value = useMemo(
    () => ({
      show,
      success: (message, duration) => show(message, 'success', duration),
      error: (message, duration) => show(message, 'error', duration),
      info: (message, duration) => show(message, 'info', duration),
      dismiss: () => setToast(null),
    }),
    [show],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <Toast key={toast?.key} toast={toast} onDismiss={() => setToast(null)} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}
