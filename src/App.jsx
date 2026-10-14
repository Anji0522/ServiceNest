import { useEffect, useState } from 'react';
import Home from './components/Home';
import ServiceDetails from './components/ServiceDetails';
import Login from './components/Login';
import { api, getAllMergedServices } from './lib/api';
import { readAuthSession } from './lib/auth-session';
import { BookingConversation, BookingDialog, BookingsPanel, ProviderDashboard } from './components/AccountPanels';
import ProtectedRoute from './components/ProtectedRoute';
import { useAuth } from './context/auth-context';
import { navigateToRoute, routePath } from './lib/routes';

const CUSTOMER_ROLES = ['customer'];
const PROVIDER_ROLES = ['provider'];

const workersList = [
  { id: "allservices", category_id: 0, service: "All Services" },
  { id: "electrician", category_id: 1, service: "Electrician" },
  { id: "plumber",     category_id: 2, service: "Plumber" },
  { id: "acrepair",    category_id: 3, service: "AC Repair" },
  { id: "cleaning",    category_id: 4, service: "Cleaning" },
  { id: "carpenter",   category_id: 5, service: "Carpentry" },
  { id: "painting",    category_id: 6, service: "Painting" },
];

const App = () => {
  const { user, hydrated, logout } = useAuth();
  const [activeCategory, setActiveCategory] = useState(0); // 0 = All Services
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('recommended');
  const [services, setServices] = useState(() => getAllMergedServices());
  const [loginRole, setLoginRole] = useState('customer');
  const [route, setRoute] = useState(routePath);
  const [showLogin, setShowLogin] = useState(routePath() === '/login');
  const [pendingService, setPendingService] = useState(null);
  const [bookingService, setBookingService] = useState(null);
  const [conversationBooking, setConversationBooking] = useState(null);
  const [panel, setPanel] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const syncRoute = () => {
      const current = routePath();
      setRoute(current);
      setShowLogin(!user && current === '/login');
      setPanel(current === '/customer/bookings' ? 'bookings' : current === '/provider/dashboard' ? 'provider' : '');
    };
    window.addEventListener('popstate', syncRoute);
    syncRoute();
    return () => window.removeEventListener('popstate', syncRoute);
  }, [user]);

  useEffect(() => {
    if (user && route === '/login') {
      const targetPath = user.role === 'provider' ? '/provider/dashboard' : '/customer/bookings';
      navigateToRoute(targetPath, true);
    }
  }, [route, user]);

  useEffect(() => {
    const loadServices = () => {
      api.getServices()
        .then(({ services: savedServices }) => {
          if (Array.isArray(savedServices) && savedServices.length > 0) {
            setServices(savedServices);
          }
        })
        .catch(() => {});
    };

    loadServices();

    const handleServicesUpdated = (event) => {
      if (event?.detail) {
        setServices((current) => {
          const exists = current.some((s) => String(s.id) === String(event.detail.id));
          return exists
            ? current.map((s) => (String(s.id) === String(event.detail.id) ? event.detail : s))
            : [event.detail, ...current];
        });
      } else {
        loadServices();
      }
    };

    window.addEventListener('servicenest:services-updated', handleServicesUpdated);
    window.addEventListener('storage', (event) => {
      if (event.key === 'servicenest_custom_services') {
        loadServices();
      }
    });

    return () => {
      window.removeEventListener('servicenest:services-updated', handleServicesUpdated);
    };
  }, []);

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredServices = services
    .filter((service) => (
      activeCategory === 0 || service.category_id === activeCategory
    ))
    .filter((service) => (
      !normalizedQuery || [
        service.title,
        service.description,
        service.provider_name,
        service.category_name,
        service.service_area,
      ].some((value) => value.toLowerCase().includes(normalizedQuery))
    ))
    .sort((first, second) => {
      if (sortBy === 'low-to-high') {
        return first.price_per_hour - second.price_per_hour;
      }
      if (sortBy === 'high-to-low') {
        return second.price_per_hour - first.price_per_hour;
      }
      if (sortBy === 'top-rated') {
        return second.rating - first.rating;
      }
      return 0;
    });

  const openLogin = (role = 'customer') => {
    setLoginRole(role);
    setShowLogin(true);
    navigateToRoute('/login');
  };

  const handleAuthenticated = (authenticatedUser) => {
    setShowLogin(false);
    if (pendingService && authenticatedUser.role === 'customer') {
      setBookingService(pendingService);
      navigateToRoute('/');
    } else {
      navigateToRoute(authenticatedUser.role === 'provider' ? '/provider/dashboard' : '/customer/bookings');
    }
    setPendingService(null);
    setNotice('');
  };

  const handleBookingRequest = (service) => {
    if (!user) {
      setPendingService(service);
      openLogin('customer');
    } else if (user.role !== 'customer') {
      const updatedUser = {
        ...user,
        role: 'customer',
      };
      const session = readAuthSession();
      api.setDemoSession(session?.token || `token-${Date.now()}`, updatedUser);
      setBookingService(service);
      setNotice('Switched to Customer view to complete your booking.');
      window.setTimeout(() => setNotice(''), 3000);
    } else {
      setBookingService(service);
    }
  };

  const handleRoleSelect = (selectedRole) => {
    if (!user) {
      openLogin(selectedRole);
      return;
    }

    if (user.role !== selectedRole) {
      const updatedUser = {
        ...user,
        role: selectedRole,
      };
      const session = readAuthSession();
      api.setDemoSession(session?.token || `token-${Date.now()}`, updatedUser);
      setNotice(`Switched to ${selectedRole === 'customer' ? 'Customer' : 'Provider'} view.`);
      window.setTimeout(() => setNotice(''), 3000);
    }

    if (selectedRole === 'provider') {
      setPanel('provider');
      navigateToRoute('/provider/dashboard');
    } else {
      setPanel('');
      navigateToRoute('/');
    }
  };

  const handleSignOut = async () => {
    try {
      await logout();
    } catch (error) {
      setNotice(error.message);
    } finally {
      setPanel('');
      setConversationBooking(null);
      navigateToRoute('/');
    }
  };

  const handleServiceCreated = (service) => {
    setServices((current) => [service, ...current]);
  };

  if (!hydrated) return <div className="app-shell" aria-busy="true">Loading your session…</div>;

  return (
    <div className="app-shell">
      {notice && <p className="app-notice" role="status">{notice}</p>}
      <Home
        workersList={workersList}
        activeCategory={activeCategory}
        onSelectCategory={setActiveCategory}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        sortBy={sortBy}
        onSortChange={setSortBy}
        user={user}
        onSignIn={openLogin}
        onSignOut={handleSignOut}
        onShowBookings={() => {
          if (!user) openLogin('customer');
          else {
            setPanel(user.role === 'provider' ? 'provider' : 'bookings');
            navigateToRoute(user.role === 'provider' ? '/provider/dashboard' : '/customer/bookings');
          }
        }}
        onRoleSelect={handleRoleSelect}
      />
      <ServiceDetails services={filteredServices} onBookService={handleBookingRequest} />
      {(showLogin || route === '/login') && (
        <Login
          initialRole={loginRole}
          onClose={() => {
            setShowLogin(false);
            setPendingService(null);
            navigateToRoute('/');
          }}
          onAuthenticated={handleAuthenticated}
        />
      )}
      {bookingService && user?.role === 'customer' && (
        <BookingDialog
          service={bookingService}
          user={user}
          onClose={() => setBookingService(null)}
          onBooked={(booking) => {
            setBookingService(null);
            setPanel('bookings');
            navigateToRoute('/customer/bookings');
            setNotice(booking.payment_method === 'razorpay'
              ? 'Payment confirmation received. Your booking is ready for the provider.'
              : 'Booking received. Payment is pending and due after the service.');
          }}
        />
      )}
      {(panel === 'bookings' || route === '/customer/bookings') && (
        <ProtectedRoute allowedRoles={CUSTOMER_ROLES}>
          <BookingsPanel user={user} onClose={() => { setPanel(''); navigateToRoute('/'); }} onMessage={setConversationBooking} />
        </ProtectedRoute>
      )}
      {(panel === 'provider' || route === '/provider/dashboard') && (
        <ProtectedRoute allowedRoles={PROVIDER_ROLES}>
          <ProviderDashboard
            user={user}
            onClose={() => { setPanel(''); navigateToRoute('/'); }}
            onServiceCreated={handleServiceCreated}
            onMessage={setConversationBooking}
          />
        </ProtectedRoute>
      )}
      {conversationBooking && user && (
        <BookingConversation
          booking={conversationBooking}
          user={user}
          onClose={() => setConversationBooking(null)}
        />
      )}
    </div>
  );
};

export default App;