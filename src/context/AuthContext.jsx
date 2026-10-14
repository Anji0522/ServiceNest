import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { clearAuthSession, readAuthSession, saveAuthSession } from '../lib/auth-session';
import { AuthContext } from './auth-context';
import { repositoryPagesBasePath } from '../lib/routes';

export const AuthProvider = ({ children }) => {
  const [session, setSession] = useState(
    () => import.meta.env.VITE_STATIC_DEMO === 'true' ? null : readAuthSession(),
  );
  const [hydrated, setHydrated] = useState(
    () => import.meta.env.VITE_STATIC_DEMO === 'true'
      || !readAuthSession()
      || Boolean(readAuthSession()?.user),
  );

  useEffect(() => {
    const handleSession = (event) => setSession(event.detail);
    const handleStorage = (event) => {
      if (event.key === 'servicenest_auth' || event.key === 'servicenest_token') {
        setSession(readAuthSession());
      }
    };
    const handleExpired = () => {
      clearAuthSession();
      const basePath = repositoryPagesBasePath();
      window.history.replaceState(null, '', `${basePath}/login`);
      window.dispatchEvent(new PopStateEvent('popstate'));
    };
    window.addEventListener('servicenest:auth-session', handleSession);
    window.addEventListener('servicenest:auth-expired', handleExpired);
    window.addEventListener('storage', handleStorage);

    const saved = readAuthSession();
    if (import.meta.env.VITE_STATIC_DEMO === 'true') {
      clearAuthSession();
    } else if (saved) {
      api.getCurrentUser()
        .then((user) => saveAuthSession(saved.token, user))
        .catch((error) => {
          if ([401, 403].includes(error.cause?.response?.status)) clearAuthSession();
        })
        .finally(() => setHydrated(true));
    }

    return () => {
      window.removeEventListener('servicenest:auth-session', handleSession);
      window.removeEventListener('servicenest:auth-expired', handleExpired);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  const value = useMemo(() => ({
    token: session?.token || null,
    user: session?.user || null,
    hydrated,
    isLoading: !hydrated,
    login: (token, userData) => saveAuthSession(token, userData),
    setSession: saveAuthSession,
    clearSession: clearAuthSession,
    logout: api.logout,
  }), [session, hydrated]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
