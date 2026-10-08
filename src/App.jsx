import { useState } from 'react';
import Home from './components/Home';
import ServiceDetails from './components/ServiceDetails';

const workersList = [
  { id: "allservices", category_id: 0, service: "All Services" },
  { id: "electrician", category_id: 1, service: "Electrician" },
  { id: "plumber",     category_id: 2, service: "Plumber" },
  { id: "acrepair",    category_id: 3, service: "AC Repair" },
  { id: "cleaning",    category_id: 4, service: "Cleaning" },
  { id: "carpenter",   category_id: 5, service: "Carpentry" },
  { id: "painting",    category_id: 6, service: "Painting" },
];

const INITIAL_SERVICES = [
  {
    id: 101,
    provider_id: 1,
    provider_name: 'David Miller',
    category_id: 1,
    category_name: 'Electrician',
    title: 'Complete Home Electrical Wiring & Inspection',
    description: 'Certified master electrician for switchboard fixes, short-circuit diagnostics, fixture upgrades, and full panel rewiring.',
    price_per_hour: 45,
    service_area: 'Downtown & Metro East',
    rating: 4.9,
    review_count: 38,
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
    verified: true,
  },
  {
    id: 102,
    provider_id: 2,
    provider_name: 'Marcus Vance',
    category_id: 2,
    category_name: 'Plumber',
    title: 'Emergency Leak Detection & Pipe Repair',
    description: 'Quick response pipe patching, drain unblocking, faucet installation, and hydro-jetting with guaranteed zero-leak assurance.',
    price_per_hour: 50,
    service_area: 'Westside & Heights',
    rating: 4.8,
    review_count: 52,
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
    verified: true,
  },
  {
    id: 103,
    provider_id: 3,
    provider_name: 'Elena Rostova',
    category_id: 3,
    category_name: 'AC Repair',
    title: 'HVAC Seasonal Tune-Up & Gas Refill',
    description: 'Deep coil cleaning, freon gas top-up, compressor inspection, and duct sanitization to keep air crisp and energy bills low.',
    price_per_hour: 65,
    service_area: 'North Hills & Suburbs',
    rating: 4.95,
    review_count: 64,
    avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80',
    verified: true,
  },
  {
    id: 104,
    provider_id: 4,
    provider_name: 'Sparkle Cleaners Team',
    category_id: 4,
    category_name: 'Cleaning',
    title: 'Deep Home Sanitization & Carpet Care',
    description: 'Eco-friendly thorough deep scrubbing of bathrooms, kitchens, hardwood, and furniture upholstery with industrial equipment.',
    price_per_hour: 35,
    service_area: 'Entire Metro City',
    rating: 4.7,
    review_count: 89,
    avatar: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=150&auto=format&fit=crop&q=80',
    verified: true,
  },
  {
    id: 105,
    provider_id: 5,
    provider_name: 'Julian Hayes',
    category_id: 5,
    category_name: 'Carpentry',
    title: 'Custom Furniture, Shelving & Cabinet Repair',
    description: 'Artisanal woodworking, hinge realignment, custom bookshelves, kitchen drawer rebuilding, and precision architectural woodwork.',
    price_per_hour: 55,
    service_area: 'South River District',
    rating: 4.85,
    review_count: 27,
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80',
    verified: true,
  },
  {
    id: 106,
    provider_id: 6,
    provider_name: 'Vibrant Walls Studio',
    category_id: 6,
    category_name: 'Painting',
    title: 'Interior Wall Painting & Texture Finishes',
    description: 'Dust-free taping, surface priming, decorative accents, and smooth premium paint coatings delivered on time.',
    price_per_hour: 40,
    service_area: 'Central City & Uptown',
    rating: 4.65,
    review_count: 31,
    avatar: 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=150&auto=format&fit=crop&q=80',
    verified: true,
  },
    {
    id: 107,
    provider_id: 7,
    provider_name: 'Priya Nair',
    category_id: 1,
    category_name: 'Electrician',
    title: 'Smart Home Setup & Lighting Installation',
    description: 'Installation of smart switches, LED lighting layouts, ceiling fans, inverters, and surge protection with neat concealed wiring.',
    price_per_hour: 48,
    service_area: 'Lakeside & Old Town',
    rating: 4.75,
    review_count: 41,
    avatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=150&auto=format&fit=crop&q=80',
    verified: true,
  },
  {
    id: 108,
    provider_id: 8,
    provider_name: 'Robert Chen',
    category_id: 2,
    category_name: 'Plumber',
    title: 'Bathroom Fitting & Water Heater Installation',
    description: 'Geyser installation, shower and tap fitting, toilet repair, tank cleaning, and water pressure correction with clean finishing.',
    price_per_hour: 42,
    service_area: 'East Park & Riverside',
    rating: 4.6,
    review_count: 36,
    avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&auto=format&fit=crop&q=80',
    verified: true,
  },
  {
    id: 109,
    provider_id: 9,
    provider_name: 'CoolBreeze Technicians',
    category_id: 3,
    category_name: 'AC Repair',
    title: 'Split & Window AC Installation and Servicing',
    description: 'New AC installation, uninstallation, jet-wash servicing, PCB repair, and leakage fixes with a 30-day service warranty.',
    price_per_hour: 58,
    service_area: 'Metro West & Tech Park',
    rating: 4.8,
    review_count: 72,
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80',
    verified: true,
  },
  {
    id: 110,
    provider_id: 10,
    provider_name: 'Anita Desai',
    category_id: 4,
    category_name: 'Cleaning',
    title: 'Kitchen & Bathroom Deep Cleaning',
    description: 'Degreasing of chimneys and tiles, descaling of fixtures, cabinet interior cleaning, and stain removal using safe, odor-free products.',
    price_per_hour: 30,
    service_area: 'City Center & Midtown',
    rating: 4.55,
    review_count: 58,
    avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&auto=format&fit=crop&q=80',
    verified: false,
  },
  {
    id: 111,
    provider_id: 11,
    provider_name: 'Thomas Brandt',
    category_id: 5,
    category_name: 'Carpentry',
    title: 'Modular Wardrobe & Door Installation',
    description: 'Wardrobe assembly, door and window frame repair, lock fitting, termite-proof polishing, and custom wall-mounted storage units.',
    price_per_hour: 52,
    service_area: 'Northgate & Green Valley',
    rating: 4.7,
    review_count: 33,
    avatar: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=150&auto=format&fit=crop&q=80',
    verified: true,
  },
  {
    id: 112,
    provider_id: 12,
    provider_name: 'ColorCraft Painters',
    category_id: 6,
    category_name: 'Painting',
    title: 'Exterior Painting & Waterproof Coating',
    description: 'Weather-resistant exterior coats, crack filling, damp-proofing, balcony and gate painting, with scaffolding handled by the crew.',
    price_per_hour: 38,
    service_area: 'Suburbs & Hillcrest',
    rating: 4.5,
    review_count: 24,
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
    verified: false,
  },
];


const App = () => {
  const [activeCategory, setActiveCategory] = useState(0); // 0 = All Services
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('recommended');

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredServices = INITIAL_SERVICES
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

  return (
    <div className="app-shell">
      <Home
        workersList={workersList}
        activeCategory={activeCategory}
        onSelectCategory={setActiveCategory}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        sortBy={sortBy}
        onSortChange={setSortBy}
      />
      <ServiceDetails services={filteredServices} />
    </div>
  );
};

export default App;