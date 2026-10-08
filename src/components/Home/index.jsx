import { MdOutlineVerifiedUser } from "react-icons/md";
import { IoIosSearch } from "react-icons/io";
import { BiSortAlt2 } from "react-icons/bi";

import Navbar from "../../components/Navbar";
import "./home.css";

const Home = (props) => {
  const {
    workersList = [],
    activeCategory = 0,
    onSelectCategory = () => {},
    searchQuery = '',
    onSearchChange = () => {},
    sortBy = 'recommended',
    onSortChange = () => {},
  } = props;

  return (
    <div className="home-page">
      <header className="home-navbar-wrapper">
        <Navbar searchQuery={searchQuery} onSearchChange={onSearchChange} />
      </header>

      <div className="hero-section">
        <div className="hero-glow-blob blob-1" aria-hidden="true"></div>
        <div className="hero-glow-blob blob-2" aria-hidden="true"></div>

        <div className="hero-card">
          <main className="home-content">
            <div className="verified-badge">
              <MdOutlineVerifiedUser className="verified-icon" />
              <p className="verified-context">Verified Local Professionals</p>
            </div>

            <h1 className="home-title">
              Reliable Home Services, <br /> scheduled on your clock.
            </h1>

            <p className="descrreption">
              Explore rated electricians, plumbers, and technicians. Transparent hourly pricing and instant booking confirmation.
            </p>
          </main>

          <div className="services-wrapper">
            <ul className="list-container" aria-label="Filter by service category">
              {workersList.map((eachService) => (
                <li className="list-items" key={eachService.id}>
                  <button
                    className={`list-item-button${activeCategory === eachService.category_id ? ' active' : ''}`}
                    type="button"
                    aria-pressed={activeCategory === eachService.category_id}
                    onClick={() => onSelectCategory(eachService.category_id)}
                  >
                    {eachService.service}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <section className="search-query-bar-container">
        <div className="search-filter-card">
          <div className="search-field-group">
            <IoIosSearch className="search-field-icon" />
            <label htmlFor="search-input" className="sr-only">
              Search for services:
            </label>
            <input
              id="search-input"
              className="search-text-input"
              type="text"
              value={searchQuery}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Search services, skills, or experts..."
            />
          </div>

          <div className="filters-row-group">
            <div className="filter-select-wrapper">
              <label className="sr-only" htmlFor="category-filter">Filter by category</label>
              <select
                id="category-filter"
                className="filter-dropdown"
                value={activeCategory}
                onChange={(event) => onSelectCategory(Number(event.target.value))}
              >
                {workersList.map((eachService) => (
                  <option key={eachService.id} value={eachService.category_id}>
                    {eachService.service}
                  </option>
                ))}
              </select>
            </div>

            <div className="filter-select-wrapper sort-wrapper">
              <BiSortAlt2 className="sort-icon" />
              <label className="sr-only" htmlFor="sort-filter">Sort services</label>
              <select
                id="sort-filter"
                className="filter-dropdown sort-dropdown"
                value={sortBy}
                onChange={(event) => onSortChange(event.target.value)}
              >
                <option value="recommended">Sort by: Recommended</option>
                <option value="low-to-high">Price: Low to High</option>
                <option value="high-to-low">Price: High to Low</option>
                <option value="top-rated">Top Rated</option>
              </select>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Home;