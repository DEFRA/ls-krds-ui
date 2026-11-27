import { defraIdClaims } from '#/test-helpers/fake-oidc-provider.js'
import { parseRelationship, parseRole, toDefraIdUser } from './claims.js'

describe('#parseRelationship', () => {
  test('Should read the six Defra ID relationship fields', () => {
    expect(parseRelationship('rel-1:org-1:Fairfield Farm:0:Agent:1')).toEqual({
      relationshipId: 'rel-1',
      organisationId: 'org-1',
      organisationName: 'Fairfield Farm',
      organisationLoa: '0',
      relationship: 'Agent',
      relationshipLoa: '1'
    })
  })

  test('Should keep colons that are part of the organisation name', () => {
    expect(
      parseRelationship('rel-1:org-1:Farm: North Field:0:Employee:0')
        .organisationName
    ).toBe('Farm: North Field')
  })

  test.each([undefined, null, 42, '', 'too:few:parts'])(
    'Should ignore %s',
    (value) => {
      expect(parseRelationship(value)).toBeNull()
    }
  )
})

describe('#parseRole', () => {
  test('Should read the relationship id, role name and status', () => {
    expect(parseRole('rel-1:Keeper:3')).toEqual({
      relationshipId: 'rel-1',
      roleName: 'Keeper',
      roleStatus: '3'
    })
  })

  test('Should ignore malformed roles', () => {
    expect(parseRole('rel-1')).toBeNull()
  })
})

describe('#toDefraIdUser', () => {
  test('Should map Defra ID claims to the user', () => {
    expect(toDefraIdUser(defraIdClaims)).toEqual({
      id: defraIdClaims.sub,
      contactId: defraIdClaims.contactId,
      email: 'agent@example.com',
      firstName: 'Ada',
      lastName: 'Agent',
      displayName: 'Ada Agent',
      serviceId: defraIdClaims.serviceId,
      loa: '1',
      aal: '1',
      currentRelationshipId: 'rel-2',
      relationships: [
        {
          relationshipId: 'rel-1',
          organisationId: 'org-1',
          organisationName: 'Fairfield Farm',
          organisationLoa: '0',
          relationship: 'Agent',
          relationshipLoa: '0',
          current: false,
          roles: [{ roleName: 'Agent', roleStatus: '3' }]
        },
        {
          relationshipId: 'rel-2',
          organisationId: 'org-2',
          organisationName: 'Hillside Holdings Ltd',
          organisationLoa: '0',
          relationship: 'Agent',
          relationshipLoa: '0',
          current: true,
          roles: [{ roleName: 'Agent', roleStatus: '3' }]
        }
      ]
    })
  })

  test('Should cope with a user who has no relationships', () => {
    const user = toDefraIdUser({ sub: 'user-1', email: 'a@b.test' })

    expect(user.relationships).toEqual([])
    expect(user.currentRelationshipId).toBeNull()
    expect(user.displayName).toBe('')
  })
})
