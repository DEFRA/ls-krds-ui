// OpenID Connect client for Defra ID (and the Defra ID stub).
//
// Runs the authorization code flow with PKCE:
// 1. buildAuthorizationUrl() sends the browser to the identity provider with
//    a fresh state, nonce and PKCE code challenge.
// 2. exchangeCode() swaps the returned code for tokens, server to server,
//    proving it started the login with the PKCE code verifier.
// 3. verifyIdToken() checks the ID token's signature against the provider's
//    published keys (JWKS), its issuer, audience and expiry, then the nonce
//    and serviceId.
//
// Modelled on createOidcClient in DEFRA/lis-hubs-infra-access.

import crypto from 'node:crypto'

import { createRemoteJWKSet, jwtVerify } from 'jose'

const OAUTH_ERROR_PATTERN = /^[a-z_]{1,64}$/

export class OidcError extends Error {
  constructor(message, options) {
    super(message, options)
    this.name = 'OidcError'
  }
}

/**
 * Reads only the OAuth `error` code from a failed response body. Free-text
 * fields such as error_description are never read, so nothing the provider
 * echoes back ends up in our logs.
 * @param {Response} response
 * @returns {Promise<string | undefined>}
 */
async function readOAuthErrorCode(response) {
  try {
    const body = await response.json()
    return typeof body?.error === 'string' &&
      OAUTH_ERROR_PATTERN.test(body.error)
      ? body.error
      : undefined
  } catch {
    return undefined
  }
}

/**
 * A fresh state, nonce and PKCE code verifier for one sign-in attempt. Kept in
 * the user's session until the callback, never sent to the browser except as
 * state and nonce on the authorize URL.
 * @returns {{ state: string, nonce: string, codeVerifier: string }}
 */
export function createAuthFlow() {
  return {
    state: crypto.randomUUID(),
    nonce: crypto.randomUUID(),
    codeVerifier: crypto.randomBytes(32).toString('base64url')
  }
}

/**
 * @param {string} codeVerifier
 * @returns {string} the S256 PKCE code challenge for the verifier
 */
export function toCodeChallenge(codeVerifier) {
  return crypto.createHash('sha256').update(codeVerifier).digest('base64url')
}

function resolveScope(scope) {
  const scopes = (scope ?? '').split(' ').filter(Boolean)
  return [...new Set(['openid', ...scopes])].join(' ')
}

/**
 * @param {object} options
 * @param {string} options.discoveryUrl - The provider's /.well-known/openid-configuration URL.
 * @param {string} options.clientId
 * @param {string | null} options.clientSecret
 * @param {string | null} [options.serviceId] - Defra ID service id.
 * @param {string} [options.scope]
 * @param {string} options.redirectUri - Absolute URL of our callback route.
 * @param {number} [options.timeoutMs]
 * @param {boolean} [options.requireNonce=true] - Reject ID tokens without a
 *   nonce. Only for the CDP Defra ID stub, which omits it; a nonce that is
 *   present but wrong is always rejected.
 */
export function createOidcClient({
  discoveryUrl,
  clientId,
  clientSecret,
  serviceId = null,
  scope = 'openid',
  redirectUri,
  timeoutMs = 10000,
  requireNonce = true
}) {
  let metadataPromise = null
  let jwks = null

  async function fetchJson(url, init = {}) {
    let response
    try {
      response = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(timeoutMs)
      })
    } catch (error) {
      throw new OidcError(`Request to ${url} failed`, { cause: error })
    }

    if (!response.ok) {
      const oauthError = await readOAuthErrorCode(response)
      const suffix = oauthError ? ` ${oauthError}` : ''
      throw new OidcError(`${url} returned ${response.status}${suffix}`)
    }

    return response.json()
  }

  /**
   * The discovery document, fetched once and shared by concurrent sign-ins.
   * A failed fetch is not cached, so one blip doesn't break sign-in until
   * the next restart.
   */
  function getMetadata() {
    if (!metadataPromise) {
      metadataPromise = fetchJson(discoveryUrl).catch((error) => {
        metadataPromise = null
        throw error
      })
    }
    return metadataPromise
  }

  async function buildAuthorizationUrl(authFlow) {
    const metadata = await getMetadata()
    const url = new URL(metadata.authorization_endpoint)
    const parameters = {
      client_id: clientId,
      response_type: 'code',
      scope: resolveScope(scope),
      redirect_uri: redirectUri,
      state: authFlow.state,
      nonce: authFlow.nonce,
      code_challenge: toCodeChallenge(authFlow.codeVerifier),
      code_challenge_method: 'S256'
    }

    for (const [name, value] of Object.entries(parameters)) {
      url.searchParams.set(name, value)
    }

    if (serviceId) {
      url.searchParams.set('serviceId', serviceId)
    }

    return url.toString()
  }

  async function exchangeCode(code, codeVerifier) {
    if (!clientSecret) {
      throw new OidcError('OIDC client secret is not configured')
    }

    const metadata = await getMetadata()
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret,
      code_verifier: codeVerifier
    })

    const tokens = await fetchJson(metadata.token_endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body
    })

    if (!tokens?.id_token) {
      throw new OidcError('Token response did not include an ID token')
    }

    return tokens
  }

  async function verifyIdToken(idToken, expectedNonce) {
    const metadata = await getMetadata()

    // Fetches the provider's public keys once, and again whenever a token
    // names a key id it hasn't seen (the provider rotated its keys).
    jwks ??= createRemoteJWKSet(new URL(metadata.jwks_uri), {
      timeoutDuration: timeoutMs
    })

    let payload
    try {
      ;({ payload } = await jwtVerify(idToken, jwks, {
        issuer: metadata.issuer,
        audience: clientId
      }))
    } catch (error) {
      throw new OidcError(`ID token rejected: ${error.code ?? error.name}`, {
        cause: error
      })
    }

    const nonceMissing = payload.nonce === undefined

    if (nonceMissing ? requireNonce : payload.nonce !== expectedNonce) {
      throw new OidcError(
        `ID token rejected: nonce ${nonceMissing ? 'missing' : 'mismatch'}`
      )
    }

    if (serviceId && payload.serviceId && payload.serviceId !== serviceId) {
      throw new OidcError('ID token rejected: unexpected serviceId')
    }

    return payload
  }

  /**
   * @returns {Promise<string | null>} the provider's end-session URL, or null
   * when it has none and the user can only be signed out locally.
   */
  async function buildLogoutUrl({ idToken, postLogoutRedirectUri }) {
    const metadata = await getMetadata()

    if (!metadata.end_session_endpoint) {
      return null
    }

    const url = new URL(metadata.end_session_endpoint)
    url.searchParams.set('post_logout_redirect_uri', postLogoutRedirectUri)

    if (idToken) {
      url.searchParams.set('id_token_hint', idToken)
    }

    return url.toString()
  }

  return {
    getMetadata,
    buildAuthorizationUrl,
    exchangeCode,
    verifyIdToken,
    buildLogoutUrl
  }
}
