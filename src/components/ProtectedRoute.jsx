import { useEffect } from 'react';
import { useAuth } from '../context/auth-context';
import { navigateToRoute } from '../lib/routes';

const ProtectedRoute = ({ allowedRoles, children }) => {
  const { user, hydrated } = useAuth();

  useEffect(() => {
    if (!hydrated) return;
    if (!user) {
      navigateToRoute('/login', true);
      return;
    }
    if (!allowedRoles.includes(user.role)) {
      navigateToRoute(user.role === 'provider' ? '/provider/dashboard' : '/customer/bookings', true);
    }
  }, [allowedRoles, hydrated, user]);

  if (!hydrated || !user || !allowedRoles.includes(user.role)) return null;
  return children;
};

export default ProtectedRoute;
