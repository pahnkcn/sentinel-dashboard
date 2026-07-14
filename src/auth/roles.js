export const AUTHORIZED_ROLES = Object.freeze(['clinician', 'admin']);

export function getAuthorizedRole(claims = {}) {
  if (claims.email_verified !== true) return null;
  return AUTHORIZED_ROLES.includes(claims.sentinelRole)
    ? claims.sentinelRole
    : null;
}
