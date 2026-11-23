// A minimal OpenID Connect provider for tests: discovery, JWKS, token and
// end-session endpoints on a real local HTTP server, signing ID tokens like
// Defra ID does (RS256). Tests mint codes with issueCode() instead of going
// through a sign-in page.

import crypto from 'node:crypto'
import http from 'node:http'

import { SignJWT, exportJWK, generateKeyPair } from 'jose'

export const FAKE_CLIENT_ID = 'test-client-id'
export const FAKE_CLIENT_SECRET = 'test-client-secret'
export const FAKE_SERVICE_ID = 'e84a398b-8104-47a2-86ae-de1168e4132f'

export const defraIdClaims = {
  sub: '6f1d2b8a-0c3e-4a51-9b0e-1a2b3c4d5e03',
  contactId: '1b2c3d4e-0000-4000-8000-00000000c0de',
  serviceId: FAKE_SERVICE_ID,
  firstName: 'Ada',
  lastName: 'Agent',
  email: 'agent@example.com',
  loa: '1',
  aal: '1',
  currentRelationshipId: 'rel-2',
  relationships: [
    'rel-1:org-1:Fairfield Farm:0:Agent:0',
    'rel-2:org-2:Hillside Holdings Ltd:0:Agent:0'
  ],
  roles: ['rel-1:Agent:3', 'rel-2:Agent:3']
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = ''
    request.on('data', (chunk) => (body += chunk))
    request.on('end', () => resolve(body))
    request.on('error', reject)
  })
}

function sendJson(response, status, body) {
  response.writeHead(status, { 'content-type': 'application/json' })
  response.end(JSON.stringify(body))
}

/**
 * @param {object} [options]
 * @param {boolean} [options.endSession=true] - Publish an end_session_endpoint.
 */
export async function startFakeOidcProvider({ endSession = true } = {}) {
  const { privateKey, publicKey } = await generateKeyPair('RS256')
  const jwk = { ...(await exportJWK(publicKey)), kid: 'test-key', alg: 'RS256' }
  const codes = new Map()
  let issuer = ''

  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url, issuer)

    if (url.pathname === '/.well-known/openid-configuration') {
      return sendJson(response, 200, {
        issuer,
        authorization_endpoint: `${issuer}/authorize`,
        token_endpoint: `${issuer}/token`,
        jwks_uri: `${issuer}/jwks`,
        ...(endSession && { end_session_endpoint: `${issuer}/logout` })
      })
    }

    if (url.pathname === '/jwks') {
      return sendJson(response, 200, { keys: [jwk] })
    }

    if (url.pathname === '/token' && request.method === 'POST') {
      const form = new URLSearchParams(await readBody(request))
      const grant = codes.get(form.get('code'))
      codes.delete(form.get('code'))

      if (
        form.get('client_id') !== FAKE_CLIENT_ID ||
        form.get('client_secret') !== FAKE_CLIENT_SECRET
      ) {
        return sendJson(response, 401, { error: 'invalid_client' })
      }

      const challenge = crypto
        .createHash('sha256')
        .update(form.get('code_verifier') ?? '')
        .digest('base64url')

      if (!grant || grant.codeChallenge !== challenge) {
        return sendJson(response, 400, { error: 'invalid_grant' })
      }

      return sendJson(response, 200, {
        token_type: 'bearer',
        expires_in: 3600,
        access_token: 'fake-access-token',
        id_token: await grant.sign()
      })
    }

    response.writeHead(404).end()
  })

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  issuer = `http://127.0.0.1:${server.address().port}`

  return {
    get issuer() {
      return issuer
    },
    discoveryUrl: `${issuer}/.well-known/openid-configuration`,

    /**
     * Mints a one-time code, as the provider would after sign-in.
     * @param {object} options
     * @param {string} options.nonce
     * @param {string} options.codeChallenge
     * @param {object} [options.claims] - Overrides for the ID token claims.
     * @param {object} [options.signWith] - Sign with another key, or issue
     *   for another audience/issuer, to test rejections.
     */
    issueCode({ nonce, codeChallenge, claims = {}, signWith = {} }) {
      const code = crypto.randomUUID()
      codes.set(code, {
        codeChallenge,
        sign: () =>
          new SignJWT({ ...defraIdClaims, nonce, ...claims })
            .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
            .setIssuer(signWith.issuer ?? issuer)
            .setAudience(signWith.audience ?? FAKE_CLIENT_ID)
            .setIssuedAt()
            .setExpirationTime(signWith.expiresIn ?? '1h')
            .sign(signWith.privateKey ?? privateKey)
      })
      return code
    },

    stop: () => new Promise((resolve) => server.close(resolve))
  }
}
