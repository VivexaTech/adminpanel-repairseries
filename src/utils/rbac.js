/** Firestore + app role keys (must match `adminUsers.role`). */
export const ROLES = {
  SUPER_ADMIN: 'superAdmin',
  TECHNICIAN_MANAGER: 'technicianManager',
  BOOKING_MANAGER: 'bookingManager',
  SERVICE_MANAGER: 'serviceManager',
}

export const ROLE_LABELS = {
  [ROLES.SUPER_ADMIN]: 'Super Admin',
  [ROLES.TECHNICIAN_MANAGER]: 'Technician Manager',
  [ROLES.BOOKING_MANAGER]: 'Booking Manager',
  [ROLES.SERVICE_MANAGER]: 'Service Manager',
  /** Shown for existing Firestore docs until a Super Admin assigns a new role. */
  supportManager: 'Support Manager (legacy)',
}

export const ASSIGNABLE_ROLES = [
  ROLES.SUPER_ADMIN,
  ROLES.TECHNICIAN_MANAGER,
  ROLES.BOOKING_MANAGER,
  ROLES.SERVICE_MANAGER,
]

/**
 * Whether the role may open this path (exact path match for non–super-admin).
 * @param {string} role
 * @param {string} pathname
 */
export function canAccessPath(role, pathname) {
  if (!role) return false
  if (role === ROLES.SUPER_ADMIN) return true
  const normalized = (pathname || '/').replace(/\/$/, '') || '/'
  if (role === ROLES.TECHNICIAN_MANAGER) return normalized === '/technicians'
  if (role === ROLES.BOOKING_MANAGER) return normalized === '/bookings'
  if (role === ROLES.SERVICE_MANAGER) {
    return normalized === '/services' || normalized === '/offers' || normalized === '/coupons'
  }
  return false
}

export function getDefaultRoute(role) {
  switch (role) {
    case ROLES.SUPER_ADMIN:
      return '/'
    case ROLES.TECHNICIAN_MANAGER:
      return '/technicians'
    case ROLES.BOOKING_MANAGER:
      return '/bookings'
    case ROLES.SERVICE_MANAGER:
      return '/services'
    default:
      return '/login'
  }
}

export function formatRoleLabel(role) {
  return ROLE_LABELS[role] || role || '—'
}
