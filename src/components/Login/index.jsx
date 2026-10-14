import { useCallback, useEffect, useState } from 'react';
import { api, categories } from '../../lib/api';
import './index.css';

const Login = ({ initialRole = 'customer', onClose, onAuthenticated }) => {
  const [mode, setMode] = useState('login');
  const [role, setRole] = useState(initialRole);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serviceStatus, setServiceStatus] = useState('checking');

  const checkService = useCallback(async (showChecking = true) => {
    if (showChecking) setServiceStatus('checking');
    try {
      const available = await api.checkAccountService();
      setServiceStatus(available ? 'available' : 'unavailable');
    } catch {
      setServiceStatus('unavailable');
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    api.checkAccountService()
      .then((available) => {
        if (mounted) setServiceStatus(available ? 'available' : 'unavailable');
      })
      .catch(() => {
        if (mounted) setServiceStatus('unavailable');
      });
    return () => {
      mounted = false;
    };
  }, []);

  const retryServiceCheck = useCallback(() => {
    checkService();
  }, [checkService]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (serviceStatus !== 'available') return;
    setError('');
    setIsSubmitting(true);
    const form = new FormData(event.currentTarget);
    const details = Object.fromEntries(form.entries());
    try {
      const user = mode === 'register'
        ? await api.register({
          ...details,
          role,
          categoryId: Number(details.categoryId),
          hourlyRate: Number(details.hourlyRate),
        })
        : await api.login({ email: details.email, password: details.password });
      onAuthenticated(user);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="account-overlay" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="account-dialog" role="dialog" aria-modal="true" aria-labelledby="account-title">
        <button className="dialog-close" type="button" onClick={onClose} aria-label="Close sign in">×</button>
        <p className="dialog-eyebrow">SERVICENEST ACCOUNT</p>
        <h2 id="account-title">{mode === 'login' ? 'Welcome back' : 'Create your account'}</h2>
        <p className="dialog-description">
          {mode === 'login' ? 'Sign in to manage your services and bookings.' : 'Join the local home-services network.'}
        </p>
        {serviceStatus !== 'available' && (
          <div className="account-unavailable" role="status">
            {serviceStatus === 'checking'
              ? 'Checking the account service…'
              : 'The account service is not connected. Sign-in and account creation will work once the API is deployed and VITE_API_URL is configured.'}
            {serviceStatus === 'unavailable' && (
              <button type="button" onClick={retryServiceCheck}>Try again</button>
            )}
          </div>
        )}
        {mode === 'register' && (
          <div className="account-role-picker" role="group" aria-label="Account type">
            {['customer', 'provider'].map((accountRole) => (
              <button
                key={accountRole}
                type="button"
                className={role === accountRole ? 'selected' : ''}
                aria-pressed={role === accountRole}
                onClick={() => setRole(accountRole)}
              >
                {accountRole === 'customer' ? 'I need a service' : 'I offer services'}
              </button>
            ))}
          </div>
        )}
        <form className="account-form" onSubmit={handleSubmit}>
          {mode === 'register' && (
            <>
              <label>
                Full name
                <input name="name" autoComplete="name" maxLength="100" required />
              </label>
              <label>
                Phone
                <input name="phone" type="tel" autoComplete="tel" maxLength="30" required />
              </label>
              <label className="account-form-wide">
                {role === 'provider' ? 'Business address' : 'Home/service address'}
                <input name="address" autoComplete="street-address" maxLength="500" required />
              </label>
              {role === 'provider' && (
                <>
                  <label className="account-form-wide">
                    Business or provider name
                    <input name="businessName" maxLength="100" required />
                  </label>
                  <label>
                    Service category
                    <select name="categoryId" defaultValue="1" required>
                      {categories.map((category) => (
                        <option key={category.id} value={category.id}>{category.name}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Hourly rate (₹)
                    <input name="hourlyRate" type="number" min="1" max="100000" step="0.01" required />
                  </label>
                  <label className="account-form-wide">
                    Service area
                    <input name="serviceArea" maxLength="200" placeholder="City, neighborhoods, or postal codes" required />
                  </label>
                  <label className="account-form-wide">
                    Services and experience
                    <textarea name="description" rows="3" maxLength="1000" required />
                  </label>
                </>
              )}
            </>
          )}
          <label className="account-form-wide">
            Email
            <input name="email" type="email" autoComplete="email" maxLength="254" required />
          </label>
          <label className="account-form-wide">
            Password
            <input
              name="password"
              type="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              minLength="8"
              maxLength={mode === 'register' ? 72 : 200}
              required
            />
          </label>
          {error && <p className="form-error account-form-wide" role="alert">{error}</p>}
          <button className="primary-action account-form-wide" type="submit" disabled={isSubmitting || serviceStatus !== 'available'}>
            {serviceStatus === 'checking'
              ? 'Connecting…'
              : isSubmitting
                ? 'Please wait…'
                : mode === 'login'
                  ? 'Sign in'
                  : 'Create account'}
          </button>
        </form>
        <p className="account-mode-toggle">
          {mode === 'login' ? 'New to ServiceNest?' : 'Already have an account?'}{' '}
          <button type="button" onClick={() => {
            setError('');
            setMode(mode === 'login' ? 'register' : 'login');
          }}>
            {mode === 'login' ? 'Create an account' : 'Sign in'}
          </button>
        </p>
      </section>
    </div>
  );
};

export default Login;