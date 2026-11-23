// Maps Defra ID ID-token claims to the user this service works with.
//
// Defra ID packs relationships and roles into colon-separated strings:
//   relationships: relationshipId:organisationId:organisationName:organisationLoa:relationship:relationshipLoa
//   roles:         relationshipId:roleName:roleStatus
// (format as issued by DEFRA/cdp-defra-id-stub; to be confirmed against real
// Defra ID). An organisation name may itself contain colons, so the fields
// around it are read from both ends.

/**
 * @typedef {object} Relationship
 * @property {string} relationshipId
 * @property {string} organisationId
 * @property {string} organisationName
 * @property {string} organisationLoa
 * @property {string} relationship - e.g. Citizen, Employee, Agent.
 * @property {string} relationshipLoa
 * @property {boolean} current - Whether this is the relationship chosen at sign-in.
 * @property {Array<{ roleName: string, roleStatus: string }>} roles
 */

/**
 * @typedef {object} DefraIdUser
 * @property {string} id - The Defra ID `sub`.
 * @property {string | null} contactId
 * @property {string} email
 * @property {string} firstName
 * @property {string} lastName
 * @property {string} displayName
 * @property {string | null} serviceId
 * @property {string | null} loa
 * @property {string | null} aal
 * @property {string | null} currentRelationshipId
 * @property {Relationship[]} relationships
 */

/**
 * @param {unknown} value
 * @returns {Omit<Relationship, 'current' | 'roles'> | null}
 */
export function parseRelationship(value) {
  if (typeof value !== 'string') {
    return null
  }

  const parts = value.split(':')
  if (parts.length < 6) {
    return null
  }

  const [relationshipId, organisationId] = parts
  const [organisationLoa, relationship, relationshipLoa] = parts.slice(-3)
  const organisationName = parts.slice(2, -3).join(':')

  return {
    relationshipId,
    organisationId,
    organisationName,
    organisationLoa,
    relationship,
    relationshipLoa
  }
}

/**
 * @param {unknown} value
 * @returns {{ relationshipId: string, roleName: string, roleStatus: string } | null}
 */
export function parseRole(value) {
  if (typeof value !== 'string') {
    return null
  }

  const parts = value.split(':')
  if (parts.length < 3) {
    return null
  }

  return {
    relationshipId: parts[0],
    roleName: parts.slice(1, -1).join(':'),
    roleStatus: parts.at(-1)
  }
}

const asList = (value) => (Array.isArray(value) ? value : [])
const asText = (value) => (typeof value === 'string' ? value : '')
const asOptional = (value) =>
  value === undefined || value === null ? null : String(value)

/**
 * @param {Record<string, unknown>} claims - A verified ID token payload.
 * @returns {DefraIdUser}
 */
export function toDefraIdUser(claims) {
  const currentRelationshipId = asOptional(claims.currentRelationshipId)
  const roles = asList(claims.roles).map(parseRole).filter(Boolean)

  const relationships = asList(claims.relationships)
    .map(parseRelationship)
    .filter(Boolean)
    .map((relationship) => ({
      ...relationship,
      current: relationship.relationshipId === currentRelationshipId,
      roles: roles
        .filter((role) => role.relationshipId === relationship.relationshipId)
        .map(({ roleName, roleStatus }) => ({ roleName, roleStatus }))
    }))

  const firstName = asText(claims.firstName)
  const lastName = asText(claims.lastName)

  return {
    id: asText(claims.sub),
    contactId: asOptional(claims.contactId),
    email: asText(claims.email),
    firstName,
    lastName,
    displayName: [firstName, lastName].filter(Boolean).join(' '),
    serviceId: asOptional(claims.serviceId),
    loa: asOptional(claims.loa),
    aal: asOptional(claims.aal),
    currentRelationshipId,
    relationships
  }
}
