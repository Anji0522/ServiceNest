
import { CiSearch } from "react-icons/ci";
import "./navbar.css";

const Navbar = ({
    searchQuery = '',
    onSearchChange = () => {},
    user = null,
    onSignIn = () => {},
    onSignOut = () => {},
    onShowBookings = () => {},
    onRoleSelect = () => {},
}) => {
    return (
        <div className="main-container-of-navbar">
            <header className="navbar">
            <div className="navbar-container">
                {/* Brand */}
                <div className="brand">
                    <img
                        src="https://res.cloudinary.com/dyhvgkrzg/image/upload/v1791420337/ServiceNest_Marketplace_Logo.png"
                        alt="ServiceNest logo"
                        className="brand-logo"
                    />

                    <div className="brand-info">
                        <h1 className="navbar-title">
                            Service<span>Nest</span>
                        </h1>
                        <p className="navbar-tagline">
                            Home Service Network
                        </p>
                    </div>
                </div>

                {/* Search */}
                <div className="search-bar">
                    <CiSearch className="navbar-search-icon" />

                    <input
                        aria-label="Search services, skills or locations"
                        className="navbar-search-input"
                        type="search"
                        value={searchQuery}
                        onChange={(event) => onSearchChange(event.target.value)}
                        placeholder="Search services, skills or locations..."
                    />
                </div>

                {/* Role Switcher */}
                <div className="navbar-role">
                    <button className={`role-btn${!user || user.role === 'customer' ? ' active' : ''}`} type="button" aria-pressed={!user || user.role === 'customer'} onClick={() => onRoleSelect('customer')}>
                        Customer
                    </button>

                    <button className={`role-btn${user?.role === 'provider' ? ' active' : ''}`} type="button" aria-pressed={user?.role === 'provider'} onClick={() => onRoleSelect('provider')}>
                        Provider
                    </button>
                </div>

                {/* Actions */}
                <div className="navbar-actions">
                    <button className="bookings-btn" type="button" onClick={onShowBookings}>
                        {user?.role === 'provider' ? 'My Services' : 'My Bookings'}
                    </button>
                </div>
                <div className="sign-in-container">
                    {user ? (
                        <>
                            <span className="navbar-user-name" title={user.email}>{user.name}</span>
                            <button className="sign-in-btn" type="button" onClick={onSignOut}>Sign out</button>
                        </>
                    ) : (
                        <button className="login-btn" type="button" onClick={() => onSignIn('customer')}>Sign in</button>
                    )}
                </div>
            </div>
            </header>
        </div>
    );
};

export default Navbar;
