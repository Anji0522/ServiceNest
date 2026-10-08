import "./serviceDetails.css";

const ServiceDetails = ({ services = [] }) => {
  return (
    <div className="service-details-container">
      <div className="service-details-header">
        <h1 className="services-heading">Available Services</h1>
        <p className="description">
          Showing <span>{services.length}</span>{" "}
          {services.length === 1 ? "professional" : "professionals"} in your network.
        </p>
      </div>

      {services.length === 0 ? (
        <p className="no-services">No services found in this category.</p>
      ) : (
        <ul className="services-list">
          {services.map((service) => (
            <li key={service.id} className="service-item">
              <img
                className="provider-avatar"
                src={service.avatar}
                alt={service.provider_name}
              />
              <div className="service-info">
                <span className="category-tag">{service.category_name}</span>
                <h2 className="service-title">{service.title}</h2>
                <p className="provider-name">
                  {service.provider_name}
                  {service.verified && (
                    <span className="verified-badge" title="Verified provider"> ✔ Verified</span>
                  )}
                </p>
                <p className="service-description">{service.description}</p>
                <p className="service-area">📍 {service.service_area}</p>
                <div className="service-meta">
                  <span className="price">₹{service.price_per_hour}/hr</span>
                  <span className="rating">
                    {service.rating} ⭐ ({service.review_count} reviews)
                  </span>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default ServiceDetails;