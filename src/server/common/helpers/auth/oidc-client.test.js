import { generateKeyPair } from 'jose'

import {
  FAKE_CLIENT_ID,
  FAKE_CLIENT_SECRET,
  FAKE_SERVICE_ID,
  startFakeOidcProvider
} from '#/test-helpers/fake-oidc-provider.js'
import {
  OidcError,
  createAuthFlow,
  createOidcClient,
  toCodeChallenge
} from './oidc-client.js'

describe('#createOidcClient', () => {
  let provider
  let client

  beforeAll(async () => {
    provider = await startFakeOidcProvider()
  })

  afterAll(async () => {
    await provider.stop()
  })

  beforeEach(() => {
    client = createOidcClient({
      discoveryUrl: provider.discoveryUrl,
      clientId: FAKE_CLIENT_ID,
      clientSecret: FAKE_CLIENT_SECRET,
      serviceId: FAKE_SERVICE_ID,
      scope: 'openid offline_access',
      redirectUri: 'http://localhost:3000/sso'
    })
  })

  async function signIn(flow, issueOptions = {}) {
    const code = provider.issueCode({
      nonce: flow.nonce,
      codeChallenge: toCodeChallenge(flow.codeVerifier),
      ...issueOptions
    })
    const tokens = await client.exchangeCode(code, flow.codeVerifier)
    return client.verifyIdToken(tokens.id_token, flow.nonce)
  }

  test('Should build an authorize URL with state, nonce and an S256 PKCE challenge', async () => {
    const flow = createAuthFlow()
    const url = new URL(await client.buildAuthorizationUrl(flow))

    expect(`${url.origin}${url.pathname}`).toBe(`${provider.issuer}/authorize`)
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: FAKE_CLIENT_ID,
      response_type: 'code',
      scope: 'openid offline_access',
      redirect_uri: 'http://localhost:3000/sso',
      state: flow.state,
      nonce: flow.nonce,
      code_challenge: toCodeChallenge(flow.codeVerifier),
      code_challenge_method: 'S256',
      serviceId: FAKE_SERVICE_ID
    })
  })

  test('Should never send the PKCE verifier to the browser', async () => {
    const flow = createAuthFlow()
    const url = await client.buildAuthorizationUrl(flow)

    expect(url).not.toContain(flow.codeVerifier)
  })

  test('Should create a different state, nonce and verifier for every sign-in', () => {
    const first = createAuthFlow()
    const second = createAuthFlow()

    expect(second.state).not.toBe(first.state)
    expect(second.nonce).not.toBe(first.nonce)
    expect(second.codeVerifier).not.toBe(first.codeVerifier)
  })

  test('Should return the claims of a valid ID token', async () => {
    const claims = await signIn(createAuthFlow())

    expect(claims).toMatchObject({
      sub: '6f1d2b8a-0c3e-4a51-9b0e-1a2b3c4d5e03',
      email: 'agent@example.com',
      aud: FAKE_CLIENT_ID,
      iss: provider.issuer
    })
  })

  test('Should reject a code redeemed without the matching PKCE verifier', async () => {
    const flow = createAuthFlow()
    const code = provider.issueCode({
      nonce: flow.nonce,
      codeChallenge: toCodeChallenge(flow.codeVerifier)
    })

    await expect(
      client.exchangeCode(code, createAuthFlow().codeVerifier)
    ).rejects.toThrow(/400 invalid_grant/)
  })

  test('Should reject an ID token without a nonce by default', async () => {
    await expect(
      signIn(createAuthFlow(), { claims: { nonce: undefined } })
    ).rejects.toThrow('nonce missing')
  })

  describe('When the nonce is not required (Defra ID stub)', () => {
    beforeEach(() => {
      client = createOidcClient({
        discoveryUrl: provider.discoveryUrl,
        clientId: FAKE_CLIENT_ID,
        clientSecret: FAKE_CLIENT_SECRET,
        redirectUri: 'http://localhost:3000/sso',
        requireNonce: false
      })
    })

    test('Should accept an ID token without a nonce', async () => {
      const claims = await signIn(createAuthFlow(), {
        claims: { nonce: undefined }
      })

      expect(claims.nonce).toBeUndefined()
    })

    test('Should still reject an ID token with the wrong nonce', async () => {
      await expect(
        signIn(createAuthFlow(), { claims: { nonce: 'replayed-nonce' } })
      ).rejects.toThrow('nonce mismatch')
    })
  })

  test('Should reject an ID token with a different nonce', async () => {
    const flow = createAuthFlow()

    await expect(
      signIn(flow, { claims: { nonce: 'replayed-nonce' } })
    ).rejects.toThrow('nonce mismatch')
  })

  test('Should reject an ID token signed with another key', async () => {
    const { privateKey } = await generateKeyPair('RS256')

    await expect(
      signIn(createAuthFlow(), { signWith: { privateKey } })
    ).rejects.toThrow(OidcError)
  })

  test('Should reject an ID token issued to another client', async () => {
    await expect(
      signIn(createAuthFlow(), { signWith: { audience: 'another-service' } })
    ).rejects.toThrow(/ERR_JWT_CLAIM_VALIDATION_FAILED/)
  })

  test('Should reject an ID token from another issuer', async () => {
    await expect(
      signIn(createAuthFlow(), {
        signWith: { issuer: 'https://evil.example' }
      })
    ).rejects.toThrow(/ERR_JWT_CLAIM_VALIDATION_FAILED/)
  })

  test('Should reject an expired ID token', async () => {
    await expect(
      signIn(createAuthFlow(), { signWith: { expiresIn: '-1m' } })
    ).rejects.toThrow(/ERR_JWT_EXPIRED/)
  })

  test('Should reject an ID token for another Defra ID service', async () => {
    await expect(
      signIn(createAuthFlow(), { claims: { serviceId: 'another-service' } })
    ).rejects.toThrow('unexpected serviceId')
  })

  test('Should refuse to exchange a code without a client secret', async () => {
    const noSecret = createOidcClient({
      discoveryUrl: provider.discoveryUrl,
      clientId: FAKE_CLIENT_ID,
      clientSecret: null,
      redirectUri: 'http://localhost:3000/sso'
    })

    await expect(noSecret.exchangeCode('code', 'verifier')).rejects.toThrow(
      'client secret is not configured'
    )
  })

  test('Should build an end-session URL with the ID token hint', async () => {
    const url = new URL(
      await client.buildLogoutUrl({
        idToken: 'the-id-token',
        postLogoutRedirectUri: 'http://localhost:3000/auth/signed-out'
      })
    )

    expect(`${url.origin}${url.pathname}`).toBe(`${provider.issuer}/logout`)
    expect(url.searchParams.get('id_token_hint')).toBe('the-id-token')
    expect(url.searchParams.get('post_logout_redirect_uri')).toBe(
      'http://localhost:3000/auth/signed-out'
    )
  })

  test('Should retry discovery after a failure instead of caching it', async () => {
    const broken = createOidcClient({
      discoveryUrl: `${provider.issuer}/missing`,
      clientId: FAKE_CLIENT_ID,
      clientSecret: FAKE_CLIENT_SECRET,
      redirectUri: 'http://localhost:3000/sso'
    })

    await expect(broken.getMetadata()).rejects.toThrow(/404/)
    await expect(broken.getMetadata()).rejects.toThrow(/404/)
  })
})
