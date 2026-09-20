/** Section keys for dynamic banners (user app + website). Keep in sync with clients. */
export const BANNER_SECTIONS = [
  // App / website navigation & screens
  { value: 'home', label: 'Home' },
  { value: 'offers', label: 'Offers' },
  { value: 'services', label: 'Services' },
  { value: 'bookings', label: 'Bookings' },
  { value: 'account', label: 'Account' },
  { value: 'cart', label: 'Cart' },
  { value: 'search', label: 'Search' },
  { value: 'category', label: 'Category page' },
  { value: 'service_details', label: 'Service details' },

  // Home page blocks (app + mobile website)
  { value: 'popular_services', label: 'Popular Services' },
  { value: 'featured', label: 'Featured Services' },
  { value: 'categories', label: 'Categories (home)' },
  { value: 'coming_soon', label: 'Coming Soon' },
  { value: 'coming_soon_main', label: 'Coming Soon — Main' },
  { value: 'coming_soon_commercial', label: 'Coming Soon — Commercial' },

  // Category-themed placements (optional marketing)
  { value: 'ac', label: 'AC' },
  { value: 'washing_machine', label: 'Washing Machine' },
  { value: 'kitchen_appliances', label: 'Kitchen Appliances' },
  { value: 'cleaning', label: 'Cleaning' },
  { value: 'commercial', label: 'Commercial' },
]

export const BANNER_SECTION_LABELS = Object.fromEntries(
  BANNER_SECTIONS.map((s) => [s.value, s.label]),
)

const BANNER_SECTION_ALIASES = {
  homepage: 'home',
  home_page: 'home',
  home_featured: 'featured',
  offer: 'offers',
  promo: 'offers',
  service: 'services',
  booking: 'bookings',
  my_bookings: 'bookings',
  profile: 'account',
  category_page: 'category',
  category_services: 'category',
  service_detail: 'service_details',
  servicedetails: 'service_details',
  popular: 'popular_services',
  featured_services: 'featured',
  comingsoon: 'coming_soon',
  coming_soon_home: 'coming_soon_main',
  ac_service: 'ac',
  ac_repair: 'ac',
  acservice: 'ac',
  air_conditioner: 'ac',
  air_conditioning: 'ac',
  airconditioner: 'ac',
  washingmachine: 'washing_machine',
  washer: 'washing_machine',
  laundry: 'washing_machine',
  kitchen: 'kitchen_appliances',
  kitchen_appliance: 'kitchen_appliances',
  appliance: 'kitchen_appliances',
  appliances: 'kitchen_appliances',
  appliance_repair: 'kitchen_appliances',
  deep_cleaning: 'cleaning',
  house_cleaning: 'cleaning',
}

/** Canonical banner section id stored in Firebase `banners.section`. */
export function normalizeBannerSection(raw) {
  const s = String(raw || 'home')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
  return BANNER_SECTION_ALIASES[s] || s || 'home'
}

/** Coming Soon service segment (Main vs Commercial). */
export const COMING_SOON_CATEGORIES = [
  { value: 'main', label: 'Main Services' },
  { value: 'commercial', label: 'Commercial Services' },
]

export const COMING_SOON_CATEGORY_LABELS = Object.fromEntries(
  COMING_SOON_CATEGORIES.map((c) => [c.value, c.label]),
)

export function normalizeComingSoonCategory(value) {
  const v = String(value || '')
    .trim()
    .toLowerCase()
  if (v === 'commercial' || v === 'commercial services') return 'commercial'
  return 'main'
}

/** Default peak windows (local hours, end exclusive). */
export const DEFAULT_PEAK_WINDOWS = [
  { startHour: 9, endHour: 11, label: 'Morning Peak', enabled: true },
  { startHour: 18, endHour: 21, label: 'Evening Peak', enabled: true },
]

export const DEFAULT_RANKING_PENALTIES = {
  normalLeave: 2,
  peakHourLeave: 10,
  emergencyLeaveRequiresApproval: true,
}
