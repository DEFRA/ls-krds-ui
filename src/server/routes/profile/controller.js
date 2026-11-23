const CURRENT_TAG_HTML =
  '<strong class="govuk-tag govuk-tag--green">Current</strong>'

/**
 * @param {import('#/server/common/helpers/auth/claims.js').Relationship} relationship
 */
function toRelationshipRow(relationship) {
  const roleNames = relationship.roles.map((role) => role.roleName)

  return [
    { text: relationship.organisationName },
    { text: relationship.relationship },
    { text: roleNames.length ? roleNames.join(', ') : 'None' },
    relationship.current ? { html: CURRENT_TAG_HTML } : { text: '' }
  ]
}

/**
 * Shows who the user is according to their Defra ID token, and which
 * organisations they can act for (their relationships).
 */
export const profileController = {
  handler(request, h) {
    const { user } = request.auth.credentials

    return h.view('profile/index', {
      pageTitle: 'Your profile',
      heading: 'Your profile',
      user,
      currentRelationship:
        user.relationships.find((relationship) => relationship.current) ?? null,
      relationshipRows: user.relationships.map(toRelationshipRow)
    })
  }
}
