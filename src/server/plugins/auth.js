// Session authentication, the default for every route.
//
// A route is signed-in only unless it opts out:
//   options: { auth: false }           public, no session read
//   options: { auth: { mode: 'try' } } public, but knows who is signed in
//
// A signed-out request to a signed-in-only route is redirected to
// /auth/login with a returnUrl, and lands back on that page after sign-in.
// Identity is on request.auth.credentials.user (see claims.js).

import Boom from '@hapi/boom'

import { getAuthSession } from '#/server/common/helpers/auth/auth-session.js'

export const AUTH_STRATEGY = 'session'
export const LOGIN_PATH = '/auth/login'

function sessionScheme() {
  return {
    authenticate(request, h) {
      const authSession = getAuthSession(request)

      if (authSession?.user) {
        return h.authenticated({ credentials: { user: authSession.user } })
      }

      if (request.auth.mode === 'required') {
        const returnUrl = encodeURIComponent(
          `${request.path}${request.url.search}`
        )

        return h.redirect(`${LOGIN_PATH}?returnUrl=${returnUrl}`).takeover()
      }

      return h.unauthenticated(Boom.unauthorized(null, AUTH_STRATEGY))
    }
  }
}

export const auth = {
  plugin: {
    name: 'auth',
    dependencies: ['@hapi/yar'],
    register(server) {
      server.auth.scheme(AUTH_STRATEGY, sessionScheme)
      server.auth.strategy(AUTH_STRATEGY, AUTH_STRATEGY)
      server.auth.default(AUTH_STRATEGY)
    }
  }
}
