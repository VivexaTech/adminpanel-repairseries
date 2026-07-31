/** Section keys for dynamic banners (user app + website). */
export const BANNER_SECTIONS = [
  { value: 'home', label: 'Home' },
  { value: 'popular_services', label: 'Popular Services' },
  { value: 'featured', label: 'Featured Services' },
  { value: 'categories', label: 'Categories' },
  { value: 'ac', label: 'AC' },
  { value: 'washing_machine', label: 'Washing Machine' },
  { value: 'kitchen_appliances', label: 'Kitchen Appliances' },
  { value: 'cleaning', label: 'Cleaning' },
  { value: 'coming_soon', label: 'Coming Soon' },
  { value: 'coming_soon_main', label: 'Coming Soon — Main' },
  { value: 'coming_soon_commercial', label: 'Coming Soon — Commercial' },
  { value: 'commercial', label: 'Commercial' },
  { value: 'offers', label: 'Offers' },
  { value: 'search', label: 'Search' },
  { value: 'cart', label: 'Cart' },
]

export const BANNER_SECTION_LABELS = Object.fromEntries(
  BANNER_SECTIONS.map((s) => [s.value, s.label]),
)

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
  { startHour: 9, endHour: 11, label: 'Morning Peak' },
  { startHour: 18, endHour: 21, label: 'Evening Peak' },
]

export const DEFAULT_RANKING_PENALTIES = {
  normalLeave: 2,
  peakHourLeave: 10,
  emergencyLeaveRequiresApproval: true,
}
