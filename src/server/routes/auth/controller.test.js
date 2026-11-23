import { config } from '#/config/config.js'
import { createServer } from '#/server/server.js'
import { statusCodes } from '#/server/common/constants/status-codes.js'
import { resetDefraIdClient } from '#/server/common/helpers/auth/defra-id.js'
import {
  FAKE_CLIENT_ID,
  FAKE_CLIENT_SECRET,
  FAKE_SERVICE_ID,
  startFakeOidcProvider
} from '#/test-helpers/fake-oidc-provider.js'

/** Keeps cookies between injected requests, like a browser would. */
function createCookieJar() {
  const cookies = new Map()

  return {
    store(response) {
      const setCookie = response.headers['set-cookie'] ?? []
      for (const header of [setCookie].flat()) {
        const [pair] = header.split(';')
        const index = pair.indexOf('=')
        const name = pair.slice(0, index)
        const value = pair.slice(index + 1)
        if (value) {
          cookies.set(name, value)
        } else {
          cookies.delete(name)
        }
      }
      return response
    },
    header() {
      return [...cookies].map(([name, value]) => `${name}=${value}`).join('; ')
    },
    get(name) {
      return cookies.get(name)
    }
  }
}

describe('#auth routes', () => {
  let server
  let provider

  beforeAll(async () => {
    provider = await startFakeOidcProvider()

    config.set('appBaseUrl', 'http://localhost:3000')
    config.set('auth.oidc.discoveryUrl', provider.discoveryUrl)
    config.set('auth.oidc.clientId', FAKE_CLIENT_ID)
    config.set('auth.oidc.clientSecret', FAKE_CLIENT_SECRET)
    config.set('auth.oidc.serviceId', FAKE_SERVICE_ID)
    resetDefraIdClient()

    server = await createServer()
    await server.initialize()
  })

  afterAll(async () => {
    await server.stop({ timeout: 0 })
    await provider.stop()
    resetDefraIdClient()
  })

  async function inject(jar, options) {
    return jar.store(
      await server.inject({
        ...options,
        headers: { ...options.headers, cookie: jar.header() }
      })
    )
  }

  /** Runs the whole sign-in through the fake provider, returning the callback response. */
  async function signIn(jar, returnUrl = '/profile') {
    const login = await inject(jar, {
      method: 'GET',
      url: `/auth/login?returnUrl=${encodeURIComponent(returnUrl)}`
    })
    const authorizeUrl = new URL(login.headers.location)
    const code = provider.issueCode({
      nonce: authorizeUrl.searchParams.get('nonce'),
      codeChallenge: authorizeUrl.searchParams.get('code_challenge')
    })
    const state = authorizeUrl.searchParams.get('state')

    return {
      state,
      code,
      callback: await inject(jar, {
        method: 'GET',
        url: `/sso?code=${code}&state=${state}`
      })
    }
  }

  test('Should send a signed-out user to sign in, remembering the page', async () => {
    const response = await server.inject({ method: 'GET', url: '/profile' })

    expect(response.statusCode).toBe(statusCodes.redirect)
    expect(response.headers.location).toBe('/auth/login?returnUrl=%2Fprofile')
  })

  test('Should send the browser to the provider with state, nonce and PKCE', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/auth/login?returnUrl=/profile'
    })
    const location = new URL(response.headers.location)

    expect(response.statusCode).toBe(statusCodes.redirect)
    expect(`${location.origin}${location.pathname}`).toBe(
      `${provider.issuer}/authorize`
    )
    expect(location.searchParams.get('redirect_uri')).toBe(
      'http://localhost:3000/sso'
    )
    expect(location.searchParams.get('state')).toBeTruthy()
    expect(location.searchParams.get('nonce')).toBeTruthy()
    expect(location.searchParams.get('code_challenge_method')).toBe('S256')
  })

  test('Should sign the user in and show their profile and relationships', async () => {
    const jar = createCookieJar()
    const { callback } = await signIn(jar)

    expect(callback.statusCode).toBe(statusCodes.redirect)
    expect(callback.headers.location).toBe('/profile')

    const profile = await inject(jar, { method: 'GET', url: '/profile' })

    expect(profile.statusCode).toBe(statusCodes.ok)
    expect(profile.result).toContain('Ada Agent')
    expect(profile.result).toContain('agent@example.com')
    expect(profile.result).toContain('Fairfield Farm')
    expect(profile.result).toContain('You are acting for')
    expect(profile.result).toContain('Hillside Holdings Ltd')
    expect(profile.result).toContain('Sign out')
  })

  test('Should start a new session at sign-in, so the old session id grants nothing', async () => {
    const jar = createCookieJar()
    await inject(jar, { method: 'GET', url: '/auth/login' })
    const sessionBeforeSignIn = jar.get('session')

    const { callback } = await signIn(jar)
    expect(callback.headers.location).toBe('/profile')
    expect(jar.get('session')).not.toBe(sessionBeforeSignIn)

    const replayed = await server.inject({
      method: 'GET',
      url: '/profile',
      headers: { cookie: `session=${sessionBeforeSignIn}` }
    })
    expect(replayed.statusCode).toBe(statusCodes.redirect)
  })

  test('Should restart sign-in when a callback is replayed', async () => {
    const jar = createCookieJar()
    const { code, state } = await signIn(jar)

    const replay = await server.inject({
      method: 'GET',
      url: `/sso?code=${code}&state=${state}`
    })

    expect(replay.statusCode).toBe(statusCodes.redirect)
    expect(replay.headers.location).toBe('/auth/login')
  })

  test('Should restart sign-in when the state does not match', async () => {
    const jar = createCookieJar()
    await inject(jar, { method: 'GET', url: '/auth/login' })

    const response = await inject(jar, {
      method: 'GET',
      url: '/sso?code=anything&state=forged'
    })

    expect(response.statusCode).toBe(statusCodes.redirect)
    expect(response.headers.location).toBe('/auth/login')
  })

  test('Should show an error when the provider returns one', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/sso?error=access_denied&error_description=nope'
    })

    expect(response.statusCode).toBe(statusCodes.badRequest)
  })

  test('Should never return the user to another site after sign-in', async () => {
    const jar = createCookieJar()
    const { callback } = await signIn(jar, 'https://evil.example/phish')

    expect(callback.headers.location).toBe('/')
  })

  test('Should sign out of the service and of the provider', async () => {
    const jar = createCookieJar()
    await signIn(jar)

    const confirm = await inject(jar, { method: 'GET', url: '/signout' })
    expect(confirm.statusCode).toBe(statusCodes.ok)
    const crumb = /name="crumb" value="([^"]+)"/.exec(confirm.result)?.[1]
    expect(crumb).toBeTruthy()

    const signOut = await inject(jar, {
      method: 'POST',
      url: '/signout',
      payload: { crumb }
    })
    const logoutUrl = new URL(signOut.headers.location)

    expect(signOut.statusCode).toBe(statusCodes.redirect)
    expect(`${logoutUrl.origin}${logoutUrl.pathname}`).toBe(
      `${provider.issuer}/logout`
    )
    expect(logoutUrl.searchParams.get('id_token_hint')).toBeTruthy()
    expect(logoutUrl.searchParams.get('post_logout_redirect_uri')).toBe(
      'http://localhost:3000/auth/signed-out'
    )

    const profile = await inject(jar, { method: 'GET', url: '/profile' })
    expect(profile.statusCode).toBe(statusCodes.redirect)
  })

  test('Should refuse a sign-out posted without a CSRF token', async () => {
    const jar = createCookieJar()
    await signIn(jar)

    const response = await inject(jar, { method: 'POST', url: '/signout' })

    expect(response.statusCode).toBe(statusCodes.forbidden)

    const profile = await inject(jar, { method: 'GET', url: '/profile' })
    expect(profile.statusCode).toBe(statusCodes.ok)
  })

  test('Should keep public pages public', async () => {
    const home = await server.inject({ method: 'GET', url: '/' })
    const health = await server.inject({ method: 'GET', url: '/health' })
    const signedOut = await server.inject({
      method: 'GET',
      url: '/auth/signed-out'
    })

    expect(home.statusCode).toBe(statusCodes.ok)
    expect(home.result).toContain('Sign in')
    expect(health.statusCode).toBe(statusCodes.ok)
    expect(signedOut.statusCode).toBe(statusCodes.ok)
  })

  test('Should allow sign-out redirects to the provider in the CSP', async () => {
    const response = await server.inject({ method: 'GET', url: '/' })

    expect(response.headers['content-security-policy']).toMatch(
      /form-action 'self' http:\/\/localhost:3200/
    )
  })
})
