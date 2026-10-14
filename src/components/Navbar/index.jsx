
import { CiSearch } from "react-icons/ci";
import "./navbar.css";

const Navbar = ({ searchQuery = '', onSearchChange = () => {} }) => {
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

            </div>
            </header>
        </div>
    );
};

export default Navbar;
