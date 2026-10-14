import { useEffect, useState } from 'react';
import { api, categories } from '../../lib/api';
import './index.css';

const Login = ({ initialRole = 'customer', onClose, onAuthenticated }) => {
  const [mode, setMode] = useState('login');
  const [role, setRole] = useState(initialRole);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serviceStatus, setServiceStatus] = useState('checking');

  useEffect(() => {
    let mounted = true;
    api.checkAccountService()
      .then((available) => {
        if (mounted) setServiceStatus(available ? 'available' : 'demo');
      })
      .catch(() => {
        if (mounted) setServiceStatus('demo');
      });
    return () => {
      mounted = false;
    };
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (serviceStatus === 'checking') return;
    setError('');
    setIsSubmitting(true);
    const form = new FormData(event.currentTarget);
    const details = Object.fromEntries(form.entries());
    try {
      let user;
      if (serviceStatus === 'available') {
        user = mode === 'register'
          ? await api.register({
            ...details,
            role,
            categoryId: Number(details.categoryId),
            hourlyRate: Number(details.hourlyRate),
          })
          : await api.login({ email: details.email, password: details.password });
      } else {
        const demoRole = mode === 'register' ? role : (role || 'customer');
        user = {
          id: `demo-${Date.now()}`,
          email: details.email || 'customer@example.com',
          role: demoRole,
          name: details.name || (details.email ? details.email.split('@')[0] : 'Demo User'),
          phone: details.phone || '+1 555-0199',
          address: details.address || '123 Demo St',
          created_at: new Date().toISOString(),
          ...(demoRole === 'provider' ? {
            providerProfile: {
              business_name: details.businessName || `${details.name || 'Provider'} Services`,
              category_id: Number(details.categoryId) || 1,
              description: details.description || 'Professional home service provider.',
              service_area: details.serviceArea || 'Metro City',
              hourly_rate: Number(details.hourlyRate) || 45,
            },
          } : {}),
        };
        api.setDemoSession(`demo-token-${Date.now()}`, user);
      }
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
        {serviceStatus === 'checking' && (
          <div className="account-unavailable" role="status">
            Checking the account service…
          </div>
        )}
        {serviceStatus === 'demo' && (
          <div className="account-unavailable" role="status">
            <strong>Demo Mode Active:</strong> Sign in with any email, or click below for instant demo access:
            <div style={{ display: 'flex', gap: '8px', marginTop: '10px', flexWrap: 'wrap' }}>
              <button
                type="button"
                style={{
                  padding: '6px 12px',
                  background: '#0d9488',
                  color: '#ffffff',
                  borderRadius: '6px',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  border: 'none',
                }}
                onClick={() => {
                  const demoCustomer = {
                    id: 'demo-customer-1',
                    email: 'customer@example.com',
                    role: 'customer',
                    name: 'Demo Customer',
                    phone: '+1 555-0199',
                    address: '123 Market St, Suite 4',
                    created_at: new Date().toISOString(),
                  };
                  api.setDemoSession('demo-token-customer', demoCustomer);
                  onAuthenticated(demoCustomer);
                }}
              >
                Sign in as Customer
              </button>
              <button
                type="button"
                style={{
                  padding: '6px 12px',
                  background: '#2563eb',
                  color: '#ffffff',
                  borderRadius: '6px',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  border: 'none',
                }}
                onClick={() => {
                  const demoProvider = {
                    id: 'demo-provider-1',
                    email: 'provider@example.com',
                    role: 'provider',
                    name: 'Elena Rostova',
                    phone: '+1 555-0188',
                    address: '456 Service Blvd',
                    created_at: new Date().toISOString(),
                    providerProfile: {
                      business_name: 'Elena Rostova HVAC',
                      category_id: 3,
                      description: 'HVAC Seasonal Tune-Up & Gas Refill',
                      service_area: 'North Hills & Suburbs',
                      hourly_rate: 65,
                    },
                  };
                  api.setDemoSession('demo-token-provider', demoProvider);
                  onAuthenticated(demoProvider);
                }}
              >
                Sign in as Provider
              </button>
            </div>
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
          <button className="primary-action account-form-wide" type="submit" disabled={isSubmitting || serviceStatus === 'checking'}>
            {serviceStatus === 'checking'
              ? 'Connecting…'
              : isSubmitting
                ? 'Please wait…'
                : mode === 'login'
                  ? (serviceStatus === 'demo' ? 'Sign in (Demo)' : 'Sign in')
                  : (serviceStatus === 'demo' ? 'Create account (Demo)' : 'Create account')}
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