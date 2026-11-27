import Boom from '@hapi/boom'

import { config } from '#/config/config.js'
import {
  clearAuthFlow,
  endAuthSession,
  getAuthFlow,
  getAuthSession,
  setAuthFlow,
  startAuthSession
} from '#/server/common/helpers/auth/auth-session.js'
import { toDefraIdUser } from '#/server/common/helpers/auth/claims.js'
import { getDefraIdClient } from '#/server/common/helpers/auth/defra-id.js'
import { createAuthFlow } from '#/server/common/helpers/auth/oidc-client.js'
import { toSafeRedirect } from '#/server/common/helpers/is-safe-redirect.js'
import { LOGIN_PATH } from '#/server/plugins/auth.js'

export const SIGN_OUT_PATH = '/signout'
export const SIGNED_OUT_PATH = '/auth/signed-out'

// OAuth error codes from RFC 6749 4.1.2.1 and OIDC Core 3.1.2.6. Anything else
// the provider sends back is logged as "unknown", never echoed.
const KNOWN_IDP_ERRORS = new Set([
  'invalid_request',
  'unauthorized_client',
  'access_denied',
  'unsupported_response_type',
  'invalid_scope',
  'server_error',
  'temporarily_unavailable',
  'interaction_required',
  'login_required',
  'account_selection_required',
  'consent_required'
])

/**
 * GET /auth/login: starts sign-in. A signed-in user goes straight to the
 * return URL; anyone else is sent to Defra ID with a fresh state, nonce and
 * PKCE challenge, which are kept in the session for the callback.
 */
export const loginController = {
  options: { auth: false },
  async handler(request, h) {
    const returnUrl = toSafeRedirect(request.query.returnUrl)

    if (getAuthSession(request)) {
      return h.redirect(returnUrl)
    }

    const authFlow = { ...createAuthFlow(), returnUrl }

    let authorizationUrl
    try {
      authorizationUrl =
        await getDefraIdClient().buildAuthorizationUrl(authFlow)
    } catch (error) {
      request.logger.error(error, 'Could not start sign-in with Defra ID')
      throw Boom.serverUnavailable('Sign-in is not available')
    }

    setAuthFlow(request, authFlow)

    return h.redirect(authorizationUrl)
  }
}

/**
 * GET /sso: the callback Defra ID redirects to with a code and state.
 */
export const callbackController = {
  options: { auth: false },
  async handler(request, h) {
    const { code, state, error } = request.query

    if (error) {
      const idpError = KNOWN_IDP_ERRORS.has(error) ? error : 'unknown'
      request.logger.warn(`Defra ID returned an error: ${idpError}`)
      clearAuthFlow(request)
      throw Boom.badRequest('Sign-in was not completed')
    }

    const authFlow = getAuthFlow(request)

    // No flow, or a state we didn't issue: a replayed or forged callback
    // (e.g. the back button after signing in). Restarting sign-in sends a
    // signed-in user straight on and gives anyone else a fresh attempt.
    if (!authFlow || !state || state !== authFlow.state || !code) {
      request.logger.info('Stale or unexpected sign-in callback, restarting')
      clearAuthFlow(request)
      return h.redirect(LOGIN_PATH)
    }

    // Single use, whatever happens next.
    clearAuthFlow(request)

    let claims
    let tokens
    try {
      const client = getDefraIdClient()
      tokens = await client.exchangeCode(code, authFlow.codeVerifier)
      claims = await client.verifyIdToken(tokens.id_token, authFlow.nonce)
    } catch (err) {
      request.logger.error(err, 'Defra ID sign-in failed')
      throw Boom.unauthorized('Sign-in failed')
    }

    const user = toDefraIdUser(claims)

    startAuthSession(request, {
      user,
      idToken: tokens.id_token,
      authenticatedAt: new Date().toISOString()
    })

    request.logger.info('User signed in with Defra ID')

    return h.redirect(toSafeRedirect(authFlow.returnUrl))
  }
}

/**
 * GET /signout: asks a signed-in user to confirm. The form posts back with a
 * CSRF token, so another site can't sign the user out.
 */
export const signOutConfirmController = {
  options: { auth: { mode: 'try' } },
  handler(request, h) {
    if (!request.auth.isAuthenticated) {
      return h.redirect('/')
    }

    return h.view('auth/sign-out', {
      pageTitle: 'Are you sure you want to sign out?',
      heading: 'Are you sure you want to sign out?'
    })
  }
}

/**
 * POST /signout: ends our session, then sends the user to Defra ID to end
 * theirs, which returns them to the signed-out page.
 */
export const signOutController = {
  options: { auth: { mode: 'try' } },
  async handler(request, h) {
    const authSession = getAuthSession(request)

    if (!authSession) {
      return h.redirect('/')
    }

    const postLogoutRedirectUri = new URL(
      SIGNED_OUT_PATH,
      config.get('appBaseUrl')
    ).toString()

    let logoutUrl = null
    try {
      logoutUrl = await getDefraIdClient().buildLogoutUrl({
        idToken: authSession.idToken,
        postLogoutRedirectUri
      })
    } catch (error) {
      request.logger.error(error, 'Could not build the Defra ID sign-out URL')
    } finally {
      // Cleared whatever happens, so a failure can't leave the session usable.
      endAuthSession(request)
    }

    request.logger.info('User signed out')

    return h.redirect(logoutUrl ?? SIGNED_OUT_PATH)
  }
}

/** GET /auth/signed-out: where Defra ID returns the user after sign-out. */
export const signedOutController = {
  options: { auth: false },
  handler(_request, h) {
    return h.view('auth/signed-out', {
      pageTitle: 'You have signed out',
      heading: 'You have signed out'
    })
  }
}
