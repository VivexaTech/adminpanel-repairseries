/** Firestore + app role keys (must match `adminUsers.role`). */
export const ROLES = {
  SUPER_ADMIN: 'superAdmin',
  SUPPORT_MANAGER: 'supportManager',
  TECHNICIAN_MANAGER: 'technicianManager',
  BOOKING_MANAGER: 'bookingManager',
}

export const ROLE_LABELS = {
  [ROLES.SUPER_ADMIN]: 'Super Admin',
  [ROLES.SUPPORT_MANAGER]: 'Support Manager',
  [ROLES.TECHNICIAN_MANAGER]: 'Technician Manager',
  [ROLES.BOOKING_MANAGER]: 'Booking Manager',
}

export const ASSIGNABLE_ROLES = [
  ROLES.SUPER_ADMIN,
  ROLES.SUPPORT_MANAGER,
  ROLES.TECHNICIAN_MANAGER,
  ROLES.BOOKING_MANAGER,
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
  if (role === ROLES.SUPPORT_MANAGER) return normalized === '/support'
  if (role === ROLES.TECHNICIAN_MANAGER) return normalized === '/technicians'
  if (role === ROLES.BOOKING_MANAGER) return normalized === '/bookings'
  return false
}

export function getDefaultRoute(role) {
  switch (role) {
    case ROLES.SUPER_ADMIN:
      return '/'
    case ROLES.SUPPORT_MANAGER:
      return '/support'
    case ROLES.TECHNICIAN_MANAGER:
      return '/technicians'
    case ROLES.BOOKING_MANAGER:
      return '/bookings'
    default:
      return '/login'
  }
}

export function formatRoleLabel(role) {
  return ROLE_LABELS[role] || role || '—'
}

