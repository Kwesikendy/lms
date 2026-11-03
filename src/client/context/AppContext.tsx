import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import { apiRequest, setClientAuthToken, getClientAuthToken } from '../lib/api.js';
import type { User, PlatformSettings, Entitlement } from '../../shared/types.js';

interface ToastItem {
  id: string;
  type: 'success' | 'error' | 'info';
  title: string;
  message?: string;
}

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  link?: string | null;
  is_read: boolean;
  created_at: string;
}

interface Integrations {
  livekitConfigured: boolean;
  livekitEgressEnabled: boolean;
  paystackConfigured: boolean;
  hubtelConfigured: boolean;
  s3Configured: boolean;
}

interface AppContextValue {
  user: User | null;
  entitlements: Entitlement[];
  notifications: NotificationItem[];
  settings: PlatformSettings;
  integrations: Integrations;
  loadingAuth: boolean;
  refreshAuth: () => Promise<void>;
  refreshSettings: () => Promise<void>;
  loginWithToken: (token: string, user: User) => Promise<void>;
  logout: () => Promise<void>;
  notify: (toast: Omit<ToastItem, 'id'>) => void;
}

const defaultSettings: PlatformSettings = {
  org_name: 'Aether Academy',
  org_tagline: 'Practical technology courses, live classes and a digital library',
  support_email: 'admissions@aetheracademy.edu.gh',
  primary_currency: 'GHS',
  accent_color: '#D6431A',
  paystack_enabled: true,
  hubtel_enabled: true,
  livekit_enabled: true,
  allow_registration: true,
};

const AppContext = createContext<AppContextValue | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [entitlements, setEntitlements] = useState<Entitlement[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [settings, setSettings] = useState<PlatformSettings>(defaultSettings);
  const [integrations, setIntegrations] = useState<Integrations>({
    livekitConfigured: false,
    livekitEgressEnabled: false,
    paystackConfigured: false,
    hubtelConfigured: false,
    s3Configured: false,
  });
  const [loadingAuth, setLoadingAuth] = useState<boolean>(true);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    const list = timers.current;
    return () => list.forEach((t) => window.clearTimeout(t));
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const notify = useCallback(
    (toast: Omit<ToastItem, 'id'>) => {
      const id = Math.random().toString(36).slice(2, 9);
      setToasts((prev) => [...prev.slice(-3), { ...toast, id }]);
      timers.current.push(window.setTimeout(() => dismiss(id), toast.type === 'error' ? 6500 : 4200));
    },
    [dismiss]
  );

  const refreshSettings = useCallback(async () => {
    try {
      const data = await apiRequest<{ settings: PlatformSettings; integrations: Integrations }>(
        '/api/catalog/settings'
      );
      if (data.settings) setSettings(data.settings);
      if (data.integrations) setIntegrations(data.integrations);
    } catch {
      // keep defaults if the API is unreachable
    }
  }, []);

  const refreshAuth = useCallback(async () => {
    const token = getClientAuthToken();
    if (!token) {
      setUser(null);
      setEntitlements([]);
      setNotifications([]);
      setLoadingAuth(false);
      return;
    }
    try {
      const data = await apiRequest<{
        user: User;
        entitlements: Entitlement[];
        notifications: NotificationItem[];
      }>('/api/auth/me');
      setUser(data.user);
      setEntitlements(data.entitlements || []);
      setNotifications(data.notifications || []);
    } catch (err: unknown) {
      const status = (err as { status?: number })?.status;
      // ONLY invalidate credentials if the server explicitly returns 401 Unauthorized
      if (status === 401) {
        setUser(null);
        setEntitlements([]);
        setNotifications([]);
        setClientAuthToken(null);
      }
    } finally {
      setLoadingAuth(false);
    }
  }, []);

  useEffect(() => {
    refreshSettings();
    refreshAuth();
  }, [refreshSettings, refreshAuth]);

  const loginWithToken = useCallback(
    async (token: string, loggedInUser: User) => {
      setClientAuthToken(token);
      setUser(loggedInUser);
      try {
        const data = await apiRequest<{
          user: User;
          entitlements: Entitlement[];
          notifications: NotificationItem[];
        }>('/api/auth/me');
        if (data.user) setUser(data.user);
        if (data.entitlements) setEntitlements(data.entitlements);
        if (data.notifications) setNotifications(data.notifications);
      } catch {
        // Retain loggedInUser even if entitlements call experiences network delay
      }
    },
    []
  );

  const logout = useCallback(async () => {
    try {
      await apiRequest('/api/auth/signout', { method: 'POST' });
    } catch {
      // cookie may already be gone
    }
    setClientAuthToken(null);
    setUser(null);
    setEntitlements([]);
    setNotifications([]);
    notify({ type: 'info', title: 'Signed out' });
  }, [notify]);

  const icons = {
    success: <CheckCircle2 className="size-5 text-[#5bd08f]" />,
    error: <AlertCircle className="size-5 text-[#ff8a7e]" />,
    info: <Info className="size-5 text-[#9cc4ea]" />,
  };

  return (
    <AppContext.Provider
      value={{
        user,
        entitlements,
        notifications,
        settings,
        integrations,
        loadingAuth,
        refreshAuth,
        refreshSettings,
        loginWithToken,
        logout,
        notify,
      }}
    >
      {children}

      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed inset-x-0 bottom-24 z-[80] flex flex-col items-center gap-2 px-4 lg:bottom-6"
      >
        <AnimatePresence initial={false}>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.97 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className="pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-2xl bg-[#16171c] px-4 py-3.5 text-white shadow-lift ring-1 ring-white/10"
            >
              <span className="mt-0.5 shrink-0">{icons[t.type]}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{t.title}</p>
                {t.message && <p className="mt-0.5 text-[13px] text-white/65">{t.message}</p>}
              </div>
              <button
                type="button"
                aria-label="Dismiss"
                onClick={() => dismiss(t.id)}
                className="-mr-1 grid size-7 shrink-0 place-items-center rounded-full text-white/50 transition-colors hover:bg-white/10 hover:text-white"
              >
                <X className="size-4" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </AppContext.Provider>
  );
};

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
