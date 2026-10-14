const TOKEN_KEY = 'servicenest_token';
const AUTH_KEY = 'servicenest_auth';

const publicProfile = (user) => {
  if (!user) return null;
  const {
    id, name, email, phone, address, role, created_at, providerProfile,
  } = user;
  return { id, name, email, phone, address, role, created_at, providerProfile };
};

export const readAuthSession = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(AUTH_KEY) || 'null');
    const token = saved?.token || localStorage.getItem(TOKEN_KEY);
    if (!token) return null;
    return { token, user: publicProfile(saved?.user) };
  } catch {
    localStorage.removeItem(AUTH_KEY);
    return null;
  }
};

export const saveAuthSession = (token, user) => {
  const session = { token, user: publicProfile(user) };
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(AUTH_KEY, JSON.stringify(session));
  window.dispatchEvent(new CustomEvent('servicenest:auth-session', { detail: session }));
  return session;
};

export const clearAuthSession = () => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(AUTH_KEY);
  window.dispatchEvent(new CustomEvent('servicenest:auth-session', { detail: null }));
};

export const loginPath = () => '/login';
