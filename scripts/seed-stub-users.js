// Registers test users with the CDP Defra ID stub (DEFRA/cdp-defra-id-stub).
//
//   npm run stub:seed
//
// Safe to re-run: the stub replaces a registration with the same userId or
// email. Run it after every stub restart (users are held in memory), and at
// least every 3 days in CDP environments (registrations expire).
//
// STUB_BASE_URL overrides the stub's base, e.g. for the CDP dev stub:
//   STUB_BASE_URL=https://cdp-defra-id-stub.dev.cdp-int.defra.cloud/cdp-defra-id-stub
//
// IDs are fixed so a user keeps the same Defra ID user ID (`sub`) across runs.

const baseUrl = (
  process.env.STUB_BASE_URL ?? 'http://localhost:3200/cdp-defra-id-stub'
).replace(/\/$/, '')

const common = {
  loa: '1',
  aal: '1',
  enrolmentCount: 1,
  enrolmentRequestCount: 1
}

export const users = [
  {
    ...common,
    userId: '6f1d2b8a-0c3e-4a51-9b0e-1a2b3c4d5e01',
    email: 'individual@example.com',
    firstName: 'Ivy',
    lastName: 'Individual',
    relationships: []
  },
  {
    ...common,
    userId: '6f1d2b8a-0c3e-4a51-9b0e-1a2b3c4d5e02',
    email: 'keeper@example.com',
    firstName: 'Kit',
    lastName: 'Keeper',
    relationships: [
      {
        relationshipId: 'a1000000-0000-4000-8000-000000000001',
        organisationId: 'b1000000-0000-4000-8000-000000000001',
        organisationName: 'Oakfield Farm',
        relationshipRole: 'Employee',
        roleName: 'Keeper',
        roleStatus: '3'
      }
    ]
  },
  {
    ...common,
    userId: '6f1d2b8a-0c3e-4a51-9b0e-1a2b3c4d5e03',
    email: 'agent@example.com',
    firstName: 'Ada',
    lastName: 'Agent',
    relationships: [
      {
        relationshipId: 'a1000000-0000-4000-8000-000000000002',
        organisationId: 'b1000000-0000-4000-8000-000000000002',
        organisationName: 'Fairfield Farm',
        relationshipRole: 'Agent',
        roleName: 'Agent',
        roleStatus: '3'
      },
      {
        relationshipId: 'a1000000-0000-4000-8000-000000000003',
        organisationId: 'b1000000-0000-4000-8000-000000000003',
        organisationName: 'Hillside Holdings Ltd',
        relationshipRole: 'Agent',
        roleName: 'Agent',
        roleStatus: '3'
      },
      {
        relationshipId: 'a1000000-0000-4000-8000-000000000004',
        organisationId: 'b1000000-0000-4000-8000-000000000004',
        organisationName: 'Moorland Grazing Co',
        relationshipRole: 'Agent',
        roleName: 'Agent',
        roleStatus: '3'
      }
    ]
  },
  {
    ...common,
    userId: '6f1d2b8a-0c3e-4a51-9b0e-1a2b3c4d5e04',
    email: 'delegate@example.com',
    firstName: 'Dee',
    lastName: 'Delegate',
    relationships: [
      {
        relationshipId: 'a1000000-0000-4000-8000-000000000005',
        organisationId: 'b1000000-0000-4000-8000-000000000001',
        organisationName: 'Oakfield Farm',
        relationshipRole: 'Employee',
        roleName: 'Delegate',
        roleStatus: '3'
      }
    ]
  },
  {
    ...common,
    userId: '6f1d2b8a-0c3e-4a51-9b0e-1a2b3c4d5e05',
    email: 'inactive@example.com',
    firstName: 'Ira',
    lastName: 'Inactive',
    relationships: [
      {
        relationshipId: 'a1000000-0000-4000-8000-000000000006',
        organisationId: 'b1000000-0000-4000-8000-000000000002',
        organisationName: 'Fairfield Farm',
        relationshipRole: 'Employee',
        roleName: 'Keeper',
        roleStatus: '1'
      }
    ]
  }
]

async function register(user) {
  const response = await fetch(`${baseUrl}/API/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(user),
    signal: AbortSignal.timeout(10000)
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`${user.email}: ${response.status} ${body}`)
  }
}

let failed = 0
for (const user of users) {
  try {
    await register(user)
    console.log(
      `Registered ${user.email} (${user.relationships.length} relationships)`
    )
  } catch (error) {
    failed++
    console.error(`Failed to register ${error.message ?? error}`)
  }
}

if (failed) {
  console.error(`${failed} of ${users.length} users failed. Is the stub up?`)
  process.exitCode = 1
} else {
  console.log(`Seeded ${users.length} users into ${baseUrl}`)
}
