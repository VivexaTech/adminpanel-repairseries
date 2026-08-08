/**
 * Home layout CMS — keep field names in sync with user app + website clients.
 *
 * Platform visibility fields on each section:
 * - showOnApp          → native mobile app
 * - showOnWebsite      → legacy / master website flag (fallback when web-surface
 *                        flags below are undefined)
 * - showOnMobileWeb    → phone-width website home (MobileAppHome)
 * - showOnDesktopWeb   → desktop marketing homepage
 *
 * Clients fall back to showOnWebsite when showOnMobileWeb / showOnDesktopWeb
 * are omitted (backward compatible with older documents).
 */

export const HOME_SECTION_LAYOUTS = [
  { value: 'slider', label: 'Slider (horizontal)' },
  { value: 'list', label: 'List (vertical)' },
  { value: 'grid', label: 'Grid' },
  { value: 'static', label: 'Static information' },
]

export const HOME_SECTION_CONTENT_TYPES = [
  { value: 'categories', label: 'Categories' },
  { value: 'services', label: 'Services' },
  { value: 'static', label: 'Static content' },
]

export const HOME_SECTION_SELECTION_MODES = [
  { value: 'manual', label: 'Manual pick (selected IDs)' },
  { value: 'all', label: 'All active items' },
  { value: 'featured', label: 'Featured services' },
  { value: 'coming_soon', label: 'Coming soon (all)' },
  { value: 'coming_soon_main', label: 'Coming soon — Main' },
  { value: 'coming_soon_commercial', label: 'Coming soon — Commercial' },
]

export const HOME_SECTION_LAYOUT_LABELS = Object.fromEntries(
  HOME_SECTION_LAYOUTS.map((x) => [x.value, x.label]),
)

export const HOME_SECTION_CONTENT_LABELS = Object.fromEntries(
  HOME_SECTION_CONTENT_TYPES.map((x) => [x.value, x.label]),
)

/** Default layout mirroring the current app/website home catalog blocks. */
export function buildDefaultHomeSections() {
  return [
    {
      title: 'Browse Categories',
      subtitle: 'Find the right service for your home',
      layout: 'grid',
      contentType: 'categories',
      selectionMode: 'all',
      itemIds: [],
      columns: 4,
      rows: 2,
      maxItems: 8,
      enabled: true,
      showOnApp: true,
      showOnWebsite: true,
      showOnMobileWeb: true,
      showOnDesktopWeb: true,
      displayOrder: 10,
      showViewAll: true,
      viewAllPath: '',
      staticBody: '',
      staticImage: '',
      staticCtaLabel: '',
      staticCtaLink: '',
    },
    {
      title: 'Coming Soon — Main',
      subtitle: 'New home services launching shortly',
      layout: 'slider',
      contentType: 'services',
      selectionMode: 'coming_soon_main',
      itemIds: [],
      columns: 2,
      rows: 0,
      maxItems: 8,
      enabled: true,
      showOnApp: true,
      showOnWebsite: true,
      showOnMobileWeb: true,
      showOnDesktopWeb: true,
      displayOrder: 20,
      showViewAll: false,
      viewAllPath: '',
      staticBody: '',
      staticImage: '',
      staticCtaLabel: '',
      staticCtaLink: '',
    },
    {
      title: 'Coming Soon — Commercial',
      subtitle: 'Business & commercial services launching soon',
      layout: 'slider',
      contentType: 'services',
      selectionMode: 'coming_soon_commercial',
      itemIds: [],
      columns: 2,
      rows: 0,
      maxItems: 8,
      enabled: true,
      showOnApp: true,
      showOnWebsite: true,
      showOnMobileWeb: true,
      showOnDesktopWeb: true,
      displayOrder: 30,
      showViewAll: false,
      viewAllPath: '',
      staticBody: '',
      staticImage: '',
      staticCtaLabel: '',
      staticCtaLink: '',
    },
    {
      title: 'Featured Services',
      subtitle: 'Hand-picked for quality & value',
      layout: 'slider',
      contentType: 'services',
      selectionMode: 'featured',
      itemIds: [],
      columns: 2,
      rows: 0,
      maxItems: 8,
      enabled: true,
      showOnApp: true,
      showOnWebsite: true,
      showOnMobileWeb: true,
      showOnDesktopWeb: true,
      displayOrder: 40,
      showViewAll: true,
      viewAllPath: '',
      staticBody: '',
      staticImage: '',
      staticCtaLabel: '',
      staticCtaLink: '',
    },
    {
      title: 'Trending Now',
      subtitle: 'Most booked this week',
      layout: 'list',
      contentType: 'services',
      selectionMode: 'all',
      itemIds: [],
      columns: 1,
      rows: 0,
      maxItems: 6,
      enabled: true,
      showOnApp: true,
      showOnWebsite: false,
      showOnMobileWeb: false,
      showOnDesktopWeb: false,
      displayOrder: 50,
      showViewAll: false,
      viewAllPath: '',
      staticBody: '',
      staticImage: '',
      staticCtaLabel: '',
      staticCtaLink: '',
    },
  ]
}

export function emptyHomeSectionForm() {
  return {
    id: '',
    title: '',
    subtitle: '',
    layout: 'grid',
    contentType: 'categories',
    selectionMode: 'all',
    itemIds: [],
    columns: 4,
    rows: 2,
    maxItems: 8,
    enabled: true,
    showOnApp: true,
    showOnWebsite: true,
    showOnMobileWeb: true,
    showOnDesktopWeb: true,
    displayOrder: 0,
    showViewAll: false,
    viewAllPath: '',
    staticBody: '',
    staticImage: '',
    staticCtaLabel: '',
    staticCtaLink: '',
  }
}

export function normalizeHomeSectionPayload(input) {
  const title = String(input.title || '').trim()
  if (!title) throw new Error('Section title is required.')

  const layout = String(input.layout || 'grid').trim()
  if (!HOME_SECTION_LAYOUTS.some((x) => x.value === layout)) {
    throw new Error('Invalid section layout.')
  }

  let contentType = String(input.contentType || 'categories').trim()
  if (layout === 'static') contentType = 'static'
  if (!HOME_SECTION_CONTENT_TYPES.some((x) => x.value === contentType)) {
    throw new Error('Invalid content type.')
  }

  let selectionMode = String(input.selectionMode || 'all').trim()
  if (contentType === 'static') selectionMode = 'manual'
  if (contentType === 'categories' && selectionMode.startsWith('coming_soon')) {
    selectionMode = 'all'
  }
  if (contentType === 'categories' && selectionMode === 'featured') {
    selectionMode = 'all'
  }
  if (!HOME_SECTION_SELECTION_MODES.some((x) => x.value === selectionMode)) {
    throw new Error('Invalid selection mode.')
  }

  const itemIds = Array.isArray(input.itemIds)
    ? [...new Set(input.itemIds.map((id) => String(id || '').trim()).filter(Boolean))]
    : []

  if (contentType !== 'static' && selectionMode === 'manual' && itemIds.length === 0) {
    throw new Error('Select at least one item for manual sections.')
  }

  const columns = Math.min(4, Math.max(1, Number(input.columns) || 1))
  const rows = Math.max(0, Number(input.rows) || 0)
  const maxItems = Math.max(0, Number(input.maxItems) || 0)
  const displayOrder = Number.isFinite(Number(input.displayOrder))
    ? Number(input.displayOrder)
    : 0

  return {
    title,
    subtitle: String(input.subtitle || '').trim(),
    layout,
    contentType,
    selectionMode,
    itemIds: selectionMode === 'manual' ? itemIds : [],
    columns,
    rows,
    maxItems,
    enabled: input.enabled !== false,
    showOnApp: input.showOnApp !== false,
    showOnWebsite: input.showOnWebsite !== false,
    // Web surface flags; default to showOnWebsite when omitted (backward compat).
    showOnMobileWeb:
      input.showOnMobileWeb !== undefined
        ? input.showOnMobileWeb !== false
        : input.showOnWebsite !== false,
    showOnDesktopWeb:
      input.showOnDesktopWeb !== undefined
        ? input.showOnDesktopWeb !== false
        : input.showOnWebsite !== false,
    displayOrder,
    showViewAll: Boolean(input.showViewAll),
    viewAllPath: String(input.viewAllPath || '').trim(),
    staticBody: String(input.staticBody || '').trim(),
    staticImage: String(input.staticImage || '').trim(),
    staticCtaLabel: String(input.staticCtaLabel || '').trim(),
    staticCtaLink: String(input.staticCtaLink || '').trim(),
  }
}
