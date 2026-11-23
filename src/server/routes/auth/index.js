import {
  SIGNED_OUT_PATH,
  SIGN_OUT_PATH,
  callbackController,
  loginController,
  signOutConfirmController,
  signOutController,
  signedOutController
} from './controller.js'
import { config } from '#/config/config.js'
import { LOGIN_PATH } from '#/server/plugins/auth.js'

/**
 * Sign-in and sign-out routes for Defra ID.
 * These routes are registered in src/server/plugins/router.js.
 */
export const authRoutes = {
  plugin: {
    name: 'auth-routes',
    register(server) {
      server.route([
        { method: 'GET', path: LOGIN_PATH, ...loginController },
        {
          method: 'GET',
          path: config.get('auth.oidc.redirectPath'),
          ...callbackController
        },
        { method: 'GET', path: SIGN_OUT_PATH, ...signOutConfirmController },
        { method: 'POST', path: SIGN_OUT_PATH, ...signOutController },
        { method: 'GET', path: SIGNED_OUT_PATH, ...signedOutController }
      ])
    }
  }
}
